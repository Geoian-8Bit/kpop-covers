import { describe, expect, it } from 'vitest';
import {
  demucsIspecAdd,
  demucsSpec,
  DEMUCS_SPEC,
  energyDb,
  fft,
  reclaimResidual,
  RESIDUAL_FLOOR,
  reflectPad,
  specShape,
  twoStems,
  type SpecConfig,
} from './dsp';
import { DEMUCS } from './separateRules';

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

describe('instrumental: what the sources left out (point 46)', () => {
  const cfg: SpecConfig = { nfft: 64, hop: 16, segment: 1024 };
  const { bins, frames } = specShape(cfg);
  const specSize = 4 * bins * frames;
  /** A sine centred on FFT bin `bin` (so its energy stays in a couple of bins). */
  const sine = (bin: number, amp: number) =>
    Float32Array.from({ length: cfg.segment }, (_, i) => amp * Math.sin((2 * Math.PI * bin * i) / cfg.nfft));
  const add = (a: Float32Array, b: Float32Array) => a.map((v, i) => v + b[i]!);
  const half = (a: Float32Array) => a.map((v) => v / 2);
  const voice = sine(4, 0.4);
  const music = sine(12, 0.3);
  const from = cfg.nfft;
  const to = cfg.segment - cfg.nfft;
  const both = (signal: Float32Array, withSpec = false) => ({
    left: signal,
    right: signal,
    spec: withSpec ? demucsSpec(signal, signal, cfg) : undefined,
  });

  /**
   * Model outputs: on the frequency branch `voiceOut` on «vocals» (source 3) and `musicOut` on «other» (source 2);
   * `voiceTime` on the time branch of «vocals», both channels.
   */
  function model(voiceOut: Float32Array | null, musicOut: Float32Array, voiceTime?: Float32Array) {
    const x = new Float32Array(4 * specSize);
    if (voiceOut) x.set(demucsSpec(voiceOut, voiceOut, cfg), 3 * specSize);
    x.set(demucsSpec(musicOut, musicOut, cfg), 2 * specSize);
    const xt = new Float32Array(4 * 2 * cfg.segment);
    if (voiceTime) {
      xt.set(voiceTime, 3 * 2 * cfg.segment);
      xt.set(voiceTime, 3 * 2 * cfg.segment + cfg.segment);
    }
    return { x, xt };
  }

  it('changes nothing when the sources already add up to the mix', () => {
    const { x, xt } = model(voice, music);
    const plain = twoStems(x, xt, cfg);
    const mix = { left: add(plain.vocals[0], plain.instrumental[0]), right: add(plain.vocals[1], plain.instrumental[1]) };
    const stats = { mix: 0, residual: 0, reclaimed: 0 };
    const filled = twoStems(x, xt, cfg, mix, stats);
    expect(worstDiff(filled.instrumental[0], plain.instrumental[0], 0, cfg.segment)).toBeLessThan(1e-5);
    expect(worstDiff(filled.vocals[0], plain.vocals[0], 0, cfg.segment)).toBe(0);
    // Under the floor: nothing is reclaimed (and no spectrogram is computed).
    expect(stats.residual).toBeLessThan(stats.mix * RESIDUAL_FLOOR);
    expect(stats.reclaimed).toBe(0);
  });

  it('gives the music back when the model took only half of it', () => {
    const { x, xt } = model(voice, half(music));
    const mix = add(voice, music);
    const plain = twoStems(x, xt, cfg);
    expect(worstDiff(plain.instrumental[0], music, from, to)).toBeGreaterThan(0.1);
    for (const withSpec of [false, true]) {
      const stats = { mix: 0, residual: 0, reclaimed: 0 };
      const filled = twoStems(x, xt, cfg, both(mix, withSpec), stats);
      expect(worstDiff(filled.instrumental[0], music, from, to)).toBeLessThan(2e-3);
      expect(worstDiff(filled.instrumental[1], music, from, to)).toBeLessThan(2e-3);
      // The voice track is left as the model made it.
      expect(worstDiff(filled.vocals[0], plain.vocals[0], 0, cfg.segment)).toBe(0);
      // A quarter of the music's energy was missing, and nearly all of it came back.
      expect(energyDb(stats.residual, stats.mix)).toBeLessThan(-5);
      expect(stats.reclaimed / stats.residual).toBeGreaterThan(0.95);
    }
  });

  it('keeps the voice the model missed out of the music (unlike mix − voice)', () => {
    const { x, xt } = model(half(voice), music);
    const mix = add(voice, music);
    const filled = twoStems(x, xt, cfg, both(mix));
    expect(worstDiff(filled.instrumental[0], music, from, to)).toBeLessThan(2e-3);
    const minus = mix.map((v, i) => v - filled.vocals[0][i]!);
    expect(worstDiff(minus, music, from, to)).toBeGreaterThan(0.1);
  });

  it('also when the model put the voice on its time branch only', () => {
    // Nothing of the voice in the frequency branch: the weights must come from the final tracks.
    const { x, xt } = model(null, music, half(voice));
    const mix = add(voice, music);
    const plain = twoStems(x, xt, cfg);
    expect(worstDiff(plain.vocals[0], half(voice), 0, cfg.segment)).toBeLessThan(1e-6);
    const filled = twoStems(x, xt, cfg, both(mix, true));
    expect(worstDiff(filled.instrumental[0], music, from, to)).toBeLessThan(2e-3);
    expect(worstDiff(filled.instrumental[1], music, from, to)).toBeLessThan(2e-3);
  });

  it('what neither track claims goes to the music', () => {
    const silent = new Float32Array(cfg.segment);
    const vocals = [new Float32Array(cfg.segment), new Float32Array(cfg.segment)] as [Float32Array, Float32Array];
    const instrumental = [new Float32Array(cfg.segment), new Float32Array(cfg.segment)] as [Float32Array, Float32Array];
    reclaimResidual({ left: music, right: silent }, vocals, instrumental, cfg);
    expect(worstDiff(instrumental[0], music, from, to)).toBeLessThan(1e-4);
    expect(worstDiff(instrumental[1], silent, 0, cfg.segment)).toBeLessThan(1e-4);
    expect(worstDiff(vocals[0], silent, 0, cfg.segment)).toBe(0);
  });

  it('energyDb', () => {
    expect(energyDb(1, 100)).toBeCloseTo(-20, 9);
    expect(energyDb(0, 100)).toBe(Number.NEGATIVE_INFINITY);
    expect(energyDb(1, 0)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('reused buffers', () => {
  it('a spectrogram into a given buffer is the same, and fully rewritten each time', () => {
    const cfg: SpecConfig = { nfft: 64, hop: 16, segment: 1000 };
    const a = tone(cfg.segment);
    const b = tone(cfg.segment, 5);
    const out = new Float32Array(demucsSpec(a, b, cfg).length).fill(9);
    expect(demucsSpec(a, b, cfg, out)).toBe(out);
    expect(Array.from(out)).toEqual(Array.from(demucsSpec(a, b, cfg)));
    demucsSpec(b, a, cfg, out);
    expect(Array.from(out)).toEqual(Array.from(demucsSpec(b, a, cfg)));
  });

  it('the inverse gives the same result on its second call (accumulators cleared)', () => {
    const cfg: SpecConfig = { nfft: 64, hop: 16, segment: 1000 };
    const spec = demucsSpec(tone(cfg.segment), tone(cfg.segment, 1), cfg);
    const first = [new Float32Array(cfg.segment), new Float32Array(cfg.segment)] as const;
    const second = [new Float32Array(cfg.segment), new Float32Array(cfg.segment)] as const;
    demucsIspecAdd(spec, first[0], first[1], cfg);
    demucsIspecAdd(spec, second[0], second[1], cfg);
    expect(Array.from(second[0])).toEqual(Array.from(first[0]));
    expect(Array.from(second[1])).toEqual(Array.from(first[1]));
  });
});

describe('segment edges', () => {
  it('the inverse is quieter at a segment edge and whole from nfft/2 in: the worker leads the song by that much', () => {
    const cfg: SpecConfig = { nfft: 64, hop: 16, segment: 1024 };
    const flat = new Float32Array(cfg.segment).fill(1);
    const out = [new Float32Array(cfg.segment), new Float32Array(cfg.segment)] as const;
    demucsIspecAdd(demucsSpec(flat, flat, cfg), out[0], out[1], cfg);
    expect(out[0][0]).toBeLessThan(0.6);
    expect(worstDiff(out[0], flat, cfg.nfft / 2, cfg.segment - cfg.nfft / 2)).toBeLessThan(1e-3);
    expect(DEMUCS.lead).toBe(DEMUCS.nfft / 2);
  });
});
