import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react';
import { Info } from 'lucide-react';
import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { cn } from '@/lib/cn';
import { soft } from '@/lib/motion';
import { stepMode, VOICE_MODES, type VoiceMode } from './voiceRules';

/** Props every variant of the control receives (see `VoiceSplitControl`). */
export interface VoiceVariantProps {
  mode: VoiceMode;
  onChange: (mode: VoiceMode) => void;
  available: boolean;
  monoLike?: boolean;
  compact?: boolean;
  /** Id of the note under the group (unavailable / mono), for `aria-describedby`. */
  noteId?: string;
}

export const GROUP_LABEL = 'Voz y música';

/** Copy per mode. `seal`: the kanji stamped on it (全 all · 楽 music · 声 voice). */
export const MODE_COPY: Record<VoiceMode, { label: string; hint: string; seal: string }> = {
  original: { label: 'Todo', hint: 'La canción tal cual', seal: '全' },
  'sin-voz': { label: 'Sin voz', hint: 'Baja la voz centrada (en mono)', seal: '楽' },
  voz: { label: 'Voz', hint: 'Sube el centro: la voz y poco más', seal: '声' },
};

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
