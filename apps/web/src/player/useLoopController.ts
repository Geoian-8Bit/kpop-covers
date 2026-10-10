import { shouldWrap } from '@coverscape/shared';
import { useEffect } from 'react';
import { hasRange, usePlayer } from './store';

type PlayerSnapshot = ReturnType<typeof usePlayer.getState>;

/** Keep ticking this long after the last busy frame so a fresh pause or scrub settles on the engine's clock. */
const IDLE_TAIL_MS = 700;

/** Frames only matter while the clock moves, a gap counts down, or the length is still unknown. */
function isBusy(state: PlayerSnapshot): boolean {
  if (!state.engine) return false;
  return state.playing || state.countdownEndsAt != null || state.scrubbing || !state.duration;
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
      const { loop } = state;

      if (state.playing && loop.enabled && hasRange(loop) && shouldWrap(t, loop)) {
        engine.seek(loop.start);
        if (state.gap > 0) {
          engine.pause();
          usePlayer.setState({ time: loop.start, countdownEndsAt: performance.now() + state.gap * 1000 });
        } else {
          usePlayer.setState({ time: loop.start });
        }
        return;
      }

      // Whole-song loop: jump back just before the end so YouTube never shows its end screen.
      if (state.playing && state.loopAll && !(loop.enabled && hasRange(loop)) && state.duration > 1 && t >= state.duration - 0.3) {
        engine.seek(0);
        if (state.gapAll > 0) {
          engine.pause();
          usePlayer.setState({ time: 0, countdownEndsAt: performance.now() + state.gapAll * 1000 });
        } else {
          usePlayer.setState({ time: 0 });
        }
        return;
      }

      // Right after a scrub, YouTube can still report the pre-seek time for a few frames: ignore big jumps back.
      const settling = performance.now() - state.scrubEndedAt < 600 && Math.abs(t - state.time) > 0.75;
      if (!settling && Math.abs(t - state.time) > 0.008) usePlayer.setState({ time: t });

      if (!state.duration) {
        const duration = engine.getDuration();
        if (duration > 0) usePlayer.setState({ duration });
      }
    };

    const tick = () => {
      frame = 0;
      step(usePlayer.getState());
      const state = usePlayer.getState();
      const now = performance.now();
      if (isBusy(state)) busyAt = now;
      if (state.engine && now - busyAt < IDLE_TAIL_MS) frame = requestAnimationFrame(tick);
    };

    const wake = (state: PlayerSnapshot) => {
      if (frame || !isBusy(state)) return;
      busyAt = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const unsubscribe = usePlayer.subscribe(wake);
    wake(usePlayer.getState());
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, []);
}
