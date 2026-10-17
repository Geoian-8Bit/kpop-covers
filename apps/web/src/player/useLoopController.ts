import { useEffect } from 'react';
import { msUntilWrap, songWrapPoint, wrapLead, wrapPoint } from './loopRules';
import { hasRange, usePlayer } from './store';

type PlayerSnapshot = ReturnType<typeof usePlayer.getState>;

/** Keep ticking this long after the last busy frame so a fresh pause or scrub settles on the engine's clock. */
const IDLE_TAIL_MS = 700;
/**
 * Frames spent asking a paused engine for its length. Some files never say (recorded WebMs only know it
 * after playing through), and the loop must not spin forever waiting; playing keeps asking anyway.
 */
const DURATION_PROBES = 120;

/** Frames only matter while the clock moves, a gap counts down, or the length is still unknown. */
function isBusy(state: PlayerSnapshot, probing: boolean): boolean {
  if (!state.engine) return false;
  return state.playing || state.countdownEndsAt != null || state.scrubbing || (!state.duration && probing);
}

/**
 * Where the playing song jumps back, if a loop is on: the A–B start or the song's start, and the moment to jump
 * (8: ahead of the end by the engine's measured seek time, so the new start shows as the old end would have).
 */
function loopTarget(state: PlayerSnapshot): { at: number; to: number; gap: number } | null {
  const { loop, engine } = state;
  const timing = engine?.loopTiming?.() ?? null;
  if (loop.enabled && hasRange(loop)) {
    // No lead with a pause between repetitions (the clip plays to its end, then counts in).
    const lead = wrapLead(timing, state.rate, loop.end - loop.start, state.gap);
    return { at: wrapPoint(loop.end, lead), to: loop.start, gap: state.gap };
  }
  // Whole-song loop: also keeps YouTube from ever showing its end screen.
  if (state.loopAll && state.duration > 1) {
    const lead = wrapLead(timing, state.rate, state.duration, state.gapAll);
    return { at: songWrapPoint(state.duration, lead, timing ?? { latencyMs: 0, maxLatencyMs: 0, endMargin: 0.3 }), to: 0, gap: state.gapAll };
  }
  return null;
}

/**
 * One rAF loop per studio: pulls the clock from the active engine into the store,
 * wraps A–B loops and resumes after the optional "get back in position" gap.
 * While paused and idle it stops entirely; a store subscription wakes it up again.
 */
export function useLoopController(): void {
  useEffect(() => {
    let frame = 0;
    let busyAt = 0;
    let probes = 0;
    let probed: PlayerSnapshot['engine'] = null;
    /** A jump due between two frames: fired by a timer instead of up to a frame late. */
    let wrapTimer: ReturnType<typeof setTimeout> | undefined;
    const probing = (state: PlayerSnapshot) => {
      // A new engine (another video) gets a fresh round of probes.
      if (state.engine !== probed) {
        probed = state.engine;
        probes = 0;
      }
      return probes < DURATION_PROBES;
    };

    /** Jump back now: never waits for the media's end or for the player to confirm the seek. */
    const wrap = (state: PlayerSnapshot, to: number, gap: number) => {
      const { engine } = state;
      if (!engine) return;
      // Only the gapless jumps are anticipated, so only they measure the engine's seek time (`loop`).
      engine.seek(to, gap > 0 ? undefined : { loop: true });
      if (gap > 0) {
        engine.pause();
        usePlayer.setState({ time: to, countdownEndsAt: performance.now() + gap * 1000 });
      } else {
        usePlayer.setState({ time: to });
      }
    };

    const step = (state: PlayerSnapshot) => {
      const { engine } = state;
      if (!engine) return;

      if (state.countdownEndsAt != null) {
        if (performance.now() >= state.countdownEndsAt) {
          usePlayer.setState({ countdownEndsAt: null });
          engine.play();
        }
        return;
      }

      // While scrubbing the pointer owns the playhead; the engine may still report the old position.
      if (state.scrubbing) return;

      const t = engine.getCurrentTime();
      const target = state.playing ? loopTarget(state) : null;
      if (target && wrapTimer === undefined) {
        const ms = msUntilWrap(t, target.at, state.rate);
        if (ms === 0) {
          wrap(state, target.to, target.gap);
          return;
        }
        if (ms != null) {
          wrapTimer = setTimeout(() => {
            wrapTimer = undefined;
            const now = usePlayer.getState();
            // Re-checked at fire time: a pause, a seek or another range in between cancels it.
            const again = now.playing && !now.scrubbing && now.countdownEndsAt == null ? loopTarget(now) : null;
            const time = now.engine?.getCurrentTime() ?? 0;
            if (again && time <= again.at + 0.5 && msUntilWrap(time, again.at, now.rate) != null) wrap(now, again.to, again.gap);
          }, ms);
        }
      }

      // Right after a scrub, YouTube can still report the pre-seek time for a few frames: ignore big jumps back.
      const settling = performance.now() - state.scrubEndedAt < 600 && Math.abs(t - state.time) > 0.75;
      if (!settling && Math.abs(t - state.time) > 0.008) usePlayer.setState({ time: t });

      if (!state.duration) {
        probes++;
        const duration = engine.getDuration();
        if (duration > 0) usePlayer.setState({ duration });
      }
    };

    const tick = () => {
      frame = 0;
      step(usePlayer.getState());
      const state = usePlayer.getState();
      const now = performance.now();
      if (isBusy(state, probing(state))) busyAt = now;
      // step() writes to the store, and the subscription below may already have asked for the next frame:
      // a second request would add one more tick per frame, every frame, while the video plays.
      if (!frame && state.engine && now - busyAt < IDLE_TAIL_MS) frame = requestAnimationFrame(tick);
    };

    const wake = (state: PlayerSnapshot) => {
      if (frame || !isBusy(state, probing(state))) return;
      busyAt = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const unsubscribe = usePlayer.subscribe(wake);
    wake(usePlayer.getState());
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      clearTimeout(wrapTimer);
    };
  }, []);
}
