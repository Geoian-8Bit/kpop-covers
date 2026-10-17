import { describe, expect, it } from 'vitest';
import { candidatesOf, createStampClock, multiSize, untilAborted } from './analyze';

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
});

describe('15 · the frame handed to the model', () => {
  it('is shrunk to MultiPose’s own input size, keeping its shape', () => {
    expect(multiSize({ width: 1920, height: 1080 })).toEqual({ width: 256, height: 144 });
    expect(multiSize({ width: 1080, height: 1920 })).toEqual({ width: 144, height: 256 });
    expect(multiSize({ width: 0, height: 0 })).toEqual({ width: 32, height: 32 });
  });

  it('people come with the box of their points, to size the crop’s boxes the same', () => {
    const keypoints = Array.from({ length: 17 }, (_, i) => ({
      x: 100 + (i % 3) * 10,
      y: 20 + i * 6,
      score: 0.9,
    }));
    const [c] = candidatesOf(
      [
        {
          score: 0.8,
          keypoints,
          box: { xMin: 0.35, yMin: 0.05, xMax: 0.55, yMax: 0.9, width: 0.2, height: 0.85 },
        },
      ],
      { width: 256, height: 144 },
    );
    expect(c!.box.x).toBeCloseTo(0.35);
    expect(c!.box.w).toBeCloseTo(0.2);
    expect(c!.box.h).toBeCloseTo(0.85);
    expect(c!.kp!.x).toBeCloseTo(100 / 256);
    expect(c!.kp!.h).toBeCloseTo(96 / 144);
  });
});

describe('16 · the tracker’s clock', () => {
  it('runs with the song inside a stretch and always grows across stretches', () => {
    const clock = createStampClock();
    clock.session(10);
    const a = clock.stamp(10);
    const b = clock.stamp(11.5);
    expect(b - a).toBeCloseTo(1500);
    // A stretch further back in the song (going backwards in chunks): a new session, still later stamps.
    clock.session(2);
    const c = clock.stamp(2);
    expect(c).toBeGreaterThan(b);
    expect(clock.stamp(2.25) - c).toBeCloseTo(250);
  });
});
