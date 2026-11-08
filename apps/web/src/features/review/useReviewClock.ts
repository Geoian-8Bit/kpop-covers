import {
  hasRange,
  msSinceReviewAlign,
  originalWaitState,
  reviewOriginalRate,
  reviewTakeRate,
  useReview,
} from '@/player/store';
import { songPerTake } from '@coverscape/shared';
import { useEffect } from 'react';
import { mediaSlot, wrapLoop } from './reviewMediaSlot';
import { FRESH_SYNC, originalWait, type SyncMemory, syncStep } from './reviewRules';

/**
 * The review's clock: every frame while it plays (or a finger scrubs), the take's time goes to the store, the A–B
 * loop wraps, and the original follows the take (`syncStep`: small gaps nudged, big ones jumped, never in a loop).
 * While the original (a file) is the one heard, the muted take is nudged instead, so the heard tempo never wobbles.
 * A take that starts before the song (`lead`): the original waits paused at 0 and starts when the take gets there.
 */
export function useReviewClock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let busyAt = 0;
    let memory: SyncMemory = FRESH_SYNC;
    /** The store's own last jump of the original (a seek, a pause, a play from elsewhere): a fresh start. */
    let storeAlignAt = Number.NEGATIVE_INFINITY;
    let wrapSeen = mediaSlot.loopWrapAt;
    let hold: ReturnType<typeof setTimeout> | undefined;
    let holding = false;

    const endHold = () => {
      clearTimeout(hold);
      hold = undefined;
      holding = false;
    };
    /** Both back at their own speeds (a nudge must not outlive a pause or a change of what's heard). */
    const baseRates = (s: ReviewSnapshot) => {
      s.originalEngine?.setRate(reviewOriginalRate(s.timing, s.rate));
      s.takeEngine?.setRate(reviewTakeRate(s.timing, s.rate));
      memory = { ...memory, nudged: false };
    };

    // P10 · Frames only while the take plays or a finger scrubs, plus a short tail so a fresh pause or scrub settles
    // on the video's clock; paused and idle, no rAF at all.
    const tick = () => {
      raf = 0;
      step();
      const now = performance.now();
      if (isReviewClockBusy(useReview.getState())) busyAt = now;
      if (useReview.getState().takeEngine && now - busyAt < REVIEW_CLOCK_TAIL_MS)
        raf = requestAnimationFrame(tick);
    };
    const wake = (s: ReviewSnapshot, before?: ReviewSnapshot) => {
      if (before && before.playing && !s.playing) {
        // Paused: the store puts the original back exactly; the follow starts afresh next time.
        endHold();
        if (memory.nudged) baseRates(s);
        memory = { ...FRESH_SYNC, lastFixAt: memory.lastFixAt };
      }
      if (before && before.audio !== s.audio && memory.nudged) baseRates(s);
      if (before && before.solo !== s.solo) {
        // «Solo toma» on or off: no hold or nudge of the original outlives it.
        endHold();
        if (memory.nudged) baseRates(s);
        memory = { ...FRESH_SYNC, lastFixAt: performance.now() };
      }
      if (raf || !isReviewClockBusy(s)) return;
      busyAt = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const step = () => {
      const s = useReview.getState();
      const take = s.takeEngine;
      if (!take) return;
      let t = s.time;
      if (!s.scrubbing) {
        t = take.getCurrentTime();
        if (s.playing && s.loop.enabled && hasRange(s.loop) && t >= s.loop.end - 0.01) {
          wrapLoop();
          return;
        }
        if (Math.abs(t - s.time) > 0.0005) useReview.setState({ time: t });
      }
      const original = s.originalEngine;
      if (!s.playing || !original || s.scrubbing || holding || s.solo) return;
      const now = performance.now();
      const base = reviewOriginalRate(s.timing, s.rate);
      const raw = s.originalRawTarget(t);
      const wait = originalWait(raw, originalWaitState.waiting);
      if (wait === 'wait') {
        if (!originalWaitState.waiting) {
          // The take went back before the song's start (a seek, an A–B wrap): the original waits at its 0.
          originalWaitState.waiting = true;
          if (memory.nudged) baseRates(s);
          original.pause();
          original.seek(0);
        }
        return;
      }
      if (wait === 'start') {
        // The take reached the song's start: the original comes in (from 0, or ahead if a frame came late).
        originalWaitState.waiting = false;
        original.setRate(base);
        take.setRate(reviewTakeRate(s.timing, s.rate));
        // YouTube's own start jumps ahead by what starting takes it; a file is put on the spot first.
        const at = Math.max(0, raw);
        if (s.originalKind !== 'youtube' && Math.abs(original.getCurrentTime() - at) > 0.05)
          original.seek(at);
        original.play();
        memory = { ...FRESH_SYNC, lastFixAt: now };
        return;
      }
      const p = mediaSlot.probe;
      if (!p || p.engine !== original) return;
      const alignAt = now - msSinceReviewAlign();
      if (alignAt > storeAlignAt + 1) {
        // A seek or a play from the store: a fresh start.
        storeAlignAt = alignAt;
        if (memory.nudged) baseRates(s);
        memory = { ...FRESH_SYNC, lastFixAt: alignAt };
      }
      if (mediaSlot.loopWrapAt > wrapSeen) {
        // An A–B wrap: let it land, keep the backoff as it was.
        wrapSeen = mediaSlot.loopWrapAt;
        memory = { ...memory, lastFixAt: Math.max(memory.lastFixAt, mediaSlot.loopWrapAt) };
      }
      const target = Math.max(0, raw);
      const length = original.getDuration();
      if (length > 0 && target > length) return; // the take runs past the end of the original
      const result = syncStep(
        {
          kind: p.kind,
          drift: original.getCurrentTime() - target,
          target,
          baseRate: base,
          now,
          ready: p.ready(),
          seekLatencyMs: p.seekLatencyMs(),
          heard: s.audio,
          takeRate: reviewTakeRate(s.timing, s.rate),
          takeTime: t,
          songSpeed: songPerTake(s.timing),
        },
        memory,
      );
      memory = result.memory;
      const action = result.action;
      switch (action.kind) {
        case 'rate':
          original.setRate(action.rate);
          break;
        case 'takeRate':
          take.setRate(action.rate);
          break;
        case 'base':
          original.setRate(base);
          take.setRate(reviewTakeRate(s.timing, s.rate));
          break;
        case 'seek':
          original.setRate(base);
          take.setRate(reviewTakeRate(s.timing, s.rate));
          p.noteJump();
          p.rawSeek(action.to);
          break;
        case 'takeSeek':
          original.setRate(base);
          take.setRate(reviewTakeRate(s.timing, s.rate));
          take.seek(action.to);
          useReview.setState({ time: action.to });
          break;
        case 'hold':
          holding = true;
          original.pause();
          hold = setTimeout(() => {
            endHold();
            const r = useReview.getState();
            if (r.playing && !r.solo && !originalWaitState.waiting && r.originalEngine === original)
              p.resume();
          }, action.ms);
          break;
        default:
          break;
      }
    };
    const unsubscribe = useReview.subscribe(wake);
    wake(useReview.getState());
    return () => {
      unsubscribe();
      cancelAnimationFrame(raf);
      endHold();
    };
  }, [active]);
}

type ReviewSnapshot = ReturnType<typeof useReview.getState>;
/** Keep ticking this long after the last busy frame (as the studio's loop does). */
const REVIEW_CLOCK_TAIL_MS = 700;
/** The clock only has work while the take moves or is being scrubbed. */
function isReviewClockBusy(s: Pick<ReviewSnapshot, 'takeEngine' | 'playing' | 'scrubbing'>): boolean {
  return s.takeEngine != null && (s.playing || s.scrubbing);
}
