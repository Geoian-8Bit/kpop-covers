import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { useDesignVariant } from '@/features/lab/labState';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import {
  countdown,
  countdownDetail,
  countdownHeadline,
  countdownStage,
  eventDateLabel,
  ignitesFirstLantern,
  litLanterns,
  LONG_COUNTDOWN_MOMENT,
  longVariantOf,
  MOON_COUNT,
  moonLitPath,
  moonPhase,
  pageFace,
  sandRun,
  tornPages,
  type Countdown,
  type CountdownStage,
  type LongCountdownVariant,
} from './eventRules';

/**
 * F16 · The countdown to an event. Two stages (`countdownStage`):
 *  - seven or more days left: the long design chosen in the lab (`countdown-long`, point 39): Koyomi (a tear-off
 *    calendar), Sunadokei (an hourglass running since the event was created) or Tsuki (the moon filling up);
 *  - the last seven days: Chōchin, seven paper lanterns, one lit per day and all of them on the day.
 * The switch shows as the first lantern lighting up. Every design draws in the same 280×66 band above the words
 * (beside them from `sm`), so the banner keeps its height whatever the design (P8: nothing below moves). The
 * drawings are decoration: the words carry it all («Faltan 12 días», hours and minutes the last day, «Hoy»…).
 */

export interface EventCountdownProps {
  name: string;
  startsAt: string;
  /** When the event was created: Sunadokei's sand and Koyomi's torn pages start there. */
  createdAt: string;
  place: string | null;
  now: Date;
  /** Smaller words (the home banner on a phone). */
  compact?: boolean;
  /** The lab's demos show one long design whatever this device has chosen. */
  longVariant?: LongCountdownVariant;
  className?: string;
}

export function EventCountdown({ name, startsAt, createdAt, place, now, compact, longVariant, className }: EventCountdownProps) {
  const chosen = longVariantOf(useDesignVariant(LONG_COUNTDOWN_MOMENT));
  const variant = longVariant ?? chosen;
  const c = countdown(startsAt, now);
  const detail = countdownDetail(c);
  const headline = countdownHeadline(c);
  const stage = countdownStage(c);

  // Previous stage, kept the React way (state adjusted during render): whether Chōchin arrives lighting up.
  const [seen, setSeen] = useState<{ stage: CountdownStage | null; ignite: boolean }>({ stage: null, ignite: false });
  if (seen.stage !== stage) setSeen({ stage, ignite: ignitesFirstLantern(c, seen.stage) });

  return (
    // The band hangs across the top on a phone, beside the words from `sm`.
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5', className)}>
      <Band id={stage === 'long' ? `long-${variant}` : 'lanterns'}>
        {stage === 'long' ? (
          <LongVisual variant={variant} c={c} startsAt={startsAt} createdAt={createdAt} now={now} />
        ) : (
          <Chochin c={c} ignite={seen.ignite} />
        )}
      </Band>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-washi-muted">{name}</p>
        <p
          className={cn(
            'font-display font-extrabold leading-tight',
            compact ? 'text-[24px] sm:text-[28px]' : 'text-[28px] sm:text-[32px]',
            c.kind === 'today' ? 'text-shu-400' : 'text-washi',
          )}
        >
          {headline}
        </p>
        {detail && <p className="text-[14px] font-medium text-kin-300">{detail}</p>}
        <p className="mt-1 text-[13px] leading-snug text-washi-subtle">
          <span>{eventDateLabel(startsAt)}</span>
          {place && (
            <span className="ml-2 inline-flex max-w-full items-center gap-1 align-bottom">
              <MapPin aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{place}</span>
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * The fixed 280×66 frame every design draws in (its size never depends on the design). A change of design
 * cross-fades; nothing animates on the first paint, and with reduced motion the swap is instant.
 */
function Band({ id, children }: { id: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const fade = reduce ? instant : soft;
  return (
    <div aria-hidden className="relative aspect-[280/66] w-full max-w-[320px] shrink-0 sm:w-[240px]">
      <AnimatePresence initial={false}>
        <motion.div
          key={id}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: fade }}
          exit={{ opacity: 0, transition: fade }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

interface LongProps {
  c: Countdown;
  startsAt: string;
  createdAt: string;
  now: Date;
}

function LongVisual({ variant, ...props }: LongProps & { variant: LongCountdownVariant }) {
  if (variant === 'sunadokei') return <Sunadokei {...props} />;
  if (variant === 'tsuki') return <Tsuki {...props} />;
  return <Koyomi {...props} />;
}

const BAND = 'h-full w-full overflow-visible';
const instant: Transition = { duration: 0 };

// ───────────── Koyomi ─────────────

/** Fixed spots of the torn pages lying beside the pad (newest first). */
const TORN_SPOTS = [
  { x: 82, y: 30, r: -9 },
  { x: 126, y: 36, r: 7 },
  { x: 170, y: 29, r: -4 },
  { x: 214, y: 37, r: 11 },
] as const;

function Koyomi({ c, createdAt, now }: LongProps) {
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

// ───────────── Sunadokei ─────────────

function Sunadokei({ c, startsAt, createdAt, now }: LongProps) {
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

// ───────────── Tsuki ─────────────

const STARS = [
  [8, 9],
  [61, 6],
  [118, 11],
  [149, 4],
  [196, 9],
] as const;

function Tsuki({ c }: LongProps) {
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

// ───────────── Chōchin ─────────────

function Chochin({ c, ignite }: { c: Countdown; ignite: boolean }) {
  const reduce = useReducedMotion();
  const lit = litLanterns(c);
  const festive = c.kind === 'today';
  // Arriving from the long design (or on the first day of the last week): the newest lantern is dark for a
  // moment, then lights up. With reduced motion it is simply lit.
  const [dark, setDark] = useState(ignite && !reduce ? lit - 1 : -1);
  useEffect(() => {
    if (dark < 0) return;
    const id = window.setTimeout(() => setDark(-1), 420);
    return () => window.clearTimeout(id);
  }, [dark]);
  return (
    <svg viewBox="0 0 280 66" className="h-full w-full">
      <path d="M2 8 Q140 24 278 8" className="stroke-kiji-300" strokeWidth={1.4} fill="none" />
      {Array.from({ length: 7 }, (_, i) => {
        const x = 23 + i * 39;
        const y = 8 + 16 * (1 - Math.pow((x - 140) / 138, 2)) * 0.5;
        const on = i < lit && i !== dark;
        const flicker = c.kind === 'hours' && i === 6;
        const glow = on || flicker;
        return (
          <motion.g
            key={i}
            style={{ transformBox: 'fill-box', transformOrigin: '50% 0%' }}
            animate={festive && !reduce ? { rotate: [-5, 5, -5] } : { rotate: 0 }}
            transition={festive && !reduce ? { duration: 2.4 + i * 0.13, repeat: Infinity, ease: 'easeInOut' } : soft}
          >
            <line x1={x} y1={y} x2={x} y2={y + 5} className="stroke-kiji-300" strokeWidth={1.2} />
            <rect x={x - 7} y={y + 4} width={14} height={4} rx={1.2} className="fill-sumi-950" />
            <motion.ellipse
              cx={x}
              cy={y + 25}
              rx={14}
              ry={18}
              initial={false}
              animate={{ opacity: flicker && !reduce ? [0.55, 1, 0.7, 1] : 1 }}
              transition={flicker && !reduce ? { duration: 1.6, repeat: Infinity } : jelly}
              className={cn(
                'transition-[fill] duration-500 motion-reduce:transition-none',
                glow ? 'fill-shu-500 drop-shadow-[0_0_7px_rgb(226_103_77/0.85)]' : 'fill-sumi-700',
              )}
            />
            {[-11, -4, 4, 11].map((dy) => (
              <path
                key={dy}
                d={`M${x - 13.2} ${y + 25 + dy} Q${x} ${y + 28 + dy} ${x + 13.2} ${y + 25 + dy}`}
                className={glow ? 'stroke-kin-200' : 'stroke-sumi-600'}
                strokeOpacity={0.45}
                strokeWidth={0.8}
                fill="none"
              />
            ))}
            <text
              x={x}
              y={y + 30}
              textAnchor="middle"
              className={cn(
                'font-display font-extrabold transition-[fill] duration-500 motion-reduce:transition-none',
                glow ? 'fill-washi' : 'fill-sumi-600',
              )}
              fontSize={14}
            >
              祭
            </text>
            <rect x={x - 7} y={y + 42} width={14} height={4} rx={1.2} className="fill-sumi-950" />
          </motion.g>
        );
      })}
    </svg>
  );
}
