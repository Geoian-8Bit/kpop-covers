import { motion } from 'motion/react';
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import {
  DriftStrip,
  driftAttrs,
  GROUP_LABEL,
  MODE_COPY,
  useModeRadios,
  useVoiceMotion,
  type VoiceVariantProps,
} from './controlParts';
import { VOICE_MODES, type VoiceMode } from './voiceRules';
import { bandPath, linePath, sineWave } from './waveRules';

/**
 * E · «Compacta» (for the phone): no big picture, only the three buttons, each with a little window of sea inside —
 * both inks for «Todo», only the indigo for «Sin voz», only the vermilion for «Voz». The chosen one is lit and its
 * wave moves while the song plays; the others rest, dimmed. Saves a whole band of the studio's height.
 */

const PILL_W = 52;
const PILL_H = 20;
const PERIOD = 26;
const LENGTH = PILL_W + 4;

const wave = (base: number, amp: number, phase = 0) =>
  sineWave(PERIOD, base, [
    { amp, cycles: 1, phase },
    { amp: amp * 0.3, cycles: 2, phase: phase + 0.8 },
  ]);
const full = (fn: ReturnType<typeof wave>) => bandPath(fn, PILL_H + 1, LENGTH + PERIOD, 2);
const edge = (fn: ReturnType<typeof wave>) => linePath(fn, LENGTH + PERIOD, 2);

const VOICE_HIGH = wave(7, 2.6);
const MUSIC_LOW = wave(13, 1.8, Math.PI);
const ALONE = wave(9.5, 3);

const MINI: Record<VoiceMode, { d: string; fill: string; line: string }[]> = {
  original: [
    { d: full(VOICE_HIGH), fill: 'fill-shu-500', line: edge(VOICE_HIGH) },
    { d: full(MUSIC_LOW), fill: 'fill-ai-600', line: '' },
  ],
  'sin-voz': [{ d: full(ALONE), fill: 'fill-ai-500', line: edge(ALONE) }],
  voz: [{ d: full(ALONE), fill: 'fill-shu-500', line: edge(ALONE) }],
};

function MiniSea({ mode, moving }: { mode: VoiceMode; moving: boolean }) {
  return (
    <span
      aria-hidden
      {...driftAttrs(moving)}
      className="relative block shrink-0 overflow-hidden rounded-full bg-sumi-950 ring-1 ring-line"
      style={{ width: PILL_W, height: PILL_H }}
    >
      <DriftStrip period={PERIOD} seconds={mode === 'original' ? 2.8 : 2.2} height={PILL_H}>
        {MINI[mode].map((layer, i) => (
          <g key={i}>
            <path d={layer.d} className={layer.fill} />
            {layer.line && (
              <path
                d={layer.line}
                fill="none"
                strokeWidth={1.2}
                strokeLinecap="round"
                className="stroke-washi/80"
              />
            )}
          </g>
        ))}
      </DriftStrip>
    </span>
  );
}

export function VoiceOlaCompacta({ mode, onChange, available, compact, noteId, playing }: VoiceVariantProps) {
  const uid = useId();
  const radio = useModeRadios(mode, onChange, !available);
  const { reduce, transition: tab } = useVoiceMotion(jelly);
  const fade = useVoiceMotion(soft).transition;

  return (
    <div
      role="radiogroup"
      aria-label={GROUP_LABEL}
      aria-describedby={noteId}
      aria-disabled={!available || undefined}
      className="well grid w-full grid-cols-3 gap-1 rounded-[14px] p-1.5"
    >
      {VOICE_MODES.map((option) => {
        const active = option === mode;
        const copy = MODE_COPY[option];
        return (
          <motion.button
            key={option}
            {...radio(option)}
            whileTap={available && !reduce ? { scale: 0.93 } : undefined}
            transition={tab}
            className={cn(
              'relative isolate flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-[10px] px-1.5 py-1.5 disabled:opacity-50',
              compact ? 'flex-col gap-1 min-[420px]:flex-row min-[420px]:gap-2' : 'flex-col gap-1',
              active ? 'text-washi' : 'text-washi-muted enabled:hover:text-washi',
            )}
          >
            {active && (
              <motion.span
                aria-hidden
                layoutId={`${uid}-mini-tab`}
                transition={tab}
                className="absolute inset-0 -z-10 rounded-[10px] bg-sumi-800 shadow-[inset_0_1px_0_rgb(255_246_230/0.1),0_4px_10px_-4px_rgb(0_0_0/0.8)] ring-1 ring-line-strong"
              />
            )}
            <motion.span
              aria-hidden
              initial={false}
              animate={{ opacity: active ? 1 : 0.45 }}
              transition={fade}
              className="block"
            >
              <MiniSea mode={option} moving={Boolean(active && playing && available)} />
            </motion.span>
            <span className="min-w-0 text-center">
              <span className="block truncate text-[14px] font-bold leading-tight">{copy.label}</span>
              {!compact && (
                <span className="block text-[11px] leading-tight text-washi-subtle">{copy.hint}</span>
              )}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
