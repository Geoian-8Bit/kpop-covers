import type { Transition } from 'motion/react';
import type { Countdown } from './eventRules';

/**
 * F16 · What the long countdown design (Tsuki) shares with `EventCountdown`: its props and how it draws in the
 * fixed 280×66 band.
 */
export interface LongProps {
  c: Countdown;
}

export const BAND = 'h-full w-full overflow-visible';
export const instant: Transition = { duration: 0 };
