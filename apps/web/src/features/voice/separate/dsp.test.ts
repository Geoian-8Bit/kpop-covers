import { describe, expect, it } from 'vitest';
import { demucsIspecAdd, demucsSpec, DEMUCS_SPEC, fft, reflectPad, specShape, twoStems, type SpecConfig } from './dsp';

const tone = (n: number, seed = 0) =>
  Float32Array.from({ length: n }, (_, i) => 0.5 * Math.sin(i / (7 + seed)) + 0.3 * Math.sin(i / (2.3 + seed)) + 0.05);

function worstDiff(a: ArrayLike<number>, b: ArrayLike<number>, from: number, to: number) {
  let worst = 0;
  for (let i = from; i < to; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
  return worst;
}

describe('fft', () => {
  it('matches a plain DFT and inverts', () => {
    const n = 16;
    const x = Float64Array.from({ length: n }, (_, i) => Math.cos(i) + i / 10);
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    fft(re, im);
    for (let k = 0; k < n; k++) {
      let r = 0;
      let j = 0;
      for (let t = 0; t < n; t++) {
        r += x[t]! * Math.cos((-2 * Math.PI * k * t) / n);
        j += x[t]! * Math.sin((-2 * Math.PI * k * t) / n);
      }
      expect(re[k]).toBeCloseTo(r, 9);
      expect(im[k]).toBeCloseTo(j, 9);
    }
    fft(re, im, true);
    for (let t = 0; t < n; t++) expect(re[t]).toBeCloseTo(x[t]!, 9);
  });
});

describe('reflectPad', () => {
  it('mirrors without repeating the edge (numpy reflect)', () => {
    expect(Array.from(reflectPad(Float32Array.from([1, 2, 3, 4]), 2, 3))).toEqual([3, 2, 1, 2, 3, 4, 3, 2, 1]);
  });
});

describe('Demucs spectrogram', () => {
  const small: SpecConfig = { nfft: 64, hop: 16, segment: 1000 };

  it('has the model\'s shape', () => {
    expect(specShape(DEMUCS_SPEC)).toEqual({ bins: 2048, frames: 336 });
    expect(demucsSpec(tone(1000), tone(1000, 1), small).length).toBe(4 * 32 * 63);
  });

  it('the inverse gives the segment back away from its edges (offsets and scaling line up)', () => {
    const left = tone(small.segment);
    const right = tone(small.segment, 2);
    const spec = demucsSpec(left, right, small);
    const outL = new Float32Array(small.segment);
    const outR = new Float32Array(small.segment);
    demucsIspecAdd(spec, outL, outR, small);
    expect(worstDiff(outL, left, small.nfft, small.segment - small.nfft)).toBeLessThan(1e-4);
    expect(worstDiff(outR, right, small.nfft, small.segment - small.nfft)).toBeLessThan(1e-4);
  });

  it('keeps left and right apart (one complex FFT carries both)', () => {
    const left = tone(small.segment);
    const silent = new Float32Array(small.segment);
    const spec = demucsSpec(left, silent, small);
    const outL = new Float32Array(small.segment);
    const outR = new Float32Array(small.segment);
    demucsIspecAdd(spec, outL, outR, small);
    expect(worstDiff(outR, silent, 0, small.segment)).toBeLessThan(1e-4);
  });

  it('works at the model\'s real size', () => {
    const n = DEMUCS_SPEC.segment;
    const left = tone(n);
    const right = tone(n, 3);
    const spec = demucsSpec(left, right);
    const outL = new Float32Array(n);
    const outR = new Float32Array(n);
    demucsIspecAdd(spec, outL, outR);
    expect(worstDiff(outL, left, 4096, n - 4096)).toBeLessThan(1e-4);
    expect(worstDiff(outR, right, 4096, n - 4096)).toBeLessThan(1e-4);
  });

  it('two stems: the voice source goes to the voice, the other three add up to the instrumental', () => {
    const cfg = small;
    const { bins, frames } = specShape(cfg);
    const specSize = 4 * bins * frames;
    const voice = tone(cfg.segment);
    const drums = tone(cfg.segment, 4);
    const x = new Float32Array(4 * specSize);
    x.set(demucsSpec(voice, voice, cfg), 3 * specSize);
    x.set(demucsSpec(drums, drums, cfg), 0);
    const xt = new Float32Array(4 * 2 * cfg.segment);
    // Time branch: 0.1 on «bass» (source 1), left channel.
    xt.fill(0.1, 1 * 2 * cfg.segment, 1 * 2 * cfg.segment + cfg.segment);
    const { vocals, instrumental } = twoStems(x, xt, cfg);
    expect(worstDiff(vocals[0], voice, cfg.nfft, cfg.segment - cfg.nfft)).toBeLessThan(1e-4);
    const expectedLeft = drums.map((v) => v + 0.1);
    expect(worstDiff(instrumental[0], expectedLeft, cfg.nfft, cfg.segment - cfg.nfft)).toBeLessThan(1e-4);
    expect(worstDiff(instrumental[1], drums, cfg.nfft, cfg.segment - cfg.nfft)).toBeLessThan(1e-4);
  });
});
