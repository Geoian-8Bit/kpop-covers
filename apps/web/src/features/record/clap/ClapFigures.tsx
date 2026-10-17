import { motion, useTransform, type MotionValue } from 'motion/react';
import { jelly, soft } from '@/lib/motion';

/**
 * F7 · The figure of the arming screen. It reads the live level (0–1 on a decibel scale), the level a clap must
 * reach, how many claps were heard (2 = fired) and a key that changes on every sound that crossed the threshold.
 */
export interface ClapFigureProps {
  level: MotionValue<number>;
  threshold: MotionValue<number>;
  count: 0 | 1 | 2;
  hitKey: number;
  reduce: boolean;
}

const C = 'var(--color-';
const color = (token: string) => `${C}${token})`;

/** A ring tick that turns with a 0–1 value around the centre (`turn` = the share of a full circle). */
function RingTick({
  value,
  turn,
  inner,
  outer,
  className,
}: {
  value: MotionValue<number>;
  turn: number;
  inner: number;
  outer: number;
  className: string;
}) {
  const rotate = useTransform(value, (v) => v * turn * 360);
  return (
    <motion.g style={{ rotate }}>
      {/* A full-size invisible box, so the rotation turns around the figure's centre. */}
      <circle r={100} fill="none" />
      <line
        x1={0}
        y1={-inner}
        x2={0}
        y2={-outer}
        strokeWidth={3}
        strokeLinecap="round"
        className={className}
      />
    </motion.g>
  );
}

// ───────────── 太鼓 Taiko ─────────────

/** One tomoe (comma), head at the bottom, in a unit circle: half of a yin–yang. */
const TOMOE = 'M0 -1 A1 1 0 0 1 0 1 A0.5 0.5 0 0 1 0 0 A0.5 0.5 0 0 0 0 -1 Z';

/**
 * «Taiko»: the drum seen from the front, its hide nailed with gold tacks and a mitsudomoe in vermilion. The hide
 * swells with the room's sound, every clap sends a ring across it and turns the crest; the double clap lights it.
 * The rim around it is the level, with the trigger marked in vermilion.
 */
export function ClapTaiko({ level, threshold, count, hitKey, reduce }: ClapFigureProps) {
  const swell = useTransform(level, (v) => (reduce ? 1 : 1 + v * 0.045));
  const fired = count === 2;
  return (
    <svg viewBox="-100 -100 200 200" className="size-full overflow-visible" aria-hidden>
      <defs>
        <radialGradient id="clap-taiko-hide" cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor={color('kin-200')} />
          <stop offset="75%" stopColor={color('kin-300')} />
          <stop offset="100%" stopColor={color('kiji-300')} />
        </radialGradient>
      </defs>
      {/* Level rim */}
      <circle r={96} fill="none" strokeWidth={5} className="stroke-washi/15" />
      <motion.circle
        r={96}
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
        transform="rotate(-90)"
        style={{ pathLength: level }}
        className={fired ? 'stroke-shu-400' : 'stroke-kin-300'}
      />
      <RingTick value={threshold} turn={1} inner={91} outer={101} className="stroke-shu-500" />

      {/* Barrel lip, hide edge, tacks */}
      <circle r={89} fill={color('kiji-700')} stroke={color('kiji-900')} strokeWidth={2} />
      <motion.g style={{ scale: swell }}>
        <circle r={83} fill={color('kiji-300')} />
        {Array.from({ length: 22 }, (_, i) => {
          const a = (i / 22) * Math.PI * 2;
          return (
            <circle
              key={i}
              cx={Math.cos(a) * 78.5}
              cy={Math.sin(a) * 78.5}
              r={2.8}
              fill={color('kin-400')}
              stroke={color('kiji-900')}
              strokeWidth={0.8}
            />
          );
        })}
        <circle r={73} fill="url(#clap-taiko-hide)" />
        {/* The crest turns a little with every clap. */}
        <motion.g
          initial={false}
          animate={{ rotate: hitKey * 40 }}
          transition={reduce ? { duration: 0 } : jelly}
        >
          <circle r={100} fill="none" />
          {[0, 120, 240].map((deg) => (
            <path
              key={deg}
              d={TOMOE}
              transform={`rotate(${deg}) translate(0 -19) scale(20)`}
              className={fired ? 'fill-shu-400' : 'fill-shu-500'}
            />
          ))}
        </motion.g>
        <motion.circle
          r={73}
          initial={false}
          animate={{ opacity: fired ? 0.22 : 0 }}
          transition={soft}
          fill={color('shu-400')}
        />
      </motion.g>

      {/* A ring runs across the hide on every sound that counted. */}
      {hitKey > 0 && !reduce && (
        <motion.circle
          key={hitKey}
          r={73}
          fill="none"
          strokeWidth={3}
          initial={{ scale: 0.35, opacity: 0.95 }}
          animate={{ scale: 1.32, opacity: 0 }}
          transition={{ duration: 0.75, ease: 'easeOut' }}
          className={fired ? 'stroke-shu-400' : 'stroke-washi'}
        />
      )}
    </svg>
  );
}
