import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react';
import { Info } from 'lucide-react';
import {
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import { stepMode, VOICE_MODES, type VoiceMode } from './voiceRules';
import type { VoiceEnvelope } from './waveRules';
import './waves.css';

/** Where the song is, read outside React (the playhead paints itself; nothing re-renders per frame). */
export interface PlaybackClock {
  read(): { time: number; duration: number };
  /** Calls `listener` whenever the time may have changed; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

/** The song's envelope for «Olas del audio real»: being read, ready, or not available (then a sample shape). */
export type EnvelopeState =
  | { status: 'loading' }
  | { status: 'ready'; envelope: VoiceEnvelope }
  | { status: 'failed' }
  | { status: 'none' };

/** Props every variant of the control receives (see `VoiceSplitControl`). */
export interface VoiceVariantProps {
  mode: VoiceMode;
  onChange: (mode: VoiceMode) => void;
  available: boolean;
  monoLike?: boolean;
  compact?: boolean;
  /** Id of the note under the group (unavailable / mono), for `aria-describedby`. */
  noteId?: string;
  /** The song is playing: the waves drift (never with «reducir movimiento»). */
  playing?: boolean;
  /** Playhead source for the variants that show one (the studio's player; the demo simulates it). */
  clock?: PlaybackClock;
  /** «Olas del audio real»: the envelope to draw. Left out, the variant reads the studio's file itself. */
  envelope?: EnvelopeState;
}

export const GROUP_LABEL = 'Voz y música';

/** Copy per mode. `seal`: the kanji stamped on it (全 all · 楽 music · 声 voice). */
export const MODE_COPY: Record<VoiceMode, { label: string; hint: string; seal: string }> = {
  original: { label: 'Todo', hint: 'La canción tal cual', seal: '全' },
  // Neutral: true both with the approximate split (centre lowered) and with the AI tracks (see `modeHint`).
  'sin-voz': { label: 'Sin voz', hint: 'La música sin la voz', seal: '楽' },
  voz: { label: 'Voz', hint: 'Sube el centro: la voz y poco más', seal: '声' },
};

/** A mode's hint, saying so when the video has voice and music separated with AI. */
export function modeHint(mode: VoiceMode, separated = false): string {
  if (separated && mode === 'sin-voz') return 'Música sin voz (separada con IA)';
  if (separated && mode === 'voz') return 'Solo la voz (separada con IA)';
  return MODE_COPY[mode].hint;
}

export const UNAVAILABLE_COPY = 'Solo con el archivo del vídeo (YouTube no deja tocar su sonido)';
export const MONO_COPY =
  'Esta pista suena en mono: la voz y la música van juntas en el centro y no se pueden separar.';

/**
 * Roving radios for the three modes: Tab lands on the chosen one, arrows move the choice (wrapping), Home/End
 * jump. Returns the props for each option's button.
 */
export function useModeRadios(mode: VoiceMode, onChange: (mode: VoiceMode) => void, disabled: boolean) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const next = stepMode(mode, e.key);
    if (!next) return;
    e.preventDefault();
    if (next !== mode) onChange(next);
    refs.current[VOICE_MODES.indexOf(next)]?.focus();
  };
  return (option: VoiceMode) => {
    const index = VOICE_MODES.indexOf(option);
    return {
      type: 'button' as const,
      role: 'radio' as const,
      'aria-checked': option === mode,
      tabIndex: option === mode ? 0 : -1,
      disabled,
      onClick: () => {
        if (option !== mode) onChange(option);
      },
      onKeyDown,
      ref: (el: HTMLButtonElement | null) => {
        refs.current[index] = el;
      },
    };
  };
}

/**
 * The spring for a variant's movement, or a quick fade when the user asks for less motion (variants then animate
 * only opacity and keep transforms at rest).
 */
export function useVoiceMotion(spring: Transition): { reduce: boolean; transition: Transition } {
  const reduce = useReducedMotion() ?? false;
  return { reduce, transition: reduce ? { duration: 0.12, ease: 'linear' } : spring };
}

/** Note under the control: why it is off (YouTube), or that the track is mono. */
export function VoiceNote({
  id,
  available,
  monoLike,
  mode,
  tone = 'ink',
}: {
  id: string;
  available: boolean;
  monoLike?: boolean;
  mode: VoiceMode;
  tone?: 'ink' | 'paper';
}) {
  const text = !available ? UNAVAILABLE_COPY : monoLike ? MONO_COPY : null;
  const strong = available && monoLike && mode === 'sin-voz';
  return (
    <div id={id} role="status" aria-live="polite" className="min-h-0">
      <AnimatePresence initial={false}>
        {text && (
          <motion.p
            key={text}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={soft}
            className={cn(
              'mt-2 flex items-start gap-2 text-[13px] leading-snug',
              tone === 'paper' ? 'text-sumi-800' : strong ? 'text-kin-300' : 'text-washi-muted',
            )}
          >
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{text}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Attributes for a variant's root: the drift runs only while the song plays and the control can act on it. */
export function driftAttrs(on: boolean): { 'data-voice-playing'?: '' } {
  return on ? { 'data-voice-playing': '' } : {};
}

/**
 * A strip of wave in px (no viewBox: nothing is stretched, a period is as wide on a phone as on a wide screen),
 * one period wider than its box and slid left by that period while the song plays, so the loop is seamless.
 * `children` are its paths, drawn long (up to `STRIP_WIDTH` + period, see `waveRules.ts`) and clipped to the strip,
 * so the layer the browser keeps is only as big as the box.
 */
export function DriftStrip({
  period,
  seconds,
  reverse,
  height,
  className,
  children,
}: {
  period: number;
  seconds: number;
  reverse?: boolean;
  height: number;
  className?: string;
  children: ReactNode;
}) {
  const style = {
    width: `calc(100% + ${period}px)`,
    height,
    '--voice-drift': `${-period}px`,
    '--voice-drift-s': `${seconds}s`,
  } as CSSProperties;
  return (
    <svg
      aria-hidden
      height={height}
      data-reverse={reverse || undefined}
      className={cn('voice-drift absolute left-0 top-0 max-w-none', className)}
      style={style}
    >
      {children}
    </svg>
  );
}

const SEAL_FILL: Record<VoiceMode, string> = {
  original: 'bg-washi text-sumi-900',
  'sin-voz': 'bg-ai-500 text-washi',
  voz: 'bg-shu-500 text-washi',
};

/**
 * The three choices as seals (全 todo · 楽 sin voz · 声 voz) under a variant's picture: a lacquer tab springs to
 * the chosen one and its seal is inked. Shared by the wave variants (A–D).
 */
export function ModeSeals({
  mode,
  onChange,
  available,
  compact,
  separated,
  className,
}: Pick<VoiceVariantProps, 'mode' | 'onChange' | 'available' | 'compact'> & {
  /** The video has AI-separated tracks: the hints say so. */
  separated?: boolean;
  className?: string;
}) {
  const uid = useId();
  const radio = useModeRadios(mode, onChange, !available);
  const { reduce, transition: tab } = useVoiceMotion(jelly);
  return (
    <div className={cn('grid grid-cols-3 gap-1', className)}>
      {VOICE_MODES.map((option) => {
        const active = option === mode;
        const copy = MODE_COPY[option];
        return (
          <motion.button
            key={option}
            {...radio(option)}
            whileTap={available && !reduce ? { scale: 0.92 } : undefined}
            transition={tab}
            className={cn(
              'relative isolate flex min-h-11 min-w-0 items-center justify-center rounded-[10px] px-1.5 disabled:opacity-50',
              compact ? 'gap-2' : 'flex-col gap-1 py-2',
              active ? 'text-washi' : 'text-washi-muted enabled:hover:text-washi',
            )}
          >
            {active && (
              <motion.span
                aria-hidden
                layoutId={`${uid}-seal-tab`}
                transition={tab}
                className="absolute inset-0 -z-10 rounded-[10px] bg-sumi-800 shadow-[inset_0_1px_0_rgb(255_246_230/0.1),0_4px_10px_-4px_rgb(0_0_0/0.8)] ring-1 ring-line-strong"
              />
            )}
            <span
              aria-hidden
              className="relative grid size-7 shrink-0 place-items-center rounded-[6px] border border-current font-display text-[15px] font-extrabold leading-none"
            >
              {copy.seal}
              <motion.span
                initial={false}
                animate={active ? { opacity: 1, scale: 1 } : { opacity: 0, scale: reduce ? 1 : 1.35 }}
                transition={tab}
                className={cn('absolute -inset-px grid place-items-center rounded-[6px]', SEAL_FILL[option])}
              >
                {copy.seal}
              </motion.span>
            </span>
            <span className="min-w-0 text-center">
              <span className="block truncate text-[14px] font-bold leading-tight">{copy.label}</span>
              {!compact && (
                <span className="block text-[11px] leading-tight text-washi-subtle">{modeHint(option, separated)}</span>
              )}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

/** «声 voz» / «楽 música» tags on a wave picture (decorative: the seals carry the names). */
export function WaveTags({ className }: { className?: string }) {
  return (
    <>
      <span
        className={cn(
          'absolute left-2 top-1.5 rounded-[4px] bg-sumi-950/55 px-1 font-display text-[11.5px] font-bold leading-[16px] text-washi',
          className,
        )}
      >
        声 voz
      </span>
      <span
        className={cn(
          'absolute bottom-1.5 left-2 rounded-[4px] bg-sumi-950/55 px-1 font-display text-[11.5px] font-bold leading-[16px] text-washi',
          className,
        )}
      >
        楽 música
      </span>
    </>
  );
}
