import type { PlayerEngine } from '@/player/engine';
import { hasRange, reviewOriginalRate, useReview } from '@/player/store';
import { type OriginalKind, seekAhead } from './reviewRules';

/**
 * What the clock needs to know about the original besides its engine: whether its clock can be judged now
 * (playing with data, not landing a jump), how long its jumps take, and a way to go on after a hold without the
 * start-up jump. One review at a time: a module slot.
 */
export interface OriginalProbe {
  engine: PlayerEngine;
  kind: OriginalKind;
  ready(): boolean;
  /** How long a jump takes to show (ms, measured). */
  seekLatencyMs(): number;
  /** A jump was just sent: its landing is measured (only one that went through loading counts). */
  noteJump(): void;
  /** Play again after a hold, as it is (no jump ahead). */
  resume(): void;
  /** A jump that already counts its own delay (the follow's, an A–B wrap): sent as it is. */
  rawSeek(seconds: number, opts?: { preview?: boolean; loop?: boolean }): void;
}
/**
 * REQ-27 · One review at a time: the module slot the media share (an object, so every split file writes the same
 * one). `loopWrapAt`: performance.now() of the last A–B wrap: the follow lets it land without counting it as a failed
 * correction.
 */
export const mediaSlot: { probe: OriginalProbe | null; loopWrapAt: number } = {
  probe: null,
  loopWrapAt: Number.NEGATIVE_INFINITY,
};

/**
 * The A–B section starts over: the take goes back to A and the original with it — a YouTube video ahead by what its
 * jumps take, so it lands in step — without restarting the follow's backoff (a short section wraps every few
 * seconds).
 */
export function wrapLoop(): void {
  const s = useReview.getState();
  const take = s.takeEngine;
  if (!take || !hasRange(s.loop)) return;
  const start = s.loop.start;
  take.seek(start, { loop: true });
  useReview.setState({ time: start });
  const original = s.originalEngine;
  if (original) {
    const p = mediaSlot.probe && mediaSlot.probe.engine === original ? mediaSlot.probe : null;
    const lead = s.playing && p?.kind === 'youtube' ? p.seekLatencyMs() : 0;
    p?.noteJump();
    const to = seekAhead(s.originalTarget(start), lead, reviewOriginalRate(s.timing, s.rate));
    if (p) p.rawSeek(to, { loop: true });
    else original.seek(to, { loop: true });
  }
  mediaSlot.loopWrapAt = performance.now();
}
