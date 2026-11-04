import type { PlayerEngine } from './engine';
import { hasRange } from './loopActions';
import { usePlayer } from './playerStore';

/**
 * REQ-28 · What both stages (file and YouTube) do when the media reaches its end: start the A–B loop (or the whole
 * song with «repetir todo») again, the same as the loop controller. A gap keeps the media paused while the
 * countdown runs, or it would play on under it. Returns false when nothing restarts (the caller marks it stopped).
 */
export function restartOnEnded(engine: PlayerEngine): boolean {
  const { loop, gap, loopAll, gapAll } = usePlayer.getState();
  const looping = loop.enabled && hasRange(loop);
  const restartAt = looping ? loop.start : loopAll ? 0 : null;
  if (restartAt == null) return false;
  const wait = looping ? gap : gapAll;
  engine.seek(restartAt);
  if (wait > 0) {
    engine.pause();
    usePlayer.setState({ time: restartAt, countdownEndsAt: performance.now() + wait * 1000, playing: false });
  } else engine.play();
  return true;
}
