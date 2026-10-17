import { describe, expect, it } from 'vitest';
import { bestLag, measureShift, monoWindow, onsetEnvelope } from './audioAlign';

const RATE = 8000;

/** A deterministic «song»: noisy beats with different strengths over a quiet bed. */
function song(seconds: number, seed = 7): Float32Array {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31 - 0.5;
  };
  const out = new Float32Array(Math.round(seconds * RATE));
  let nextBeat = 0;
  let gain = 0;
  for (let i = 0; i < out.length; i++) {
    if (i >= nextBeat) {
      gain = 0.3 + Math.abs(rand()) * 1.4;
      nextBeat = i + Math.round(RATE * (0.18 + Math.abs(rand()) * 0.35));
    }
    gain *= 0.9993;
    out[i] = rand() * gain + rand() * 0.02;
  }
  return out;
}

/** The copy: the same sound `lag` samples late (negative: early), a bit quieter, with some noise. */
function shifted(x: Float32Array, lag: number, seed = 3): Float32Array {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31 - 0.5;
  };
  const out = new Float32Array(x.length);
  for (let i = 0; i < out.length; i++) {
    const j = i - lag;
    out[i] = (j >= 0 && j < x.length ? x[j]! * 0.8 : 0) + rand() * 0.01;
  }
  return out;
}

describe('measureShift', () => {
  const original = song(12);

  it('finds a copy that starts late, to the sample', () => {
    const m = measureShift([original], [shifted(original, 170)], RATE, { windowSeconds: 10 })!;
    expect(Math.round(m.seconds * RATE)).toBe(170);
    expect(m.confidence).toBeGreaterThan(0.8);
  });

  it('finds a copy that starts early', () => {
    const m = measureShift([original], [shifted(original, -45)], RATE, { windowSeconds: 10 })!;
    expect(Math.round(m.seconds * RATE)).toBe(-45);
  });

  it('says 0 for the same start', () => {
    const m = measureShift([original, original], [shifted(original, 0), shifted(original, 0, 9)], RATE, { windowSeconds: 10 })!;
    expect(Math.round(m.seconds * RATE)).toBe(0);
  });

  it('finds a big shift (a lost start of a quarter of a second)', () => {
    const m = measureShift([original], [shifted(original, 2000)], RATE, { windowSeconds: 10 })!;
    expect(Math.round(m.seconds * RATE)).toBe(2000);
  });

  it('gives up on silence or something too short', () => {
    expect(measureShift([new Float32Array(RATE * 5)], [new Float32Array(RATE * 5)], RATE)).toBeNull();
    expect(measureShift([original.subarray(0, 100)], [original.subarray(0, 100)], RATE)).toBeNull();
  });
});

describe('helpers', () => {
  it('mixes two channels and pads with zeros', () => {
    const w = monoWindow([new Float32Array([1, 1, 1]), new Float32Array([0, 1, 3])], 1, 4);
    expect(Array.from(w)).toEqual([1, 2, 0, 0]);
  });

  it('marks where the sound gets louder', () => {
    const x = new Float32Array(40);
    x.fill(0.5, 20);
    const env = onsetEnvelope(x, 10);
    expect(env[2]).toBeGreaterThan(0);
    expect(env[3]).toBe(0);
  });

  it('correlates at the right lag', () => {
    const a = new Float32Array([0, 1, 0, -1, 2, 0]);
    const b = new Float32Array([0, 0, 0, 1, 0, -1, 2, 0]);
    expect(bestLag(a, b, -3, 3).lag).toBe(2);
  });
});
