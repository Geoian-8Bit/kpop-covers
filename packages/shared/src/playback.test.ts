import { describe, expect, it } from 'vitest';
import { clampSpeed, formatSpeed, normalizeRange, shouldWrap, stepSpeed } from './playback';

describe('speed helpers', () => {
  it('clamps and snaps to 0.05 steps', () => {
    expect(clampSpeed(0.6)).toBe(0.6);
    expect(clampSpeed(0.62)).toBe(0.6);
    expect(clampSpeed(0.1)).toBe(0.25);
    expect(clampSpeed(3)).toBe(2);
    expect(clampSpeed(Number.NaN)).toBe(1);
  });

  it('steps without float drift', () => {
    expect(stepSpeed(0.75, 1)).toBe(0.8);
    expect(stepSpeed(0.25, -1)).toBe(0.25);
    expect(stepSpeed(2, 1)).toBe(2);
    let v = 1;
    for (let i = 0; i < 8; i++) v = stepSpeed(v, -1);
    expect(v).toBe(0.6);
  });

  it('formats speed', () => {
    expect(formatSpeed(0.75)).toBe('0,75×');
    expect(formatSpeed(1)).toBe('1×');
  });
});

describe('normalizeRange', () => {
  it('orders marks', () => {
    expect(normalizeRange(30, 10, 100)).toEqual({ start: 10, end: 30 });
  });

  it('clamps to the media duration', () => {
    expect(normalizeRange(-5, 120, 100)).toEqual({ start: 0, end: 100 });
  });

  it('enforces a minimum length', () => {
    expect(normalizeRange(50, 50, 100)).toEqual({ start: 50, end: 50.2 });
    expect(normalizeRange(100, 100, 100)).toEqual({ start: 99.8, end: 100 });
  });

  it('returns null for unusable media', () => {
    expect(normalizeRange(0, 1, 0)).toBeNull();
    expect(normalizeRange(0, 1, Number.NaN)).toBeNull();
  });
});

describe('shouldWrap', () => {
  it('detects loop end', () => {
    expect(shouldWrap(9.5, { start: 5, end: 10 })).toBe(false);
    expect(shouldWrap(9.99, { start: 5, end: 10 })).toBe(true);
    expect(shouldWrap(11, { start: 5, end: 10 })).toBe(true);
  });
});
