import type { RecordFormat } from '../recorder';

/**
 * idle → (countdown) → arming (waiting for the song to really start) → recording ⇄ paused → finishing → review.
 * Pausing stops song and camera together; going on continues both from there, so a take can be shot in parts.
 */
export type Phase = 'idle' | 'countdown' | 'arming' | 'recording' | 'paused' | 'finishing' | 'review';
export type From = 'start' | 'here' | 'range';
export type Span = { start: number; end: number };
export type Take = { url: string; file: File };
export type SoundSource = 'pending' | 'song' | 'mic' | 'none';
export type Confirm = 'close' | 'again' | 'discard' | 'leftover' | 'rearm';

export const TIMERS = [0, 3, 5, 10] as const;
export type TimerSeconds = (typeof TIMERS)[number];
export const TIMER_KEY = 'coverscape.recordTimer';
/** Seconds the song may take to start (a YouTube video still loading) before we give up on that try. */
export const ARM_TIMEOUT_MS = 8000;

export function readTimer(): TimerSeconds {
  try {
    const raw = localStorage.getItem(TIMER_KEY);
    const n = raw == null ? Number.NaN : Number(raw);
    return (TIMERS as readonly number[]).includes(n) ? (n as TimerSeconds) : 3;
  } catch {
    return 3;
  }
}

export type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };
export type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

export const HEX = '24,2 43,13 43,35 24,46 5,35 5,13';

/**
 * REQ-27 · The recorder's functions that one hook calls in another (the take machine pausing calls the sink, closing
 * calls the clap…). Each hook registers its own here on every render, so a call made later (an event, an effect)
 * always reaches the latest render's version, as the single 2950-line component did with its hoisted functions.
 */
export interface StudioFx {
  clearTimers: () => void;
  disarmClap: () => void;
  armClap: () => void;
  dropUnusedSink: () => void;
  prepareSink: () => void;
  releasePicture: () => void;
  replaceTake: (next: Take | null, diskId?: string | null, reviewVideoId?: string | null) => void;
  stopBench: () => void;
  pausePart: () => void;
  finish: () => Promise<void>;
  plannedFormat: () => RecordFormat;
  captureFps: () => 30 | 60;
  directPossible: () => boolean;
  lockForDirect: () => void;
  unlockOrientation: () => void;
  shutter: () => void;
  roll: () => void;
  paceCounts: () => import('../paceSkip').PaceCounts;
  again: () => void;
  dropLeftover: () => void;
}
