import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { jelly } from '@/lib/motion';
import {
  DriftStrip,
  driftAttrs,
  GROUP_LABEL,
  ModeSeals,
  useVoiceMotion,
  type VoiceVariantProps,
} from './controlParts';
import type { VoiceMode } from './voiceRules';
import { bandPath, linePath, sineWave, STRIP_WIDTH } from './waveRules';

/**
 * C · «Gran ola» after Hokusai: one great wave carved like an ukiyo-e block — engraved lines in the indigo body (the
 * music) and a vermilion crest curling over with claws of foam (the voice). The sea behind it runs to the end of the
 * row and drifts while the song plays; the wave rises and falls a little. Choosing springs the crest: «Sin voz»
 * breaks it off and it goes dark; «Voz» sinks the sea and leaves the crest alone, lifted.
 *
 * The wave keeps its proportions (2:1, the height of the box) at any width; only the sea grows with the row.
 */

/* The great wave, in a 200 × 100 block. */
const BODY =
  'M0 100L0 86C14 85 24 78 30 66C36 54 38 40 48 28C58 16 74 10 90 10C108 10 122 20 130 34C138 48 142 62 156 68C170 74 186 74 200 73L200 100Z';
const BODY_LINES = [
  'M6 96C20 93 30 84 36 72C42 60 46 46 56 36',
  'M18 98C30 95 40 86 46 76C52 64 58 50 70 40',
  'M96 22C110 24 120 34 126 46',
  'M104 34C116 38 124 50 130 60',
  'M140 70C156 78 176 80 198 80',
  'M128 80C150 88 174 90 198 89',
];
const CREST =
  'M62 18C70 6 88 0 104 3C118 6 128 16 130 28C122 18 110 14 98 15C84 16 72 24 66 34C62 30 56 28 48 30C40 32 36 38 34 44C32 36 36 28 44 24C50 21 56 20 62 18Z';
const CREST_LINES = ['M70 12C82 6 96 5 108 9', 'M76 18C86 13 98 12 110 15'];
const CREST_EDGE = 'M62 18C70 6 88 0 104 3C118 6 128 16 130 28';
const CLAWS = ['M34 44q-3 2 -4 6', 'M38 38q-4 1 -6 4', 'M42 33q-4 0 -7 2', 'M48 30q-3 -1 -6 0'];
const SPRAY = [
  { cx: 28, cy: 52, r: 1.3 },
  { cx: 31, cy: 47, r: 0.9 },
  { cx: 25, cy: 46, r: 0.7 },
  { cx: 36, cy: 51, r: 0.8 },
];

const SEA = 140;

function sea(h: number) {
  const surface = sineWave(SEA, 0.74 * h, [
    { amp: 0.025 * h, cycles: 2 },
    { amp: 0.015 * h, cycles: 3, phase: 1 },
  ]);
  const w = STRIP_WIDTH + SEA;
  const line = (base: number, phase: number) =>
    linePath(sineWave(SEA, base * h, [{ amp: 0.02 * h, cycles: 2, phase }]), w);
  const curls: string[] = [];
  for (let x = 30; x < w; x += SEA / 2) {
    const y = surface(x) + 0.09 * h;
    curls.push(`M${x} ${y.toFixed(1)}q4 -4 8 0`);
  }
  return {
    fill: bandPath(surface, h + 1, w),
    lines: [line(0.83, 0.6), line(0.91, 2.1)],
    curls: curls.join(''),
  };
}

const SEAS = new Map<number, ReturnType<typeof sea>>();
function seaFor(h: number) {
  let found = SEAS.get(h);
  if (!found) {
    found = sea(h);
    SEAS.set(h, found);
  }
  return found;
}

function poses(mode: VoiceMode, reduce: boolean, h: number) {
  const crest =
    mode === 'sin-voz'
      ? reduce
        ? { x: 0, y: 0, rotate: 0, scale: 1, opacity: 0.15 }
        : { x: -8, y: -6, rotate: -12, scale: 0.94, opacity: 0.15 }
      : mode === 'voz'
        ? { x: 0, y: reduce ? 0 : -4, rotate: 0, scale: reduce ? 1 : 1.04, opacity: 1 }
        : { x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 };
  const sunk = mode === 'voz';
  /** The wave's body sinks in block units (×h/100 on screen); the sea strip in px. */
  const body = sunk ? (reduce ? { y: 0, opacity: 0.2 } : { y: 45, opacity: 0.25 }) : { y: 0, opacity: 1 };
  const seaPose = sunk
    ? reduce
      ? { y: 0, opacity: 0.2 }
      : { y: 0.45 * h, opacity: 0.25 }
    : { y: 0, opacity: 1 };
  return { crest, body, sea: seaPose };
}

export function VoiceOlaHokusai({ mode, onChange, available, compact, noteId, playing }: VoiceVariantProps) {
  const { reduce, transition } = useVoiceMotion(jelly);
  const h = compact ? 64 : 84;
  const strip = seaFor(h);
  const pose = poses(mode, reduce, h);

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
        {...driftAttrs(Boolean(playing && available))}
        className={cn(
          'relative overflow-hidden rounded-[10px] bg-linear-to-b from-washi/[0.10] via-sumi-900 to-sumi-950',
          !available && 'opacity-40',
        )}
        style={{ height: h }}
      >
        {/* The sea behind, to the end of the row. */}
        <motion.div initial={false} animate={pose.sea} transition={transition} className="absolute inset-0">
          <DriftStrip period={SEA} seconds={16} height={h}>
            <path d={strip.fill} className="fill-ai-700" />
            {strip.lines.map((d, i) => (
              <path key={i} d={d} fill="none" strokeWidth={1} className="stroke-ai-300/35" />
            ))}
            <path
              d={strip.curls}
              fill="none"
              strokeWidth={1}
              strokeLinecap="round"
              className="stroke-ai-200/40"
            />
          </DriftStrip>
        </motion.div>

        {/* The great wave, at the left, at its own proportions. */}
        <div className="voice-bob absolute bottom-0 left-1" style={{ height: h, width: 2 * h }}>
          <svg viewBox="0 0 200 100" className="size-full overflow-visible">
            <motion.g initial={false} animate={pose.body} transition={transition}>
              <path d={BODY} className="fill-ai-600" />
              {BODY_LINES.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  strokeWidth={0.9}
                  strokeLinecap="round"
                  className="stroke-ai-300/45"
                />
              ))}
            </motion.g>
            <motion.g
              initial={false}
              animate={pose.crest}
              transition={transition}
              style={{ transformBox: 'fill-box', transformOrigin: '75% 80%' }}
            >
              <path d={CREST} className="fill-shu-500" />
              {CREST_LINES.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  strokeWidth={0.9}
                  strokeLinecap="round"
                  className="stroke-shu-300/60"
                />
              ))}
              <path
                d={CREST_EDGE}
                fill="none"
                strokeWidth={1.3}
                strokeLinecap="round"
                className="stroke-washi/75"
              />
              {CLAWS.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  className="stroke-washi"
                />
              ))}
              {SPRAY.map((dot, i) => (
                <circle key={i} {...dot} className="fill-washi/90" />
              ))}
            </motion.g>
          </svg>
        </div>

        <span className="absolute right-2 top-1.5 rounded-[4px] bg-sumi-950/55 px-1 font-display text-[11.5px] font-bold leading-[16px] text-washi">
          声 cresta · 楽 mar
        </span>
      </div>

      <ModeSeals mode={mode} onChange={onChange} available={available} compact={compact} className="mt-1.5" />
    </div>
  );
}
