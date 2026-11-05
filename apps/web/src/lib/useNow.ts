import { useEffect, useMemo, useState } from 'react';

// REQ-28 · One «now» hook for the whole app (events and calendar used a `Date` one, the votes a number one).

/**
 * The current time (ms), refreshed every `everyMs`; with `refreshOnVisible` also when the app comes back to the
 * front (what the events and the calendar always did; the votes only tick).
 */
export function useNow(
  everyMs = 30_000,
  { refreshOnVisible = false }: { refreshOnVisible?: boolean } = {},
): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, everyMs);
    if (!refreshOnVisible) return () => window.clearInterval(id);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [everyMs, refreshOnVisible]);
  return now;
}

/** `useNow` as a `Date`, refreshed on the timer and when the app comes back to the front. */
export function useNowDate(everyMs = 30_000): Date {
  const now = useNow(everyMs, { refreshOnVisible: true });
  return useMemo(() => new Date(now), [now]);
}
