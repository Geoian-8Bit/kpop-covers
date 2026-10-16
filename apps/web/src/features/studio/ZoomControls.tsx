import { hasLinkedFile, type Clip, type Video } from '@coverscape/shared';
import { AnimatePresence, motion } from 'motion/react';
import { Bookmark, BookmarkX, FileVideo, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useUpdateClip } from '@/data/clips';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { rememberStage } from '@/lib/stagePref';
import { friendlyError } from '@/lib/supabase';
import type { ReactNode } from 'react';
import { usePlayer } from '@/player/store';
import { ZoomLayer } from '@/player/ZoomLayer';
import {
  clipHasZoom,
  clipZoomColumns,
  isZoomed,
  NO_ZOOM,
  sameZoom,
  stepZoom,
  zoomLabel,
  zoomOfClip,
  ZOOM_MAX,
  type Size,
} from '@/player/zoom';
import { useToast } from '@/providers/ToastProvider';

/**
 * F9 · Zoom in the studio: the row under the player (bigger, smaller, whole video, saved with the clip) and the
 * badge over the video. Only a file can be zoomed: YouTube's player is never altered (its terms), so with YouTube
 * the row is shown switched off, saying how to get it.
 */

export const ZOOM_NEEDS_FILE = 'Vincula el archivo del vídeo para ampliar.';

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
  const zoom = usePlayer((s) => s.zoom);
  const stage = usePlayer((s) => s.stage);
  const ready = usePlayer((s) => s.ready);
  const activeClipId = usePlayer((s) => s.activeClipId);
  const update = useUpdateClip();
  const toast = useToast();
  const { can, reason } = zoomAvailability(video, stage, ready);
  const clip = activeClipId ? (clips.find((c) => c.id === activeClipId) ?? null) : null;
  const clipZoom = zoomOfClip(clip);
  const zoomed = can && isZoomed(zoom);
  const saved = clip != null && sameZoom(zoom, clipZoom);

  const step = (factor: number) => usePlayer.getState().setZoom(stepZoom(usePlayer.getState().zoom, factor));

  function saveWithClip() {
    if (!clip) return;
    const columns = clipZoomColumns(usePlayer.getState().zoom);
    update.mutate(
      { clip, patch: columns },
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
    <div className="sep-t px-4 py-3 sm:px-5" role="group" aria-labelledby="zoom-row-title">
      <p
        id="zoom-row-title"
        className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-washi-subtle"
      >
        Zoom
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Reducir el zoom"
          disabled={!zoomed}
          onClick={() => step(1 / 1.5)}
        >
          <ZoomOut className="size-5" />
        </Button>
        <span aria-live="polite" className="tabular w-14 text-center font-mono text-[13px] text-washi">
          {can ? zoomLabel(zoom) : '100 %'}
        </span>
        <Button
          variant="secondary"
          size="icon"
          aria-label="Ampliar el centro del vídeo"
          disabled={!can || zoom.scale >= ZOOM_MAX}
          onClick={() => step(1.5)}
        >
          <ZoomIn className="size-5" />
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          disabled={!zoomed}
          onClick={() => usePlayer.getState().setZoom(NO_ZOOM)}
        >
          <Scan className="size-4" /> Ver completo
        </Button>
        {clip && zoomed && !saved && (
          <Button
            variant="secondary"
            className="min-h-11 max-w-full"
            loading={update.isPending}
            onClick={saveWithClip}
          >
            <Bookmark className="size-4 shrink-0" />{' '}
            <span className="truncate">Guardar con «{clip.name}»</span>
          </Button>
        )}
        {clip && clipHasZoom(clip) && (
          <Button variant="ghost" className="min-h-11" disabled={update.isPending} onClick={removeFromClip}>
            <BookmarkX className="size-4" /> Quitar el zoom del clip
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-washi-subtle">
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
          `«${clip.name}» se abre así de ampliado. Pellizca o usa la rueda para cambiarlo; doble toque para verlo entero.`
        ) : (
          'Pellizca o usa la rueda sobre el vídeo para ampliar una zona; arrastra para moverla y toca dos veces para verlo entero.'
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
  const zoom = usePlayer((s) => (enabled ? s.zoom : NO_ZOOM));
  return (
    <ZoomLayer zoom={zoom} box={box} media={media} live={live}>
      {children}
    </ZoomLayer>
  );
}

/** Over the video while zoomed: how much, and a way back to the whole video. */
export function ZoomBadge({ visible, className }: { visible: boolean; className?: string }) {
  const zoom = usePlayer((s) => s.zoom);
  return (
    <AnimatePresence>
      {visible && isZoomed(zoom) && (
        <motion.div
          key="zoom-badge"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={jelly}
          className={cn(
            'absolute z-20 flex items-center gap-1 rounded-[10px] bg-sumi-950/85 pl-2.5 text-washi',
            className,
          )}
        >
          <span className="tabular font-mono text-[12px] font-semibold">{zoomLabel(zoom)}</span>
          <button
            type="button"
            aria-label="Ver el vídeo completo"
            title="Ver el vídeo completo (doble toque)"
            onClick={() => usePlayer.getState().setZoom(NO_ZOOM)}
            className="grid size-11 place-items-center rounded-[10px] text-washi-muted transition-colors hover:text-washi"
          >
            <Scan className="size-4.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
