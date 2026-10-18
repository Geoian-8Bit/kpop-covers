import { describe, expect, it } from 'vitest';
import { bandPath, crestXs, linePath, sineWave, trochoidWave } from './waveRules';

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
