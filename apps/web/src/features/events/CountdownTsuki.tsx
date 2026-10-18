import { motion, useReducedMotion } from 'motion/react';
import { jelly } from '@/lib/motion';
import { BAND, instant, type LongProps } from './countdownBand';
import { MOON_COUNT, moonLitPath, moonPhase } from './eventRules';

// F16 · Tsuki, the moon filling up: the countdown while the event is a week away or more (chosen in point 40).

const STARS = [
  [8, 9],
  [61, 6],
  [118, 11],
  [149, 4],
  [196, 9],
] as const;

export function Tsuki({ c }: LongProps) {
  const reduce = useReducedMotion();
  const days = c.kind === 'days' ? c.days : 0;
  const { illumination, index } = moonPhase(days);
  const move = reduce ? instant : jelly;
  return (
    <svg viewBox="0 0 280 66" className={BAND}>
      {STARS.map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r={0.9} className="fill-washi" fillOpacity={0.45} />
      ))}
      {/* The row of phases, new to full: the moons passed are lit, the current one bigger, the rest still faint. */}
      {Array.from({ length: MOON_COUNT }, (_, i) => {
        const current = i === index;
        const f = current ? illumination : i / (MOON_COUNT - 1);
        const cx = 16 + i * 27;
        const r = current ? 12 : 8.5;
        return (
          <motion.g
            key={i}
            initial={false}
            animate={{ opacity: i > index ? 0.42 : 1, scale: current ? 1 : 0.94 }}
            transition={move}
            style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
            className={current ? 'drop-shadow-[0_0_6px_rgb(228_200_143/0.7)]' : undefined}
          >
            <circle cx={cx} cy={34} r={r} className="fill-sumi-700 stroke-washi/25" strokeWidth={0.8} />
            {f > 0 && <path d={moonLitPath(cx, 34, r, f)} className="fill-kin-200" />}
          </motion.g>
        );
      })}
      {/* Days left, big beside the moons. */}
      <text x={248} y={44} textAnchor="end" fontSize={days > 99 ? 26 : 32} className="tabular fill-washi font-display font-extrabold">
        {days}
      </text>
      <text x={252} y={44} fontSize={11} className="fill-washi-muted font-bold">
        {days === 1 ? 'día' : 'días'}
      </text>
    </svg>
  );
}
