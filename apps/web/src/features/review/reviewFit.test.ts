import { describe, expect, it } from 'vitest';
import { clampFit, fitOf, gestureFit, keyFit, NO_FIT, wheelFit } from './reviewFit';

const frame = { width: 400, height: 300 };

describe('overlay fit', () => {
  it('clamps to the database limits and rounds', () => {
    expect(clampFit({ scale: 9, x: 3, y: -3 })).toEqual({ scale: 5, x: 1, y: -1 });
    expect(clampFit({ scale: 0.01, x: 0.123456, y: Number.NaN })).toEqual({ scale: 0.2, x: 0.1235, y: 0 });
  });

  it('reads defaults from a take that lacks the columns', () => {
    expect(fitOf({})).toEqual(NO_FIT);
    expect(fitOf({ fit_scale: 1.5, fit_x: 0.1, fit_y: -0.2 })).toEqual({ scale: 1.5, x: 0.1, y: -0.2 });
  });

  it('pans with one finger', () => {
    const fit = gestureFit(NO_FIT, [{ x: 0, y: 0 }], [{ x: 40, y: -30 }], frame);
    expect(fit).toEqual({ scale: 1, x: 0.1, y: -0.1 });
  });

  it('scales around the midpoint of two fingers, keeping it under them', () => {
    const from = [
      { x: -50, y: 0 },
      { x: 50, y: 0 },
    ];
    const to = [
      { x: -100, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(gestureFit(NO_FIT, from, to, frame)).toEqual({ scale: 2, x: 0, y: 0 });
    // Pinching around a point right of centre moves the original left, so that point stays put.
    const off = gestureFit(
      NO_FIT,
      [
        { x: 50, y: 0 },
        { x: 150, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
      frame,
    );
    expect(off.scale).toBe(2);
    expect(off.x).toBe(-0.25);
  });

  it('ignores mismatched gestures and an empty frame', () => {
    expect(gestureFit(NO_FIT, [{ x: 0, y: 0 }], [], frame)).toBe(NO_FIT);
    expect(gestureFit(NO_FIT, [{ x: 0, y: 0 }], [{ x: 9, y: 9 }], { width: 0, height: 0 })).toBe(NO_FIT);
  });

  it('never scales past the limits with two fingers', () => {
    const fit = gestureFit(
      NO_FIT,
      [
        { x: -5, y: 0 },
        { x: 5, y: 0 },
      ],
      [
        { x: -500, y: 0 },
        { x: 500, y: 0 },
      ],
      frame,
    );
    expect(fit.scale).toBe(5);
  });

  it('zooms in with the wheel up, around the cursor', () => {
    const bigger = wheelFit(NO_FIT, -100, { x: 0, y: 0 }, frame);
    expect(bigger.scale).toBeGreaterThan(1);
    expect(bigger.x).toBe(0);
    const smaller = wheelFit(NO_FIT, 100, { x: 100, y: 0 }, frame);
    expect(smaller.scale).toBeLessThan(1);
    expect(smaller.x).toBeGreaterThan(0);
  });

  it('nudges with the keyboard', () => {
    expect(keyFit(NO_FIT, 'ArrowRight')).toEqual({ scale: 1, x: 0.02, y: 0 });
    expect(keyFit(NO_FIT, '+')!.scale).toBe(1.04);
    expect(keyFit(NO_FIT, 'x')).toBeNull();
  });
});
