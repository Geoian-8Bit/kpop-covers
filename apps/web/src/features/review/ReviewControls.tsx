import { clampAdjust, formatSpeed, formatTime, SYNC_ADJUST_LIMIT, type Clip, type Note } from '@coverscape/shared';
import { motion } from 'motion/react';
import {
  ArrowLeftRight,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  MessageSquarePlus,
  Repeat,
  Scan,
  SlidersHorizontal,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { ButtonSkin } from '@/components/ui/ButtonSkin';
import { ElasticToggle } from '@/components/ui/ElasticToggle';
import { Segmented } from '@/components/ui/Segmented';
import { CLIP_SWATCH } from '@/data/clips';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { hasRange, useReview } from '@/player/store';
import { isZoomed, NO_ZOOM, stepZoom, zoomLabel, zoomOfClip, ZOOM_MAX } from '@/player/zoom';
import {
  categoryLabel,
  noteStatus,
  REVIEW_RATE_MAX,
  REVIEW_RATE_MIN,
  REVIEW_RATES,
  SPLIT_MAX,
  SPLIT_MIN,
  type CompareMode,
  type ViewPrefs,
} from './reviewRules';
import { capturePointer } from './pointer';

const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(2).replace('.', ',')} s`;

// ───────────── Timeline of the take ─────────────

/** The take's time bar: drag to scrub (both follow), A–B band, and the take's notes as dots. */
export function ReviewTimeline({
  notes,
  openNoteId,
  onNote,
}: {
  notes: Note[];
  openNoteId: string | null;
  onNote: (note: Note) => void;
}) {
  const time = useReview((s) => s.time);
  const duration = useReview((s) => s.duration);
  const loop = useReview((s) => s.loop);
  const trackRef = useRef<HTMLDivElement>(null);
  const f = (t: number) => (duration > 0 ? Math.min(1, Math.max(0, t / duration)) : 0);

  const at = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration;
  };

  return (
    <div className="relative px-1 pt-1">
      {/* Note dots: each a 44 px target over a small seal. */}
      <div className="relative h-7">
        {duration > 0 &&
          notes.map((n) => {
            const done = noteStatus(n) === 'done';
            const label = `Nota en ${formatTime(Number(n.take_seconds), { tenths: true })}${categoryLabel(n.category) ? ` · ${categoryLabel(n.category)}` : ''}${done ? ' · resuelta' : ''}: ${n.body}`;
            return (
              <button
                key={n.id}
                type="button"
                aria-label={label}
                title={label}
                onClick={() => onNote(n)}
                className="group absolute top-1/2 z-10 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center"
                style={{ left: `${f(Number(n.take_seconds)) * 100}%` }}
              >
                <motion.span
                  aria-hidden
                  animate={{ scale: openNoteId === n.id ? 1.45 : 1 }}
                  transition={jelly}
                  className={cn(
                    'block size-3 rotate-45 rounded-[2px] ring-2 ring-sumi-950 group-hover:scale-125',
                    done ? 'bg-rokusho' : 'bg-ai-300',
                    openNoteId === n.id && 'ring-kin-300',
                  )}
                />
              </button>
            );
          })}
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Tiempo de la toma"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration * 10) / 10}
        aria-valuenow={Math.round(time * 10) / 10}
        aria-valuetext={`${formatTime(time)} de ${formatTime(duration)}`}
        className="relative h-9 cursor-pointer touch-none"
        onPointerDown={(e) => {
          if (duration <= 0) return;
          capturePointer(e);
          const s = useReview.getState();
          s.setScrubbing(true);
          s.seek(at(e.clientX), { preview: true });
        }}
        onPointerMove={(e) => {
          if (!useReview.getState().scrubbing) return;
          useReview.getState().seek(at(e.clientX), { preview: true });
        }}
        onPointerUp={() => useReview.getState().setScrubbing(false)}
        onPointerCancel={() => useReview.getState().setScrubbing(false)}
        onKeyDown={(e) => {
          const s = useReview.getState();
          const step = e.shiftKey ? 5 : 1;
          if (e.key === 'ArrowLeft') s.seek(s.time - step);
          else if (e.key === 'ArrowRight') s.seek(s.time + step);
          else if (e.key === 'Home') s.seek(0);
          else if (e.key === 'End') s.seek(s.duration);
          else return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="well absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full">
          {hasRange(loop) && (
            <div
              className={cn('absolute inset-y-0 rounded-full', loop.enabled ? 'bg-shu-500/70' : 'bg-shu-500/30')}
              style={{ left: `${f(loop.start) * 100}%`, width: `${(f(loop.end) - f(loop.start)) * 100}%` }}
            />
          )}
          <div className="absolute inset-y-0 left-0 rounded-full bg-washi/35" style={{ width: `${f(time) * 100}%` }} />
        </div>
        {loop.start != null && <Seal at={f(loop.start)} label="A" />}
        {loop.end != null && <Seal at={f(loop.end)} label="B" />}
        <span
          aria-hidden
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-washi shadow-[0_0_0_3px_var(--color-sumi-950)]"
          style={{ left: `${f(time) * 100}%` }}
        />
      </div>
      <div className="tabular flex justify-between px-0.5 font-mono text-[11px] text-washi-muted">
        <span>{formatTime(time, { tenths: true })}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function Seal({ at, label }: { at: number; label: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute grid size-5 -translate-x-1/2 place-items-center rounded-[3px] bg-shu-500 font-display text-[11px] font-extrabold text-washi',
        label === 'A' ? 'top-0' : 'bottom-0',
      )}
      style={{ left: `${at * 100}%` }}
    >
      {label}
    </span>
  );
}

// ───────────── Transport ─────────────

function IconButton({
  label,
  onClick,
  children,
  pressed,
  className,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  pressed?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: 0.86 }}
      transition={jelly}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-[10px] text-washi-muted transition-colors hover:bg-washi/[0.08] hover:text-washi disabled:opacity-40',
        pressed && 'bg-washi/[0.12] text-washi',
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/** Frame ‹ ▶ › · A B loop · Nota · settings. Fits a 390 px phone (8 × 44 px). */
export function ReviewTransport({
  onNote,
  settingsOpen,
  onSettings,
  onLoopMissing,
}: {
  onNote: () => void;
  settingsOpen: boolean;
  onSettings: () => void;
  onLoopMissing: () => void;
}) {
  const playing = useReview((s) => s.playing);
  const ready = useReview((s) => s.takeEngine != null);
  const loop = useReview((s) => s.loop);
  return (
    <div className="mx-auto flex max-w-xl items-center justify-between gap-0.5">
      <IconButton label="Fotograma anterior (,)" onClick={() => useReview.getState().step(-1)} disabled={!ready}>
        <ChevronLeft className="size-6" />
      </IconButton>
      <motion.button
        type="button"
        aria-label={playing ? 'Pausar (espacio)' : 'Reproducir (espacio)'}
        onClick={() => useReview.getState().togglePlay()}
        disabled={!ready}
        whileTap={{ scale: 0.88 }}
        transition={jelly}
        className="size-12 shrink-0 drop-shadow-[0_6px_10px_var(--color-sumi-950)] disabled:opacity-40"
      >
        <ButtonSkin kind={playing ? 'pause' : 'play'} />
      </motion.button>
      <IconButton label="Fotograma siguiente (.)" onClick={() => useReview.getState().step(1)} disabled={!ready}>
        <ChevronRight className="size-6" />
      </IconButton>
      <IconButton label="Marcar A (inicio del tramo)" onClick={() => useReview.getState().markStart()} pressed={loop.start != null}>
        <span className="font-display text-[17px] font-extrabold">A</span>
      </IconButton>
      <IconButton label="Marcar B (fin del tramo)" onClick={() => useReview.getState().markEnd()} pressed={loop.end != null}>
        <span className="font-display text-[17px] font-extrabold">B</span>
      </IconButton>
      <IconButton
        label={loop.enabled ? 'Quitar el bucle del tramo' : 'Repetir el tramo A–B'}
        pressed={loop.enabled}
        onClick={() => {
          if (!useReview.getState().toggleLoop()) onLoopMissing();
        }}
        className={loop.enabled ? 'text-shu-400' : undefined}
      >
        <Repeat className="size-5" />
      </IconButton>
      <IconButton label="Nota en este momento (N)" onClick={onNote} disabled={!ready} className="text-kin-300">
        <MessageSquarePlus className="size-5" />
      </IconButton>
      <IconButton label={settingsOpen ? 'Cerrar ajustes del repaso' : 'Ajustes del repaso'} pressed={settingsOpen} onClick={onSettings} className="lg:hidden">
        <SlidersHorizontal className="size-5" />
      </IconButton>
    </div>
  );
}

// ───────────── Settings ─────────────

/** − 100 % + · whole picture, for one of the two (keyboard and screen readers reach the zoom here). */
function ZoomStepper({ label, which }: { label: string; which: 'take' | 'original' }) {
  const zoom = useReview((s) => (which === 'take' ? s.zoomTake : s.zoomOriginal));
  // Only the scale changes: the zoomed spot stays put.
  const set = (factor: number) => useReview.getState().setZoom(which, stepZoom(zoom, factor));
  return (
    <div role="group" aria-label={`Zoom: ${label}`} className="flex min-h-11 items-center gap-1">
      <span className="w-20 shrink-0 text-[13px] text-washi-muted">{label}</span>
      <IconButton label={`Reducir el zoom (${label.toLowerCase()})`} onClick={() => set(1 / 1.5)} disabled={!isZoomed(zoom)}>
        <ZoomOut className="size-5" />
      </IconButton>
      <span aria-live="polite" className="tabular w-12 text-center font-mono text-[12px] text-washi">
        {zoomLabel(zoom)}
      </span>
      <IconButton label={`Ampliar (${label.toLowerCase()})`} onClick={() => set(1.5)} disabled={zoom.scale >= ZOOM_MAX}>
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
    <section className="space-y-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-[12px] font-bold uppercase tracking-[0.08em] text-washi-subtle">{title}</h3>
      {children}
      {hint && <p className="text-[12px] leading-snug text-washi-subtle">{hint}</p>}
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  valueText: string;
  onCommit?: () => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-3">
      <span className="w-28 shrink-0 text-[13px] text-washi-muted">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="h-11 min-w-0 flex-1 accent-kin-400"
      />
      <span className="tabular w-16 shrink-0 text-right font-mono text-[12px] text-washi">{valueText}</span>
    </label>
  );
}

export interface ReviewSettingsProps {
  mode: CompareMode;
  variant: string;
  prefs: ViewPrefs;
  onPrefs: (patch: Partial<ViewPrefs>) => void;
  onResetFit: () => void;
  fitStatus: 'idle' | 'saving' | 'saved' | 'error';
  adjust: number;
  onAdjust: (value: number) => void;
  adjustStatus: 'idle' | 'saving' | 'saved' | 'error';
  hasOriginal: boolean;
  practisedMirrored: boolean;
  clips: { clip: Clip; start: number; end: number }[];
  /** F9 · The original can be zoomed (a file; YouTube's player is never altered). */
  canZoomOriginal: boolean;
  /** F8 · Save the take's A–B as a clip of the song. */
  onSaveRange: () => void;
  onClose?: () => void;
}

const STATUS_TEXT = { idle: '', saving: 'Guardando…', saved: 'Guardado en la toma', error: 'No se pudo guardar' } as const;

export function ReviewSettings({
  mode,
  variant,
  prefs,
  onPrefs,
  onResetFit,
  fitStatus,
  adjust,
  onAdjust,
  adjustStatus,
  hasOriginal,
  practisedMirrored,
  clips,
  canZoomOriginal,
  onSaveRange,
  onClose,
}: ReviewSettingsProps) {
  const rate = useReview((s) => s.rate);
  const audio = useReview((s) => s.audio);
  const mirrorTake = useReview((s) => s.mirrorTake);
  const mirrorOriginal = useReview((s) => s.mirrorOriginal);
  const activeClipId = useReview((s) => s.activeClipId);
  const loop = useReview((s) => s.loop);
  const review = useReview.getState;

  return (
    <div className="space-y-4 text-washi">
      {onClose && (
        <div className="flex items-center justify-between">
          <p className="font-display text-[17px] font-bold">Ajustes del repaso</p>
          <Button variant="ghost" size="icon" aria-label="Cerrar ajustes" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>
      )}

      <Row title="Vista">
        {mode === 'stacked' ? (
          <>
            <Button variant="secondary" className="min-h-11" onClick={() => onPrefs({ order: prefs.order === 'original-first' ? 'take-first' : 'original-first' })}>
              <ArrowLeftRight className="size-4" /> Cambiar el orden
            </Button>
            {variant === 'cortina' ? (
              <Range
                label="Cortina"
                value={prefs.wipe}
                min={0.04}
                max={0.96}
                step={0.01}
                onChange={(wipe) => onPrefs({ wipe })}
                valueText={`${Math.round(prefs.wipe * 100)} %`}
              />
            ) : (
              <Range
                label="Reparto"
                value={prefs.split}
                min={SPLIT_MIN}
                max={SPLIT_MAX}
                step={0.01}
                onChange={(split) => onPrefs({ split })}
                valueText={`${Math.round(prefs.split * 100)} / ${Math.round((1 - prefs.split) * 100)}`}
              />
            )}
          </>
        ) : (
          <>
            <Range
              label="Transparencia"
              value={Math.round((1 - prefs.opacity) * 100)}
              min={0}
              max={100}
              step={1}
              onChange={(v) => onPrefs({ opacity: Math.round((1 - v / 100) * 100) / 100 })}
              valueText={`${Math.round((1 - prefs.opacity) * 100)} %`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-washi-muted">Encima</span>
              <Segmented
                label="Qué va encima"
                layoutId="review-on-top"
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
              <span role="status" className={cn('text-[12px]', fitStatus === 'error' ? 'text-enji-300' : 'text-washi-subtle')}>
                {STATUS_TEXT[fitStatus]}
              </span>
            </div>
          </>
        )}
      </Row>

      <Row title="Velocidad" hint="La toma va a esta velocidad y el original, en proporción a la velocidad a la que se grabó.">
        <Segmented
          label="Velocidad común"
          layoutId="review-rate"
          value={(REVIEW_RATES as readonly number[]).includes(rate) ? rate : null}
          onChange={(r) => review().setRate(r)}
          options={REVIEW_RATES.map((r) => ({ value: r, label: formatSpeed(r) }))}
        />
        <Range
          label="Fina"
          value={rate}
          min={REVIEW_RATE_MIN}
          max={REVIEW_RATE_MAX}
          step={0.05}
          onChange={(r) => review().setRate(r)}
          valueText={formatSpeed(rate)}
        />
      </Row>

      {hasOriginal && (
        <Row title="Ajuste fino" hint="Adelanta o retrasa el original para compensar el retraso de cámara y sonido del móvil. Se guarda con la toma.">
          <Range
            label="Sincronía"
            value={adjust}
            min={-SYNC_ADJUST_LIMIT}
            max={SYNC_ADJUST_LIMIT}
            step={0.01}
            onChange={(v) => onAdjust(clampAdjust(v))}
            valueText={signed(adjust)}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="secondary" size="sm" className="min-h-11" aria-label="Retrasar el original 0,01 s" onClick={() => onAdjust(clampAdjust(adjust - 0.01))}>
              −0,01
            </Button>
            <Button variant="secondary" size="sm" className="min-h-11" aria-label="Adelantar el original 0,01 s" onClick={() => onAdjust(clampAdjust(adjust + 0.01))}>
              +0,01
            </Button>
            <Button variant="ghost" size="sm" className="min-h-11" onClick={() => onAdjust(0)} disabled={adjust === 0}>
              Poner a 0
            </Button>
            <span role="status" className={cn('text-[12px]', adjustStatus === 'error' ? 'text-enji-300' : 'text-washi-subtle')}>
              {STATUS_TEXT[adjustStatus]}
            </span>
          </div>
        </Row>
      )}

      <Row
        title="Espejo"
        hint={
          practisedMirrored
            ? 'Ensayaste con el original en espejo: por eso los dos empiezan invertidos. La toma se guarda sin espejo.'
            : 'La toma se guarda sin espejo. Invierte una de las dos para que miren igual.'
        }
      >
        <div className="flex flex-col gap-1">
          <ElasticToggle checked={mirrorTake} onChange={() => review().toggleMirrorTake()} label="Toma en espejo" />
          {hasOriginal && <ElasticToggle checked={mirrorOriginal} onChange={() => review().toggleMirrorOriginal()} label="Original en espejo" />}
        </div>
      </Row>

      {hasOriginal && (
        <Row title="Sonido">
          <Segmented
            label="Qué se oye"
            layoutId="review-audio"
            value={audio}
            onChange={(a) => review().setAudio(a)}
            options={[
              { value: 'take', label: 'La toma' },
              { value: 'original', label: 'El original' },
            ]}
          />
        </Row>
      )}

      <Row title="Tramos de la canción en esta toma" hint={clips.length ? 'Elige uno para repetirlo en la toma y en el original a la vez.' : 'Ningún clip de la canción cae dentro de esta toma.'}>
        {clips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {clips.map(({ clip, start, end }) => (
              <motion.button
                key={clip.id}
                type="button"
                aria-pressed={activeClipId === clip.id}
                whileTap={{ scale: 0.92 }}
                transition={jelly}
                onClick={() => {
                  review().loopRange({ start, end }, clip.id);
                  // F9 · A clip saved zoomed in opens zoomed in on the original (its picture is the song's).
                  if (canZoomOriginal && mode === 'stacked') review().setZoom('original', zoomOfClip(clip));
                  review().play();
                }}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-[10px] px-3 text-[13px]',
                  activeClipId === clip.id ? 'bg-washi font-bold text-sumi-900' : 'well font-medium text-washi-muted hover:text-washi',
                )}
              >
                <span aria-hidden className={cn('size-2.5 rotate-[-3deg] rounded-[2px]', CLIP_SWATCH[clip.color].dot)} />
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
            ? 'En «Superpuesto» el zoom amplía los dos a la vez. Pulsa «Ampliar» sobre el vídeo para que los dedos amplíen en vez de encajar; doble toque para verlos enteros.'
            : 'Pellizca o usa la rueda sobre la toma o el original para ampliar una zona; arrastra para moverla y toca dos veces para verlo entero.'
        }
      >
        <ZoomStepper label={mode === 'overlay' ? 'Los dos' : 'Toma'} which="take" />
        {hasOriginal && mode === 'stacked' &&
          (canZoomOriginal ? (
            <ZoomStepper label="Original" which="original" />
          ) : (
            <p className="text-[12px] leading-snug text-washi-muted">
              Original de YouTube: vincula el archivo del vídeo para ampliar.
            </p>
          ))}
      </Row>
    </div>
  );
}
