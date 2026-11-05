import { describe, expect, it } from 'vitest';
import { createZoomApplier } from './zoomStore';

/** A camera whose applyConstraints answers when told to; it counts how many are in flight at once. */
function fakeCamera() {
  const pending: (() => void)[] = [];
  const applied: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const apply = (_track: MediaStreamTrack | undefined, zoom: number) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    return new Promise<boolean>((resolve) =>
      pending.push(() => {
        inFlight--;
        applied.push(zoom);
        resolve(true);
      }),
    );
  };
  const answer = async () => {
    pending.shift()?.();
    // Let the applier's own promise chain run.
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  return { apply, answer, applied, stats: () => ({ inFlight, maxInFlight, pending: pending.length }) };
}

describe('createZoomApplier (REQ-23 · S-11)', () => {
  it('keeps at most one applyConstraints in flight during a pinch and lands on the last value', async () => {
    const cam = fakeCamera();
    let answered = 0;
    const setZoom = createZoomApplier(cam.apply, () => answered++);
    // A pinch: one value per frame, far faster than the camera answers.
    for (let i = 1; i <= 60; i++) setZoom(undefined, 1 + i / 20);
    expect(cam.stats()).toMatchObject({ inFlight: 1, pending: 1 });
    await cam.answer();
    // The first answer sends only the newest value waiting, not the 58 in between.
    expect(cam.stats()).toMatchObject({ inFlight: 1, pending: 1 });
    await cam.answer();
    expect(cam.applied).toEqual([1.05, 4]);
    expect(cam.stats().maxInFlight).toBe(1);
    expect(answered).toBe(2);
  });

  it('applies at once when nothing is in flight, and goes on after a refusal', async () => {
    const order: number[] = [];
    const setZoom = createZoomApplier((_t, zoom) => {
      order.push(zoom);
      return zoom === 2 ? Promise.reject(new Error('refused')) : Promise.resolve(true);
    });
    setZoom(undefined, 2);
    expect(order).toEqual([2]);
    setZoom(undefined, 3);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(order).toEqual([2, 3]);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    setZoom(undefined, 1);
    expect(order).toEqual([2, 3, 1]);
  });
});
