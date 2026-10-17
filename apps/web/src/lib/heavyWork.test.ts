import { describe, expect, it } from 'vitest';
import {
  beginHeavyWork,
  heavyWorkBusy,
  heavyWorkBusySince,
  heavyWorkRunning,
  onHeavyWorkChange,
  reloadBusy,
  untilHeavyWork,
} from './heavyWork';

describe('heavy work', () => {
  it('counts each job until it ends (ending twice does nothing)', () => {
    const a = beginHeavyWork('copy');
    const b = beginHeavyWork('copy');
    expect(heavyWorkRunning('copy')).toBe(true);
    expect(heavyWorkRunning('voice')).toBe(false);
    a();
    a();
    expect(heavyWorkRunning('copy')).toBe(true);
    b();
    expect(heavyWorkRunning('copy')).toBe(false);
  });

  it('an idle job still runs (an update would cut it) but loads nothing', () => {
    const work = beginHeavyWork('copy');
    expect(heavyWorkBusy('copy')).toBe(true);
    work.idle(true);
    expect(heavyWorkRunning('copy')).toBe(true);
    expect(heavyWorkBusy('copy')).toBe(false);
    expect(heavyWorkBusy()).toBe(false);
    work.idle(false);
    expect(heavyWorkBusy()).toBe(true);
    work();
    expect(heavyWorkBusy()).toBe(false);
  });

  it('remembers when it last loaded the device', () => {
    const before = performance.now();
    const work = beginHeavyWork('voice');
    expect(heavyWorkBusySince(before)).toBe(true);
    work.idle(true);
    // It loaded the device after `before`, not after now.
    expect(heavyWorkBusySince(before)).toBe(true);
    expect(heavyWorkBusySince(performance.now() + 1)).toBe(false);
    work();
    expect(heavyWorkBusySince(performance.now() + 1)).toBe(false);
  });

  it('an update would cut the copy first, then the separation', () => {
    expect(reloadBusy()).toBeNull();
    const voice = beginHeavyWork('voice');
    expect(reloadBusy()).toBe('voice');
    const copy = beginHeavyWork('copy');
    copy.idle(true);
    expect(reloadBusy()).toBe('copy');
    copy();
    voice();
    expect(reloadBusy()).toBeNull();
  });

  it('tells its listeners and waits until free', async () => {
    let calls = 0;
    const off = onHeavyWorkChange(() => calls++);
    const work = beginHeavyWork('copy');
    let free = false;
    const waiting = untilHeavyWork(() => heavyWorkBusy('copy')).then(() => (free = true));
    await Promise.resolve();
    expect(free).toBe(false);
    work();
    await waiting;
    expect(free).toBe(true);
    expect(calls).toBe(2);
    off();
  });

  it('stops waiting when cancelled', async () => {
    const work = beginHeavyWork('copy');
    const abort = new AbortController();
    const waiting = untilHeavyWork(() => heavyWorkRunning('copy'), abort.signal);
    abort.abort();
    await expect(waiting).resolves.toBeUndefined();
    work();
  });
});
