import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { useEffect } from 'react';
import { jelly, snappy, soft } from '@/lib/motion';

/**
 * F7 · The three figures of the arming screen (design lab moment `clap-arm`). All three read the same thing: the
 * live level (0–1 on a decibel scale), the level a clap must reach, how many claps were heard (2 = fired) and a key
 * that changes on every sound that crossed the threshold.
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

// ───────────── 太鼓 Taiko (recommended) ─────────────

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

// ───────────── 拍子木 Hyōshigi ─────────────

function Grain({ x }: { x: number }) {
  return (
    <g strokeWidth={1.2} fill="none" className="stroke-kiji-700/50">
      <path d={`M${x + 8} -64 C ${x + 10} -20, ${x + 6} 20, ${x + 9} 64`} />
      <path d={`M${x + 17} -64 C ${x + 15} -30, ${x + 19} 10, ${x + 16} 64`} />
      <path d={`M${x + 24} -50 C ${x + 23} -10, ${x + 25} 30, ${x + 23} 56`} />
    </g>
  );
}

/**
 * «Hyōshigi»: the two wooden clappers of the kabuki stage, hanging from their cord. They lean together with the
 * room's sound and strike on every clap (with a burst of lines); the second strike lights them.
 */
export function ClapHyoshigi({ level, count, hitKey, reduce }: ClapFigureProps) {
  const lean = useTransform(level, (v) => (reduce ? 0 : v * 4.5));
  const leanBack = useTransform(lean, (v) => -v);
  const fired = count === 2;
  const strike = hitKey > 0 && !reduce;
  const wood = fired ? 'fill-kin-200' : 'fill-kiji-400';
  return (
    <svg viewBox="-100 -100 200 200" className="size-full overflow-visible" aria-hidden>
      <defs>
        <radialGradient id="clap-hyoshigi-glow">
          <stop offset="0%" stopColor={color('kin-200')} stopOpacity={0.75} />
          <stop offset="45%" stopColor={color('shu-400')} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color('shu-500')} stopOpacity={0} />
        </radialGradient>
      </defs>
      <motion.circle
        r={98}
        initial={false}
        animate={{ opacity: fired ? 1 : count === 1 ? 0.3 : 0, scale: fired ? 1 : 0.8 }}
        transition={soft}
        fill="url(#clap-hyoshigi-glow)"
      />
      <g transform="scale(1.15)">
        {/* Cord */}
        <path
          d="M-20 -66 C -26 -98, 26 -98, 20 -66"
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
          className="stroke-murasaki"
        />
        <motion.g style={{ x: lean }}>
          <motion.g
            key={`l${hitKey}`}
            initial={strike ? { x: 0 } : false}
            animate={strike ? { x: [0, 6, 0] } : { x: 0 }}
            transition={{ duration: 0.22, times: [0, 0.35, 1], ease: 'easeOut' }}
          >
            <rect
              x={-36}
              y={-70}
              width={30}
              height={140}
              rx={4}
              className={`${wood} transition-colors duration-300`}
            />
            <Grain x={-36} />
            <rect
              x={-36}
              y={-70}
              width={30}
              height={140}
              rx={4}
              fill="none"
              strokeWidth={1.5}
              className="stroke-kiji-900"
            />
          </motion.g>
        </motion.g>
        <motion.g style={{ x: leanBack }}>
          <motion.g
            key={`r${hitKey}`}
            initial={strike ? { x: 0 } : false}
            animate={strike ? { x: [0, -6, 0] } : { x: 0 }}
            transition={{ duration: 0.22, times: [0, 0.35, 1], ease: 'easeOut' }}
          >
            <rect
              x={6}
              y={-70}
              width={30}
              height={140}
              rx={4}
              className={`${wood} transition-colors duration-300`}
            />
            <Grain x={6} />
            <rect
              x={6}
              y={-70}
              width={30}
              height={140}
              rx={4}
              fill="none"
              strokeWidth={1.5}
              className="stroke-kiji-900"
            />
          </motion.g>
        </motion.g>
        {/* The crack of the strike: short strokes flying off the meeting edge. */}
        {strike && (
          <motion.g
            key={`s${hitKey}`}
            initial={{ opacity: 1, scale: 0.6 }}
            animate={{ opacity: 0, scale: 1.25 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            strokeWidth={3}
            strokeLinecap="round"
            className={fired ? 'stroke-shu-400' : 'stroke-kin-300'}
          >
            <circle r={100} fill="none" stroke="none" />
            {[-150, -120, -60, -30, 30, 60, 120, 150].map((deg) => {
              const a = (deg * Math.PI) / 180;
              const y = deg < 0 ? -74 : 74;
              return (
                <line
                  key={deg}
                  x1={Math.cos(a) * 10}
                  y1={y + Math.sin(a) * 10}
                  x2={Math.cos(a) * 24}
                  y2={y + Math.sin(a) * 24}
                />
              );
            })}
          </motion.g>
        )}
      </g>
    </svg>
  );
}

// ───────────── 円相 Ensō ─────────────

/** A brush circle that starts at the top left and overlaps itself a little at the end. */
function ensoPath(r: number): string {
  const start = -110;
  const pts: string[] = [];
  for (let d = 0; d <= 372; d += 6) {
    const a = ((start + d) * Math.PI) / 180;
    // A slightly uneven hand: the radius breathes a little along the stroke.
    const rr = r + Math.sin(d / 37) * 1.6;
    pts.push(`${d ? 'L' : 'M'}${(Math.cos(a) * rr).toFixed(2)} ${(Math.sin(a) * rr).toFixed(2)}`);
  }
  return pts.join(' ');
}
const ENSO = ensoPath(62);
const ENSO_DRY = ensoPath(56);
const DRAW_SHARE = 0.8;

/**
 * «Ensō»: a circle of ink on washi paper, drawn as far as the room's sound reaches. The first clap leaves half of it
 * on the paper; the second closes it and the seal is stamped. The vermilion mark is where a clap must reach.
 */
export function ClapEnso({ level, threshold, count, hitKey, reduce }: ClapFigureProps) {
  const held = useMotionValue(0);
  useEffect(() => {
    const target = count === 2 ? 1 : count === 1 ? 0.5 : 0;
    const controls = animate(
      held,
      target,
      reduce ? { duration: 0 } : count === 2 ? { duration: 0.45, ease: 'easeOut' } : snappy,
    );
    return () => controls.stop();
  }, [count, held, reduce]);
  const drawn = useTransform(() => Math.max(held.get(), level.get() * DRAW_SHARE));
  const dry = useTransform(drawn, (v) => Math.max(0, v - 0.04));
  const fired = count === 2;

  return (
    <svg viewBox="-100 -100 200 200" className="size-full overflow-visible" aria-hidden>
      <rect x={-92} y={-92} width={184} height={184} rx={10} className="fill-washi" />
      <rect
        x={-84}
        y={-84}
        width={168}
        height={168}
        rx={6}
        fill="none"
        strokeWidth={1}
        className="stroke-kin-400/60"
      />
      <circle r={62} fill="none" strokeWidth={14} className="stroke-sumi-900/[0.06]" />
      <motion.path
        d={ENSO}
        fill="none"
        strokeWidth={13}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ pathLength: drawn }}
        className="stroke-sumi-900"
      />
      <motion.path
        d={ENSO_DRY}
        fill="none"
        strokeWidth={3.5}
        strokeLinecap="round"
        style={{ pathLength: dry, opacity: 0.55 }}
        className="stroke-sumi-700"
      />
      {/* Where a clap must reach, on the circle (the stroke starts at -110°). */}
      <g transform="rotate(-20)" opacity={fired ? 0 : 1} className="transition-opacity duration-300">
        <RingTick
          value={threshold}
          turn={DRAW_SHARE * (372 / 360)}
          inner={52}
          outer={72}
          className="stroke-shu-500"
        />
      </g>
      {/* A drop of ink flies off on every clap. */}
      {hitKey > 0 && !reduce && (
        <motion.g
          key={hitKey}
          initial={{ opacity: 0.9, scale: 0.4 }}
          animate={{ opacity: 0, scale: 1.15 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          className="fill-sumi-900"
        >
          <circle r={100} fill="none" />
          <circle cx={-58 + (hitKey % 3) * 9} cy={-60} r={4} />
          <circle cx={-46 + (hitKey % 2) * 6} cy={-74} r={2.2} />
          <circle cx={-70} cy={-48 + (hitKey % 3) * 4} r={1.6} />
        </motion.g>
      )}
      {/* The seal, stamped when the circle closes. */}
      <motion.g
        initial={false}
        animate={
          fired ? { opacity: 1, scale: 1, rotate: -4 } : { opacity: 0, scale: reduce ? 1 : 1.6, rotate: 0 }
        }
        transition={reduce ? { duration: 0 } : jelly}
        style={{ x: 58, y: 60 }}
      >
        <rect x={-15} y={-15} width={30} height={30} rx={3} className="fill-shu-500" />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-washi font-display text-[19px] font-extrabold"
        >
          拍
        </text>
      </motion.g>
    </svg>
  );
}

export function ClapFigure({ variant, ...props }: ClapFigureProps & { variant: string }) {
  if (variant === 'hyoshigi') return <ClapHyoshigi {...props} />;
  if (variant === 'enso') return <ClapEnso {...props} />;
  return <ClapTaiko {...props} />;
}
