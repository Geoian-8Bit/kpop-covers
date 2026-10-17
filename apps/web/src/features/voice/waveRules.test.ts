import { describe, expect, it } from 'vitest';
import {
  bandPath,
  crestXs,
  envelopeFromChannels,
  envelopePaths,
  linePath,
  normalise,
  percentile,
  playheadFraction,
  sineWave,
  smooth,
  syntheticEnvelope,
  trochoidWave,
} from './waveRules';

describe('periodic waves', () => {
  it('sineWave repeats exactly every period (the strip slides by one period without a jump)', () => {
    const wave = sineWave(160, 30, [
      { amp: 8, cycles: 1 },
      { amp: 3, cycles: 2, phase: 1.1 },
      { amp: 1, cycles: 2.6 }, // rounded to a whole number of cycles
    ]);
    for (const x of [0, 13, 57.5, 120]) expect(wave(x + 160)).toBeCloseTo(wave(x), 6);
  });

  it('trochoidWave repeats, peaks at half the period and has a sharper crest than its trough', () => {
    const period = 200;
    const wave = trochoidWave(period, 40, 10, 0.6);
    for (const x of [0, 33, 99, 150]) expect(wave(x + period)).toBeCloseTo(wave(x), 6);
    expect(wave(period / 2)).toBeCloseTo(30, 1); // crest: base − amp (y grows downwards)
    expect(wave(0)).toBeCloseTo(50, 1);
    // Sharp crest: 10 px from the crest the water has already dropped more than 10 px from the trough rises.
    const nearCrest = wave(period / 2 + 10) - wave(period / 2);
    const nearTrough = wave(0) - wave(10);
    expect(nearCrest).toBeGreaterThan(nearTrough);
  });

  it('crestXs lists the crests inside the strip', () => {
    expect(crestXs(100, 320)).toEqual([50, 150, 250]);
  });

  it('bandPath and linePath cover the whole width and close the band', () => {
    const top = sineWave(100, 20, [{ amp: 5, cycles: 1 }]);
    const band = bandPath(top, 60, 300, 10);
    expect(band.startsWith('M0 ')).toBe(true);
    expect(band).toContain('L300 60');
    expect(band.endsWith('Z')).toBe(true);
    const line = linePath(top, 300, 10);
    expect(line.startsWith('M0 ')).toBe(true);
    expect(line).toContain('L300 ');
    expect(line).not.toContain('NaN');
  });
});

describe('series helpers', () => {
  it('percentile, normalise and smooth', () => {
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([5, 1, 3], 0.5)).toBe(3);
    expect(normalise([0, 0, 0])).toEqual([0, 0, 0]);
    const n = normalise([0, 1, 2, 4]);
    expect(Math.max(...n)).toBe(1);
    expect(n[0]).toBe(0);
    expect(smooth([0, 3, 0], 1)).toEqual([1.5, 1, 1.5]);
    expect(smooth([1, 2], 0)).toEqual([1, 2]);
  });
});

describe('envelopeFromChannels', () => {
  const rate = 8000;
  const seconds = 4;
  const length = rate * seconds;

  /** Voice-like tone in the centre during the first half; a panned guitar-like tone all along. */
  function song(mono: boolean) {
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const voice = i < length / 2 ? 0.5 * Math.sin(2 * Math.PI * 440 * t) : 0;
      const guitar = 0.3 * Math.sin(2 * Math.PI * 660 * t);
      left[i] = voice + (mono ? guitar / 2 : guitar);
      right[i] = voice + (mono ? guitar / 2 : 0);
    }
    return { left, right };
  }

  it('finds the voice in the centre where it sings, and the music on the sides all along', () => {
    const { left, right } = song(false);
    const env = envelopeFromChannels(left, right, rate, 40);
    expect(env.mid).toHaveLength(40);
    expect(env.side).toHaveLength(40);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // The guitar is panned left, so it also lives a bit in the mid: the voice half must still be clearly louder.
    expect(avg(env.mid.slice(2, 18))).toBeGreaterThan(avg(env.mid.slice(22, 38)) * 1.5);
    expect(avg(env.side.slice(2, 18))).toBeGreaterThan(0.6);
    expect(avg(env.side.slice(22, 38))).toBeGreaterThan(0.6);
  });

  it('a mono song has no sides to show', () => {
    const { left, right } = song(true);
    const env = envelopeFromChannels(left, right, rate, 40);
    expect(Math.max(...env.side)).toBe(0);
    expect(Math.max(...env.mid)).toBeGreaterThan(0.5);
  });

  it('empty input gives an empty envelope', () => {
    expect(envelopeFromChannels(new Float32Array(0), new Float32Array(0), rate)).toEqual({
      mid: [],
      side: [],
    });
  });
});

describe('syntheticEnvelope', () => {
  it('is deterministic per seed and stays within 0…1', () => {
    const a = syntheticEnvelope('demo', 120);
    expect(syntheticEnvelope('demo', 120)).toEqual(a);
    expect(syntheticEnvelope('other', 120)).not.toEqual(a);
    for (const v of [...a.mid, ...a.side]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // The voice has gaps between phrases; the music never goes fully silent.
    expect(Math.min(...a.mid)).toBeLessThan(0.15);
    expect(Math.min(...a.side)).toBeGreaterThan(0);
  });
});

describe('envelopePaths', () => {
  const layout = { width: 1000, height: 80, floor: 6, bodyRange: 30, crestRange: 30 };

  it('draws the crest above the body and spans the whole width', () => {
    const paths = envelopePaths({ mid: [0, 1, 0.5], side: [0.5, 0.5, 0.5] }, layout);
    for (const d of Object.values(paths)) {
      expect(d.startsWith('M0 ')).toBe(true);
      expect(d).not.toContain('NaN');
    }
    expect(paths.body).toContain('L1000 80L0 80Z');
    // At x = 0 the surface is at 80 − 6 − 15 = 59 and the crest one unit above it (no voice there).
    expect(paths.surface.startsWith('M0 59')).toBe(true);
    expect(paths.crestTop.startsWith('M0 58')).toBe(true);
  });

  it('falls back to a flat sea without data', () => {
    const paths = envelopePaths({ mid: [], side: [] }, layout);
    expect(paths.surface).toBe('M0 74L1000 74');
  });
});

describe('playheadFraction', () => {
  it('is 0…1, and 0 while the duration is unknown', () => {
    expect(playheadFraction(5, 10)).toBe(0.5);
    expect(playheadFraction(12, 10)).toBe(1);
    expect(playheadFraction(-1, 10)).toBe(0);
    expect(playheadFraction(3, 0)).toBe(0);
    expect(playheadFraction(Number.NaN, 10)).toBe(0);
  });
});
