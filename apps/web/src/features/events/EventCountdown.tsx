import { motion, useReducedMotion } from 'motion/react';
import { MapPin } from 'lucide-react';
import { cn } from '@/lib/cn';
import { jelly, soft } from '@/lib/motion';
import { countdown, countdownDetail, countdownHeadline, eventDateLabel, litLanterns, type Countdown } from './eventRules';

/**
 * F16 · The countdown to an event («Chōchin»): seven paper lanterns with 祭; one lights up for each day of the last
 * week, all of them glow and sway on the day. The lanterns are decoration: the words carry it all («Faltan 12 días»,
 * hours and minutes the last day, «Hoy», «Ayer», «Ya pasó»), so an event further than a week away reads the same.
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
  const detail = countdownDetail(c);
  const headline = countdownHeadline(c);
  return (
    // The lanterns hang in a row across the top on a phone, beside the words from `sm`.
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-5', className)}>
      <Lanterns c={c} />
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

function Lanterns({ c }: { c: Countdown }) {
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
