import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutoHideChrome } from './autoHideChrome';

describe('createAutoHideChrome', () => {
  let playing = true;
  beforeEach(() => {
    vi.useFakeTimers();
    playing = true;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const make = () => createAutoHideChrome({ shown: true, extra: 1 }, { isPlaying: () => playing });

  it('hides 3 s after waking while playing, keeping the other fields', () => {
    const c = make();
    c.wake();
    vi.advanceTimersByTime(2999);
    expect(c.store.getState().shown).toBe(true);
    vi.advanceTimersByTime(1);
    expect(c.store.getState()).toEqual({ shown: false, extra: 1 });
  });

  it('stays up while paused, and pausing brings it back', () => {
    const c = make();
    playing = false;
    c.wake();
    vi.advanceTimersByTime(5000);
    expect(c.store.getState().shown).toBe(true);
    c.hide();
    expect(c.store.getState().shown).toBe(false);
    c.onPlayingChange(false);
    expect(c.store.getState().shown).toBe(true);
    playing = true;
    c.onPlayingChange(true);
    vi.advanceTimersByTime(3000);
    expect(c.store.getState().shown).toBe(false);
  });

  it('cancelHide and hide stop a pending countdown', () => {
    const c = make();
    c.wake();
    c.cancelHide();
    vi.advanceTimersByTime(5000);
    expect(c.store.getState().shown).toBe(true);
  });

  it('listen wakes on a mouse move or a key, not on a touch move', () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    const c = make();
    c.hide();
    const off = c.listen();
    target.dispatchEvent(Object.assign(new Event('pointermove'), { pointerType: 'touch' }));
    expect(c.store.getState().shown).toBe(false);
    target.dispatchEvent(Object.assign(new Event('pointermove'), { pointerType: 'mouse' }));
    expect(c.store.getState().shown).toBe(true);
    c.hide();
    target.dispatchEvent(new Event('keydown'));
    expect(c.store.getState().shown).toBe(true);
    off();
    c.hide();
    target.dispatchEvent(new Event('keydown'));
    expect(c.store.getState().shown).toBe(false);
  });
});
