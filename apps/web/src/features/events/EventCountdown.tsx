import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { useRehearsalExceptions, useRehearsalRules } from '@/data/calendar';
import { madridClock, madridToday } from '@/features/calendar/calendarRules';
import { rehearsalsLeft } from '@/features/calendar/rehearsalRules';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import { instant } from './countdownBand';
import { Tsuki } from './CountdownTsuki';
import {
  countdown,
  countdownDetail,
  countdownHeadline,
  countdownStage,
  eventDateLabel,
  ignitesFirstLantern,
  litLanterns,
  rehearsalDetail,
  rehearsalHeadline,
  type Countdown,
  type CountdownStage,
} from './eventRules';

/**
 * F16 · The countdown to an event. Two stages (`countdownStage`):
 *  - seven or more days left: Tsuki, the phases of the moon filling up until it is full a week before (point 39,
 *    chosen in the design lab in point 40);
 *  - the last seven days: Chōchin, seven paper lanterns, one lit per day and all of them on the day.
 * The switch shows as the first lantern lighting up. Both designs draw in the same 280×66 band above the words
 * (beside them from `sm`), so the banner keeps its height whatever the design (P8: nothing below moves). The
 * drawings are decoration: the words carry it all («Faltan 12 días», hours and minutes the last day, «Hoy»…).
 */

export interface EventCountdownProps {
  name: string;
  startsAt: string;
  place: string | null;
  now: Date;
  /** Smaller words (the home banner on a phone). */
  compact?: boolean;
  className?: string;
}

export function EventCountdown({ name, startsAt, place, now, compact, className }: EventCountdownProps) {
  const c = countdown(startsAt, now);
  // Rehearsals left before the event (no timetable → null → the usual calendar days).
  const rules = useRehearsalRules();
  const today = madridToday(now);
  const eventDay = Number.isNaN(Date.parse(startsAt)) ? today : madridClock(startsAt).day;
  const exceptions = useRehearsalExceptions(today, eventDay);
  const left = rules.data && exceptions.data ? rehearsalsLeft(now, startsAt, rules.data, exceptions.data) : null;
  const detail = (left && rehearsalDetail(c, left)) ?? countdownDetail(c);
  const headline = (left && rehearsalHeadline(c, left)) ?? countdownHeadline(c);
  const stage = countdownStage(c);

  // Previous stage, kept the React way (state adjusted during render): whether Chōchin arrives lighting up.
  const [seen, setSeen] = useState<{ stage: CountdownStage | null; ignite: boolean }>({ stage: null, ignite: false });
  if (seen.stage !== stage) setSeen({ stage, ignite: ignitesFirstLantern(c, seen.stage) });

  return (
    // The band hangs across the top on a phone, beside the words from `sm`.
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5', className)}>
      <Band id={stage}>
        {stage === 'long' ? (
          <Tsuki c={c} />
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
 * The fixed 280×66 frame both designs draw in (its size never depends on the design). The switch to the lanterns
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
