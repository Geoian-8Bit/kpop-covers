import { motion, useReducedMotion } from 'motion/react';
import { Move } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { useMediaBox, ZoomLayer } from '@/player/ZoomLayer';
import {
  gestureZoom,
  isDoubleTap,
  isZoomed,
  keyZoom,
  mirrorZoom,
  NO_ZOOM,
  wheelZoom,
  zoomLabel,
  type Size as ZoomSize,
  type Zoom,
} from '@/player/zoom';
import {
  aspectOf,
  bestLayout,
  gestureFit,
  splitBounds,
  stageGesture,
  YOUTUBE_MIN_BOX,
  keyFit,
  wheelFit,
  YOUTUBE_ASPECT,
  type Aspect,
  type CompareMode,
  type Fit,
  type Pt,
  type Size,
  type ViewPrefs,
} from './reviewRules';
import { capturePointer } from './pointer';
import { useTapAnyFinger } from './tapAnyFinger';

/**
 * F5 · 51 · How the take and the original share the screen, «Biombo»: in «Separados» two lacquered panels joined by
 * a gold hinge (one above the other or side by side, whichever shows both pictures biggest); in «Superpuesto» the
 * original sits over the take in a screen frame, see-through, moved and scaled with two fingers (files only).
 *
 * The two media nodes never move in the React tree (only their boxes change), so switching mode never reloads a
 * video or the YouTube player. Boxes change by style, not by animating their size (no per-frame layout).
 */

interface CompareStageProps {
  mode: CompareMode;
  prefs: ViewPrefs;
  /** Share of the first panel chosen with the hinge (for one way only); null: the best for these two pictures. */
  split: ChosenSplit | null;
  onSplit: (split: ChosenSplit) => void;
  fit: Fit;
  /** `settled`: the gesture ended (save it). */
  onFit: (fit: Fit, settled: boolean) => void;
  mirrorTake: boolean;
  mirrorOriginal: boolean;
  take: ReactNode;
  original: ReactNode;
  /** The original is YouTube's player: never covered by a label, never zoomed. */
  originalIsYouTube: boolean;
  /** The take's saved size, until its video says its own. */
  takeAspect: Aspect;
  /** Drawn over the take, inside its mirror (a note's sketch). */
  takeExtra?: ReactNode;
  /** A plain tap on the frame (play / pause). */
  onTap?: () => void;
  /** Whether the review plays now (a tap that would start it never waits). */
  isPlaying?: () => boolean;
  /**
   * Side by side, the take's panel gets at least this many px (the settings float over it on a small phone on its
   * side: they may cover the take, never YouTube).
   */
  takeRoom?: number;
  /** Where the take's panel is (px in the stage), for what must sit over the take and never over YouTube. */
  onTakeRect?: (rect: { left: number; top: number; width: number; height: number } | null) => void;
  className?: string;
  /** F9 · Zoom over each (its picture's own fractions, inside its mirror). «Superpuesto»: the take's zoom takes in both. */
  zoomTake?: Zoom;
  zoomOriginal?: Zoom;
  /** Only a file original can be zoomed: YouTube's player is never altered. */
  canZoomOriginal?: boolean;
  onZoom?: (which: 'take' | 'original', zoom: Zoom) => void;
  /** A zoom gesture over an original that can't be zoomed (YouTube). */
  onZoomUnavailable?: () => void;
  /** «Superpuesto»: what the fingers do — fit the original over the take, or zoom both. */
  overlayGesture?: 'fit' | 'zoom';
  onOverlayGesture?: (gesture: 'fit' | 'zoom') => void;
}

/** A share set with the hinge, for the way the panels went then (turning the phone starts again from the best). */
export interface ChosenSplit {
  value: number;
  direction: 'row' | 'column';
}

/** What a gesture works on. */
type Target = 'fit' | 'take' | 'original' | 'both';

/** The hinge between the panels (px). */
const HINGE = 10;

type Rect = { left: number; top: number; width: number; height: number };

function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, Size] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setSize((current) =>
        current.width === el.clientWidth && current.height === el.clientHeight ? current : { width: el.clientWidth, height: el.clientHeight },
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

function panelRects(size: Size, row: boolean, split: number): [Rect, Rect] {
  const total = (row ? size.width : size.height) - HINGE;
  const first = Math.max(0, Math.round(total * split));
  const second = Math.max(0, total - first);
  if (row) {
    return [
      { left: 0, top: 0, width: first, height: size.height },
      { left: first + HINGE, top: 0, width: second, height: size.height },
    ];
  }
  return [
    { left: 0, top: 0, width: size.width, height: first },
    { left: 0, top: first + HINGE, width: size.width, height: second },
  ];
}

const rectStyle = (r: Rect) => ({ left: r.left, top: r.top, width: r.width, height: r.height });

export function CompareStage({
  mode,
  prefs,
  split: chosenSplit,
  onSplit,
  fit,
  onFit,
  mirrorTake,
  mirrorOriginal,
  take,
  original,
  originalIsYouTube,
  takeAspect,
  takeExtra,
  onTap,
  isPlaying,
  takeRoom,
  onTakeRect,
  className,
  zoomTake = NO_ZOOM,
  zoomOriginal = NO_ZOOM,
  canZoomOriginal = false,
  onZoom,
  onZoomUnavailable,
  overlayGesture = 'zoom',
  onOverlayGesture,
}: CompareStageProps) {
  const reduce = useReducedMotion();
  const [frameRef, size] = useSize<HTMLDivElement>();
  const overlay = mode === 'overlay';

  // ── F9 · What each zoom needs: its box and its video's own size. ──
  const takeBox = useMediaBox<HTMLDivElement>();
  const originalBox = useMediaBox<HTMLDivElement>();
  const [zoomLive, setZoomLive] = useState(false);

  // ── «Separados»: the way and the share that show both biggest; the hinge overrides the share. ──
  const originalFirst = prefs.order === 'original-first';
  const aTake = aspectOf(takeBox.media, takeAspect);
  const aOriginal = originalIsYouTube ? YOUTUBE_ASPECT : aspectOf(originalBox.media, YOUTUBE_ASPECT);
  // YouTube's player never under 200×200 (its terms): its panel keeps the room for it, by the layout and the hinge.
  const youtubeMin = originalIsYouTube ? YOUTUBE_MIN_BOX : null;
  const mins = (originalFirst ? [youtubeMin, null] : [null, youtubeMin]) as readonly [Size | null, Size | null];
  const auto = bestLayout(size, originalFirst ? aOriginal : aTake, originalFirst ? aTake : aOriginal, HINGE, mins);
  const row = auto.direction === 'row';
  const bounds = splitBounds(size, auto.direction, HINGE, mins);
  const chosen = chosenSplit?.direction === auto.direction ? chosenSplit.value : null;
  const total = (row ? size.width : size.height) - HINGE;
  const forced = takeRoom && row && total > 0 ? (originalFirst ? 1 - takeRoom / total : takeRoom / total) : null;
  const wanted = forced ?? chosen ?? auto.split;
  const split = forced == null && chosen == null ? auto.split : Math.min(bounds.max, Math.max(bounds.min, wanted));
  const full: Rect = { left: 0, top: 0, width: size.width, height: size.height };
  const [firstRect, secondRect] = panelRects(size, row, split);
  const originalRect = overlay ? full : originalFirst ? firstRect : secondRect;
  const takeRect = overlay ? full : originalFirst ? secondRect : firstRect;
  const onTakeRectRef = useRef(onTakeRect);
  onTakeRectRef.current = onTakeRect;
  const rectKey = size.width > 0 ? [takeRect.left, takeRect.top, takeRect.width, takeRect.height].join(',') : '';
  useEffect(() => {
    if (!rectKey) return onTakeRectRef.current?.(null);
    const [left, top, width, height] = rectKey.split(',').map(Number) as [number, number, number, number];
    onTakeRectRef.current?.({ left, top, width, height });
  }, [rectKey]);
  const originalOnTop = !overlay || prefs.onTop === 'original';

  /** Which one a point of the frame (px from its top-left) is on, for a gesture that starts there. */
  const targetAt = (p: Pt): Target => {
    // «Superpuesto»: the original moves only while «Encajar» is on; otherwise fingers zoom both.
    if (overlay) return overlayGesture === 'fit' ? 'fit' : 'both';
    const r = originalRect;
    return p.x >= r.left && p.x <= r.left + r.width && p.y >= r.top && p.y <= r.top + r.height ? 'original' : 'take';
  };
  /** The zoom a target works on, its box (px) and how to bring a frame point into it; null: not zoomable. */
  const zoomTarget = (target: Target) => {
    if (target === 'fit') return null;
    if (target === 'original' && !canZoomOriginal) return null;
    const rect = target === 'both' ? full : target === 'take' ? takeRect : originalRect;
    const which: 'take' | 'original' = target === 'original' ? 'original' : 'take';
    return {
      which,
      zoom: which === 'take' ? zoomTake : zoomOriginal,
      box: { width: rect.width, height: rect.height } as ZoomSize,
      media: which === 'take' ? takeBox.media : originalBox.media,
      mirrored: which === 'take' ? mirrorTake : mirrorOriginal,
      at: (p: Pt): Pt => ({ x: p.x - rect.left, y: p.y - rect.top }),
    };
  };

  // ── Gestures: in «Superpuesto» drag / two fingers / wheel fit the original over the take (or zoom both); in
  // «Separados» they zoom the one under the fingers. A tap plays; a double tap on a zoomed one shows it whole. ──
  /** Pointers in px from the frame's top-left. */
  const pointers = useRef(new Map<number, Pt>());
  /**
   * The gesture under way. `travelled`: a finger went past the threshold (then lifting is never a tap, whatever the
   * gesture); `moved`: something really moved (fit or zoom) and the fingers are captured.
   */
  const gesture = useRef<{ fit: Fit; zoom: Zoom; from: Pt[]; moved: boolean; travelled: boolean; at: number; target: Target } | null>(null);
  /** Where and when each finger went down: a second finger that only taps plays or pauses. */
  const downs = useRef(new Map<number, { x: number; y: number; at: number }>());
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(tapTimer.current), []);
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const onFitRef = useRef(onFit);
  onFitRef.current = onFit;

  const local = (e: { clientX: number; clientY: number }): Pt => {
    const rect = frameRef.current!.getBoundingClientRect();
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
      const spread = to.length === 2 && Math.abs(Math.hypot(to[0]!.x - to[1]!.x, to[0]!.y - to[1]!.y) - Math.hypot(g.from[0]!.x - g.from[1]!.x, g.from[0]!.y - g.from[1]!.y)) >= 8;
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
    if (!g.moved) for (const id of pointers.current.keys()) capturePointer({ currentTarget: e.currentTarget, pointerId: id });
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
        onFitRef.current(wheelFit(fitRef.current, delta, at, { width: rect.width, height: rect.height }), false);
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

  /**
   * «Separados»: each zoomable panel takes the keyboard when focused: + zooms in; once zoomed, the arrows move the
   * view, − zooms out and 0 shows it whole. Other keys (and arrows on a whole picture) go on to the review.
   */
  const panelKeys = (target: 'take' | 'original', label: string) => {
    if (overlay || !zoomTarget(target)) return {};
    return {
      tabIndex: 0,
      role: 'group',
      'data-zoom-panel': '',
      'aria-label': `${label}: + para ampliar; con zoom, flechas para mover, − para reducir y 0 para verlo entero`,
      onKeyDown: (e: ReactKeyboardEvent<HTMLDivElement>) => {
        const zt = zoomTarget(target);
        if (!zt || e.metaKey || e.ctrlKey || e.altKey) return;
        if (!isZoomed(zt.zoom) && e.key !== '+' && e.key !== '=') return;
        const next = keyZoom(zt.zoom, e.key, zt.box, zt.media, zt.mirrored);
        if (!next) return;
        e.preventDefault();
        e.stopPropagation();
        onZoom?.(zt.which, next);
      },
    };
  };

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!overlay) return;
    if (overlayGesture !== 'fit') {
      const zt = zoomTarget('both');
      const next = zt ? keyZoom(zt.zoom, e.key, zt.box, zt.media, zt.mirrored) : null;
      if (!next || !zt) return;
      e.preventDefault();
      e.stopPropagation();
      onZoom?.('take', next);
      return;
    }
    const next = keyFit(fitRef.current, e.key);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    onFitRef.current(next, true);
  }

  const fitTransform = overlay ? `translate(${fit.x * size.width}px, ${fit.y * size.height}px) scale(${fit.scale})` : 'none';
  const originalOpacity = overlay && originalOnTop ? prefs.opacity : 1;
  const takeOpacity = overlay && !originalOnTop ? prefs.opacity : 1;
  const flip = reduce ? { duration: 0 } : jelly;
  const fitTap = useTapAnyFinger(() => onOverlayGesture?.(overlayGesture === 'fit' ? 'zoom' : 'fit'));

  return (
    <div
      ref={frameRef}
      // Clipped and isolated: nothing on the stage (a zoomed or moved picture) can ever spread over the controls.
      className={cn('relative isolate size-full touch-none select-none overflow-hidden', className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={(e) => {
        // A finger that slid off before any gesture began (not captured): forget it, it was never a gesture.
        if (gesture.current?.moved || !pointers.current.has(e.pointerId)) return;
        pointers.current.delete(e.pointerId);
        downs.current.delete(e.pointerId);
        if (pointers.current.size === 0) gesture.current = null;
        else restart();
      }}
      onKeyDown={onKeyDown}
      tabIndex={overlay ? 0 : -1}
      role={overlay ? 'group' : undefined}
      aria-label={
        overlay
          ? overlayGesture !== 'fit'
            ? 'Zoom sobre los dos: pellizca o usa la rueda para ampliar, arrastra para mover, doble toque para verlos enteros; con el teclado, flechas, + o − y 0'
            : 'Encaje del original: arrastra para moverlo, pellizca o usa la rueda para escalarlo; con el teclado, flechas y + o −'
          : undefined
      }
    >
      {size.width > 0 && (
        <>
          {/* F9 · «Superpuesto» zooms both together, following the take's mirror; «Separados» zooms each panel. */}
          <ZoomLayer zoom={overlay ? mirrorZoom(zoomTake, mirrorTake) : NO_ZOOM} box={size} media={takeBox.media} live={zoomLive}>
            {/* The original */}
            <div
              ref={originalBox.ref}
              {...panelKeys('original', 'Original')}
              className={cn(
                'absolute overflow-hidden transition-opacity duration-200 motion-reduce:transition-none',
                PANEL_FOCUS,
                overlay ? 'rounded-none' : PANEL,
              )}
              style={{ ...rectStyle(originalRect), opacity: originalOpacity, zIndex: originalOnTop ? 2 : 1 }}
            >
              <div className="absolute inset-0" style={{ transform: fitTransform, transformOrigin: '50% 50%' }}>
                <motion.div className="absolute inset-0" initial={false} animate={{ scaleX: mirrorOriginal ? -1 : 1 }} transition={flip}>
                  <ZoomLayer
                    zoom={!overlay && canZoomOriginal ? zoomOriginal : NO_ZOOM}
                    box={originalBox.box}
                    media={originalBox.media}
                    live={zoomLive}
                  >
                    {original}
                  </ZoomLayer>
                </motion.div>
                {overlay && <OverlayFrame />}
              </div>
              {/* YouTube's player is never covered: its panel has no label (it shows its own name). */}
              {!overlay && !originalIsYouTube && (
                <PanelLabel>
                  Original{canZoomOriginal && isZoomed(zoomOriginal) ? ` · ${zoomLabel(zoomOriginal)}` : ''}
                </PanelLabel>
              )}
            </div>

            {/* The take */}
            <div
              ref={takeBox.ref}
              {...panelKeys('take', 'Toma')}
              className={cn(
                'absolute overflow-hidden transition-opacity duration-200 motion-reduce:transition-none',
                PANEL_FOCUS,
                overlay ? 'rounded-none' : PANEL,
              )}
              style={{ ...rectStyle(takeRect), opacity: takeOpacity, zIndex: originalOnTop ? 1 : 2 }}
            >
              <motion.div className="absolute inset-0" initial={false} animate={{ scaleX: mirrorTake ? -1 : 1 }} transition={flip}>
                <ZoomLayer zoom={overlay ? NO_ZOOM : zoomTake} box={takeBox.box} media={takeBox.media} live={zoomLive}>
                  {take}
                  {takeExtra}
                </ZoomLayer>
              </motion.div>
              {!overlay && <PanelLabel tone="take">Toma{isZoomed(zoomTake) ? ` · ${zoomLabel(zoomTake)}` : ''}</PanelLabel>}
            </div>
          </ZoomLayer>

          {!overlay && (
            <Hinge
              row={row}
              at={row ? firstRect.width : firstRect.height}
              split={split}
              bounds={bounds}
              total={(row ? size.width : size.height) - HINGE}
              onChange={(value) => onSplit({ value: Math.min(bounds.max, Math.max(bounds.min, value)), direction: auto.direction })}
            />
          )}
          {overlay && (
            <span className="pointer-events-none absolute left-2 top-2 z-[3] rounded-[8px] bg-sumi-950/80 px-2 py-1 text-[12px] font-medium text-washi-muted">
              {originalOnTop ? 'Original encima' : 'Toma encima'} · se ve al {Math.round(prefs.opacity * 100)} %
              {fit.scale !== 1 ? ` · tamaño ${Math.round(fit.scale * 100)} %` : ''}
              {isZoomed(zoomTake) ? ` · ${zoomLabel(zoomTake)}` : ''}
            </span>
          )}
          {overlay && onOverlayGesture && (
            <motion.button
              type="button"
              aria-pressed={overlayGesture === 'fit'}
              aria-label={
                overlayGesture === 'fit'
                  ? 'Encajando el original: arrastra para moverlo y pellizca para escalarlo. Pulsa para terminar'
                  : 'Encajar el original sobre la toma'
              }
              title={overlayGesture === 'fit' ? 'Terminar de encajar' : 'Encajar el original'}
              {...fitTap}
              onPointerDown={(e) => {
                e.stopPropagation();
                fitTap.onPointerDown(e);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                fitTap.onPointerUp(e);
              }}
              whileTap={reduce ? undefined : { scale: 0.9 }}
              transition={jelly}
              className={cn(
                'absolute right-2 top-2 z-[5] flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-bold',
                overlayGesture === 'fit' ? 'bg-washi text-sumi-900' : 'bg-sumi-950/85 text-washi',
              )}
            >
              <Move className="size-4" />
              {overlayGesture === 'fit' ? 'Listo' : 'Encajar'}
            </motion.button>
          )}
        </>
      )}
    </div>
  );
}

/** A lacquered panel of the screen: ink inside, a gold hairline at the edge (its border: it never covers the picture). */
const PANEL = 'rounded-[12px] border border-kin-400/45 bg-sumi-950';
const PANEL_FOCUS = 'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kin-300';

function PanelLabel({ children, tone }: { children: ReactNode; tone?: 'take' }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute left-2 top-2 z-[3] rounded-[7px] bg-sumi-950/80 px-2 py-0.5 text-[12px] font-bold',
        tone === 'take' ? 'text-shu-300' : 'text-kin-300',
      )}
    >
      {children}
    </span>
  );
}

/** «Superpuesto»: the original's screen frame — a gold edge and the two folds of a three-leaf byōbu. */
function OverlayFrame() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[4px] shadow-[inset_0_0_0_2px_var(--color-kin-400)]">
      <span className="absolute inset-y-0 left-1/3 w-px bg-kin-400/30" />
      <span className="absolute inset-y-0 left-2/3 w-px bg-kin-400/30" />
    </div>
  );
}

/**
 * «Separados»: the gold hinge between the panels; drag it (or use the arrows) to share the space, within what keeps
 * YouTube's player whole. While dragging only the hinge moves (a transform): the panels — and YouTube's iframe — take
 * their new size once, on release.
 */
function Hinge({
  row,
  at,
  split,
  bounds,
  total,
  onChange,
}: {
  row: boolean;
  /** Where the hinge starts (px from the frame's start). */
  at: number;
  split: number;
  bounds: { min: number; max: number };
  total: number;
  onChange: (split: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ start: number; split: number; next: number } | null>(null);
  const centre = at + HINGE / 2;
  const clampTo = (value: number) => Math.min(bounds.max, Math.max(bounds.min, value));
  const end = (commit: boolean) => {
    const d = drag.current;
    drag.current = null;
    ref.current?.style.removeProperty('transform');
    if (commit && d && d.next !== d.split) onChange(d.next);
  };
  return (
    <div
      ref={ref}
      role="separator"
      tabIndex={0}
      aria-orientation={row ? 'vertical' : 'horizontal'}
      aria-label="Reparto entre el original y la toma"
      aria-valuemin={Math.round(bounds.min * 100)}
      aria-valuemax={Math.round(bounds.max * 100)}
      aria-valuenow={Math.round(split * 100)}
      onPointerDown={(e) => {
        e.stopPropagation();
        capturePointer(e);
        drag.current = { start: row ? e.clientX : e.clientY, split, next: split };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || total <= 0) return;
        e.stopPropagation();
        d.next = clampTo(d.split + ((row ? e.clientX : e.clientY) - d.start) / total);
        const px = (d.next - d.split) * total;
        ref.current?.style.setProperty('transform', row ? `translateX(${px}px)` : `translateY(${px}px)`);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        end(true);
      }}
      onPointerCancel={() => end(false)}
      onKeyDown={(e) => {
        const back = row ? 'ArrowLeft' : 'ArrowUp';
        const fwd = row ? 'ArrowRight' : 'ArrowDown';
        if (e.key !== back && e.key !== fwd) return;
        e.preventDefault();
        e.stopPropagation();
        onChange(clampTo(split + (e.key === fwd ? 0.05 : -0.05)));
      }}
      className={cn(
        'group absolute z-[4] flex items-center justify-center rounded-[8px] outline-none will-change-transform focus-visible:bg-kin-300/15',
        row ? 'top-0 h-full w-11 cursor-col-resize' : 'left-0 h-11 w-full cursor-row-resize',
      )}
      style={row ? { left: centre - 22 } : { top: centre - 22 }}
    >
      {/* A gold rod with two hinge plates; the grip in the middle lights up under the finger or the focus. */}
      <span aria-hidden className={cn('relative', row ? 'h-full w-px bg-kin-400/50' : 'h-px w-full bg-kin-400/50')}>
        {[0.22, 0.78].map((f) => (
          <span
            key={f}
            className={cn('absolute rounded-[2px] bg-kin-400', row ? 'left-1/2 h-5 w-[5px] -translate-x-1/2' : 'top-1/2 h-[5px] w-5 -translate-y-1/2')}
            style={row ? { top: `calc(${f * 100}% - 10px)` } : { left: `calc(${f * 100}% - 10px)` }}
          />
        ))}
        <span
          className={cn(
            'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-kin-300 shadow-[0_0_0_3px_var(--color-sumi-950)] group-hover:scale-125 group-focus-visible:scale-125 group-active:scale-125',
            row ? 'h-8 w-[5px]' : 'h-[5px] w-8',
          )}
        />
      </span>
    </div>
  );
}
