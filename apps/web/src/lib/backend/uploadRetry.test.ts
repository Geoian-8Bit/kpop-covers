import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadsRunning } from '../mediaActivity';
import type { UploadResult } from './types';
import { uploadWithRetry } from './uploadRetry';

// The tests run in Node: a minimal page (always online and on screen).
beforeEach(() => {
  vi.useFakeTimers();
  const events = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.stubGlobal('window', events);
  vi.stubGlobal('document', { ...events, visibilityState: 'visible' });
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ok: UploadResult = { ok: true, path: 'g/v.mp4' };
const network: UploadResult = { ok: false, reason: 'network' };

function runner(results: UploadResult[]) {
  return vi.fn(async () => results.shift() ?? network);
}

describe('uploadWithRetry', () => {
  it('tries again silently after network failures and reports the success', async () => {
    const run = runner([network, network, ok]);
    const onRetry = vi.fn();
    const done = uploadWithRetry(run, { path: 'g/v.mp4', bytes: 10, onRetry, storedBytes: async () => null });
    expect(uploadsRunning()).toBe(1);
    await vi.runAllTimersAsync();
    await expect(done).resolves.toEqual(ok);
    expect(run).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalled();
    expect(uploadsRunning()).toBe(0);
  });

  it('reports a real refusal at once', async () => {
    const run = runner([{ ok: false, reason: 'too-big' }]);
    const done = uploadWithRetry(run, { path: 'g/v.mp4', bytes: 10, storedBytes: async () => null });
    await vi.runAllTimersAsync();
    await expect(done).resolves.toEqual({ ok: false, reason: 'too-big' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last try', async () => {
    const run = runner([]);
    const done = uploadWithRetry(run, { path: 'g/v.mp4', bytes: 10, storedBytes: async () => null });
    await vi.runAllTimersAsync();
    await expect(done).resolves.toEqual(network);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('a lost answer that hid a finished upload is not sent again', async () => {
    const run = runner([network]);
    const done = uploadWithRetry(run, { path: 'g/v.mp4', bytes: 10, storedBytes: async () => 10 });
    await vi.runAllTimersAsync();
    await expect(done).resolves.toEqual(ok);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('a file of another size at the name is not ours', async () => {
    const run = runner([network, { ok: false, reason: 'exists' }]);
    const done = uploadWithRetry(run, { path: 'g/v.mp4', bytes: 10, storedBytes: async () => 9 });
    await vi.runAllTimersAsync();
    await expect(done).resolves.toEqual({ ok: false, reason: 'exists' });
  });

  it('cancelling stops the retries during the wait', async () => {
    const abort = new AbortController();
    const run = runner([network, ok]);
    const done = uploadWithRetry(run, {
      path: 'g/v.mp4',
      bytes: 10,
      signal: abort.signal,
      storedBytes: async () => null,
    });
    const caught = done.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(500);
    abort.abort();
    await vi.runAllTimersAsync();
    expect(((await caught) as DOMException).name).toBe('AbortError');
    expect(run).toHaveBeenCalledTimes(1);
    expect(uploadsRunning()).toBe(0);
  });
});
