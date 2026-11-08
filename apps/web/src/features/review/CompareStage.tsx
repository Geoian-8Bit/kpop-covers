import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import {
  isZoomed,
  keyZoom,
  mirrorZoom,
  NO_ZOOM,
  type Size as ZoomSize,
  type Zoom,
  zoomLabel,
} from '@/player/zoom';
import { useMediaBox, ZoomLayer } from '@/player/ZoomLayer';
import { Move } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Hinge } from './Hinge';
import {
  type Aspect,
  aspectOf,
  bestLayout,
  type CompareMode,
  type Fit,
  keyFit,
  type Pt,
  type Size,
  splitBounds,
  type ViewPrefs,
  YOUTUBE_ASPECT,
  YOUTUBE_MIN_BOX,
} from './reviewRules';
import { OverlayFrame, PANEL, PANEL_FOCUS, PanelLabel } from './StageChrome';
import { HINGE, panelRects, type Rect, rectStyle, type Target } from './stageLayout';
import { useTapAnyFinger } from './tapAnyFinger';
import { useStageGestures } from './useStageGestures';
import { useStageSize } from './useStageSize';

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
  /**
   * One of the two alone and big («Solo toma», or a video being placed in «Sincronía»); the other stays mounted (no
   * reload) but hidden. With a panel over the take's side (`takeRoom`) it keeps to the rest of the stage.
   */
  alone?: 'take' | 'original' | null;
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

export function CompareStage({
  mode,
  prefs,
  split: chosenSplit,
  onSplit,
  fit,
  onFit,
  mirrorTake,
  mirrorOriginal,
  alone = null,
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
  const [frameRef, size] = useStageSize<HTMLDivElement>();
  const overlay = mode === 'overlay' && !alone;

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
  const mins = (originalFirst ? [youtubeMin, null] : [null, youtubeMin]) as readonly [
    Size | null,
    Size | null,
  ];
  const auto = bestLayout(
    size,
    originalFirst ? aOriginal : aTake,
    originalFirst ? aTake : aOriginal,
    HINGE,
    mins,
  );
  const row = auto.direction === 'row';
  const bounds = splitBounds(size, auto.direction, HINGE, mins);
  const chosen = chosenSplit?.direction === auto.direction ? chosenSplit.value : null;
  const total = (row ? size.width : size.height) - HINGE;
  const forced =
    takeRoom && row && total > 0 ? (originalFirst ? 1 - takeRoom / total : takeRoom / total) : null;
  const wanted = forced ?? chosen ?? auto.split;
  const split =
    forced == null && chosen == null ? auto.split : Math.min(bounds.max, Math.max(bounds.min, wanted));
  const full: Rect = { left: 0, top: 0, width: size.width, height: size.height };
  const [firstRect, secondRect] = panelRects(size, row, split);
  // Alone beside the panel over the take's side: the uncovered rest of the stage.
  const aloneRoom = alone && takeRoom && size.width - takeRoom >= 120 ? size.width - takeRoom : null;
  const whole: Rect = aloneRoom
    ? { left: originalFirst ? 0 : takeRoom!, top: 0, width: aloneRoom, height: size.height }
    : full;
  const originalRect = overlay ? full : alone ? whole : originalFirst ? firstRect : secondRect;
  const takeRect = overlay ? full : alone ? whole : originalFirst ? secondRect : firstRect;
  const onTakeRectRef = useRef(onTakeRect);
  onTakeRectRef.current = onTakeRect;
  const rectKey =
    size.width > 0 ? [takeRect.left, takeRect.top, takeRect.width, takeRect.height].join(',') : '';
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
    if (alone) return alone;
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

  // ── Gestures (useStageGestures): in «Superpuesto» drag / two fingers / wheel fit the original over the take (or zoom
  // both); in «Separados» they zoom the one under the fingers. A tap plays; a double tap on a zoomed one shows it whole. ──
  const { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, fitRef, onFitRef } = useStageGestures({
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
  });

  /**
   * «Separados»: each zoomable panel takes the keyboard when focused: + zooms in; once zoomed, the arrows move the
   * view, − zooms out and 0 shows it whole. Other keys (and arrows on a whole picture) go on to the review.
   */
  const panelKeys = (target: 'take' | 'original', label: string) => {
    if (overlay || (alone && target !== alone) || !zoomTarget(target)) return {};
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

  const fitTransform = overlay
    ? `translate(${fit.x * size.width}px, ${fit.y * size.height}px) scale(${fit.scale})`
    : 'none';
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
      onPointerLeave={onPointerLeave}
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
          <ZoomLayer
            zoom={overlay ? mirrorZoom(zoomTake, mirrorTake) : NO_ZOOM}
            box={size}
            media={takeBox.media}
            live={zoomLive}
          >
            {/* The original */}
            <div
              ref={originalBox.ref}
              {...panelKeys('original', 'Original')}
              className={cn(
                'absolute overflow-hidden transition-opacity duration-200 motion-reduce:transition-none',
                PANEL_FOCUS,
                overlay ? 'rounded-none' : PANEL,
              )}
              style={{
                ...rectStyle(originalRect),
                opacity: originalOpacity,
                zIndex: originalOnTop ? 2 : 1,
                visibility: alone === 'take' ? 'hidden' : undefined,
              }}
              aria-hidden={alone === 'take' || undefined}
            >
              <div
                className="absolute inset-0"
                style={{ transform: fitTransform, transformOrigin: '50% 50%' }}
              >
                <motion.div
                  className="absolute inset-0"
                  initial={false}
                  animate={{ scaleX: mirrorOriginal ? -1 : 1 }}
                  transition={flip}
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
                {overlay && <OverlayFrame />}
              </div>
              {/* YouTube's player is never covered: its panel has no label (it shows its own name). */}
              {!overlay && !alone && !originalIsYouTube && (
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
              style={{
                ...rectStyle(takeRect),
                opacity: takeOpacity,
                zIndex: originalOnTop ? 1 : 2,
                visibility: alone === 'original' ? 'hidden' : undefined,
              }}
              aria-hidden={alone === 'original' || undefined}
            >
              <motion.div
                className="absolute inset-0"
                initial={false}
                animate={{ scaleX: mirrorTake ? -1 : 1 }}
                transition={flip}
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
              {!overlay && !alone && (
                <PanelLabel tone="take">
                  Toma{isZoomed(zoomTake) ? ` · ${zoomLabel(zoomTake)}` : ''}
                </PanelLabel>
              )}
            </div>
          </ZoomLayer>

          {!overlay && !alone && (
            <Hinge
              row={row}
              at={row ? firstRect.width : firstRect.height}
              split={split}
              bounds={bounds}
              total={(row ? size.width : size.height) - HINGE}
              onChange={(value) =>
                onSplit({
                  value: Math.min(bounds.max, Math.max(bounds.min, value)),
                  direction: auto.direction,
                })
              }
            />
          )}
          {overlay && (
            <span className="pointer-events-none absolute left-2 top-2 z-[3] rounded-[8px] bg-sumi-950/80 px-2 py-1 text-[12px] font-medium text-washi-muted">
              {originalOnTop ? 'Original encima' : 'Toma encima'} · se ve al {Math.round(prefs.opacity * 100)}{' '}
              %{fit.scale !== 1 ? ` · tamaño ${Math.round(fit.scale * 100)} %` : ''}
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
