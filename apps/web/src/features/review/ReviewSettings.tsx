import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { CLIP_SWATCH } from '@/data/clips';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { hasRange, useReview } from '@/player/store';
import { isZoomed, NO_ZOOM, stepZoom, ZOOM_MAX, zoomLabel, zoomOfClip } from '@/player/zoom';
import { type Clip, formatSpeed, formatTime } from '@coverscape/shared';
import {
  ArrowLeftRight,
  BookmarkPlus,
  Crosshair,
  FlipHorizontal2,
  RectangleVertical,
  Scan,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { Ref } from 'react';
import { type CompareMode, REVIEW_RATE_MAX, REVIEW_RATE_MIN, type ViewPrefs } from './reviewRules';
import type { SaveStatus } from './reviewStageStore';
import { ReviewSyncSettings } from './ReviewSyncSettings';
import { FrameStep, IconButton } from './ReviewTransport';
import { Chip, Group, Range, SaveNote } from './settingsParts';

// ───────────── Settings ─────────────

/** − 100 % + · whole picture, for one of the two (keyboard and screen readers reach the zoom here). */
function ZoomStepper({ label, which }: { label: string; which: 'take' | 'original' }) {
  const zoom = useReview((s) => (which === 'take' ? s.zoomTake : s.zoomOriginal));
  // Only the scale changes: the zoomed spot stays put.
  const set = (factor: number) => useReview.getState().setZoom(which, stepZoom(zoom, factor));
  return (
    <div role="group" aria-label={`Zoom: ${label}`} className="flex min-h-11 items-center gap-0.5">
      <span className="w-[4.75rem] shrink-0 leading-tight">
        <span className="block text-[11px] text-washi-subtle">Zoom</span>
        <span className="text-[13px] text-washi-muted">{label}</span>
      </span>
      <IconButton
        label={`Reducir el zoom (${label.toLowerCase()})`}
        onClick={() => set(1 / 1.5)}
        disabled={!isZoomed(zoom)}
      >
        <ZoomOut className="size-5" />
      </IconButton>
      <span aria-live="polite" className="tabular w-12 text-center font-mono text-[12px] text-washi">
        {zoomLabel(zoom)}
      </span>
      <IconButton
        label={`Ampliar (${label.toLowerCase()})`}
        onClick={() => set(1.5)}
        disabled={zoom.scale >= ZOOM_MAX}
      >
        <ZoomIn className="size-5" />
      </IconButton>
      <IconButton
        label={`Ver entero (${label.toLowerCase()})`}
        onClick={() => useReview.getState().setZoom(which, NO_ZOOM)}
        disabled={!isZoomed(zoom)}
      >
        <Scan className="size-5" />
      </IconButton>
    </div>
  );
}

export interface ReviewSettingsProps {
  mode: CompareMode;
  prefs: ViewPrefs;
  onPrefs: (patch: Partial<ViewPrefs>) => void;
  /** «Separados»: the hinge moved by hand (null: automatic). */
  split: number | null;
  onAutoSplit: () => void;
  onResetFit: () => void;
  fitStatus: SaveStatus;
  adjust: number;
  /**
   * `settled` false while the slider is being dragged (the original is put in place once it is let go); 'soon' for
   * the ±0,01 taps (put in place once the taps stop).
   */
  onAdjust: (value: number, settled?: boolean | 'soon') => void;
  /** «La canción empieza en…» (the take's second), saved with the take like the fine sync. */
  onLead: (seconds: number) => void;
  /** The song's second that matches the take's point (a take of only part of the song). */
  onSongStart: (seconds: number) => void;
  /** Status of the sync values' save (the song's start and the fine sync). */
  adjustStatus: SaveStatus;
  hasOriginal: boolean;
  /** The original is YouTube: «Superpuesto» needs the file. */
  originalIsYouTube: boolean;
  practisedMirrored: boolean;
  clips: { clip: Clip; start: number; end: number }[];
  /** The song's clips (by start), to put the sync point's song second at one. */
  songClips: Clip[];
  /** F9 · The original can be zoomed (a file; YouTube's player is never altered). */
  canZoomOriginal: boolean;
  /** F8 · Save the take's A–B as a clip of the song. */
  onSaveRange: () => void;
  onClose?: () => void;
  /** A phone on its side: frame by frame lives here (the quick strip and the bar hold the rest). */
  compact?: boolean;
  /** The sheet's title, focused when it opens. */
  titleRef?: Ref<HTMLHeadingElement>;
  /** A slider is being dragged (the panel over the take fades meanwhile, so the take shows). */
  onSliding?: (sliding: boolean) => void;
}

export function ReviewSettings({
  mode,
  prefs,
  onPrefs,
  split,
  onAutoSplit,
  onResetFit,
  fitStatus,
  adjust,
  onAdjust,
  onLead,
  onSongStart,
  songClips,
  adjustStatus,
  hasOriginal,
  originalIsYouTube,
  practisedMirrored,
  clips,
  canZoomOriginal,
  onSaveRange,
  onClose,
  compact,
  titleRef,
  onSliding,
}: ReviewSettingsProps) {
  const rate = useReview((s) => s.rate);
  const mirrorTake = useReview((s) => s.mirrorTake);
  const mirrorOriginal = useReview((s) => s.mirrorOriginal);
  const activeClipId = useReview((s) => s.activeClipId);
  const loop = useReview((s) => s.loop);
  const solo = useReview((s) => s.solo);
  const reduce = useReducedMotion();
  const review = useReview.getState;
  /** The original is on the stage (not «Solo toma»). */
  const comparing = hasOriginal && !solo;

  return (
    <div className="space-y-2 text-washi">
      {onClose && (
        <div className="-my-1 flex items-center justify-between">
          <h2 ref={titleRef} tabIndex={-1} className="font-display text-[16px] font-bold outline-none">
            Ajustes del repaso
          </h2>
          <Button variant="ghost" size="icon" aria-label="Cerrar ajustes" onClick={onClose} className="-mr-2">
            <X className="size-5" />
          </Button>
        </div>
      )}

      {hasOriginal && (
        <ReviewSyncSettings
          adjust={adjust}
          onAdjust={onAdjust}
          onLead={onLead}
          onSongStart={onSongStart}
          songClips={songClips}
          status={adjustStatus}
          onSliding={onSliding}
        />
      )}

      <Group
        title="Vista"
        aside={mode === 'overlay' && comparing ? <SaveNote status={fitStatus} /> : undefined}
        hint={originalIsYouTube && !solo ? '«Superpuesto» necesita el archivo del vídeo.' : undefined}
      >
        <div className="flex flex-wrap items-center gap-1">
          <Chip pressed={solo} onClick={() => review().setSolo(!solo)} label="Solo la toma, sin el original">
            <RectangleVertical className="size-4" /> Solo toma
          </Chip>
          {comparing && mode === 'stacked' && (
            <>
              <Chip
                label="Cambiar el orden"
                onClick={() =>
                  onPrefs({ order: prefs.order === 'original-first' ? 'take-first' : 'original-first' })
                }
              >
                <ArrowLeftRight className="size-4" /> Orden
              </Chip>
              <Chip label="Reparto automático" onClick={onAutoSplit} disabled={split == null}>
                Reparto auto
              </Chip>
            </>
          )}
          {comparing && mode === 'overlay' && (
            <Chip label="Recolocar el original" onClick={onResetFit}>
              <Crosshair className="size-4" /> Recolocar
            </Chip>
          )}
        </div>
        {comparing && mode === 'overlay' && (
          <>
            <Range
              label="Transparencia"
              value={Math.round((1 - prefs.opacity) * 100)}
              min={0}
              max={90}
              step={1}
              onChange={(v) => onPrefs({ opacity: Math.round((1 - v / 100) * 100) / 100 })}
              valueText={`${Math.round((1 - prefs.opacity) * 100)} %`}
              onSlide={onSliding}
            />
            <div className="flex min-h-11 items-center gap-2">
              <span className="w-[4.75rem] shrink-0 text-[13px] text-washi-muted">Encima</span>
              <Segmented
                label="Qué va encima"
                layoutId="review-on-top"
                size="sm"
                value={prefs.onTop}
                onChange={(onTop) => onPrefs({ onTop })}
                options={[
                  { value: 'original', label: 'Original' },
                  { value: 'take', label: 'Toma' },
                ]}
              />
            </div>
          </>
        )}
        <div className="flex min-h-11 items-center gap-1">
          <span className="w-[4.75rem] shrink-0 text-[13px] text-washi-muted">Espejo</span>
          <Chip label="Toma en espejo" pressed={mirrorTake} onClick={() => review().toggleMirrorTake()}>
            <FlipHorizontal2 className="size-4" /> Toma
          </Chip>
          {comparing && (
            <Chip
              label="Original en espejo"
              pressed={mirrorOriginal}
              onClick={() => review().toggleMirrorOriginal()}
            >
              <FlipHorizontal2 className="size-4" /> Original
            </Chip>
          )}
        </div>
        {practisedMirrored && (
          <p className="text-[12px] leading-snug text-washi-subtle">
            Ensayaste en espejo: por eso empiezan invertidos.
          </p>
        )}
      </Group>

      <Group title="Reproducción">
        <Range
          label="Velocidad"
          value={rate}
          min={REVIEW_RATE_MIN}
          max={REVIEW_RATE_MAX}
          step={0.05}
          onChange={(r) => review().setRate(r)}
          valueText={formatSpeed(rate)}
          onSlide={onSliding}
        />
        {compact && (
          <div className="flex min-h-11 items-center gap-0.5">
            <span className="w-[4.75rem] shrink-0 text-[13px] text-washi-muted">Fotograma</span>
            <FrameStep dir={-1} />
            <FrameStep dir={1} />
          </div>
        )}
        <ZoomStepper label={mode === 'overlay' && comparing ? 'Los dos' : 'Toma'} which="take" />
        {comparing &&
          mode === 'stacked' &&
          (canZoomOriginal ? (
            <ZoomStepper label="Original" which="original" />
          ) : (
            <p className="text-[12px] leading-snug text-washi-subtle">
              Zoom del original: vincula el archivo del vídeo.
            </p>
          ))}
      </Group>

      <Group
        title="Tramos en esta toma"
        hint={clips.length ? undefined : 'Ningún clip de la canción cae en esta toma.'}
      >
        {clips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {clips.map(({ clip, start, end }) => (
              <motion.button
                key={clip.id}
                type="button"
                aria-pressed={activeClipId === clip.id}
                whileTap={reduce ? undefined : { scale: 0.92 }}
                transition={jelly}
                onClick={() => {
                  review().loopRange({ start, end }, clip.id);
                  // F9 · A clip saved zoomed in opens zoomed in on the original (its picture is the song's).
                  if (canZoomOriginal && mode === 'stacked') review().setZoom('original', zoomOfClip(clip));
                  review().play();
                }}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-[10px] px-3 text-[13px]',
                  activeClipId === clip.id
                    ? 'bg-washi font-bold text-sumi-900'
                    : 'well font-medium text-washi-muted hover:text-washi',
                )}
              >
                <span
                  aria-hidden
                  className={cn('size-2.5 rotate-[-3deg] rounded-[2px]', CLIP_SWATCH[clip.color].dot)}
                />
                {clip.name}
                <span className="tabular font-mono text-[11px] opacity-70">
                  {formatTime(start)}–{formatTime(end)}
                </span>
              </motion.button>
            ))}
          </div>
        )}
        {hasRange(loop) && (
          <div className="flex flex-wrap items-center gap-1">
            {!activeClipId && (
              <Chip onClick={onSaveRange}>
                <BookmarkPlus className="size-4" /> Guardar el tramo como clip
              </Chip>
            )}
            <Chip onClick={() => review().clearLoop()}>Quitar el tramo A–B</Chip>
          </div>
        )}
      </Group>
    </div>
  );
}
