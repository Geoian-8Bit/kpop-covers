import { describe, expect, it } from 'vitest';
import { WAVE_BIG_BYTES, waveBuckets, wavePeaks } from './waveformRules';

describe('wave', () => {
  it('picks about 8 bars a second, fewer for a big file', () => {
    expect(waveBuckets(60, 1000)).toBe(480);
    expect(waveBuckets(5, null)).toBe(120);
    expect(waveBuckets(600, null)).toBe(1200);
    expect(waveBuckets(60, WAVE_BIG_BYTES + 1)).toBe(120);
  });

  it('measures the peak of each bar, normalised to the loudest, across channels', () => {
    const left = new Float32Array([0, 0.1, -0.5, 0.2, 0, 0, 0.25, 0]);
    const right = new Float32Array([0, 0, 0, 0, 0, 0, 0, -0.1]);
    expect(wavePeaks([left, right], 4)).toEqual([0.2, 1, 0, 0.5]);
    expect(wavePeaks([new Float32Array(4)], 2)).toEqual([0, 0]);
    expect(wavePeaks([], 4)).toEqual([]);
  });
});
