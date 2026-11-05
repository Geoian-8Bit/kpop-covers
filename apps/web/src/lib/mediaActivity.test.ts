import { afterEach, describe, expect, it, vi } from 'vitest';
import { whenIdle } from './idle';
import { beginUpload, mediaBusy, registerMediaProbe, uploadsRunning } from './mediaActivity';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('mediaBusy', () => {
  it('follows the registered players (YouTube iframes)', () => {
    let playing = true;
    const release = registerMediaProbe(() => playing);
    expect(mediaBusy()).toBe(true);
    playing = false;
    expect(mediaBusy()).toBe(false);
    playing = true;
    release();
    expect(mediaBusy()).toBe(false);
  });

  it('a player that throws while going away is not busy', () => {
    const release = registerMediaProbe(() => {
      throw new Error('gone');
    });
    expect(mediaBusy()).toBe(false);
    release();
  });

  it('counts page media streaming from the network, not device copies or the camera', () => {
    const media = (currentSrc: string, paused: boolean, networkState = 1) => ({
      currentSrc,
      paused,
      networkState,
    });
    let els = [media('blob:x', false), media('', false)];
    vi.stubGlobal('document', { querySelectorAll: () => els });
    expect(mediaBusy()).toBe(false);
    els = [media('https://x/v.mp4', true, 1)];
    expect(mediaBusy()).toBe(false);
    els = [media('https://x/v.mp4', true, 2)];
    expect(mediaBusy()).toBe(true);
    els = [media('https://x/v.mp4', false)];
    expect(mediaBusy()).toBe(true);
  });
});

describe('uploads', () => {
  it('counts each upload once', () => {
    const a = beginUpload();
    const b = beginUpload();
    expect(uploadsRunning()).toBe(2);
    a();
    a();
    expect(uploadsRunning()).toBe(1);
    b();
    expect(uploadsRunning()).toBe(0);
  });
});

describe('whenIdle', () => {
  it('falls back to a timer where requestIdleCallback is missing (Safari)', () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    const run = vi.fn();
    whenIdle(run, { fallbackMs: 1000 });
    vi.advanceTimersByTime(999);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledOnce();
  });
});
