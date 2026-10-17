import type { Transition } from 'motion/react';
import type { Countdown } from './eventRules';

/**
 * F16 · What the long countdown designs (Koyomi, Sunadokei, Tsuki: one chunk each, only the one chosen loads) share
 * with `EventCountdown`: their props and how they draw in its fixed 280×66 band.
 */
export interface LongProps {
  c: Countdown;
  startsAt: string;
  createdAt: string;
  now: Date;
}

export const BAND = 'h-full w-full overflow-visible';
export const instant: Transition = { duration: 0 };
