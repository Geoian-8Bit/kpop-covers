import { motion } from 'motion/react';
import { useId, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import { GROUP_LABEL, MODE_COPY, useModeRadios, useVoiceMotion, type VoiceVariantProps } from './controlParts';
import { VOICE_MODES, type VoiceMode } from './voiceRules';

/**
 * «Puertas correderas»: a small hinoki frame with two lanes, 声 voz and 楽 música. Two washi fusuma rest in the
 * wall pockets at the ends; taking a part out slides its door over it on a spring, and the paper lets the lane
 * show through faintly, like a lit room behind shōji. Wooden name plaques under the frame are the choices; the
 * lanes can also be tapped to close or open their door.
 */

/** Kumiko lattice drawn on the washi (static: only the door moves). */
const LATTICE: CSSProperties = {
  backgroundImage: [
    'repeating-linear-gradient(0deg, transparent 0 13px, rgb(74 52 36 / 0.32) 13px 14px)',
    'repeating-linear-gradient(90deg, transparent 0 17px, rgb(74 52 36 / 0.32) 17px 18px)',
  ].join(','),
};

/** Where each door sits: in its pocket (a sliver visible, so you can tell there is a door) or over its lane. */
function doors(mode: VoiceMode) {
  return { voice: mode === 'sin-voz', music: mode === 'voz' };
}

export function VoiceFusuma({ mode, onChange, available, compact, noteId }: VoiceVariantProps) {
  const uid = useId();
  const radio = useModeRadios(mode, onChange, !available);
  const { reduce, transition } = useVoiceMotion(jelly);
  const shut = doors(mode);

  /** Door motion: a spring slide, or (less motion) a fade in place. */
  const door = (closed: boolean, side: 'left' | 'right') =>
    reduce
      ? { x: '0%', opacity: closed ? 1 : 0 }
      : { x: closed ? '0%' : side === 'left' ? '-90%' : '90%', opacity: 1 };

  const tapLane = (lane: 'voice' | 'music') => {
    if (!available) return;
    const target: VoiceMode = lane === 'voice' ? 'sin-voz' : 'voz';
    onChange(mode === target ? 'original' : target);
  };

  return (
    <div
      role="radiogroup"
      aria-label={GROUP_LABEL}
      aria-describedby={noteId}
      aria-disabled={!available || undefined}
      className="w-full"
    >
      {/* The frame (decorative; the plaques below are the control). */}
      <div
        aria-hidden
        className={cn(
          'relative overflow-hidden rounded-[10px] bg-sumi-950 ring-1 ring-kiji-700',
          compact ? 'h-11' : 'h-[92px]',
          !available && 'opacity-40',
        )}
      >
        <div className="absolute inset-x-0 top-0 h-1.5 bg-kiji-700" />
        <div className="absolute inset-x-0 bottom-0 h-1.5 bg-kiji-700" />
        <div className="absolute inset-x-0 inset-y-1.5 grid grid-cols-2">
          {(['voice', 'music'] as const).map((lane) => {
            const covered = lane === 'voice' ? shut.voice : shut.music;
            return (
              <motion.div
                key={lane}
                onClick={() => tapLane(lane)}
                animate={{ opacity: covered ? 0.55 : 1 }}
                transition={transition}
                className={cn(
                  'flex items-center justify-center gap-2',
                  available && 'cursor-pointer',
                  lane === 'voice' ? 'text-shu-400' : 'text-ai-300',
                )}
              >
                <span className={cn('font-display font-extrabold leading-none', compact ? 'text-[20px]' : 'text-[34px]')}>
                  {lane === 'voice' ? '声' : '楽'}
                </span>
                {!compact && (
                  <span className="text-[13px] font-bold text-washi-muted">{lane === 'voice' ? 'Voz' : 'Música'}</span>
                )}
              </motion.div>
            );
          })}
        </div>
        {/* Centre post between the lanes. */}
        <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-kiji-700" />

        {(['left', 'right'] as const).map((side) => {
          const closed = side === 'left' ? shut.voice : shut.music;
          return (
            <motion.div
              key={side}
              initial={false}
              animate={door(closed, side)}
              transition={transition}
              className={cn(
                'pointer-events-none absolute inset-y-1.5 w-1/2 border-x-[3px] border-kiji-400 bg-washi/90',
                side === 'left' ? 'left-0' : 'right-0',
              )}
              style={LATTICE}
            >
              {/* Hikite: the round finger pull, on the edge that meets the post. */}
              <span
                className={cn(
                  'absolute top-1/2 size-3 -translate-y-1/2 rounded-full border-2 border-kiji-700 bg-kiji-300',
                  side === 'left' ? 'right-1.5' : 'left-1.5',
                )}
              />
            </motion.div>
          );
        })}
      </div>

      {/* Wooden plaques: the three choices. */}
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {VOICE_MODES.map((option) => {
          const active = option === mode;
          const copy = MODE_COPY[option];
          return (
            <motion.button
              key={option}
              {...radio(option)}
              whileTap={available ? { scale: 0.92 } : undefined}
              transition={jelly}
              className={cn(
                'relative isolate flex min-h-11 min-w-0 flex-col items-center justify-center rounded-[8px] border border-kiji-700 px-1.5 disabled:opacity-50',
                compact ? 'py-1' : 'py-2',
                active ? 'text-sumi-900' : 'text-washi-muted enabled:hover:text-washi',
              )}
            >
              {active && (
                <motion.span
                  layoutId={`${uid}-fusuma-plaque`}
                  transition={transition}
                  className="absolute inset-0 -z-10 rounded-[8px] bg-washi shadow-[inset_0_0_0_2px_var(--color-kiji-300),0_4px_10px_-4px_rgb(0_0_0/0.8)]"
                />
              )}
              <span className="block max-w-full truncate text-[14px] font-bold leading-tight">{copy.label}</span>
              {!compact && (
                <span
                  className={cn(
                    'block text-center text-[11px] leading-tight',
                    active ? 'text-sumi-700' : 'text-washi-subtle',
                  )}
                >
                  {copy.hint}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
