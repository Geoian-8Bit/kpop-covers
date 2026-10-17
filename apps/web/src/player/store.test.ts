import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerEngine } from './engine';
import { usePlayer } from './store';

function fakeEngine(duration = 200) {
  let now = 0;
  return {
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn((s: number) => {
      now = s;
    }),
    getCurrentTime: () => now,
    getDuration: () => duration,
    setRate: vi.fn(),
  } satisfies PlayerEngine;
}

const chorus = { id: 'c1', start_seconds: 40, end_seconds: 60, speed: 1, mirrored: false };

describe('player store · a clip tapped while no engine is attached', () => {
  beforeEach(() => {
    usePlayer.getState().reset();
    usePlayer.setState({ duration: 200 });
  });

  it('lands on the clip and plays once the engine attaches', () => {
    expect(usePlayer.getState().applyClip(chorus)).toBe(true);
    const engine = fakeEngine();
    usePlayer.getState().attach(engine);
    expect(engine.seek).toHaveBeenCalledWith(40);
    expect(engine.play).toHaveBeenCalledTimes(1);
    const s = usePlayer.getState();
    expect(s.time).toBe(40);
    expect(s.playing).toBe(true);
    expect(s.activeClipId).toBe('c1');
  });

  it('beats an older moment left by switching stage', () => {
    usePlayer.setState({ time: 100 });
    usePlayer.getState().setStage('file');
    usePlayer.getState().applyClip(chorus);
    const engine = fakeEngine();
    usePlayer.getState().attach(engine);
    expect(engine.seek).toHaveBeenLastCalledWith(40);
  });

  it('a pause before the engine arrives cancels the start', () => {
    usePlayer.getState().applyClip(chorus);
    usePlayer.getState().pause();
    const engine = fakeEngine();
    usePlayer.getState().attach(engine);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('switching stage afterwards does not start the other one by itself', () => {
    usePlayer.getState().applyClip(chorus);
    usePlayer.getState().setStage('file');
    const engine = fakeEngine();
    usePlayer.getState().attach(engine);
    expect(engine.seek).toHaveBeenLastCalledWith(40);
    expect(engine.play).not.toHaveBeenCalled();
  });

  it('without autoplay it only waits on the clip', () => {
    usePlayer.getState().applyClip(chorus, { autoplay: false });
    const engine = fakeEngine();
    usePlayer.getState().attach(engine);
    expect(engine.seek).toHaveBeenCalledWith(40);
    expect(engine.play).not.toHaveBeenCalled();
  });
});

describe('player store · a stage that mounts again', () => {
  beforeEach(() => usePlayer.getState().reset());

  it('lands where the timeline already is', () => {
    const first = fakeEngine();
    usePlayer.getState().attach(first);
    usePlayer.getState().seek(75);
    usePlayer.getState().detach(first);
    const second = fakeEngine();
    usePlayer.getState().attach(second);
    expect(second.seek).toHaveBeenCalledWith(75);
    expect(usePlayer.getState().time).toBe(75);
  });

  it('a fresh video at 0 is left alone', () => {
    const engine = fakeEngine();
    usePlayer.getState().attach(engine);
    expect(engine.seek).not.toHaveBeenCalled();
  });
});
