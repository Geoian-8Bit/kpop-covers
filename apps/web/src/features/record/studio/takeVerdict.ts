import {
  directTakeVerdict,
  droppedFrames,
  resolutionClass,
  takeVerdict,
  type PaceVerdict,
} from '@coverscape/shared';

/**
 * REQ-27 · The numbers a finished take is judged by, out of the recorder (pure: what `finish` computed inline).
 *
 * R4. Canvas take: frames the camera delivered vs frames drawn into the take (the page couldn't keep up). Direct
 * take: the recorder gets every camera frame; what's worth knowing is the real rate (less light → fewer frames per
 * second on many phones), not "losses".
 */
export function takeFrames(t: { drawn: number; delivered: number; canvas: boolean; seconds: number }): {
  expected: number;
  dropped: number | null;
  realFps: number | null;
} {
  const expected = t.canvas ? t.delivered : 0;
  const dropped = t.canvas && t.delivered > 0 ? droppedFrames({ expected, delivered: t.drawn }) : null;
  const realFps = t.seconds > 0 && t.drawn > 0 ? t.drawn / t.seconds : null;
  return { expected, dropped, realFps };
}

/** What was counted of the take, without the first 2 s of the take and of each resume (paceSkip). */
export interface CountedPace {
  frames: number;
  delivered: number;
  missed: number;
  seconds: number;
}

/**
 * P19 · A take whose preview couldn't keep up (frames lost, or a delay that grew): this phone doesn't keep up with the
 * mode. A canvas take is judged against the frames the camera delivered; a direct take (the file gets every camera
 * frame) by its delay against the countdown's, and by its mean rate against the countdown's only when the delay grows
 * too: never by callbacks the page missed, by the median rate, nor by the rate at rest of an earlier rehearsal (a
 * darker room slows the camera down by itself).
 */
export function judgeTake(t: {
  canvas: boolean;
  mode: { width: number; height: number; fps: number } | null;
  wantFps: number;
  counted: CountedPace | null;
  lagMs: number | null;
  /** The camera at rest in this mode (learnt by a rehearsal). */
  rest: { lagMs: number | null } | null;
  /** The camera in this take's countdown. */
  countdown: { fps: number | null; lagMs: number | null } | null;
}): PaceVerdict {
  const { mode, counted } = t;
  if (!mode || !counted || counted.seconds <= 0) return 'unknown';
  const resolution = resolutionClass(mode.width, mode.height);
  return t.canvas
    ? takeVerdict({
        wantFps: t.wantFps,
        cameraFps: counted.delivered / counted.seconds,
        frames: counted.frames,
        seconds: counted.seconds,
        resolution,
        lagMs: t.lagMs,
        restLagMs: t.rest?.lagMs ?? null,
      })
    : directTakeVerdict({
        wantFps: t.wantFps,
        modeFps: mode.fps,
        presented: counted.frames,
        seconds: counted.seconds,
        restFps: t.countdown?.fps ?? null,
        resolution,
        lagMs: t.lagMs,
        restLagMs: t.countdown?.lagMs ?? t.rest?.lagMs ?? null,
      });
}
