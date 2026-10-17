import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { soft } from '@/lib/motion';
import { BAND, instant, type LongProps } from './countdownBand';
import { pageFace, tornPages } from './eventRules';

// F16 · Koyomi, the tear-off calendar (a long countdown design; its own chunk, loaded when chosen).

/** Fixed spots of the torn pages lying beside the pad (newest first). */
const TORN_SPOTS = [
  { x: 82, y: 30, r: -9 },
  { x: 126, y: 36, r: 7 },
  { x: 170, y: 29, r: -4 },
  { x: 214, y: 37, r: 11 },
] as const;

export function Koyomi({ c, createdAt, now }: LongProps) {
  const reduce = useReducedMotion();
  const face = pageFace(c);
  const torn = tornPages(c, createdAt, now, TORN_SPOTS.length);
  const small = face.big.length > 2;
  return (
    <svg viewBox="0 0 280 66" className={BAND}>
      {/* The pages torn off on earlier days, lying on the floor, fainter the older. */}
      {torn.map((day, i) => {
        const spot = TORN_SPOTS[i]!;
        return (
          <g key={i} transform={`translate(${spot.x} ${spot.y}) rotate(${spot.r} 17 14)`} opacity={0.62 - i * 0.12}>
            <path d="M0 3 L4 0 L8 3 L12 0 L16 3 L20 0 L24 3 L28 0 L32 3 L34 1 V28 H0 Z" className="fill-washi-muted" />
            <text
              x={17}
              y={21}
              textAnchor="middle"
              fontSize={day > 99 ? 11 : 13}
              className="tabular fill-sumi-600 font-display font-extrabold"
            >
              {day}
            </text>
          </g>
        );
      })}
      {/* The pad: the pages still to go peeking under the top one. */}
      <rect x={10} y={16} width={48} height={49} rx={4} className="fill-kin-200" />
      <rect x={8} y={14} width={52} height={48} rx={4} className="fill-washi-muted" />
      <AnimatePresence initial={false}>
        <motion.g
          key={face.big}
          style={{ transformBox: 'fill-box', transformOrigin: '8% 0%' }}
          initial={{ opacity: 1 }}
          animate={{ opacity: 1, rotate: 0, x: 0, y: 0 }}
          // Torn off at the right ring first: it swings down from the left one and drops onto the pile.
          exit={reduce ? { opacity: 0, transition: instant } : { rotate: 28, x: 62, y: 26, opacity: 0, transition: soft }}
        >
          <rect x={6} y={11} width={56} height={49} rx={4} className="fill-washi" />
          <text
            x={34}
            y={small ? 41 : 44}
            textAnchor="middle"
            fontSize={small ? 22 : 30}
            className="tabular fill-sumi-900 font-display font-extrabold"
          >
            {face.big}
          </text>
          <text x={34} y={55} textAnchor="middle" fontSize={7.5} letterSpacing={1.2} className="fill-sumi-600 font-bold uppercase">
            {face.unit}
          </text>
        </motion.g>
      </AnimatePresence>
      {/* The binding: a vermilion bar with two rings. */}
      <rect x={6} y={3} width={56} height={10} rx={3} className="fill-shu-500" />
      <circle cx={21} cy={8} r={2.4} className="fill-sumi-900 stroke-kin-300" strokeWidth={1.2} />
      <circle cx={47} cy={8} r={2.4} className="fill-sumi-900 stroke-kin-300" strokeWidth={1.2} />
    </svg>
  );
}
