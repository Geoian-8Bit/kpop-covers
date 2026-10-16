import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId } from 'react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import {
  countdown,
  countdownDetail,
  countdownHeadline,
  eventDateLabel,
  litLanterns,
  pageFace,
  sandRun,
  type Countdown,
} from './eventRules';

/**
 * F16 · The countdown to an event, in one of three designs from the lab (`event-countdown`):
 *  - koyomi (recommended): a tear-off day calendar (himekuri); each day a page is torn off and falls.
 *  - chochin: seven paper lanterns; one lights up for each day of the last week, all of them on the day.
 *  - sunadokei: a washi-and-wood hourglass whose sand runs from the event's creation until it starts.
 * The words are the same in all three: «Faltan 12 días», hours and minutes the last day, «Hoy».
 */

export type CountdownVariant = 'koyomi' | 'chochin' | 'sunadokei';

export interface EventCountdownProps {
  variant: string;
  name: string;
  startsAt: string;
  createdAt: string;
  place: string | null;
  now: Date;
  /** Smaller words (the home banner on a phone). */
  compact?: boolean;
  className?: string;
}

export function EventCountdown({ variant, name, startsAt, createdAt, place, now, compact, className }: EventCountdownProps) {
  const c = countdown(startsAt, now);
  const detail = countdownDetail(c);
  const Visual = variant === 'chochin' ? Chochin : variant === 'sunadokei' ? Sunadokei : Koyomi;
  const headline = countdownHeadline(c);
  return (
    <div
      className={cn(
        'flex gap-4 sm:gap-5',
        // The lanterns hang in a row across the top; the other two sit beside the words.
        variant === 'chochin' ? 'flex-col gap-2 sm:flex-row sm:items-center' : 'items-center',
        className,
      )}
    >
      <Visual c={c} startsAt={startsAt} createdAt={createdAt} now={now} />
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

interface VisualProps {
  c: Countdown;
  startsAt: string;
  createdAt: string;
  now: Date;
}

// ───────────── Koyomi ─────────────

function Koyomi({ c }: VisualProps) {
  const face = pageFace(c);
  const key = `${face.big}-${face.unit}`;
  return (
    <div aria-hidden className="relative h-[96px] w-[80px] shrink-0">
      {/* The stack of pages still to go, peeking under the top one. */}
      <span className="absolute inset-x-1 bottom-0 top-4 rounded-b-[6px] bg-kin-200 shadow-[0_6px_14px_-6px_rgb(0_0_0/0.8)]" />
      <span className="absolute inset-x-0.5 bottom-[3px] top-4 rounded-b-[6px] bg-washi-muted" />
      <div className="absolute inset-x-0 bottom-[6px] top-4">
        <AnimatePresence initial={false}>
          <motion.div
            key={key}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1, rotate: 0, x: 0, y: 0, zIndex: 0 }}
            exit={{ rotate: -38, x: -26, y: 70, opacity: 0, zIndex: 2, transition: { duration: 0.7, ease: [0.4, 0, 0.7, 1] } }}
            style={{ transformOrigin: '8% 0%' }}
            className="absolute inset-0 flex flex-col items-center justify-center rounded-b-[6px] bg-washi text-sumi-900 shadow-[inset_0_-10px_14px_-12px_rgb(0_0_0/0.35)]"
          >
            <span
              className={cn(
                'font-display font-extrabold leading-none',
                face.kanji ? 'text-[26px] text-shu-500' : face.big.length > 2 ? 'text-[30px]' : 'text-[38px]',
              )}
            >
              {face.big}
            </span>
            <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-sumi-600">{face.unit}</span>
          </motion.div>
        </AnimatePresence>
      </div>
      {/* The binding: a vermilion bar with two rings. */}
      <span className="absolute inset-x-0 top-0 z-10 flex h-5 items-center justify-around rounded-t-[6px] bg-shu-500 px-3 shadow-[inset_0_-2px_0_rgb(0_0_0/0.2)]">
        <span className="size-2 rounded-full bg-sumi-900 ring-2 ring-kin-300/70" />
        <span className="size-2 rounded-full bg-sumi-900 ring-2 ring-kin-300/70" />
      </span>
    </div>
  );
}

// ───────────── Chōchin ─────────────

function Chochin({ c }: VisualProps) {
  const reduce = useReducedMotion();
  const lit = litLanterns(c);
  const festive = c.kind === 'today';
  return (
    <svg viewBox="0 0 280 66" aria-hidden className="h-auto w-full max-w-[320px] shrink-0 sm:w-[240px]">
      <path d="M2 8 Q140 24 278 8" className="stroke-kiji-300" strokeWidth={1.4} fill="none" />
      {Array.from({ length: 7 }, (_, i) => {
        const x = 23 + i * 39;
        const y = 8 + 16 * (1 - Math.pow((x - 140) / 138, 2)) * 0.5;
        const on = i < lit;
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
                'transition-[fill] duration-500',
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
              className={cn('font-display font-extrabold transition-[fill] duration-500', glow ? 'fill-washi' : 'fill-sumi-600')}
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

// ───────────── Sunadokei ─────────────

function Sunadokei({ c, startsAt, createdAt, now }: VisualProps) {
  const reduce = useReducedMotion();
  const p = c.kind === 'days' || c.kind === 'hours' ? Math.min(0.97, sandRun(startsAt, createdAt, now)) : 1;
  const running = p < 1 && !reduce;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  // Top bulb holds sand from y=12+p*34 down to the neck (46); the pile below rises from 86 by p*34.
  return (
    <svg viewBox="0 0 64 98" aria-hidden className="h-[96px] w-[62px] shrink-0">
      <defs>
        <clipPath id={`sand-top-${uid}`}>
          <motion.rect x={0} width={64} height={60} initial={false} animate={{ y: 12 + p * 34 }} transition={soft} />
        </clipPath>
        <clipPath id={`sand-bottom-${uid}`}>
          <motion.rect x={0} width={64} height={60} initial={false} animate={{ y: 86 - p * 34 }} transition={soft} />
        </clipPath>
      </defs>
      {/* Wooden ends and posts. */}
      <rect x={4} y={2} width={56} height={7} rx={2} className="fill-kiji-400" />
      <rect x={4} y={89} width={56} height={7} rx={2} className="fill-kiji-400" />
      <rect x={6} y={9} width={3} height={80} className="fill-kiji-700" />
      <rect x={55} y={9} width={3} height={80} className="fill-kiji-700" />
      {/* Washi glass. */}
      <path d="M12 11 H52 Q52 34 34 48 Q52 62 52 87 H12 Q12 62 30 48 Q12 34 12 11 Z" className="fill-washi/10 stroke-washi/40" strokeWidth={1} />
      <path
        d="M13 12 H51 Q51 34 33.5 47.6 L32 48 L30.5 47.6 Q13 34 13 12 Z"
        className="fill-kin-300"
        clipPath={`url(#sand-top-${uid})`}
      />
      <path d="M13 86 H51 Q51 62 33 50 L32 49.6 L31 50 Q13 62 13 86 Z" className="fill-kin-400" clipPath={`url(#sand-bottom-${uid})`} />
      {running && (
        <motion.line
          x1={32}
          y1={48}
          x2={32}
          y2={86 - p * 34}
          className="stroke-kin-300"
          strokeWidth={1.2}
          strokeDasharray="2 3"
          animate={{ strokeDashoffset: [0, -10] }}
          transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
        />
      )}
    </svg>
  );
}
