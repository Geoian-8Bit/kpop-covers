import { afterEach, describe, expect, it, vi } from 'vitest';
import { abortError, isAbort, sleep } from './async';

describe('async helpers', () => {
  afterEach(() => vi.useRealTimers());

  it('abortError keeps the message and is recognised as a cancellation', () => {
    const e = abortError('Copia cancelada');
    expect(e).toBeInstanceOf(DOMException);
    expect(e.name).toBe('AbortError');
    expect(e.message).toBe('Copia cancelada');
    expect(isAbort(e)).toBe(true);
  });

  it('isAbort rejects other errors', () => {
    expect(isAbort(new Error('AbortError'))).toBe(false);
    expect(isAbort(new DOMException('x', 'NotAllowedError'))).toBe(false);
    expect(isAbort(null)).toBe(false);
  });

  it('sleep resolves after the given time', async () => {
    vi.useFakeTimers();
    let done = false;
    void sleep(100).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(99);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });
});
