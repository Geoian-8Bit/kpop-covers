import { describe, expect, it } from 'vitest';
import { analysisFps, untilAborted } from './analyze';

describe('cancelling the analysis', () => {
  it('a pending model download is left behind at once when cancelled', async () => {
    const never = new Promise<never>(() => {});
    const abort = new AbortController();
    const waiting = untilAborted(never, abort.signal);
    abort.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    await expect(untilAborted(Promise.resolve(1), abort.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('otherwise passes the result or the error through', async () => {
    const abort = new AbortController();
    await expect(untilAborted(Promise.resolve(7), abort.signal)).resolves.toBe(7);
    await expect(untilAborted(Promise.reject(new Error('red')), abort.signal)).rejects.toThrow('red');
  });

  it('looks at 5–10 frames a second', () => {
    expect(analysisFps(12)).toBe(10);
    expect(analysisFps(180)).toBe(6);
    expect(analysisFps(600)).toBe(5);
    expect(analysisFps(0)).toBe(8);
  });
});
