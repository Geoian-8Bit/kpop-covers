import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { jelly, snappy } from '@/lib/motion';
import { GROUP_LABEL, MODE_COPY, useModeRadios, useVoiceMotion, type VoiceVariantProps } from './controlParts';
import { VOICE_MODES, type VoiceMode } from './voiceRules';

/**
 * «Capas de grabado»: an ukiyo-e print is made from one carved block per colour, printed one over another. Here
 * the three choices are three blocks stacked like a printer's pile — 全 todo (key block with both inks), 楽 música
 * (indigo) and 声 voz (vermilion). The chosen block comes forward into register, with the gold kentō marks
 * (the L-shaped corner and the straight guide printers align the paper to); the others step back in depth.
 */

/** The carved swatch printed on each block (decorative). */
function Swatch({ mode, compact }: { mode: VoiceMode; compact?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-[4px] bg-sumi-950 shadow-[inset_0_1px_3px_rgb(0_0_0/0.7)]',
        compact ? 'h-6 w-7' : 'h-8 w-10',
      )}
    >
      {mode !== 'voz' && (
        <span
          className={cn('absolute inset-x-0 bottom-0 bg-ai-600', mode === 'original' ? 'top-1/2' : 'top-[30%]')}
          style={{
            backgroundImage:
              'repeating-radial-gradient(circle at 50% 140%, transparent 0 3px, rgb(169 194 222 / 0.45) 3px 4px)',
          }}
        />
      )}
      {mode !== 'sin-voz' && (
        <span
          className={cn(
            'absolute rounded-full bg-shu-500',
            mode === 'original' ? 'left-[18%] top-[14%] size-[42%]' : 'left-1/2 top-1/2 size-[62%] -translate-x-1/2 -translate-y-1/2',
          )}
        />
      )}
    </span>
  );
}

/** Kentō: the registration marks of the chosen block (kagi at one corner, hikitsuke along the edge). */
function Kento() {
  return (
    <>
      <span className="absolute bottom-1 left-1 h-2.5 w-[1.5px] bg-kin-300" />
      <span className="absolute bottom-1 left-1 h-[1.5px] w-2.5 bg-kin-300" />
      <span className="absolute bottom-1 right-3 h-[1.5px] w-4 bg-kin-300" />
    </>
  );
}

export function VoiceCapas({ mode, onChange, available, compact, noteId }: VoiceVariantProps) {
  const radio = useModeRadios(mode, onChange, !available);
  const { reduce, transition } = useVoiceMotion(snappy);
  const chosen = VOICE_MODES.indexOf(mode);

  /** Forward and in register when chosen; back by depth (distance from the chosen block) otherwise. */
  const place = (index: number) => {
    const depth = Math.abs(index - chosen);
    if (depth === 0) return { x: 0, y: 0, scale: 1, opacity: 1 };
    const opacity = depth === 1 ? 0.72 : 0.6;
    if (reduce) return { x: 0, y: 0, scale: 1, opacity };
    return compact
      ? { x: 0, y: 3 + 2 * depth, scale: 1 - 0.03 * depth, opacity }
      : { x: 8 + 6 * depth, y: 0, scale: 1 - 0.025 * depth, opacity };
  };

  return (
    <div
      role="radiogroup"
      aria-label={GROUP_LABEL}
      aria-describedby={noteId}
      aria-disabled={!available || undefined}
      className={cn('w-full', compact ? 'grid grid-cols-3 pb-1.5' : 'flex flex-col pr-5')}
    >
      {VOICE_MODES.map((option, index) => {
        const active = option === mode;
        const copy = MODE_COPY[option];
        const depth = Math.abs(index - chosen);
        return (
          <motion.button
            key={option}
            {...radio(option)}
            initial={false}
            animate={place(index)}
            whileTap={available ? { scale: 0.95 } : undefined}
            transition={{ default: transition, scale: reduce ? transition : jelly }}
            style={{ zIndex: 10 - depth }}
            className={cn(
              // Lacquer like `paper-raised`, without its corner fittings (too busy on a block this small).
              'relative flex min-h-11 min-w-0 items-center rounded-[10px] border border-line-strong bg-sumi-800 bg-[linear-gradient(180deg,rgb(255_246_230/0.075),rgb(0_0_0/0.06))] text-left shadow-[inset_0_1px_0_rgb(255_246_230/0.12),0_2px_4px_rgb(0_0_0/0.5),0_14px_28px_-12px_rgb(0_0_0/0.7)] disabled:cursor-not-allowed',
              compact ? 'gap-2 px-2 py-1.5 [&:not(:first-child)]:-ml-1.5' : 'gap-3 px-3 py-2.5 [&:not(:first-child)]:-mt-2',
              !available && 'saturate-0',
            )}
          >
            <Swatch mode={option} compact={compact} />
            <span className="min-w-0">
              <span className={cn('flex items-baseline gap-1.5 font-bold leading-tight', compact ? 'text-[13px]' : 'text-[15px]')}>
                {!compact && (
                  <span aria-hidden className="font-display text-[13px] text-kin-300">
                    {copy.seal}
                  </span>
                )}
                <span className="truncate">{copy.label}</span>
              </span>
              {!compact && <span className="block text-[12px] leading-tight text-washi-subtle">{copy.hint}</span>}
            </span>
            <motion.span
              aria-hidden
              initial={false}
              animate={{ opacity: active ? 1 : 0 }}
              transition={transition}
              className="pointer-events-none absolute inset-0 rounded-[10px] ring-1 ring-kin-300/60"
            >
              <Kento />
            </motion.span>
          </motion.button>
        );
      })}
    </div>
  );
}
