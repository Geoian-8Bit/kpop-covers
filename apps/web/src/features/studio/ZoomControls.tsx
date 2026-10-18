import { hasLinkedFile, type Clip, type Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bookmark, BookmarkX, FileVideo, Scan, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useUpdateClip } from '@/data/clips';
import { cn } from '@/lib/cn';
import { rememberStage } from '@/lib/stagePref';
import { friendlyError } from '@/lib/supabase';
import { useEffect, useState, type ReactNode } from 'react';
import { usePlayer } from '@/player/store';
import { useUnlessCovered } from './studioAsleep';
import { ZoomLayer } from '@/player/ZoomLayer';
import {
  clipHasZoom,
  clipZoomColumns,
  isZoomed,
  keyZoom,
  NO_ZOOM,
  sameZoom,
  stepZoom,
  zoomBadgeLabel,
  zoomControlsView,
  zoomOfClip,
  type Size,
} from '@/player/zoom';
import { useShallow } from 'zustand/react/shallow';
import { useToast } from '@/providers/ToastProvider';

/**
 * F9 · 7 · 44 · Zoom in the studio, with the fingers only (as in any phone video): pinch to zoom in or out, drag to
 * move, double tap for the whole video, in fullscreen too. On a touch screen no buttons for it (a deliberate choice of
 * point 44, which gives up «Ampliar» as one-finger alternative): only, when a clip is on, one compact line to save
 * the pinched zoom in the clip or take it off. The wheel
 * (or a trackpad pinch) and the keys (+, −, 0, arrows, with the focus on the video) do the same on a computer, where
 * the row under the player also offers «Ampliar» (no pinch with a mouse, WCAG 2.5.1), says how, shows the amount and
 * «Ver completo» while zoomed, the arrows (no drag needed, 2.5.7), and saves the zoom with the clip.
 * Only a file can be zoomed: YouTube's player is never altered (its terms forbid changing or covering it), so with
 * YouTube the row says how to get it.
 */

export const ZOOM_NEEDS_FILE = 'Vincula el archivo del vídeo para ampliar.';

/** 44 · The zoom's buttons (row and fullscreen arrows) are for a mouse: hidden where the primary pointer is a finger. */
export const ZOOM_UI_TOUCH_HIDDEN = 'pointer-coarse:hidden';

/** «Ampliar» in the row: one tap, one step (around the spot already zoomed, the centre the first time). */
const ZOOM_STEP = 1.5;
/** The amount is read out this long after it last changed (a pinch changes it every frame). */
const LIVE_SETTLE_MS = 600;

/** `value`, once it has stayed the same for `ms`. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

/** Whether the studio can zoom right now, and why not. */
export function zoomAvailability(
  video: Video,
  stage: 'youtube' | 'file',
  ready: boolean,
): { can: boolean; reason: 'link' | 'switch' | 'loading' | null } {
  const playsFile = video.source === 'upload' || (stage === 'file' && hasLinkedFile(video));
  if (!playsFile) return { can: false, reason: hasLinkedFile(video) ? 'switch' : 'link' };
  return ready ? { can: true, reason: null } : { can: false, reason: 'loading' };
}

export function ZoomRow({ video, clips, onLink }: { video: Video; clips: Clip[]; onLink: () => void }) {
  // P12 · Derived values, not the zoom itself: a pinch or a drag changes it every frame, the row only
  // when its label, a limit or «saved with the clip» changes.
  const view = usePlayer(useShallow((s) => zoomControlsView(s.zoom)));
  const stage = usePlayer((s) => s.stage);
  const ready = usePlayer((s) => s.ready);
  const activeClipId = usePlayer((s) => s.activeClipId);
  const update = useUpdateClip();
  const toast = useToast();
  const { can, reason } = zoomAvailability(video, stage, ready);
  const clip = activeClipId ? (clips.find((c) => c.id === activeClipId) ?? null) : null;
  const clipZoom = zoomOfClip(clip);
  const zoomed = can && view.zoomed;
  const saved = usePlayer((s) => clip != null && sameZoom(s.zoom, clipZoom));
  const settledLabel = useSettled(zoomed ? view.label : '', LIVE_SETTLE_MS);
  // 44 · On a touch screen only the clip's own zoom stays, as one compact line: saving the zoom pinched now, or
  // taking it off the clip (and the note that a YouTube clip opens zoomed with the file). Nothing else.
  const clipLine = clip != null && ((zoomed && !saved) || clipHasZoom(clip));

  function saveWithClip() {
    if (!clip) return;
    update.mutate(
      { clip, patch: clipZoomColumns(usePlayer.getState().zoom) },
      {
        onSuccess: () => toast(`Zoom guardado con «${clip.name}»`, 'success'),
        onError: (err) => toast(friendlyError(err), 'error'),
      },
    );
  }

  function removeFromClip() {
    if (!clip) return;
    usePlayer.getState().setZoom(NO_ZOOM);
    update.mutate(
      { clip, patch: clipZoomColumns(NO_ZOOM) },
      {
        onSuccess: () => toast(`«${clip.name}» ya no se abre ampliado`, 'success'),
        onError: (err) => toast(friendlyError(err), 'error'),
      },
    );
  }

  return (
    // 44 · The whole row only with a mouse (or a trackpad): on a touch screen the zoom is the fingers' alone.
    <div
      className={cn('sep-t px-4 py-3 sm:px-5', clipLine ? 'pointer-coarse:py-2' : ZOOM_UI_TOUCH_HIDDEN)}
      role="group"
      aria-label="Zoom"
    >
      <p
        aria-hidden
        className={cn('mb-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-washi-subtle', ZOOM_UI_TOUCH_HIDDEN)}
      >
        Zoom
      </p>
      {/* Said once the amount settles, not on every frame of a pinch. */}
      <span className="sr-only" aria-live="polite">
        {settledLabel}
      </span>
      {/* Only with something to do: «Ampliar» (one finger, 2.5.1), the amount and the way back while zoomed, the clip's saved zoom. */}
      <div className="empty:hidden mb-1 flex flex-wrap items-center gap-1.5 pointer-coarse:mb-0">
        {can && !view.atMax && (
          <Button
            variant="ghost"
            className={cn('min-h-11', ZOOM_UI_TOUCH_HIDDEN)}
            onClick={() => usePlayer.getState().setZoom(stepZoom(usePlayer.getState().zoom, ZOOM_STEP))}
          >
            <ZoomIn className="size-4" /> Ampliar
          </Button>
        )}
        {zoomed && (
          <>
            <span className={cn('tabular rounded-[8px] bg-sumi-800 px-2.5 py-1 font-mono text-[13px] font-semibold text-washi', ZOOM_UI_TOUCH_HIDDEN)}>
              {view.label}
            </span>
            <Button variant="ghost" className={cn('min-h-11', ZOOM_UI_TOUCH_HIDDEN)} onClick={() => usePlayer.getState().setZoom(NO_ZOOM)}>
              <Scan className="size-4" /> Ver completo
            </Button>
            <PanArrows className={ZOOM_UI_TOUCH_HIDDEN} />
          </>
        )}
        {clip && zoomed && !saved && (
          <Button
            variant="secondary"
            className="min-h-11 max-w-full"
            loading={update.isPending}
            onClick={saveWithClip}
          >
            <Bookmark className="size-4 shrink-0" />{' '}
            <span className="truncate">Guardar el zoom en «{clip.name}»</span>
          </Button>
        )}
        {clip && clipHasZoom(clip) && (
          <Button variant="ghost" className="min-h-11" disabled={update.isPending} onClick={removeFromClip}>
            <BookmarkX className="size-4" /> Quitar el zoom del clip
          </Button>
        )}
      </div>
      <p className={cn('text-[12px] leading-snug text-washi-subtle', ZOOM_UI_TOUCH_HIDDEN)}>
        {reason === 'link' ? (
          <span className="flex flex-wrap items-center gap-x-2">
            {ZOOM_NEEDS_FILE} Con YouTube no se puede ampliar su reproductor.
            <button
              type="button"
              onClick={onLink}
              className="inline-flex min-h-11 items-center gap-1 font-medium text-kin-300 hover:underline"
            >
              <FileVideo className="size-3.5" /> Añadir archivo
            </button>
          </span>
        ) : reason === 'switch' ? (
          <span className="flex flex-wrap items-center gap-x-2">
            Con YouTube no se puede ampliar: usa el archivo vinculado.
            <button
              type="button"
              onClick={() => {
                usePlayer.getState().setStage('file');
                rememberStage(video.id, 'file');
              }}
              className="inline-flex min-h-11 items-center gap-1 font-medium text-kin-300 hover:underline"
            >
              <FileVideo className="size-3.5" /> Usar el archivo
            </button>
          </span>
        ) : reason === 'loading' ? (
          'Cargando el vídeo…'
        ) : clip && saved && clipHasZoom(clip) ? (
          `«${clip.name}» se abre así de ampliado. Cámbialo con la rueda; doble clic para verlo entero.`
        ) : zoomed ? (
          'Arrastra o usa las flechas para mover la zona; doble clic en el vídeo para verlo entero.'
        ) : (
          'Pulsa «Ampliar», o usa la rueda o + y − sobre el vídeo, también en pantalla completa.'
        )}
      </p>
      {!can && clip && clipHasZoom(clip) && reason !== 'loading' && (
        <p className="mt-1 text-[12px] leading-snug text-kin-200">
          «{clip.name}» se guardó ampliado: se ve así con el archivo.
        </p>
      )}
    </div>
  );
}

/**
 * A nominal 16:9 box for the arrows: the move is a tenth of the view whatever the real box, and every view holds the
 * zoomed spot inside its own box when drawing.
 */
const PAN_BOX: Size = { width: 1600, height: 900 };

const PAN_KEYS = [
  { key: 'ArrowLeft', label: 'Mover la zona a la izquierda', Icon: ArrowLeft },
  { key: 'ArrowUp', label: 'Mover la zona hacia arriba', Icon: ArrowUp },
  { key: 'ArrowDown', label: 'Mover la zona hacia abajo', Icon: ArrowDown },
  { key: 'ArrowRight', label: 'Mover la zona a la derecha', Icon: ArrowRight },
] as const;

/**
 * While zoomed: moves the zoomed spot with single taps, no dragging needed (WCAG 2.5.7). Same steps as the arrow
 * keys on the video, and the way they point on screen (the mirror is taken into account).
 */
function PanArrows({ fullscreen = false, className }: { fullscreen?: boolean; className?: string }) {
  const move = (key: string) => {
    const { zoom, mirrored, setZoom } = usePlayer.getState();
    const next = keyZoom(zoom, key, PAN_BOX, null, mirrored);
    if (next) setZoom(next);
  };
  return (
    <span role="group" aria-label="Mover la zona ampliada" className={cn('inline-flex gap-1', className)}>
      {PAN_KEYS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          onClick={() => move(key)}
          className={
            fullscreen
              ? 'grid size-11 place-items-center rounded-full bg-sumi-950/60 text-washi transition-colors hover:bg-washi/15 active:bg-washi/20'
              : 'grid size-11 place-items-center rounded-[10px] border border-line-strong text-washi hover:bg-washi/[0.06]'
          }
        >
          <Icon aria-hidden className="size-4.5" />
        </button>
      ))}
    </span>
  );
}

/**
 * Global review 2 [2] · The same arrows in fullscreen's bottom bar while zoomed: moving the zoomed spot doesn't ask
 * to drag there either (WCAG 2.5.7), nor to leave fullscreen. 44 · With a mouse only: fingers drag the picture.
 */
export function FsPanArrows() {
  const zoomed = usePlayer((s) => isZoomed(s.zoom));
  if (!zoomed) return null;
  return (
    <div className={cn('mb-1 flex justify-end', ZOOM_UI_TOUCH_HIDDEN)}>
      <PanArrows fullscreen />
    </div>
  );
}

/**
 * The studio's zoomed picture: reads the zoom itself, so a gesture repaints only this layer (its child, the file
 * stage, is the same element and is not redrawn). Off (YouTube, loading): the whole video.
 */
export function PlayerZoomLayer({
  enabled,
  box,
  media,
  live,
  children,
}: {
  enabled: boolean;
  box: Size;
  media: Size | null;
  live: boolean;
  children: ReactNode;
}) {
  // Holds still under the recorder (`covered`): the zoom never repaints a hidden picture.
  const zoom = useUnlessCovered((s) => (enabled ? s.zoom : NO_ZOOM));
  return (
    <ZoomLayer zoom={zoom} box={box} media={media} live={live}>
      {children}
    </ZoomLayer>
  );
}

/** How long the zoom amount stays over the video after it last changed. */
const BADGE_MS = 1200;

/**
 * 4 · 7 · The zoom amount over the video, only while it changes and a moment after (like a phone's gallery): nothing
 * stays on the picture. The way back is the double tap, or «Ver completo» in the row below.
 */
export function ZoomBadge({ visible, className }: { visible: boolean; className?: string }) {
  // P12 · Only the label (a string): a pinch doesn't repaint the badge every frame.
  const label = usePlayer((s) => zoomBadgeLabel(s.zoom));
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (label == null) {
      setShown(false);
      return;
    }
    setShown(true);
    const id = setTimeout(() => setShown(false), BADGE_MS);
    return () => clearTimeout(id);
  }, [label]);
  return (
    <AnimatePresence>
      {visible && shown && label != null && (
        <motion.div
          key="zoom-badge"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: 0.1 }}
          className={cn(
            'tabular pointer-events-none absolute z-20 rounded-[8px] bg-sumi-950/80 px-2.5 py-1 font-mono text-[12px] font-semibold text-washi',
            className,
          )}
        >
          {label}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
