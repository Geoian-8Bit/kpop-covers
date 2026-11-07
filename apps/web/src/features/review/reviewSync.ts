import { needsAlignOnPlay } from '@/player/reviewAlign';
import { clamp } from '@coverscape/shared';

// ───────────── Keeping the original with the take (51) ─────────────

/**
 * The take is the clock (it carries the sound by default): it never waits for the original. The original follows
 * it gently: a file is nudged a few per cent faster or slower for small gaps and only jumps for big ones; YouTube
 * can't take fine speeds, so when it runs ahead it holds still for the gap, and when it falls behind it jumps a
 * little ahead of the take (its own seek delay). Every jump waits for the previous one to land, and jumps that keep
 * failing back off (2 s, 4 s, 8 s…) so the original never stutters in a loop of seeks.
 */
export type OriginalKind = 'file' | 'youtube';

export const SYNC = {
  file: {
    /** Below this (s) the original is in step. */
    nudgeOver: 0.03,
    /** Above this (s) a nudge would take too long: jump. */
    seekOver: 0.5,
    /** Most a nudge changes the speed (±6 %: not heard on a muted original, not seen). */
    maxNudge: 0.06,
    /** After a jump, wait this long before judging again (the jump lands). */
    settleMs: 450,
    cooldownMs: 1200,
  },
  youtube: {
    /** Ahead by more than this (s): hold still for the gap. */
    holdOver: 0.1,
    /** Behind by more than this (s): jump ahead. */
    seekOver: 0.2,
    settleMs: 900,
    cooldownMs: 2000,
    /** Longest hold (ms): a bigger gap is a jump instead. */
    maxHoldMs: 1500,
  },
  /** Backoff ceiling between corrections that keep failing. */
  maxCooldownMs: 8000,
  /** In step this long: the backoff starts again from the bottom. */
  calmMs: 3000,
} as const;

/** What the clock remembers between frames. */
export interface SyncMemory {
  /** performance.now() of the last correction (a jump, or the end of a hold). */
  lastFixAt: number;
  /** Corrections without a calm stretch between them. */
  streak: number;
  /** Since when the original has been in step (null: it isn't). */
  calmSince: number | null;
  /** A speed nudge is in effect (files). */
  nudged: boolean;
}
export const FRESH_SYNC: SyncMemory = {
  lastFixAt: Number.NEGATIVE_INFINITY,
  streak: 0,
  calmSince: null,
  nudged: false,
};

export type SyncAction =
  | { kind: 'none' }
  /** Play the original at this speed for now (files). */
  | { kind: 'rate'; rate: number }
  /**
   * Play the take at this speed for now (files, while the original is the one heard: its tempo must not wobble,
   * so the muted take follows it instead).
   */
  | { kind: 'takeRate'; rate: number }
  /** Jump the take to this second (the original is heard: the muted take is what moves). */
  | { kind: 'takeSeek'; to: number }
  /** Both back to their normal speeds (files). */
  | { kind: 'base' }
  /** Jump the original to this second (its own seconds). */
  | { kind: 'seek'; to: number }
  /** Pause the original this long, then play it again (YouTube ahead). */
  | { kind: 'hold'; ms: number };

export interface SyncInput {
  kind: OriginalKind;
  /** Original's time − where it should be (s, original's seconds): > 0 ahead, < 0 behind. */
  drift: number;
  /** Where the original should be now (original's seconds). */
  target: number;
  /** The original's normal speed (the take's recording speed × the common speed). */
  baseRate: number;
  /** performance.now(). */
  now: number;
  /** The original is playing with data (not loading, not landing a seek): only then is its clock judged. */
  ready: boolean;
  /** How long its jumps take to show (ms, measured): it jumps that much ahead. */
  seekLatencyMs: number;
  /** Which of the two is heard (default: the take). */
  heard?: 'take' | 'original';
  /** The take's normal speed (the common speed), for nudging it instead of the original. */
  takeRate?: number;
  /** The take's second now and the song's speed in the take (song s per take s), to jump the take instead. */
  takeTime?: number;
  songSpeed?: number;
}

/** With YouTube heard, the take jumps when they're this far apart (s): YouTube itself is never touched then. */
const HEARD_YOUTUBE_SEEK_OVER = 0.15;

/** The wait before the next correction: doubles with each one that didn't settle it. */
export function syncCooldown(kind: OriginalKind, streak: number): number {
  const base = kind === 'file' ? SYNC.file.cooldownMs : SYNC.youtube.cooldownMs;
  return Math.min(SYNC.maxCooldownMs, base * 2 ** Math.max(0, Math.min(streak, 6)));
}

/** Where to jump so the original shows `target` when the jump lands: ahead by its delay at its speed (≤ 1,5 s). */
export function seekAhead(target: number, latencyMs: number, rate: number): number {
  const lead = (clamp(Number.isFinite(latencyMs) ? latencyMs : 0, 0, 1500) / 1000) * (rate > 0 ? rate : 1);
  return Math.max(0, Math.round((target + lead) * 1000) / 1000);
}

/** A jump's measured delay folded into the running estimate (ms); first samples count more. */
export function blendLatency(previous: number | null, sampleMs: number): number {
  if (!Number.isFinite(sampleMs) || sampleMs < 0) return previous ?? 0;
  const sample = Math.min(sampleMs, 3000);
  return previous == null ? sample : Math.round(previous * 0.6 + sample * 0.4);
}

export { needsAlignOnPlay };

/**
 * A take that starts before the song (`lead`, a video from the gallery): while the take is before the song's start
 * the original's second for it (`target`, unclamped) is below 0, so the original waits, paused at 0 — it is never
 * sent below 0 nor followed there. When the take gets to the song's start it comes in once ('start'); from then on
 * it is followed as usual. `waiting`: it is parked now.
 */
export function originalWait(target: number, waiting: boolean): 'wait' | 'start' | 'follow' {
  if (!Number.isFinite(target)) return waiting ? 'wait' : 'follow';
  if (target < -0.0005) return 'wait';
  return waiting ? 'start' : 'follow';
}

/** One frame of the follow: what to do with the original, and what to remember. */
export function syncStep(input: SyncInput, memory: SyncMemory): { action: SyncAction; memory: SyncMemory } {
  const { kind, drift, now } = input;
  if (!input.ready || !Number.isFinite(drift)) return { action: { kind: 'none' }, memory };
  const abs = Math.abs(drift);
  const calmBand = kind === 'file' ? SYNC.file.nudgeOver * 2 : SYNC.youtube.holdOver;
  let next: SyncMemory = memory;
  if (abs <= calmBand) {
    const calmSince = memory.calmSince ?? now;
    next = { ...memory, calmSince, streak: now - calmSince >= SYNC.calmMs ? 0 : memory.streak };
  } else if (memory.calmSince != null) {
    next = { ...memory, calmSince: null };
  }
  const since = now - next.lastFixAt;
  const settle = kind === 'file' ? SYNC.file.settleMs : SYNC.youtube.settleMs;
  if (since < settle) return { action: { kind: 'none' }, memory: next };
  const cooled = since >= syncCooldown(kind, next.streak);
  const jump = (): { action: SyncAction; memory: SyncMemory } => ({
    action: { kind: 'seek', to: seekAhead(input.target, input.seekLatencyMs, input.baseRate) },
    memory: { ...next, lastFixAt: now, streak: next.streak + 1, calmSince: null, nudged: false },
  });

  if (input.heard === 'original' && input.takeTime != null) {
    // The original is the one heard: its sound is never moved, held or sped up. The muted take follows it instead:
    // a jump of the take (a file here, quick) for big gaps, a nudge of its speed for small ones (files).
    const songSpeed = input.songSpeed && input.songSpeed > 0 ? input.songSpeed : 1;
    const over = kind === 'file' ? SYNC.file.seekOver : HEARD_YOUTUBE_SEEK_OVER;
    if (abs > over && cooled) {
      return {
        action: {
          kind: 'takeSeek',
          to: Math.max(0, Math.round((input.takeTime + drift / songSpeed) * 1000) / 1000),
        },
        memory: { ...next, lastFixAt: now, streak: next.streak + 1, calmSince: null, nudged: false },
      };
    }
  }

  if (kind === 'file') {
    const f = SYNC.file;
    if (abs > f.seekOver && cooled && input.heard !== 'original') return jump();
    if (abs > f.nudgeOver) {
      // drift > 0: ahead → a little slower. Past the jump threshold (cooling down) it nudges at the most.
      const factor = 1 - clamp(drift * 0.5, -f.maxNudge, f.maxNudge);
      if (input.heard === 'original') {
        // The original is heard: the take (muted) speeds up when the original is ahead, slows when it's behind.
        const takeRate = input.takeRate && input.takeRate > 0 ? input.takeRate : 1;
        return {
          action: { kind: 'takeRate', rate: Math.round((takeRate / factor) * 1000) / 1000 },
          memory: { ...next, nudged: true },
        };
      }
      return {
        action: { kind: 'rate', rate: Math.round(input.baseRate * factor * 1000) / 1000 },
        memory: { ...next, nudged: true },
      };
    }
    if (next.nudged) return { action: { kind: 'base' }, memory: { ...next, nudged: false } };
    return { action: { kind: 'none' }, memory: next };
  }

  const y = SYNC.youtube;
  if (!cooled || input.heard === 'original') return { action: { kind: 'none' }, memory: next };
  if (drift > y.holdOver) {
    // Playing again takes a moment too (about half a jump): the hold is that much shorter.
    const restart = clamp(Number.isFinite(input.seekLatencyMs) ? input.seekLatencyMs : 0, 0, 1500) / 2;
    const ms = Math.round((drift / (input.baseRate > 0 ? input.baseRate : 1)) * 1000 - restart);
    if (ms < 60) return { action: { kind: 'none' }, memory: next };
    if (ms <= y.maxHoldMs) {
      // The hold ends `ms` from now: that is when the next judgement may start settling.
      return {
        action: { kind: 'hold', ms },
        memory: { ...next, lastFixAt: now + ms, streak: next.streak + 1, calmSince: null },
      };
    }
    return jump();
  }
  if (drift < -y.seekOver) return jump();
  return { action: { kind: 'none' }, memory: next };
}
