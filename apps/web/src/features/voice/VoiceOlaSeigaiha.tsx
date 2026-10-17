import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import {
  DriftStrip,
  driftAttrs,
  GROUP_LABEL,
  ModeSeals,
  useVoiceMotion,
  WaveTags,
  type VoiceVariantProps,
} from './controlParts';
import { bandPath, linePath, sineWave, STRIP_WIDTH, type WaveFn } from './waveRules';

/**
 * D · «Seigaiha y pincel»: the music is the app's own seigaiha (青海波, the calm sea of overlapping waves) and the
 * voice a single vermilion brushstroke riding over it, thick and thin like ink, with dry-brush streaks at its
 * edges. Both drift while the song plays (the sea slowly, the stroke faster). Each mode lights one layer and dims
 * the other: «Sin voz» lifts the brush off the paper, «Voz» lets the sea fade.
 */

const SEIGAIHA_TILE = 40; // the utility's tile width (index.css)
const BRUSH = 180;

function brush(h: number) {
  const centre = sineWave(BRUSH, 0.45 * h, [
    { amp: 0.16 * h, cycles: 1 },
    { amp: 0.04 * h, cycles: 3, phase: 0.7 },
  ]);
  /** Ink load: heavy where the brush presses, thin where it lifts. */
  const width: WaveFn = (x) =>
    0.07 * h + 0.05 * h * (1 + Math.sin((2 * Math.PI * 2 * x) / BRUSH + 1.3)) * 0.5;
  const w = STRIP_WIDTH + BRUSH;
  return {
    stroke: bandPath(
      (x) => centre(x) - width(x) / 2,
      (x) => centre(x) + width(x) / 2,
      w,
      3,
    ),
    sheen: linePath((x) => centre(x) - width(x) * 0.15, w, 3),
    dryTop: linePath((x) => centre(x) - width(x) * 0.95, w, 3),
    dryBottom: linePath((x) => centre(x) + width(x) * 0.9, w, 3),
  };
}

const BRUSHES = new Map<number, ReturnType<typeof brush>>();
function brushFor(h: number) {
  let found = BRUSHES.get(h);
  if (!found) {
    found = brush(h);
    BRUSHES.set(h, found);
  }
  return found;
}

const SEA_STYLE = {
  width: `calc(100% + ${SEIGAIHA_TILE}px)`,
  '--voice-drift': `${-SEIGAIHA_TILE}px`,
  '--voice-drift-s': '7s',
} as CSSProperties;

export function VoiceOlaSeigaiha({ mode, onChange, available, compact, noteId, playing }: VoiceVariantProps) {
  const { reduce, transition: spring } = useVoiceMotion(jelly);
  const fade = useVoiceMotion(soft).transition;
  const h = compact ? 56 : 72;
  const ink = brushFor(h);
  const voiceOn = mode !== 'sin-voz';
  const musicOn = mode !== 'voz';

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
        className={cn('relative overflow-hidden rounded-[10px] bg-sumi-950', !available && 'opacity-40')}
        style={{ height: h }}
      >
        <motion.div
          initial={false}
          animate={{ opacity: musicOn ? 1 : 0.16 }}
          transition={fade}
          className="absolute inset-0"
        >
          <div className="seigaiha voice-drift absolute inset-y-0 left-0" style={SEA_STYLE} />
          <div className="absolute inset-0 bg-ai-600/25" />
        </motion.div>

        <motion.div
          initial={false}
          animate={
            voiceOn
              ? { opacity: 1, scaleY: 1 }
              : reduce
                ? { opacity: 0.12, scaleY: 1 }
                : { opacity: 0.12, scaleY: 0.5 }
          }
          transition={{ default: fade, scaleY: spring }}
          className="absolute inset-0"
        >
          <DriftStrip period={BRUSH} seconds={9} height={h}>
            <path d={ink.stroke} className="fill-shu-500" />
            <path d={ink.sheen} fill="none" strokeWidth={1} className="stroke-shu-300/55" />
            <path
              d={ink.dryTop}
              fill="none"
              strokeWidth={1}
              strokeDasharray="22 5 7 4"
              className="stroke-shu-400/60"
            />
            <path
              d={ink.dryBottom}
              fill="none"
              strokeWidth={1}
              strokeDasharray="9 6 26 4"
              className="stroke-shu-400/50"
            />
          </DriftStrip>
        </motion.div>
        <WaveTags />
      </div>

      <ModeSeals mode={mode} onChange={onChange} available={available} compact={compact} className="mt-1.5" />
    </div>
  );
}
