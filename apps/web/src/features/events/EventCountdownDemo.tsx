import { CalendarMinus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Segmented } from '@/components/ui/Segmented';
import { EventCountdown } from './EventCountdown';

type Scenario = 'month' | 'twelve' | 'week' | 'hours' | 'today';

/** A sample event: Saturday 12 December at 21:00, created 40 days before. */
const START = new Date(2026, 11, 12, 21, 0);
const CREATED = new Date(2026, 10, 2, 12, 0);

const DAYS: Record<Exclude<Scenario, 'hours' | 'today'>, number> = { month: 30, twelve: 12, week: 7 };

function nowFor(days: number | 'hours'): Date {
  if (days === 'hours') return new Date(2026, 11, 11, 22, 25);
  if (days === 0) return new Date(2026, 11, 12, 16, 0);
  return new Date(2026, 11, 12 - days, 12, 0);
}

/**
 * Lab stage for F16: the home's countdown with a sample event, in the chosen design. Pick how far away it is, or
 * «Pasar un día» to see a day go by (a page torn off, a lantern lit, sand running). Nothing is saved.
 */
export function EventCountdownDemo({ variant }: { variant: string }) {
  const [days, setDays] = useState<number | 'hours'>(12);
  const scenario: Scenario | null =
    days === 'hours' ? 'hours' : days === 0 ? 'today' : days === 30 ? 'month' : days === 12 ? 'twelve' : days === 7 ? 'week' : null;

  function pick(s: Scenario) {
    setDays(s === 'hours' ? 'hours' : s === 'today' ? 0 : DAYS[s]);
  }

  function nextDay() {
    setDays((d) => (d === 'hours' ? 0 : d === 1 ? 'hours' : Math.max(0, d - 1)));
  }

  return (
    <div className="flex w-full flex-col gap-4 p-3 sm:p-4">
      <Segmented
        size="sm"
        label="Cuánto falta"
        layoutId="countdown-demo"
        value={scenario}
        onChange={pick}
        options={[
          { value: 'month', label: '30 d', ariaLabel: 'Faltan 30 días' },
          { value: 'twelve', label: '12 d', ariaLabel: 'Faltan 12 días' },
          { value: 'week', label: '7 d', ariaLabel: 'Falta una semana' },
          { value: 'hours', label: 'Último día' },
          { value: 'today', label: 'Hoy' },
        ]}
      />
      <div className="rounded-[12px] border border-line bg-sumi-900/60 px-3 py-3 sm:px-5">
        <EventCountdown
          variant={variant}
          name="Showcase de diciembre"
          startsAt={START.toISOString()}
          createdAt={CREATED.toISOString()}
          place="Sala Pop"
          now={nowFor(days)}
          compact
        />
      </div>
      <div className="flex justify-center">
        <Button variant="secondary" onClick={nextDay} disabled={days === 0}>
          <CalendarMinus aria-hidden className="size-4" /> Pasar un día
        </Button>
      </div>
    </div>
  );
}
