import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import {
  gestureZoom,
  isDoubleTap,
  isZoomed,
  NO_ZOOM,
  wheelZoom,
  type Size as ZoomSize,
  type Zoom,
} from '@/player/zoom';
import { capturePointer } from './pointer';
import { gestureFit, stageGesture, wheelFit, type Fit, type Pt, type Size } from './reviewRules';
import type { Target } from './stageLayout';

/** The zoom a target works on, its box (px) and how to bring a frame point into it (see `CompareStage`). */
export interface ZoomTarget {
  which: 'take' | 'original';
  zoom: Zoom;
  box: ZoomSize;
  media: Size | null;
  mirrored: boolean;
  at: (p: Pt) => Pt;
}

interface StageGestureInput {
  frameRef: RefObject<HTMLDivElement | null>;
  size: Size;
  overlay: boolean;
  fit: Fit;
  onFit: (fit: Fit, settled: boolean) => void;
  targetAt: (p: Pt) => Target;
  zoomTarget: (target: Target) => ZoomTarget | null;
  setZoomLive: (live: boolean) => void;
  onTap?: () => void;
  isPlaying?: () => boolean;
  onZoom?: (which: 'take' | 'original', zoom: Zoom) => void;
  onZoomUnavailable?: () => void;
}

/**
 * REQ-27 · The stage's pointer, tap and wheel gestures, moved out of `CompareStage` as they were. REQ-25 · The
 * frame's rect is cached for the gesture under way.
 */
export function useStageGestures({
  frameRef,
  size,
  overlay,
  fit,
  onFit,
  targetAt,
  zoomTarget,
  setZoomLive,
  onTap,
  isPlaying,
  onZoom,
  onZoomUnavailable,
}: StageGestureInput) {
  // ── Gestures: in «Superpuesto» drag / two fingers / wheel fit the original over the take (or zoom both); in
  // «Separados» they zoom the one under the fingers. A tap plays; a double tap on a zoomed one shows it whole. ──
  /** Pointers in px from the frame's top-left. */
  const pointers = useRef(new Map<number, Pt>());
  /**
   * The gesture under way. `travelled`: a finger went past the threshold (then lifting is never a tap, whatever the
   * gesture); `moved`: something really moved (fit or zoom) and the fingers are captured.
   */
  const gesture = useRef<{
    fit: Fit;
    zoom: Zoom;
    from: Pt[];
    moved: boolean;
    travelled: boolean;
    at: number;
    target: Target;
  } | null>(null);
  /** Where and when each finger went down: a second finger that only taps plays or pauses. */
  const downs = useRef(new Map<number, { x: number; y: number; at: number }>());
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(tapTimer.current), []);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const onFitRef = useRef(onFit);
  onFitRef.current = onFit;

  /**
   * REQ-25 · The frame's rect, read once when a gesture's first finger goes down and kept until the last lifts
   * (re-read if the frame resizes meanwhile, a turn): no forced layout read on every pointermove.
   */
  const frameRect = useRef<DOMRect | null>(null);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (frameRect.current) frameRect.current = el.getBoundingClientRect();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [frameRef]);
  const local = (e: { clientX: number; clientY: number }): Pt => {
    const rect = frameRect.current ?? frameRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  /** The frame's centre is the fit's origin. */
  const centred = (p: Pt): Pt => ({ x: p.x - size.width / 2, y: p.y - size.height / 2 });
  const restart = () => {
    const from = [...pointers.current.values()].slice(0, 2);
    const target = gesture.current?.target ?? targetAt(from[0]!);
    const zt = zoomTarget(target);
    gesture.current = {
      fit: fitRef.current,
      zoom: zt?.zoom ?? NO_ZOOM,
      from,
      moved: gesture.current?.moved ?? false,
      travelled: gesture.current?.travelled ?? false,
      at: gesture.current?.at ?? performance.now(),
      target,
    };
  };

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // No capture yet: a tap or a resting finger takes nothing; the pointer is captured once a gesture really starts.
    if (pointers.current.size === 0) frameRect.current = frameRef.current!.getBoundingClientRect();
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    downs.current.set(e.pointerId, { ...p, at: performance.now() });
    if (pointers.current.size === 1) gesture.current = null;
    restart();
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, local(e));
    const to = [...pointers.current.values()].slice(0, 2);
    const g = gesture.current;
    if (to.length !== g.from.length) return;
    if (!g.travelled) {
      // Past the threshold only when a finger really slid (6 px) or two fingers really spread or pinched (8 px): a
      // resting thumb's tremor and another finger's tap never zoom.
      const slid = to.some((pt, i) => Math.hypot(pt.x - g.from[i]!.x, pt.y - g.from[i]!.y) >= 6);
      const spread =
        to.length === 2 &&
        Math.abs(
          Math.hypot(to[0]!.x - to[1]!.x, to[0]!.y - to[1]!.y) -
            Math.hypot(g.from[0]!.x - g.from[1]!.x, g.from[0]!.y - g.from[1]!.y),
        ) >= 8;
      if (!slid && !spread) return;
      g.travelled = true;
    }
    const zt = zoomTarget(g.target);
    const kind = stageGesture({
      overlay,
      fitting: g.target === 'fit',
      fingers: to.length,
      zoomed: isZoomed(g.zoom),
      zoomable: zt != null,
    });
    if (kind === 'none') {
      // A finger on a whole picture (a thumb holding the phone): nothing moves, nothing is taken.
      if (!zt && to.length === 2 && g.target !== 'fit') onZoomUnavailable?.();
      return;
    }
    if (!g.moved)
      for (const id of pointers.current.keys())
        capturePointer({ currentTarget: e.currentTarget, pointerId: id });
    g.moved = true;
    if (kind === 'fit') {
      onFitRef.current(gestureFit(g.fit, g.from.map(centred), to.map(centred), size), false);
      return;
    }
    if (!zt) return;
    setZoomLive(true);
    onZoom?.(zt.which, gestureZoom(g.zoom, g.from.map(zt.at), to.map(zt.at), zt.box, zt.media, zt.mirrored));
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const point = pointers.current.get(e.pointerId)!;
    const down = downs.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    downs.current.delete(e.pointerId);
    const g = gesture.current;
    const quick = (at: number) => performance.now() - at < 450;
    if (pointers.current.size > 0) {
      // A second finger that only tapped (a thumb rests on the screen): play or pause, inside this touch.
      const still = down != null && Math.hypot(point.x - down.x, point.y - down.y) < 6;
      if (e.type !== 'pointercancel' && g && !g.moved && still && quick(down.at)) onTap?.();
      restart(); // carry on with the other finger from here
      if (gesture.current) gesture.current.travelled = true; // the resting one lifting later is no tap
      return;
    }
    gesture.current = null;
    frameRect.current = null;
    setZoomLive(false);
    if (!g) return;
    // A cancelled pointer (the system took it) or a slide is never a tap.
    if (e.type !== 'pointercancel' && !g.travelled && quick(g.at)) tap(g.target, point);
    else if (g.target === 'fit' && g.moved) onFitRef.current(fitRef.current, true);
  }

  /**
   * A tap plays or pauses. Playing always happens inside the tap (a phone only lets the take play with sound so).
   * Zoomed in, a second quick tap shows the whole picture: so a pause waits a moment (pausing needs no tap), while a
   * play starts at once and the second tap only resets the zoom.
   */
  function tap(target: Target, point: Pt) {
    clearTimeout(tapTimer.current);
    const zt = zoomTarget(target);
    if (!zt || !isZoomed(zt.zoom)) {
      lastTap.current = null;
      onTap?.();
      return;
    }
    const now = { at: performance.now(), x: point.x, y: point.y };
    if (isDoubleTap(lastTap.current, now)) {
      lastTap.current = null;
      onZoom?.(zt.which, NO_ZOOM);
      return;
    }
    lastTap.current = now;
    if (!isPlaying?.()) onTap?.();
    else tapTimer.current = setTimeout(() => onTap?.(), 300);
  }

  // The wheel needs a non-passive listener (React's is passive).
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const wheelRef = useRef({ targetAt, zoomTarget, onZoom, onZoomUnavailable });
  wheelRef.current = { targetAt, zoomTarget, onZoom, onZoomUnavailable };
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const w = wheelRef.current;
      const target = w.targetAt(p);
      e.preventDefault();
      clearTimeout(settleTimer.current);
      if (target === 'fit') {
        const at = { x: p.x - rect.width / 2, y: p.y - rect.height / 2 };
        onFitRef.current(
          wheelFit(fitRef.current, delta, at, { width: rect.width, height: rect.height }),
          false,
        );
        settleTimer.current = setTimeout(() => onFitRef.current(fitRef.current, true), 250);
        return;
      }
      const zt = w.zoomTarget(target);
      if (!zt) {
        if (delta < 0) w.onZoomUnavailable?.();
        return;
      }
      setZoomLive(true);
      w.onZoom?.(zt.which, wheelZoom(zt.zoom, delta, zt.at(p), zt.box, zt.media, zt.mirrored));
      settleTimer.current = setTimeout(() => setZoomLive(false), 200);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      clearTimeout(settleTimer.current);
    };
  }, [frameRef]);

  function onPointerLeave(e: ReactPointerEvent<HTMLDivElement>) {
    // A finger that slid off before any gesture began (not captured): forget it, it was never a gesture.
    if (gesture.current?.moved || !pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    downs.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      frameRect.current = null;
    } else restart();
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, fitRef, onFitRef };
}
