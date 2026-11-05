import { Button } from '@/components/ui/Button';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { Segmented } from '@/components/ui/Segmented';
import { CLIP_SWATCH } from '@/data/clips';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { hasRange, useReview } from '@/player/store';
import { isZoomed, NO_ZOOM, stepZoom, ZOOM_MAX, zoomLabel, zoomOfClip } from '@/player/zoom';
import { clampAdjust, type Clip, formatSpeed, formatTime, SYNC_ADJUST_LIMIT } from '@coverscape/shared';
import { ArrowLeftRight, BookmarkPlus, Crosshair, Scan, X, ZoomIn, ZoomOut } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode, Ref } from 'react';
import { signed } from './reviewControlParts';
import { type CompareMode, REVIEW_RATE_MAX, REVIEW_RATE_MIN, type ViewPrefs } from './reviewRules';
import { FrameStep, IconButton } from './ReviewTransport';

// ───────────── Settings ─────────────

/** − 100 % + · whole picture, for one of the two (keyboard and screen readers reach the zoom here). */
function ZoomStepper({ label, which }: { label: string; which: 'take' | 'original' }) {
  const zoom = useReview((s) => (which === 'take' ? s.zoomTake : s.zoomOriginal));
  // Only the scale changes: the zoomed spot stays put.
  const set = (factor: number) => useReview.getState().setZoom(which, stepZoom(zoom, factor));
  return (
    <div role="group" aria-label={`Zoom: ${label}`} className="flex min-h-11 items-center gap-1">
      <span className="w-20 shrink-0 text-[13px] text-washi-muted">{label}</span>
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

function Row({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="space-y-2.5 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <h3 className="font-display text-[15px] font-bold text-washi">{title}</h3>
      {children}
      {hint && <p className="text-[13px] leading-snug text-washi-subtle">{hint}</p>}
    </section>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
  valueText,
  onCommit,
  onSlide,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  valueText: string;
  /** The finger (or the key) let go. */
  onCommit?: () => void;
  /** A finger is on the slider (true) or has let go (false). */
  onSlide?: (sliding: boolean) => void;
}) {
  const end = () => {
    onCommit?.();
    onSlide?.(false);
  };
  return (
    <label className="flex min-h-11 items-center gap-3">
      <span className="w-24 shrink-0 text-[13px] text-washi-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        // Let go however it ends: lifted, cancelled (the sheet took it as a scroll), lost, or left with the keys.
        onPointerDown={() => onSlide?.(true)}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyUp={() => onCommit?.()}
        onBlur={end}
        className="h-11 min-w-0 flex-1 accent-kin-400"
      />
      <span className="tabular w-16 shrink-0 text-right font-mono text-[12px] text-washi">{valueText}</span>
    </label>
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
  fitStatus: 'idle' | 'saving' | 'saved' | 'error';
  adjust: number;
  /**
   * `settled` false while the slider is being dragged (the original is put in place once it is let go); 'soon' for
   * the ±0,01 taps (put in place once the taps stop).
   */
  onAdjust: (value: number, settled?: boolean | 'soon') => void;
  adjustStatus: 'idle' | 'saving' | 'saved' | 'error';
  hasOriginal: boolean;
  /** The original is YouTube: «Superpuesto» needs the file. */
  originalIsYouTube: boolean;
  practisedMirrored: boolean;
  clips: { clip: Clip; start: number; end: number }[];
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

const STATUS_TEXT = {
  idle: '',
  saving: 'Guardando…',
  saved: 'Guardado en la toma',
  error: 'No se pudo guardar',
} as const;

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
  const reduce = useReducedMotion();
  const review = useReview.getState;

  return (
    <div className="space-y-4 text-washi">
      {onClose && (
        <div className="-mb-1 flex items-center justify-between">
          <h2 ref={titleRef} tabIndex={-1} className="font-display text-[18px] font-bold outline-none">
            Ajustes del repaso
          </h2>
          <Button variant="ghost" size="icon" aria-label="Cerrar ajustes" onClick={onClose} className="-mr-2">
            <X className="size-5" />
          </Button>
        </div>
      )}

      {hasOriginal && (
        <Row
          title="Ajuste fino"
          hint="Adelanta o retrasa el original para compensar el retraso de cámara y sonido del móvil. Se guarda con la toma."
        >
          <Range
            label="Sincronía"
            value={adjust}
            min={-SYNC_ADJUST_LIMIT}
            max={SYNC_ADJUST_LIMIT}
            step={0.01}
            onChange={(v) => onAdjust(clampAdjust(v), false)}
            onCommit={() => onAdjust(adjust, true)}
            onSlide={onSliding}
            valueText={signed(adjust)}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              aria-label="Retrasar el original 0,01 s"
              onClick={() => onAdjust(clampAdjust(adjust - 0.01), 'soon')}
            >
              −0,01
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-11"
              aria-label="Adelantar el original 0,01 s"
              onClick={() => onAdjust(clampAdjust(adjust + 0.01), 'soon')}
            >
              +0,01
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11"
              onClick={() => onAdjust(0)}
              disabled={adjust === 0}
            >
              Poner a 0
            </Button>
            <span
              role="status"
              className={cn('text-[12px]', adjustStatus === 'error' ? 'text-enji-300' : 'text-washi-subtle')}
            >
              {STATUS_TEXT[adjustStatus]}
            </span>
          </div>
        </Row>
      )}

      {compact && (
        <Row title="Fotograma a fotograma">
          <div className="flex items-center">
            <FrameStep dir={-1} />
            <FrameStep dir={1} />
          </div>
        </Row>
      )}

      <Row
        title="Vista"
        hint={
          originalIsYouTube
            ? '«Superpuesto» necesita el archivo del vídeo: vincúlalo en el estudio. El vídeo de YouTube se ve entero y sin tapar.'
            : undefined
        }
      >
        {mode === 'stacked' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              className="min-h-11"
              onClick={() =>
                onPrefs({ order: prefs.order === 'original-first' ? 'take-first' : 'original-first' })
              }
            >
              <ArrowLeftRight className="size-4" /> Cambiar el orden
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={onAutoSplit} disabled={split == null}>
              Reparto automático
            </Button>
          </div>
        ) : (
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-washi-muted">Encima</span>
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
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" className="min-h-11" onClick={onResetFit}>
                <Crosshair className="size-4" /> Recolocar
              </Button>
              <span
                role="status"
                className={cn('text-[12px]', fitStatus === 'error' ? 'text-enji-300' : 'text-washi-subtle')}
              >
                {STATUS_TEXT[fitStatus]}
              </span>
            </div>
          </>
        )}
      </Row>

      <Row
        title="Velocidad fina"
        hint="Las velocidades de siempre están en los accesos rápidos. La toma va a esta velocidad y el original, en proporción a la velocidad a la que se grabó."
      >
        <Range
          label="Fina"
          value={rate}
          min={REVIEW_RATE_MIN}
          max={REVIEW_RATE_MAX}
          step={0.05}
          onChange={(r) => review().setRate(r)}
          valueText={formatSpeed(rate)}
          onSlide={onSliding}
        />
      </Row>

      <Row
        title="Espejo"
        hint={
          practisedMirrored
            ? 'Ensayaste con el original en espejo: por eso los dos empiezan invertidos. La toma se guarda sin espejo.'
            : 'La toma se guarda sin espejo. Invierte una de las dos para que miren igual.'
        }
      >
        <div className="flex flex-col gap-1">
          <ElasticToggle
            checked={mirrorTake}
            onChange={() => review().toggleMirrorTake()}
            label="Toma en espejo"
          />
          {hasOriginal && (
            <ElasticToggle
              checked={mirrorOriginal}
              onChange={() => review().toggleMirrorOriginal()}
              label="Original en espejo"
            />
          )}
        </div>
      </Row>

      <Row
        title="Tramos de la canción en esta toma"
        hint={
          clips.length
            ? 'Elige uno para repetirlo en la toma y en el original a la vez.'
            : 'Ningún clip de la canción cae dentro de esta toma.'
        }
      >
        {clips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
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
          <div className="flex flex-wrap items-center gap-1.5">
            {!activeClipId && (
              <Button variant="secondary" size="sm" className="min-h-11" onClick={onSaveRange}>
                <BookmarkPlus className="size-4" /> Guardar el tramo como clip
              </Button>
            )}
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => review().clearLoop()}>
              Quitar el tramo A–B
            </Button>
          </div>
        )}
      </Row>

      <Row
        title="Zoom"
        hint={
          mode === 'overlay'
            ? 'En «Superpuesto» los dedos amplían los dos a la vez; pulsa «Encajar» sobre el vídeo para mover y escalar el original. Doble toque para verlos enteros.'
            : 'Pellizca sobre la toma o el original para ampliar una zona; arrastra para moverla y toca dos veces para verlo entero.'
        }
      >
        <ZoomStepper label={mode === 'overlay' ? 'Los dos' : 'Toma'} which="take" />
        {hasOriginal &&
          mode === 'stacked' &&
          (canZoomOriginal ? (
            <ZoomStepper label="Original" which="original" />
          ) : (
            <p className="text-[13px] leading-snug text-washi-muted">
              Original de YouTube: vincula el archivo del vídeo para ampliar.
            </p>
          ))}
      </Row>
    </div>
  );
}
