import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerEngine } from './engine';
import { usePlayer } from './playerStore';
import { restartOnEnded } from './restartOnEnded';

const engine = () =>
  ({
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    getCurrentTime: () => 0,
    getDuration: () => 100,
    setRate: vi.fn(),
  }) satisfies PlayerEngine;

describe('restartOnEnded · what both stages do at the end of the media', () => {
  beforeEach(() => {
    usePlayer.getState().reset();
    usePlayer.setState({ loopAll: false, gap: 0, gapAll: 0 });
  });

  it('does nothing without a loop or «repetir todo»', () => {
    const e = engine();
    expect(restartOnEnded(e)).toBe(false);
    expect(e.seek).not.toHaveBeenCalled();
  });

  it('starts the A–B loop again at once without a gap', () => {
    usePlayer.setState({ loop: { start: 10, end: 20, enabled: true } });
    const e = engine();
    expect(restartOnEnded(e)).toBe(true);
    expect(e.seek).toHaveBeenCalledWith(10);
    expect(e.play).toHaveBeenCalled();
  });

  it('waits paused through the whole-song gap with a countdown', () => {
    usePlayer.setState({ loopAll: true, gapAll: 2, playing: true });
    const e = engine();
    expect(restartOnEnded(e)).toBe(true);
    expect(e.seek).toHaveBeenCalledWith(0);
    expect(e.pause).toHaveBeenCalled();
    const s = usePlayer.getState();
    expect(s.playing).toBe(false);
    expect(s.time).toBe(0);
    expect(s.countdownEndsAt).not.toBeNull();
  });
});
