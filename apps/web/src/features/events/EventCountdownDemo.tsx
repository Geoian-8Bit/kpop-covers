import { CalendarMinus, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EventCountdown } from './EventCountdown';
import { countdown, countdownStage, LANTERN_DAYS, type LongCountdownVariant } from './eventRules';

/**
 * F16 · Point 39 · Lab demos of the long countdown: the home banner with a sample event, one long design each, then
 * Chōchin for the last week. A slider moves «faltan N días» from 30 to 0 (left to right, as time goes by);
 * «Pasar un día» lets a day go by (a page torn off, sand running, the moon filling) and «Ver el cambio» shows the
 * switch to the lanterns. Nothing is saved. (This file's chunk, `EventCountdownDemo-<hash>.js`, stays out of the
 * precache.)
 */

const MAX_DAYS = 30;
/** The sample event: Saturday 12 December at 21:00, created 40 days before. */
const START = new Date(2026, 11, 12, 21, 0);
const CREATED = new Date(2026, 10, 2, 12, 0);
const LABELS: Record<LongCountdownVariant, string> = { koyomi: 'Koyomi', sunadokei: 'Sunadokei', tsuki: 'Tsuki' };

/** `days` calendar days before the event at noon; the day itself at 16:00 (five hours to go). */
function nowFor(days: number): Date {
  if (days === 0) return new Date(2026, 11, 12, 16, 0);
  return new Date(2026, 11, 12 - days, 12, 0);
}

function CountdownStage({ variant }: { variant: LongCountdownVariant }) {
  const [days, setDays] = useState(20);
  // «Ver el cambio»: set to the last long day, then one day later the first lantern lights up.
  const [showing, setShowing] = useState(false);
  useEffect(() => {
    if (!showing) return;
    const id = window.setTimeout(() => {
      setDays(LANTERN_DAYS - 1);
      setShowing(false);
    }, 900);
    return () => window.clearTimeout(id);
  }, [showing]);

  const now = nowFor(days);
  const long = countdownStage(countdown(START, now)) === 'long';
  const status = long
    ? `Faltan ${days} días: ${LABELS[variant]}, el diseño para más de una semana.`
    : days === 0
      ? 'El día del evento: Chōchin, todos los farolillos.'
      : `Última semana: Chōchin, ${LANTERN_DAYS - days} ${LANTERN_DAYS - days === 1 ? 'farolillo encendido' : 'farolillos encendidos'}.`;

  return (
    <div className="flex w-full flex-col gap-4 p-3 sm:p-4">
      {/* The home banner as it looks on the phone. */}
      <div className="rounded-[12px] border border-line bg-sumi-900/60 px-3 py-3 sm:px-5">
        <EventCountdown
          longVariant={variant}
          name="Showcase de diciembre"
          startsAt={START.toISOString()}
          createdAt={CREATED.toISOString()}
          place="Sala Pop"
          now={now}
          compact
        />
      </div>
      <p aria-live="polite" className="min-h-[2.75em] text-[13px] leading-snug text-washi-muted">
        {status}
      </p>
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor={`countdown-days-${variant}`} className="text-[13px] font-bold text-washi-muted">
            Cuánto falta
          </label>
          <span className="tabular font-mono text-[13px] font-bold">
            {days === 0 ? 'Hoy' : days === 1 ? 'Falta 1 día' : `Faltan ${days} días`}
          </span>
        </div>
        {/* Left is 30 days, right is the day itself: the slider moves as time goes by. */}
        <input
          id={`countdown-days-${variant}`}
          type="range"
          min={0}
          max={MAX_DAYS}
          step={1}
          value={MAX_DAYS - days}
          onChange={(e) => {
            setShowing(false);
            setDays(MAX_DAYS - Number(e.target.value));
          }}
          aria-valuetext={days === 0 ? 'Hoy' : days === 1 ? 'Falta 1 día' : `Faltan ${days} días`}
          className="mt-1 h-11 w-full cursor-pointer accent-kin-300"
        />
        <div className="flex justify-between text-[11px] text-washi-subtle">
          <span>30 días</span>
          <span>Una semana</span>
          <span>Hoy</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setShowing(false);
            setDays((d) => Math.max(0, d - 1));
          }}
          disabled={days === 0}
        >
          <CalendarMinus aria-hidden className="size-4" /> Pasar un día
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setDays(LANTERN_DAYS);
            setShowing(true);
          }}
          disabled={showing}
        >
          <Sparkles aria-hidden className="size-4" /> Ver el cambio
        </Button>
      </div>
    </div>
  );
}

export function KoyomiDemo() {
  return <CountdownStage variant="koyomi" />;
}

export function SunadokeiDemo() {
  return <CountdownStage variant="sunadokei" />;
}

export function TsukiDemo() {
  return <CountdownStage variant="tsuki" />;
}
