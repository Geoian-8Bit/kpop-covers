import { motion, useReducedMotion } from 'motion/react';
import { useId } from 'react';
import { soft } from '@/lib/motion';
import { BAND, instant, type LongProps } from './countdownBand';
import { sandRun } from './eventRules';

// F16 · Sunadokei, the hourglass (a long countdown design; its own chunk, loaded when chosen).

export function Sunadokei({ c, startsAt, createdAt, now }: LongProps) {
  const reduce = useReducedMotion();
  const p = c.kind === 'days' || c.kind === 'hours' ? Math.min(0.97, sandRun(startsAt, createdAt, now)) : 1;
  const running = p < 1;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const days = c.kind === 'days' ? c.days : 0;
  const move = reduce ? instant : soft;
  return (
    <svg viewBox="0 0 280 66" className={BAND}>
      <defs>
        <clipPath id={`sand-top-${uid}`}>
          <motion.rect x={0} width={64} height={60} initial={false} animate={{ y: 12 + p * 34 }} transition={move} />
        </clipPath>
        <clipPath id={`sand-bottom-${uid}`}>
          <motion.rect x={0} width={64} height={60} initial={false} animate={{ y: 86 - p * 34 }} transition={move} />
        </clipPath>
      </defs>
      {/* The dunes: the sand that has run piles up along the way to the festival. */}
      <motion.path
        d="M58 66 V60 C96 50 128 58 160 53 S226 42 280 52 V66 Z"
        className="fill-kin-400"
        fillOpacity={0.28}
        style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
        initial={false}
        animate={{ scaleY: 0.35 + p * 0.65 }}
        transition={move}
      />
      <motion.path
        d="M92 66 V62 C128 56 170 62 204 57 S252 52 280 58 V66 Z"
        className="fill-kin-300"
        fillOpacity={0.32}
        style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
        initial={false}
        animate={{ scaleY: 0.3 + p * 0.7 }}
        transition={move}
      />
      {/* Days left, big. */}
      <text x={150} y={40} textAnchor="end" fontSize={32} className="tabular fill-kin-300 font-display font-extrabold">
        {days}
      </text>
      <text x={156} y={40} fontSize={12} className="fill-washi-muted font-bold">
        {days === 1 ? 'día' : 'días'}
      </text>
      {/* The festival banner (nobori) waiting at the end of the dunes. */}
      <line x1={262} y1={14} x2={262} y2={52} className="stroke-kiji-300" strokeWidth={1.4} />
      <rect x={263} y={15} width={13} height={27} rx={1} className="fill-shu-500" />
      <text x={269.5} y={32} textAnchor="middle" fontSize={10} className="fill-washi font-display font-extrabold">
        祭
      </text>
      {/* The hourglass: wooden ends and posts, washi glass (the 64×98 drawing at two thirds). */}
      <g transform="translate(8 0) scale(0.673)">
        <rect x={4} y={2} width={56} height={7} rx={2} className="fill-kiji-400" />
        <rect x={4} y={89} width={56} height={7} rx={2} className="fill-kiji-400" />
        <rect x={6} y={9} width={3} height={80} className="fill-kiji-700" />
        <rect x={55} y={9} width={3} height={80} className="fill-kiji-700" />
        <path
          d="M12 11 H52 Q52 34 34 48 Q52 62 52 87 H12 Q12 62 30 48 Q12 34 12 11 Z"
          className="fill-washi/10 stroke-washi/40"
          strokeWidth={1}
        />
        <path
          d="M13 12 H51 Q51 34 33.5 47.6 L32 48 L30.5 47.6 Q13 34 13 12 Z"
          className="fill-kin-300"
          clipPath={`url(#sand-top-${uid})`}
        />
        <path
          d="M13 86 H51 Q51 62 33 50 L32 49.6 L31 50 Q13 62 13 86 Z"
          className="fill-kin-400"
          clipPath={`url(#sand-bottom-${uid})`}
        />
        {/* The thread of falling sand: still (it sits on the home page for weeks; no endless repaint). */}
        {running && (
          <line
            x1={32}
            y1={48}
            x2={32}
            y2={86 - p * 34}
            className="stroke-kin-300"
            strokeWidth={1.2}
            strokeDasharray="2 3"
          />
        )}
      </g>
    </svg>
  );
}
