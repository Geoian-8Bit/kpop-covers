import { clampAdjust, formatSpeed, formatTime, SYNC_ADJUST_LIMIT, type Clip, type Note } from '@coverscape/shared';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeftRight,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Crosshair,
  FlipHorizontal2,
  Layers,
  MessageSquarePlus,
  Repeat,
  Scan,
  SlidersHorizontal,
  Volume2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { forwardRef, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
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
  nextQuickOpacity,
  nextQuickRate,
  noteStatus,
  REVIEW_RATE_MAX,
  REVIEW_RATE_MIN,
  type CompareMode,
  type ViewPrefs,
} from './reviewRules';
import { capturePointer } from './pointer';
import { useTapAnyFinger } from './tapAnyFinger';

const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value).toFixed(2).replace('.', ',')} s`;

/** A small pill like the studio's tray buttons: 38 px to the eye, 44 px to the finger. */
const pill =
  "relative flex h-[38px] shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-[13px] font-bold transition-colors after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-[''] disabled:opacity-40";
const pillIdle = 'text-washi-muted hover:bg-washi/[0.07] hover:text-washi';

// ───────────── Timeline of the take ─────────────

/**
 * The take's time bar: drag to scrub (both follow), the A–B band and the take's notes as diamonds; under it the
 * clock and, on the right, `actions` (sound, note).
 */
export function ReviewTimeline({
  notes,
  openNoteId,
  onNote,
  actions,
  variant = 'full',
  showTotal = true,
}: {
  notes: Note[];
  openNoteId: string | null;
  onNote: (note: Note) => void;
  actions?: ReactNode;
  /** 'bar': clock and line only, for the one-row bar of a phone on its side. */
  variant?: 'full' | 'bar';
  /** «/ 0:45» after the clock (left out when the row is busy). */
  showTotal?: boolean;
}) {
  const bar = variant === 'bar';
  const duration = useReview((s) => s.duration);
  const loop = useReview((s) => s.loop);
  const reduce = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const f = (t: number) => (duration > 0 ? Math.min(1, Math.max(0, t / duration)) : 0);

  // P1 · Fill, thumb, clock and aria follow the take's clock through the DOM (like the studio's FsProgress), so
  // playback never re-renders the timeline: the fill moves every frame (a transform), the label each tenth, aria
  // each second.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let lastTime = Number.NaN;
    let lastDuration = Number.NaN;
    let lastTenth = Number.NaN;
    let lastSecond = Number.NaN;
    const paint = (time: number, total: number) => {
      if (time === lastTime && total === lastDuration) return;
      const totalChanged = total !== lastDuration;
      lastTime = time;
      lastDuration = total;
      const ratio = total > 0 ? Math.min(1, Math.max(0, time / total)) : 0;
      fillRef.current?.style.setProperty('transform', `scaleX(${ratio})`);
      thumbRef.current?.style.setProperty('left', `${ratio * 100}%`);
      const tenth = Math.floor(time * 10);
      if (tenth !== lastTenth && clockRef.current) {
        lastTenth = tenth;
        clockRef.current.textContent = formatTime(time, { tenths: true });
      }
      const second = Math.floor(time);
      if (second !== lastSecond || totalChanged) {
        lastSecond = second;
        track.setAttribute('aria-valuenow', String(second));
        track.setAttribute('aria-valuetext', `${formatTime(second)} de ${formatTime(total)}`);
      }
    };
    const { time, duration: total } = useReview.getState();
    paint(time, total);
    return useReview.subscribe((s) => paint(s.time, s.duration));
  }, [bar]);

  const at = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration;
  };

  const dots =
    duration > 0 &&
    notes.map((n) => {
      const done = noteStatus(n) === 'done';
      const label = `Nota en ${formatTime(Number(n.take_seconds), { tenths: true })}${categoryLabel(n.category) ? ` · ${categoryLabel(n.category)}` : ''}${done ? ' · resuelta' : ''}: ${n.body}`;
      return (
        <TapButton
          key={n.id}
          type="button"
          aria-label={label}
          title={label}
          onTap={() => onNote(n)}
          className={cn(
            'group absolute z-10 grid w-11 -translate-x-1/2 place-items-center',
            // On the one-row bar the target is the strip above the line (44 × 22 px), never the line itself.
            bar ? '-top-2 h-[22px]' : 'top-1/2 h-11 -translate-y-1/2',
          )}
          style={{ left: `${f(Number(n.take_seconds)) * 100}%` }}
        >
          <motion.span
            aria-hidden
            animate={{ scale: openNoteId === n.id ? 1.45 : 1 }}
            transition={reduce ? { duration: 0 } : jelly}
            className={cn(
              'block rotate-45 rounded-[2px] ring-2 ring-sumi-850 group-hover:scale-125',
              bar ? 'size-2.5' : 'size-3',
              done ? 'bg-rokusho' : 'bg-ai-300',
              openNoteId === n.id && 'ring-kin-300',
            )}
          />
        </TapButton>
      );
    });

  const track = (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Tiempo de la toma"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 10) / 10}
      className={cn(
        'relative h-10 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-kin-300',
        bar ? 'min-w-0 flex-1' : 'mx-2',
      )}
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
      <div className="well absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full">
        {hasRange(loop) && (
          <div
            className={cn('absolute inset-y-0', loop.enabled ? 'bg-shu-500/70' : 'bg-shu-500/30')}
            style={{ left: `${f(loop.start) * 100}%`, width: `${(f(loop.end) - f(loop.start)) * 100}%` }}
          />
        )}
        <div ref={fillRef} className="absolute inset-0 origin-left scale-x-0 bg-kin-300/45" />
      </div>
      {loop.start != null && <Seal at={f(loop.start)} label="A" />}
      {loop.end != null && <Seal at={f(loop.end)} label="B" />}
      <span
        ref={thumbRef}
        aria-hidden
        className="absolute top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[4px] border border-kin-400 bg-washi shadow-[0_0_0_3px_var(--color-sumi-850)]"
      />
    </div>
  );

  const clock = (
    <p className={cn('tabular shrink-0 whitespace-nowrap font-mono text-[13px] text-washi-muted', bar && 'w-[3.6rem] text-right')}>
      <span ref={clockRef} className="font-semibold text-washi" />
      {!bar && showTotal && <span className="text-washi-subtle"> / {formatTime(duration)}</span>}
    </p>
  );

  if (bar) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {clock}
        {/* The line keeps clear of the clock (its thumb overhangs its start); the note marks sit just above it, as
            buttons of their own beside the slider, so a tap on one opens the note instead of moving the time. */}
        <div className="relative ml-3 mr-1 flex min-w-0 flex-1">
          {track}
          {notes.length > 0 && <div className="pointer-events-none absolute inset-x-0 top-0 h-0 [&>button]:pointer-events-auto">{dots}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Note diamonds: each a 44 px target over a small mark, just above the bar. */}
      {notes.length > 0 && <div className="relative mx-2 h-6">{dots}</div>}
      {track}
      <div className="flex min-h-11 items-center gap-2 px-1">
        {clock}
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </div>
    </div>
  );
}

/** A plain review button that answers to any finger (see `useTapAnyFinger`). */
function TapButton({ onTap, disabled, ...rest }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & { onTap: () => void }) {
  const tap = useTapAnyFinger(onTap, disabled);
  return <button {...rest} disabled={disabled} {...tap} />;
}

function Seal({ at, label }: { at: number; label: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute grid size-5 -translate-x-1/2 place-items-center rounded-[4px] bg-shu-600 font-display text-[11px] font-extrabold text-washi',
        label === 'A' ? '-top-1' : '-bottom-1',
      )}
      style={{ left: `${at * 100}%` }}
    >
      {label}
    </span>
  );
}

/** «Se oye: la toma / el original»: one tap switches which of the two is heard. */
export function SoundPill({ hasOriginal }: { hasOriginal: boolean }) {
  const audio = useReview((s) => s.audio);
  if (!hasOriginal) return null;
  const takeHeard = audio === 'take';
  return <SoundPillButton takeHeard={takeHeard} />;
}

function SoundPillButton({ takeHeard }: { takeHeard: boolean }) {
  const soundTap = useTapAnyFinger(() => useReview.getState().setAudio(takeHeard ? 'original' : 'take'));
  return (
    <button
      type="button"
      aria-label={takeHeard ? 'Se oye la toma. Pulsa para oír el original' : 'Se oye el original. Pulsa para oír la toma'}
      {...soundTap}
      className={cn(pill, takeHeard ? pillIdle : 'bg-ai-600/50 text-ai-200 ring-1 ring-inset ring-ai-400/35')}
    >
      <Volume2 className="size-[18px]" />
      <span>{takeHeard ? 'Toma' : 'Original'}</span>
    </button>
  );
}

export function NotePill({ onNote }: { onNote: () => void }) {
  const ready = useReview((s) => s.takeEngine != null);
  const tap = useTapAnyFinger(onNote, !ready);
  return (
    <button type="button" aria-label="Nota en este momento (N)" title="Nota en este momento (N)" disabled={!ready} {...tap} className={cn(pill, 'text-kin-300 hover:bg-washi/[0.07]')}>
      <MessageSquarePlus className="size-[18px]" />
      <span>Nota</span>
    </button>
  );
}

// ───────────── Quick controls ─────────────

/** One square of the quick strip: 44 px, its name for screen readers and as a tooltip, its state visible. */
function QuickButton({
  label,
  title,
  onClick,
  pressed,
  tone = 'ai',
  disabled,
  children,
}: {
  label: string;
  title?: string;
  onClick: () => void;
  pressed?: boolean;
  tone?: 'ai' | 'shu' | 'kin';
  disabled?: boolean;
  children: ReactNode;
}) {
  const reduce = useReducedMotion();
  const tap = useTapAnyFinger(onClick, disabled);
  const on = { ai: 'bg-ai-600/50 text-ai-200', shu: 'bg-shu-700 text-washi', kin: 'bg-kin-300/15 text-kin-200' }[tone];
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      disabled={disabled}
      {...tap}
      whileTap={reduce ? undefined : { scale: 0.88 }}
      transition={jelly}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-[9px] text-[13px] font-bold transition-colors disabled:opacity-40',
        pressed ? on : 'text-washi-muted hover:bg-washi/[0.07] hover:text-washi',
      )}
    >
      {children}
    </motion.button>
  );
}

/**
 * The quick strip: what is used most while reviewing a dance, one tap each, always at hand (a column by the take's
 * side of the stage on a phone on its side, a row over the controls in portrait). Never over YouTube.
 * Speed (1 → 0,75 → 0,5), A, B, repeat, the original in a mirror, separate / overlaid (files only), how much of the
 * original shows (overlaid only) and a note at this moment.
 */
export function QuickStrip({
  orientation,
  mode,
  canOverlay,
  hasOriginal,
  opacity,
  onTop,
  onMode,
  onOpacity,
  onNote,
  onLoopMissing,
  withLoop = true,
  withNote = true,
  withMode = true,
  bare = false,
}: {
  orientation: 'row' | 'column';
  mode: CompareMode;
  canOverlay: boolean;
  hasOriginal: boolean;
  /** «Superpuesto»: how much the one on top shows (0–1). */
  opacity: number;
  /** Which one is on top in «Superpuesto» (the see-through one). */
  onTop: 'original' | 'take';
  onMode: (mode: CompareMode) => void;
  onOpacity: (opacity: number) => void;
  onNote: () => void;
  onLoopMissing: () => void;
  /** The A–B buttons (the portrait controls already have them). */
  withLoop?: boolean;
  withNote?: boolean;
  /** Separate / overlaid (in portrait the header has it). */
  withMode?: boolean;
  /** Without the tray of its own (inside another row). */
  bare?: boolean;
}) {
  const rate = useReview((s) => s.rate);
  const loop = useReview((s) => s.loop);
  const mirrorOriginal = useReview((s) => s.mirrorOriginal);
  const ready = useReview((s) => s.takeEngine != null);
  const review = useReview.getState;
  const overlay = mode === 'overlay';
  const topName = onTop === 'take' ? 'La toma' : 'El original';

  // A column taller than the room scrolls: a fade at its foot says there is more below.
  const listRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || orientation !== 'column') return;
    const check = () => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 4);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    el.addEventListener('scroll', check, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', check);
    };
  }, [orientation]);

  return (
    <div
      role="group"
      aria-label="Accesos rápidos del repaso"
      className={cn(
        // `relative`: the tray's crest backdrop (index.css, .skin-tray::before, inset 0) must cover the tray only.
        'relative flex shrink-0',
        !bare && 'skin-track skin-tray rounded-[12px] border border-line bg-sumi-900/80 p-0.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]',
        orientation === 'column' && 'max-h-full',
      )}
    >
      <div
        ref={listRef}
        className={cn(
          'flex items-center gap-0.5',
          orientation === 'column' ? 'max-h-full flex-col overflow-y-auto overscroll-contain scrollbar-none' : 'flex-row',
        )}
      >
        {/* The most used first: a note, the speed, the section. */}
        {withNote && (
          <QuickButton label="Nota en este momento (N)" disabled={!ready} tone="kin" onClick={onNote}>
            <MessageSquarePlus className="size-[18px] text-kin-300" />
          </QuickButton>
        )}
        <QuickButton
          label={`Velocidad: ${formatSpeed(rate)}. Pulsa para ${formatSpeed(nextQuickRate(rate))}`}
          title="Velocidad (1× · 0,75× · 0,5×)"
          pressed={rate !== 1}
          tone="kin"
          onClick={() => review().setRate(nextQuickRate(rate))}
        >
          <span className="tabular font-mono text-[12px]">{formatSpeed(rate)}</span>
        </QuickButton>
        {withLoop && (
          <>
            <QuickButton label="Marcar A (inicio del tramo)" pressed={loop.start != null} tone="shu" onClick={() => review().markStart()}>
              <span className="font-display text-[16px] font-extrabold">A</span>
            </QuickButton>
            <QuickButton label="Marcar B (fin del tramo)" pressed={loop.end != null} tone="shu" onClick={() => review().markEnd()}>
              <span className="font-display text-[16px] font-extrabold">B</span>
            </QuickButton>
            <QuickButton
              label="Repetir el tramo A–B"
              pressed={loop.enabled}
              onClick={() => {
                if (!review().toggleLoop()) onLoopMissing();
              }}
            >
              <Repeat className="size-[18px]" />
            </QuickButton>
          </>
        )}
        {hasOriginal && (
          <QuickButton label="Original en espejo" pressed={mirrorOriginal} onClick={() => review().toggleMirrorOriginal()}>
            <FlipHorizontal2 className="size-[18px]" />
          </QuickButton>
        )}
        {withMode && canOverlay && (
          <QuickButton label="Superpuesto" title="Superpuesto (si no, separados)" pressed={overlay} onClick={() => onMode(overlay ? 'stacked' : 'overlay')}>
            {overlay ? <Layers className="size-[18px]" /> : <Columns2 className="size-[18px]" />}
          </QuickButton>
        )}
        {overlay && (
          <QuickButton
            label={`${topName} (encima) se ve al ${Math.round(opacity * 100)} %. Pulsa para cambiarlo`}
            title={`Cuánto se ve ${onTop === 'take' ? 'la toma' : 'el original'} (encima)`}
            tone="kin"
            onClick={() => onOpacity(nextQuickOpacity(opacity))}
          >
            <span className="tabular font-mono text-[11px] text-kin-200">{Math.round(opacity * 100)}%</span>
          </QuickButton>
        )}
      </div>
      {more && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0.5 bottom-0.5 h-6 rounded-b-[10px] bg-linear-to-t from-sumi-900 to-transparent"
        />
      )}
    </div>
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
  const reduce = useReducedMotion();
  const tap = useTapAnyFinger(onClick, disabled);
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      {...tap}
      whileTap={reduce ? undefined : { scale: 0.86 }}
      transition={jelly}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full text-washi-muted transition-colors hover:bg-washi/[0.08] hover:text-washi disabled:opacity-40',
        pressed && 'bg-washi/[0.12] text-washi',
        className,
      )}
    >
      {children}
    </motion.button>
  );
}

/** The play crest, as in the studio: plays and pauses both (inside the tap). */
export function PlayCrest({ size = 'md' }: { size?: 'md' | 'sm' }) {
  const playing = useReview((s) => s.playing);
  const ready = useReview((s) => s.takeEngine != null);
  const reduce = useReducedMotion();
  const tap = useTapAnyFinger(() => useReview.getState().togglePlay(), !ready);
  return (
    <motion.button
      type="button"
      aria-label={playing ? 'Pausar los dos (espacio)' : 'Reproducir los dos (espacio)'}
      {...tap}
      disabled={!ready}
      whileTap={reduce ? undefined : { scale: 0.88, rotate: -6 }}
      transition={jelly}
      className={cn(
        'relative shrink-0 drop-shadow-[0_8px_12px_rgb(0_0_0/0.55)] disabled:opacity-40',
        size === 'md' ? 'size-12' : 'size-11',
      )}
    >
      <ButtonSkin kind={playing ? 'pause' : 'play'} />
    </motion.button>
  );
}

/** ‹ and › frame by frame. */
export function FrameStep({ dir }: { dir: -1 | 1 }) {
  const ready = useReview((s) => s.takeEngine != null);
  return (
    <IconButton label={dir < 0 ? 'Fotograma anterior (,)' : 'Fotograma siguiente (.)'} onClick={() => useReview.getState().step(dir)} disabled={!ready}>
      {dir < 0 ? <ChevronLeft className="size-6" /> : <ChevronRight className="size-6" />}
    </IconButton>
  );
}

/** The section of the take: A, B and repeat, together like the studio's tray. */
export function LoopTray({ onLoopMissing }: { onLoopMissing: () => void }) {
  const loop = useReview((s) => s.loop);
  const trayBtn = "relative grid h-[38px] w-11 place-items-center rounded-[8px] transition-colors after:absolute after:inset-x-0 after:-inset-y-[3px] after:content-['']";
  return (
    <div
      role="group"
      aria-label="Tramo A–B"
      // `relative`: the tray's crest backdrop (index.css, .skin-tray::before, inset 0) must cover the tray only —
      // without it, it covered the whole bar and took its taps.
      className="skin-track skin-tray relative flex shrink-0 items-center rounded-[12px] border border-line bg-sumi-900/70 p-0.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]"
    >
      <TapButton
        type="button"
        aria-label="Marcar A (inicio del tramo)"
        aria-pressed={loop.start != null}
        onTap={() => useReview.getState().markStart()}
        className={cn(trayBtn, loop.start != null ? 'bg-shu-700 text-washi' : pillIdle)}
      >
        <span className="font-display text-[16px] font-extrabold">A</span>
      </TapButton>
      <TapButton
        type="button"
        aria-label="Marcar B (fin del tramo)"
        aria-pressed={loop.end != null}
        onTap={() => useReview.getState().markEnd()}
        className={cn(trayBtn, loop.end != null ? 'bg-shu-700 text-washi' : pillIdle)}
      >
        <span className="font-display text-[16px] font-extrabold">B</span>
      </TapButton>
      <TapButton
        type="button"
        aria-label={loop.enabled ? 'Quitar el bucle del tramo' : 'Repetir el tramo A–B'}
        aria-pressed={loop.enabled}
        onTap={() => {
          if (!useReview.getState().toggleLoop()) onLoopMissing();
        }}
        className={cn(trayBtn, loop.enabled ? 'bg-ai-600/50 text-ai-200' : pillIdle)}
      >
        <Repeat className="size-[18px]" />
      </TapButton>
    </div>
  );
}

/** The settings button (it says when they're open). */
export const SettingsButton = forwardRef<HTMLButtonElement, { open: boolean; onClick: () => void; className?: string }>(
  function SettingsButton({ open, onClick, className }, ref) {
    const reduce = useReducedMotion();
    const tap = useTapAnyFinger(onClick);
    return (
      <motion.button
        ref={ref}
        type="button"
        aria-label={open ? 'Cerrar ajustes del repaso' : 'Ajustes del repaso'}
        aria-expanded={open}
        {...tap}
        whileTap={reduce ? undefined : { scale: 0.86 }}
        transition={jelly}
        className={cn(
          'grid size-11 shrink-0 place-items-center rounded-full text-washi-muted transition-colors hover:bg-washi/[0.08] hover:text-washi',
          open && 'bg-washi/[0.12] text-washi',
          className,
        )}
      >
        <SlidersHorizontal className="size-5" />
      </motion.button>
    );
  },
);

/** A–B · ‹ ▶ › · settings: one row that fits a 390 px phone, the play crest in the middle as in the studio. */
export function ReviewTransport({
  settingsOpen,
  onSettings,
  onLoopMissing,
  settingsRef,
  hideSettings,
}: {
  settingsOpen: boolean;
  onSettings: () => void;
  onLoopMissing: () => void;
  settingsRef?: Ref<HTMLButtonElement>;
  /** The settings live beside (a wide screen): the button keeps its room, unseen. */
  hideSettings?: boolean;
}) {
  return (
    <div className="mx-auto flex max-w-xl items-center justify-between gap-1">
      <LoopTray onLoopMissing={onLoopMissing} />
      <div className="flex items-center">
        <FrameStep dir={-1} />
        <PlayCrest />
        <FrameStep dir={1} />
      </div>
      <SettingsButton ref={settingsRef} open={settingsOpen} onClick={onSettings} className={hideSettings ? 'invisible' : undefined} />
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
      <IconButton label={`Ver entero (${label.toLowerCase()})`} onClick={() => useReview.getState().setZoom(which, NO_ZOOM)} disabled={!isZoomed(zoom)}>
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

const STATUS_TEXT = { idle: '', saving: 'Guardando…', saved: 'Guardado en la toma', error: 'No se pudo guardar' } as const;

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
        <Row title="Ajuste fino" hint="Adelanta o retrasa el original para compensar el retraso de cámara y sonido del móvil. Se guarda con la toma.">
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
            <Button variant="secondary" size="sm" className="min-h-11" aria-label="Retrasar el original 0,01 s" onClick={() => onAdjust(clampAdjust(adjust - 0.01), 'soon')}>
              −0,01
            </Button>
            <Button variant="secondary" size="sm" className="min-h-11" aria-label="Adelantar el original 0,01 s" onClick={() => onAdjust(clampAdjust(adjust + 0.01), 'soon')}>
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
        hint={originalIsYouTube ? '«Superpuesto» necesita el archivo del vídeo: vincúlalo en el estudio. El vídeo de YouTube se ve entero y sin tapar.' : undefined}
      >
        {mode === 'stacked' ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              className="min-h-11"
              onClick={() => onPrefs({ order: prefs.order === 'original-first' ? 'take-first' : 'original-first' })}
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
              <span role="status" className={cn('text-[12px]', fitStatus === 'error' ? 'text-enji-300' : 'text-washi-subtle')}>
                {STATUS_TEXT[fitStatus]}
              </span>
            </div>
          </>
        )}
      </Row>

      <Row title="Velocidad fina" hint="Las velocidades de siempre están en los accesos rápidos. La toma va a esta velocidad y el original, en proporción a la velocidad a la que se grabó.">
        <Range label="Fina" value={rate} min={REVIEW_RATE_MIN} max={REVIEW_RATE_MAX} step={0.05} onChange={(r) => review().setRate(r)} valueText={formatSpeed(rate)} onSlide={onSliding} />
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
          <ElasticToggle checked={mirrorTake} onChange={() => review().toggleMirrorTake()} label="Toma en espejo" />
          {hasOriginal && <ElasticToggle checked={mirrorOriginal} onChange={() => review().toggleMirrorOriginal()} label="Original en espejo" />}
        </div>
      </Row>

      <Row
        title="Tramos de la canción en esta toma"
        hint={clips.length ? 'Elige uno para repetirlo en la toma y en el original a la vez.' : 'Ningún clip de la canción cae dentro de esta toma.'}
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
            <p className="text-[13px] leading-snug text-washi-muted">Original de YouTube: vincula el archivo del vídeo para ampliar.</p>
          ))}
      </Row>
    </div>
  );
}
