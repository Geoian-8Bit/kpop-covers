import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '@/player/store';
import { gestureZoom, isZoomed, keyZoom, wheelZoom, type Pt, type Size, type Zoom } from '@/player/zoom';
import { inTurnedLayer, layerPoint } from './fullscreenRules';

/**
 * F9 · Zoom over the file: two fingers or the wheel zoom, a drag moves (+ the keyboard on the focused video).
 * REQ-21 · Out of MediaStage, and lighter per frame: the box's rect is read once when a gesture starts (dropped on
 * `resize`/`scroll` and when the last finger lifts), and the pointers of one frame end in a single `setZoom` from a
 * requestAnimationFrame; whatever is pending lands at once on pointerup/cancel and when a finger joins or leaves, so
 * the gesture's maths and the zoom it ends on are the same as before.
 */
export function useStagePinch({
  boxEl,
  canZoom,
  box,
  media,
  mirrored,
}: {
  boxEl: HTMLDivElement | null;
  canZoom: boolean;
  box: Size;
  media: Size | null;
  mirrored: boolean;
}) {
  /** The kind of the last pointer on the video (the stage's tap handling reads it). */
  const pointerType = useRef<string>('mouse');
  /** A gesture just ended: the click that follows it is not a tap. */
  const swallowClickUntil = useRef(0);
  const [zoomLive, setZoomLive] = useState(false);
  const zoomPointers = useRef(new Map<number, Pt>());
  const zoomGesture = useRef<{ start: Zoom; from: Pt[]; moved: boolean } | null>(null);
  const geometry = useRef({ box, media, mirrored });
  geometry.current = { box, media, mirrored };
  /** The box's rect and turn for the running gesture (null: read it on the next pointer). */
  const frame = useRef<{ rect: DOMRect; turned: ReturnType<typeof inTurnedLayer> } | null>(null);
  /** requestAnimationFrame id of the pending setZoom (0: none). */
  const pending = useRef(0);

  // A layout change mid-gesture (rotation, the page scrolling) makes the cached rect stale: read it again.
  useEffect(() => {
    const drop = () => {
      frame.current = null;
    };
    window.addEventListener('resize', drop);
    window.addEventListener('scroll', drop, true);
    return () => {
      window.removeEventListener('resize', drop);
      window.removeEventListener('scroll', drop, true);
      cancelAnimationFrame(pending.current);
    };
  }, []);

  // REQ-02 · In the CSS-turned fullscreen the picture's own axes are not the screen's (layerPoint).
  const boxPoint = (e: { clientX: number; clientY: number }): Pt => {
    if (!boxEl) return { x: e.clientX, y: e.clientY };
    frame.current ??= { rect: boxEl.getBoundingClientRect(), turned: inTurnedLayer(boxEl) };
    return layerPoint(e, frame.current.rect, frame.current.turned);
  };
  /** The frame's zoom from where the fingers are now. */
  const applyPinch = () => {
    pending.current = 0;
    const g = zoomGesture.current;
    if (!g) return;
    const to = [...zoomPointers.current.values()].slice(0, 2);
    if (to.length !== g.from.length) return;
    const { box: b, media: m, mirrored: flip } = geometry.current;
    // REQ-21 · «Live» turns on in the same batch as the gesture's first zoom: one commit, not one more before it.
    if (g.moved) setZoomLive(true);
    usePlayer.getState().setZoom(gestureZoom(g.start, g.from, to, b, m, flip));
  };
  /** Lands a frame still waiting for its requestAnimationFrame (before the gesture changes shape or ends). */
  const flushPinch = () => {
    if (!pending.current) return;
    cancelAnimationFrame(pending.current);
    applyPinch();
  };
  const restartZoomGesture = (moved: boolean) => {
    zoomGesture.current = {
      start: usePlayer.getState().zoom,
      from: [...zoomPointers.current.values()].slice(0, 2),
      moved,
    };
  };
  function onZoomPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    pointerType.current = e.pointerType;
    if (!canZoom || (e.pointerType === 'mouse' && e.button !== 0)) return;
    flushPinch();
    if (zoomPointers.current.size === 0) frame.current = null;
    zoomPointers.current.set(e.pointerId, boxPoint(e));
    restartZoomGesture(zoomPointers.current.size > 1 ? (zoomGesture.current?.moved ?? false) : false);
  }
  function onZoomPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const g = zoomGesture.current;
    if (!g || !zoomPointers.current.has(e.pointerId)) return;
    zoomPointers.current.set(e.pointerId, boxPoint(e));
    const to = [...zoomPointers.current.values()].slice(0, 2);
    if (to.length !== g.from.length) return;
    // One finger on the whole video is a tap (or the page scrolling), not a drag.
    if (to.length === 1 && !isZoomed(g.start)) return;
    if (!g.moved && to.length === 1 && Math.hypot(to[0]!.x - g.from[0]!.x, to[0]!.y - g.from[0]!.y) < 6)
      return;
    if (!g.moved) {
      g.moved = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* already gone */
      }
    }
    pending.current ||= requestAnimationFrame(applyPinch);
  }
  function onZoomPointerEnd(e: React.PointerEvent<HTMLButtonElement>) {
    if (!zoomPointers.current.has(e.pointerId)) return;
    flushPinch();
    zoomPointers.current.delete(e.pointerId);
    const moved = zoomGesture.current?.moved ?? false;
    if (moved) swallowClickUntil.current = performance.now() + 400;
    if (zoomPointers.current.size > 0) {
      restartZoomGesture(moved); // one finger lifted: carry on with the other from here
      return;
    }
    zoomGesture.current = null;
    frame.current = null;
    setZoomLive(false);
  }
  /**
   * Keyboard on the video (focus on it): + zooms in; once zoomed, the arrows move the view, − zooms out and 0 shows
   * the whole video. Handled keys don't reach the studio's shortcuts (they skip prevented events).
   */
  function onZoomKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (!canZoom || e.metaKey || e.ctrlKey || e.altKey) return;
    const current = usePlayer.getState().zoom;
    if (!isZoomed(current) && e.key !== '+' && e.key !== '=') return;
    const next = keyZoom(current, e.key, box, media, mirrored);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    usePlayer.getState().setZoom(next);
  }
  // The wheel needs a non-passive listener. On the whole video, scrolling down still scrolls the page.
  useEffect(() => {
    const el = boxEl;
    if (!el || !canZoom) return;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      const current = usePlayer.getState().zoom;
      if (!isZoomed(current) && e.deltaY >= 0) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const g = geometry.current;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      setZoomLive(true);
      const at = layerPoint(e, rect, inTurnedLayer(el));
      usePlayer.getState().setZoom(wheelZoom(current, delta, at, g.box, g.media, g.mirrored));
      clearTimeout(settle);
      settle = setTimeout(() => setZoomLive(false), 200);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      clearTimeout(settle);
    };
  }, [canZoom, boxEl]);

  return {
    zoomLive,
    pointerType,
    swallowClickUntil,
    onZoomPointerDown,
    onZoomPointerMove,
    onZoomPointerEnd,
    onZoomKey,
  };
}
