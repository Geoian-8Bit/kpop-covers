import { shouldWrap } from '@coverscape/shared';
import { useEffect } from 'react';
import { hasRange, usePlayer } from './store';

/**
 * One rAF loop per studio: pulls the clock from the active engine into the store,
 * wraps A–B loops and resumes after the optional "get back in position" gap.
 */
export function useLoopController(): void {
  useEffect(() => {
    let frame = 0;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const state = usePlayer.getState();
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

      // Right after a scrub, YouTube can still report the pre-seek time for a few frames: ignore big jumps back.
      const settling = performance.now() - state.scrubEndedAt < 600 && Math.abs(t - state.time) > 0.75;
      if (!settling && Math.abs(t - state.time) > 0.008) usePlayer.setState({ time: t });

      if (!state.duration) {
        const duration = engine.getDuration();
        if (duration > 0) usePlayer.setState({ duration });
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
}
