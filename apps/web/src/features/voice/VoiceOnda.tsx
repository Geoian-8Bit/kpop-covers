import { motion } from 'motion/react';
import { useId } from 'react';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import { GROUP_LABEL, MODE_COPY, useModeRadios, useVoiceMotion, type VoiceVariantProps } from './controlParts';
import { VOICE_MODES, type VoiceMode } from './voiceRules';

/**
 * «La ola partida» (recommended): the app's own gesture — the wave of the timeline — split in two bands, the voice
 * in vermilion riding on top and the music in indigo below. Choosing parts them; the band that is taken out
 * settles flat and fades, like water going still. Under it, three seals (全 todo · 楽 sin voz · 声 voz).
 */

const W = 240; // one period: the paths are two periods wide and drift by one, so the loop is seamless
const H = 80;

/** A closed band between two wavy edges over 0…2W. `top`/`bottom`: y for x. */
function band(top: (x: number) => number, bottom: (x: number) => number): string {
  const xs: number[] = [];
  for (let x = 0; x <= 2 * W; x += 6) xs.push(x);
  const upper = xs.map((x, i) => `${i ? 'L' : 'M'}${x} ${top(x).toFixed(1)}`).join(' ');
  const lower = [...xs].reverse().map((x) => `L${x} ${bottom(x).toFixed(1)}`).join(' ');
  return `${upper} ${lower} Z`;
}

const k = (period: number) => (2 * Math.PI) / period;
/** Crest of the voice band: a sharper, curling top like Hokusai's foam (sum of harmonics of the period). */
const voiceTop = (x: number) => 24 - 7 * Math.sin(k(W / 2) * x) - 2.5 * Math.sin(k(W / 4) * x + 1.1);
const voiceBottom = (x: number) => voiceTop(x) + 11 + 2 * Math.sin(k(W / 3) * x);
const musicTop = (x: number) => 46 - 6 * Math.sin(k(W / 2) * x + 2.2) - 3 * Math.sin(k(W) * x + 0.4);

const VOICE_PATH = band(voiceTop, voiceBottom);
const MUSIC_PATH = band(musicTop, () => H + 2);
const FOAM_PATH = (() => {
  const pts: string[] = [];
  for (let x = 0; x <= 2 * W; x += 6) pts.push(`${x ? 'L' : 'M'}${x} ${voiceTop(x).toFixed(1)}`);
  return pts.join(' ');
})();

type BandState = { y: number; scaleY: number; opacity: number };

function bands(mode: VoiceMode, reduce: boolean): { voice: BandState; music: BandState } {
  const whole: BandState = { y: 0, scaleY: 1, opacity: 1 };
  const still = (y: number): BandState => (reduce ? { y: 0, scaleY: 1, opacity: 0.25 } : { y, scaleY: 0.14, opacity: 0.32 });
  const lifted = (y: number): BandState => (reduce ? whole : { y, scaleY: 1, opacity: 1 });
  if (mode === 'sin-voz') return { voice: still(-6), music: lifted(5) };
  if (mode === 'voz') return { voice: lifted(-6), music: still(5) };
  return { voice: whole, music: whole };
}

const SEAL_FILL: Record<VoiceMode, string> = {
  original: 'bg-washi text-sumi-900',
  'sin-voz': 'bg-ai-500 text-washi',
  voz: 'bg-shu-500 text-washi',
};

export function VoiceOnda({ mode, onChange, available, compact, noteId }: VoiceVariantProps) {
  const uid = useId();
  const radio = useModeRadios(mode, onChange, !available);
  const { reduce, transition } = useVoiceMotion(soft);
  const tab = useVoiceMotion(jelly).transition;
  const state = bands(mode, reduce);
  const drift = !reduce && available;

  return (
    <div
      role="radiogroup"
      aria-label={GROUP_LABEL}
      aria-describedby={noteId}
      aria-disabled={!available || undefined}
      className="well w-full rounded-[14px] p-1.5"
    >
      <div
        aria-hidden
        className={cn(
          'relative overflow-hidden rounded-[10px] bg-sumi-900',
          compact ? 'h-10' : 'h-[76px]',
          !available && 'opacity-40',
        )}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full">
          <motion.g
            style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
            animate={state.music}
            transition={transition}
          >
            <motion.g
              animate={drift ? { x: [0, -W] } : { x: 0 }}
              transition={drift ? { duration: 14, ease: 'linear', repeat: Infinity } : { duration: 0 }}
            >
              <path d={MUSIC_PATH} className="fill-ai-600" />
            </motion.g>
          </motion.g>
          <motion.g
            style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
            animate={state.voice}
            transition={transition}
          >
            <motion.g
              animate={drift ? { x: [0, -W] } : { x: 0 }}
              transition={drift ? { duration: 9, ease: 'linear', repeat: Infinity } : { duration: 0 }}
            >
              <path d={VOICE_PATH} className="fill-shu-500" />
              <path
                d={FOAM_PATH}
                fill="none"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                className="stroke-washi/70"
              />
            </motion.g>
          </motion.g>
        </svg>
        {!compact && (
          <>
            <span className="absolute left-2.5 top-1.5 font-display text-[12px] font-bold text-washi">声 voz</span>
            <span className="absolute bottom-1.5 left-2.5 font-display text-[12px] font-bold text-washi">楽 música</span>
          </>
        )}
      </div>

      <div className="mt-1.5 grid grid-cols-3 gap-1">
        {VOICE_MODES.map((option) => {
          const active = option === mode;
          const copy = MODE_COPY[option];
          return (
            <motion.button
              key={option}
              {...radio(option)}
              whileTap={available ? { scale: 0.92 } : undefined}
              transition={tab}
              className={cn(
                'relative isolate flex min-h-11 min-w-0 items-center justify-center rounded-[10px] px-1.5 disabled:opacity-50',
                compact ? 'gap-2' : 'flex-col gap-1 py-2',
                active ? 'text-washi' : 'text-washi-muted enabled:hover:text-washi',
              )}
            >
              {active && (
                <motion.span
                  layoutId={`${uid}-onda-tab`}
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
                  className={cn(
                    'absolute -inset-px grid place-items-center rounded-[6px]',
                    SEAL_FILL[option],
                  )}
                >
                  {copy.seal}
                </motion.span>
              </span>
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
    </div>
  );
}
