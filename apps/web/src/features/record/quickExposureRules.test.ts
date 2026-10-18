import { describe, expect, it } from 'vitest';
import {
  exposureFromDrag,
  formatExposure,
  placeQuickBar,
  QUICK_BAR_HEIGHT,
  QUICK_BAR_WIDTH,
  QUICK_LABEL_ROOM,
  QUICK_TRACK,
  snapExposure,
  sunOffset,
  type Box,
} from './quickExposureRules';

const PHONE: Box = { left: 0, top: 0, width: 390, height: 844 };
const EV = { min: -2, max: 2, step: 0.1 };

const overlaps = (a: Box, b: Box) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
const inside = (a: Box, b: Box) =>
  a.left >= b.left && a.top >= b.top && a.left + a.width <= b.left + b.width && a.top + a.height <= b.top + b.height;

describe('P49 · where the quick light bar goes', () => {
  it('beside the ring, to its right, centred on the tap', () => {
    const b = placeQuickBar(150, 400, PHONE, []);
    expect(b.left).toBeGreaterThan(150 + 38);
    expect(b.top + b.height / 2).toBeCloseTo(400);
    expect(b.width).toBe(QUICK_BAR_WIDTH);
    expect(b.height).toBe(QUICK_BAR_HEIGHT);
  });

  it('to the left of the ring near the right edge, never off screen', () => {
    const b = placeQuickBar(370, 400, PHONE, []);
    expect(b.left + b.width).toBeLessThan(370 - 38);
    expect(inside(b, PHONE)).toBe(true);
    const top = placeQuickBar(200, 10, PHONE, []);
    expect(inside(top, PHONE)).toBe(true);
  });

  it('never over a button: the tools rail on the right, the shutter row below', () => {
    const rail: Box[] = [0, 1, 2, 3].map((i) => ({ left: 336, top: 120 + i * 64, width: 44, height: 56 }));
    const shutter: Box = { left: 0, top: 690, width: 390, height: 154 };
    const obstacles = [...rail, shutter];
    for (const [x, y] of [
      [290, 200],
      [300, 650],
      [80, 640],
      [200, 420],
    ] as const) {
      const b = placeQuickBar(x, y, PHONE, obstacles);
      expect(obstacles.some((o) => overlaps(b, o)), `${x},${y}`).toBe(false);
      expect(inside(b, PHONE)).toBe(true);
    }
  });

  it('when every place covers something, the one covering least', () => {
    const wall: Box = { left: 0, top: 0, width: 390, height: 844 };
    const b = placeQuickBar(200, 400, PHONE, [wall]);
    expect(inside(b, PHONE)).toBe(true);
  });
});

describe('P49 · what a drag gives', () => {
  it('up is brighter; the whole track is the whole range; relative to where it was', () => {
    expect(exposureFromDrag(0, -QUICK_TRACK / 2, EV)).toBe(2);
    expect(exposureFromDrag(0, QUICK_TRACK / 2, EV)).toBe(-2);
    expect(exposureFromDrag(0.5, 0, EV)).toBe(0.5);
    expect(exposureFromDrag(0, -QUICK_TRACK / 8, EV)).toBe(0.5);
  });

  it('stays inside the range and on the camera steps', () => {
    expect(exposureFromDrag(1.5, -500, EV)).toBe(2);
    expect(exposureFromDrag(-1.5, 500, EV)).toBe(-2);
    expect(exposureFromDrag(0, -3, EV)).toBe(0.1);
    expect(snapExposure(0.333, { min: -2, max: 2, step: 1 / 3 })).toBeCloseTo(1 / 3, 3);
    expect(snapExposure(0.04, EV)).toBe(0);
    expect(Object.is(snapExposure(-0.04, EV), -0)).toBe(false);
    // A camera with no step: any value inside the range.
    expect(snapExposure(0.37, { min: -2, max: 2 })).toBe(0.37);
  });

  it('the sun sits at the top for the brightest, at the bottom for the darkest', () => {
    expect(sunOffset(2, EV)).toBe(0);
    expect(sunOffset(-2, EV)).toBe(QUICK_TRACK);
    expect(sunOffset(0, EV)).toBe(QUICK_TRACK / 2);
    expect(sunOffset(9, EV)).toBe(0);
  });

  it('writes the value as the panel does', () => {
    expect(formatExposure(0)).toBe('0');
    expect(formatExposure(0.7)).toBe('+0,7');
    expect(formatExposure(-1)).toBe('−1');
    expect(formatExposure(0.04)).toBe('0');
  });
});

describe('the quick bar and the screen edge (ronda 2 · review)', () => {
  it('leaves room above for its number, inside the given (safe) bounds', () => {
    const safe: Box = { left: 0, top: 47, width: 390, height: 763 };
    const b = placeQuickBar(200, 50, safe, []);
    expect(b.top).toBeGreaterThanOrEqual(47 + QUICK_LABEL_ROOM);
    expect(b.top + b.height).toBeLessThanOrEqual(47 + 763);
  });
});
