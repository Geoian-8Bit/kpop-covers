import { motion } from 'motion/react';
import { Move, ZoomIn } from 'lucide-react';
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
import { jelly, snappy } from '@/lib/motion';
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
  clampSplit,
  gestureFit,
  keyFit,
  wheelFit,
  type CompareMode,
  type Fit,
  type Pt,
  type Size,
  type ViewPrefs,
} from './reviewRules';
import { capturePointer } from './pointer';

/**
 * F5 · How the take and the original share the screen, «Biombo»: in «Apilado» two panels hinged like a byōbu
 * folding screen; in «Superpuesto» the original sits in a lacquered screen frame you move and scale with two
 * fingers.
 *
 * The two media nodes never move in the React tree (only their boxes change), so switching mode never reloads a
 * video or the YouTube player.
 */

interface CompareStageProps {
  mode: CompareMode;
  prefs: ViewPrefs;
  onPrefs: (patch: Partial<ViewPrefs>) => void;
  fit: Fit;
  /** `settled`: the gesture ended (save it). */
  onFit: (fit: Fit, settled: boolean) => void;
  mirrorTake: boolean;
  mirrorOriginal: boolean;
  take: ReactNode;
  original: ReactNode;
  /** Drawn over the take, inside its mirror (a note's sketch). */
  takeExtra?: ReactNode;
  /** A plain tap on the frame (play / pause). */
  onTap?: () => void;
  labels?: { take: string; original: string };
  className?: string;
  /**
   * F9 · Zoom over each (its picture's own fractions, inside its mirror). «Superpuesto»: the take's zoom takes in
   * both, following the take's mirror; the original keeps its fit over the take.
   */
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

/** What a gesture works on. */
type Target = 'fit' | 'take' | 'original' | 'both';

const HINGE = 12;

type Rect = { left: number; top: number; width: number; height: number };

function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, Size] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

/** The two boxes of «Apilado»: side by side when the frame is wider than tall, else one above the other. */
function stackedRects(size: Size, split: number): [Rect, Rect] {
  const row = size.width >= size.height;
  const total = row ? size.width : size.height;
  const first = Math.max(0, total * split - HINGE / 2);
  const second = Math.max(0, total - first - HINGE);
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

export function CompareStage({
  mode,
  prefs,
  onPrefs,
  fit,
  onFit,
  mirrorTake,
  mirrorOriginal,
  take,
  original,
  takeExtra,
  onTap,
  labels = { take: 'Tu toma', original: 'Original' },
  className,
  zoomTake = NO_ZOOM,
  zoomOriginal = NO_ZOOM,
  canZoomOriginal = false,
  onZoom,
  onZoomUnavailable,
  overlayGesture = 'fit',
  onOverlayGesture,
}: CompareStageProps) {
  const [frameRef, size] = useSize<HTMLDivElement>();
  const overlay = mode === 'overlay';
  const row = size.width >= size.height;
  const full: Rect = { left: 0, top: 0, width: size.width, height: size.height };
  const [firstRect, secondRect] = stackedRects(size, prefs.split);
  const originalFirst = prefs.order === 'original-first';
  const originalRect = overlay ? full : originalFirst ? firstRect : secondRect;
  const takeRect = overlay ? full : originalFirst ? secondRect : firstRect;
  const originalOnTop = !overlay || prefs.onTop === 'original';

  // ── F9 · What each zoom needs: its box and its video's own size. ──
  const takeBox = useMediaBox<HTMLDivElement>();
  const originalBox = useMediaBox<HTMLDivElement>();
  const [zoomLive, setZoomLive] = useState(false);

  /** Which one a point of the frame (px from its top-left) is on, for a gesture that starts there. */
  const targetAt = (p: Pt): Target => {
    if (overlay) return overlayGesture === 'zoom' ? 'both' : 'fit';
    const r = originalRect;
    return p.x >= r.left && p.x <= r.left + r.width && p.y >= r.top && p.y <= r.top + r.height
      ? 'original'
      : 'take';
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
  // «Apilado» they zoom the one under the fingers. A tap plays; a double tap on a zoomed one shows it whole. ──
  /** Pointers in px from the frame's top-left. */
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{
    fit: Fit;
    zoom: Zoom;
    from: Pt[];
    moved: boolean;
    at: number;
    target: Target;
  } | null>(null);
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
      at: gesture.current?.at ?? performance.now(),
      target,
    };
  };

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    capturePointer(e);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) gesture.current = null;
    restart();
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, local(e));
    const to = [...pointers.current.values()].slice(0, 2);
    const g = gesture.current;
    if (to.length !== g.from.length) return;
    const travel = Math.hypot(to[0]!.x - g.from[0]!.x, to[0]!.y - g.from[0]!.y);
    if (!g.moved && travel < 6 && to.length === 1) return;
    g.moved = true;
    if (g.target === 'fit') {
      onFitRef.current(gestureFit(g.fit, g.from.map(centred), to.map(centred), size), false);
      return;
    }
    const zt = zoomTarget(g.target);
    if (!zt) {
      if (to.length === 2) onZoomUnavailable?.();
      return;
    }
    // One finger on a whole picture: nothing to move.
    if (to.length === 1 && !isZoomed(g.zoom)) return;
    setZoomLive(true);
    onZoom?.(zt.which, gestureZoom(g.zoom, g.from.map(zt.at), to.map(zt.at), zt.box, zt.media, zt.mirrored));
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const point = pointers.current.get(e.pointerId)!;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      restart(); // one finger lifted: carry on with the other from here
      return;
    }
    gesture.current = null;
    setZoomLive(false);
    if (!g) return;
    if (!g.moved && performance.now() - g.at < 450) tap(g.target, point);
    else if (g.target === 'fit' && g.moved) onFitRef.current(fitRef.current, true);
  }

  /** Zoomed in, a single tap waits a moment: a second one shows the whole picture instead of playing. */
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
    tapTimer.current = setTimeout(() => onTap?.(), 300);
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

  /**
   * «Apilado»: each zoomable panel takes the keyboard when focused: + zooms in; once zoomed, the arrows move the
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
  const PANEL_FOCUS = 'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-kin-300';

  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!overlay) return;
    if (overlayGesture === 'zoom') {
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

  const fitTransform = overlay
    ? `translate(${fit.x * size.width}px, ${fit.y * size.height}px) scale(${fit.scale})`
    : 'none';
  const originalOpacity = overlay && originalOnTop ? prefs.opacity : 1;
  const takeOpacity = overlay && !originalOnTop ? prefs.opacity : 1;

  return (
    <div
      ref={frameRef}
      className={cn('relative size-full touch-none select-none overflow-hidden bg-sumi-950', className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      tabIndex={overlay ? 0 : -1}
      role={overlay ? 'group' : undefined}
      aria-label={
        overlay
          ? overlayGesture === 'zoom'
            ? 'Zoom sobre los dos: pellizca o usa la rueda para ampliar, arrastra para mover, doble toque para verlos enteros; con el teclado, flechas, + o − y 0'
            : 'Encaje del original: arrastra para moverlo, pellizca o usa la rueda para escalarlo; con el teclado, flechas y + o −'
          : undefined
      }
    >
      {size.width > 0 && (
        <>
          {/* F9 · «Superpuesto» zooms both together, following the take's mirror; «Apilado» zooms each panel. */}
          <ZoomLayer
            zoom={overlay ? mirrorZoom(zoomTake, mirrorTake) : NO_ZOOM}
            box={size}
            media={takeBox.media}
            live={zoomLive}
          >
            {/* The original */}
            <motion.div
              ref={originalBox.ref}
              {...panelKeys('original', labels.original)}
              className={cn('absolute overflow-hidden', PANEL_FOCUS, !overlay && PANEL_FRAME)}
              initial={false}
              animate={{ ...originalRect, opacity: originalOpacity }}
              transition={snappy}
              // Clipped to its box, so the panel's outer shadow stays hidden as it always has.
              style={{ zIndex: originalOnTop ? 2 : 1, clipPath: 'inset(0 0 0 0)' }}
            >
              <div
                className="absolute inset-0"
                style={{ transform: fitTransform, transformOrigin: '50% 50%' }}
              >
                <div className="absolute inset-0">
                  <motion.div
                    className="absolute inset-0"
                    initial={false}
                    animate={{ scaleX: mirrorOriginal ? -1 : 1 }}
                    transition={jelly}
                  >
                    <ZoomLayer
                      zoom={!overlay && canZoomOriginal ? zoomOriginal : NO_ZOOM}
                      box={originalBox.box}
                      media={originalBox.media}
                      live={zoomLive}
                    >
                      {original}
                    </ZoomLayer>
                  </motion.div>
                  {overlay && <OverlayDress />}
                </div>
              </div>
              {!overlay && (
                <PanelLabel>
                  {labels.original}
                  {canZoomOriginal && isZoomed(zoomOriginal) ? ` · ${zoomLabel(zoomOriginal)}` : ''}
                </PanelLabel>
              )}
            </motion.div>

            {/* The take */}
            <motion.div
              ref={takeBox.ref}
              {...panelKeys('take', labels.take)}
              className={cn('absolute overflow-hidden', PANEL_FOCUS, !overlay && PANEL_FRAME)}
              initial={false}
              animate={{ ...takeRect, opacity: takeOpacity }}
              transition={snappy}
              style={{ zIndex: originalOnTop ? 1 : 2 }}
            >
              <motion.div
                className="absolute inset-0"
                initial={false}
                animate={{ scaleX: mirrorTake ? -1 : 1 }}
                transition={jelly}
              >
                <ZoomLayer
                  zoom={overlay ? NO_ZOOM : zoomTake}
                  box={takeBox.box}
                  media={takeBox.media}
                  live={zoomLive}
                >
                  {take}
                  {takeExtra}
                </ZoomLayer>
              </motion.div>
              {!overlay && (
                <PanelLabel>
                  {labels.take}
                  {isZoomed(zoomTake) ? ` · ${zoomLabel(zoomTake)}` : ''}
                </PanelLabel>
              )}
            </motion.div>
          </ZoomLayer>

          {!overlay && (
            <Hinge
              row={row}
              split={prefs.split}
              size={size}
              onChange={(split) => onPrefs({ split: clampSplit(split) })}
            />
          )}
          {overlay && (
            <span className="pointer-events-none absolute left-2 top-2 z-[3] rounded-[6px] bg-sumi-950/75 px-2 py-1 text-[11px] font-medium text-washi-muted">
              {originalOnTop ? `${labels.original} encima` : `${labels.take} encima`} ·{' '}
              {Math.round(fit.scale * 100)} %{isZoomed(zoomTake) ? ` · ampliado ${zoomLabel(zoomTake)}` : ''}
            </span>
          )}
          {overlay && onOverlayGesture && (
            <motion.button
              type="button"
              aria-pressed={overlayGesture === 'zoom'}
              aria-label={
                overlayGesture === 'zoom'
                  ? 'Los gestos amplían los dos. Pulsa para que encajen el original'
                  : 'Los gestos encajan el original. Pulsa para que amplíen los dos'
              }
              title={overlayGesture === 'zoom' ? 'Gestos: ampliar los dos' : 'Gestos: encajar el original'}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={() => onOverlayGesture(overlayGesture === 'zoom' ? 'fit' : 'zoom')}
              whileTap={{ scale: 0.9 }}
              transition={jelly}
              className={cn(
                'absolute right-2 top-2 z-[5] flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-[12px] font-bold',
                overlayGesture === 'zoom' ? 'bg-washi text-sumi-900' : 'bg-sumi-950/80 text-washi',
              )}
            >
              {overlayGesture === 'zoom' ? <ZoomIn className="size-4" /> : <Move className="size-4" />}
              {overlayGesture === 'zoom' ? 'Ampliar' : 'Encajar'}
            </motion.button>
          )}
        </>
      )}
    </div>
  );
}

/** Lacquered screen panel: gold hairline inside a sumi border. */
const PANEL_FRAME =
  'rounded-[3px] shadow-[inset_0_0_0_1px_var(--color-kin-400),inset_0_0_0_4px_var(--color-sumi-900),0_10px_24px_-14px_var(--color-sumi-950)]';

function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-2 top-2 z-[3] rounded-[6px] bg-sumi-950/80 px-2 py-1 text-[11px] font-bold tracking-[0.04em] text-kin-300">
      {children}
    </span>
  );
}

/** What dresses the original over the take: a screen frame. */
function OverlayDress() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[2px] shadow-[inset_0_0_0_2px_var(--color-kin-400)]"
    >
      <span className="absolute inset-y-0 left-1/3 w-px bg-kin-400/35" />
      <span className="absolute inset-y-0 left-2/3 w-px bg-kin-400/35" />
    </div>
  );
}

/** «Apilado»: the joint between the panels; drag it (or use the arrows) to share the space 30–70 %. */
function Hinge({
  row,
  split,
  size,
  onChange,
}: {
  row: boolean;
  split: number;
  size: Size;
  onChange: (split: number) => void;
}) {
  const total = row ? size.width : size.height;
  const at = total * split - HINGE / 2;
  const drag = useRef<{ start: number; split: number } | null>(null);
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={row ? 'vertical' : 'horizontal'}
      aria-label="Reparto entre el original y la toma"
      aria-valuemin={30}
      aria-valuemax={70}
      aria-valuenow={Math.round(split * 100)}
      onPointerDown={(e) => {
        e.stopPropagation();
        capturePointer(e);
        drag.current = { start: row ? e.clientX : e.clientY, split };
      }}
      onPointerMove={(e) => {
        if (!drag.current || total <= 0) return;
        e.stopPropagation();
        onChange(drag.current.split + ((row ? e.clientX : e.clientY) - drag.current.start) / total);
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        drag.current = null;
      }}
      onKeyDown={(e) => {
        const back = row ? 'ArrowLeft' : 'ArrowUp';
        const fwd = row ? 'ArrowRight' : 'ArrowDown';
        if (e.key !== back && e.key !== fwd) return;
        e.preventDefault();
        e.stopPropagation();
        onChange(split + (e.key === fwd ? 0.05 : -0.05));
      }}
      className={cn(
        'group absolute z-[4] flex items-center justify-center',
        row
          ? 'top-0 h-full w-11 cursor-col-resize flex-col'
          : 'left-0 h-11 w-full cursor-row-resize flex-row',
      )}
      style={row ? { left: at + HINGE / 2 - 22 } : { top: at + HINGE / 2 - 22 }}
    >
      <span
        aria-hidden
        className={cn(
          'flex items-center justify-around rounded-[2px]',
          row ? 'h-full w-[6px] flex-col py-[18%]' : 'h-[6px] w-full flex-row px-[18%]',
          'bg-sumi-800 shadow-[0_0_0_1px_var(--color-kin-400)]',
        )}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn('rounded-[1px] bg-kin-400', row ? 'h-4 w-[10px]' : 'h-[10px] w-4')} />
        ))}
      </span>
      <motion.span
        aria-hidden
        className="absolute grid size-7 place-items-center rounded-full bg-washi text-[10px] font-bold text-sumi-900 opacity-0 shadow-[0_4px_10px_-4px_var(--color-sumi-950)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        whileTap={{ scale: 0.85 }}
        transition={jelly}
      >
        {Math.round(split * 100)}
      </motion.span>
    </div>
  );
}
