import { describe, expect, it } from 'vitest';
import {
  accumulate,
  chooseEngine,
  DEMUCS,
  estimateLag,
  estimateLagSliced,
  estimateRemainingSeconds,
  estimateSeparationRange,
  estimateStemBytes,
  formatBytes,
  formatMinutes,
  formatRange,
  GROUP_STORAGE_BYTES,
  headFrameCount,
  LAG_HEAD_SECONDS,
  MAX_SEPARATE_SECONDS,
  maxSeparateSeconds,
  modelCacheLooksBroken,
  monoHead,
  normalize,
  planSegments,
  progressLabel,
  progressMilestone,
  progressPercent,
  reusablePendingStems,
  smallerStemBitrate,
  spaceVerdict,
  STEM_MAX_BYTES,
  stemBitrate,
  stemFits,
  triangleWeights,
  type DeviceCaps,
} from './separateRules';

describe('planSegments', () => {
  it('covers the whole song with 25 % overlap and no wasted tail segment', () => {
    const total = 240 * DEMUCS.sampleRate;
    const plan = planSegments(total);
    const stride = Math.floor(DEMUCS.segment * 0.75);
    expect(plan[0]).toEqual({ start: 0, length: DEMUCS.segment });
    expect(plan[1]!.start).toBe(stride);
    const last = plan[plan.length - 1]!;
    expect(last.start + last.length).toBe(total);
    expect(plan[plan.length - 2]!.start + DEMUCS.segment).toBeLessThan(total);
    expect(plan.length).toBe(41);
  });

  it('a song shorter than one segment is one short segment; nothing for nothing', () => {
    expect(planSegments(1000)).toEqual([{ start: 0, length: 1000 }]);
    expect(planSegments(0)).toEqual([]);
    expect(planSegments(Number.NaN)).toEqual([]);
  });

  it('every sample is inside some segment', () => {
    const total = 100_003;
    const plan = planSegments(total, 10_000, 0.25);
    const covered = new Uint8Array(total);
    for (const s of plan) covered.fill(1, s.start, s.start + s.length);
    expect(covered.every((c) => c === 1)).toBe(true);
  });
});

describe('overlap-add', () => {
  it('triangle weights never reach zero and peak at the centre', () => {
    const w = triangleWeights(11);
    expect(Math.min(...w)).toBeGreaterThan(0);
    expect(Math.max(...w)).toBeCloseTo(1);
    expect(w[0]).toBeCloseTo(w[10]!);
  });

  it('putting back the same signal from overlapping segments gives the signal (no seams)', () => {
    const total = 50_000;
    const segment = 4000;
    const signal = Float32Array.from({ length: total }, (_, i) => Math.sin(i / 37) * 0.8 + 0.1);
    const out = new Float32Array(total);
    const sum = new Float32Array(total);
    const weights = triangleWeights(segment);
    for (const s of planSegments(total, segment, 0.25)) {
      accumulate(out, sum, signal.subarray(s.start, s.start + s.length), s.start, s.length, weights);
    }
    normalize(out, sum);
    let worst = 0;
    for (let i = 0; i < total; i++) worst = Math.max(worst, Math.abs(out[i]! - signal[i]!));
    expect(worst).toBeLessThan(1e-5);
  });
});

describe('chooseEngine', () => {
  const desktop: DeviceCaps = { webgpu: true, shaderF16: true, deviceMemoryGb: 8, maxBindingBytes: 2 ** 31, mobile: false };

  it('prefers the half-precision model when the GPU can run it', () => {
    expect(chooseEngine(desktop)).toEqual({ kind: 'fp16', mobile: false });
  });

  it('falls back to full precision when there is room for it', () => {
    expect(chooseEngine({ ...desktop, shaderF16: false })).toEqual({ kind: 'fp32', mobile: false });
    expect(chooseEngine({ ...desktop, shaderF16: false, maxBindingBytes: 128 * 1024 * 1024 })).toEqual({
      kind: 'none',
      reason: 'small-gpu',
    });
  });

  it('says why a device can not', () => {
    expect(chooseEngine({ ...desktop, webgpu: false })).toEqual({ kind: 'none', reason: 'no-webgpu' });
    expect(chooseEngine({ ...desktop, deviceMemoryGb: 2 })).toEqual({ kind: 'none', reason: 'low-memory' });
  });

  it('a capable phone can, but is flagged', () => {
    expect(chooseEngine({ ...desktop, mobile: true, deviceMemoryGb: null, maxBindingBytes: null })).toEqual({
      kind: 'fp16',
      mobile: true,
    });
  });
});

describe('time', () => {
  it('estimates a range before starting, longer at full precision and on phones', () => {
    const [a, b] = estimateSeparationRange(240, 'fp16');
    expect(a).toBeLessThan(b);
    expect(estimateSeparationRange(240, 'fp32')[1]).toBeGreaterThan(b);
    expect(estimateSeparationRange(240, 'fp16', true)[1]).toBeGreaterThan(b);
  });

  it('time left leaves out the first (warm-up) segment and follows the recent pace', () => {
    expect(estimateRemainingSeconds([], 10)).toBeNull();
    expect(estimateRemainingSeconds([5000], 10)).toBe(50);
    expect(estimateRemainingSeconds([9000, 1000, 1000], 10)).toBe(10);
    expect(estimateRemainingSeconds([9000, 4000, 1000, 1000, 1000, 1000, 1000], 4)).toBe(4);
    expect(estimateRemainingSeconds([1000], 0)).toBe(0);
  });

  it('formats minutes in Spanish', () => {
    expect(formatMinutes(20)).toBe('menos de 1 min');
    expect(formatMinutes(70)).toBe('1 min');
    expect(formatMinutes(250)).toBe('unos 4 min');
    expect(formatRange([30, 50])).toBe('menos de 1 min');
    expect(formatRange([60, 180])).toBe('entre 1 y 3 min');
    expect(formatRange([100, 140])).toBe('unos 2 min');
  });
});

describe('size of the tracks', () => {
  it('a 4-minute song gives tracks of 3–6 MB each', () => {
    const rate = stemBitrate(240, 'aac')!;
    expect(rate).toBe(160_000);
    const bytes = estimateStemBytes(240, rate);
    expect(bytes).toBeGreaterThan(3 * 1024 * 1024);
    expect(bytes).toBeLessThan(6 * 1024 * 1024);
  });

  it('long songs get a lower bitrate so each track stays under the cap; too long is refused', () => {
    const rate = stemBitrate(15 * 60, 'aac')!;
    expect(rate).toBeLessThan(160_000);
    expect(estimateStemBytes(15 * 60, rate)).toBeLessThanOrEqual(STEM_MAX_BYTES);
    expect(stemBitrate(60 * 60, 'opus')).toBeNull();
  });

  it('checks the space left, keeping the database margin', () => {
    const MiB = 1024 * 1024;
    expect(spaceVerdict(500 * MiB, 10 * MiB)).toEqual({ ok: true, needed: 10 * MiB, free: 524 * MiB });
    expect(spaceVerdict(1000 * MiB, 10 * MiB).ok).toBe(false);
    expect(spaceVerdict(2000 * MiB, 10 * MiB).free).toBe(0);
  });

  it('asks for room for both tracks at the cap plus the 50 MB kept for one take (never half a separation)', () => {
    const MiB = 1024 * 1024;
    const line = GROUP_STORAGE_BYTES - 52_428_800;
    // 33 MiB free above the line used to pass (free ≥ 32 MiB) and leave one track orphaned.
    expect(spaceVerdict(GROUP_STORAGE_BYTES - 33 * MiB, 10 * MiB).ok).toBe(false);
    expect(spaceVerdict(line - 2 * STEM_MAX_BYTES - 1, 10 * MiB).ok).toBe(true);
    expect(spaceVerdict(line - 2 * STEM_MAX_BYTES, 10 * MiB).ok).toBe(false);
  });

  it('a retry reuses the row its earlier try left without tracks, and only that one', () => {
    const row = {
      id: 'r1',
      source_file_name: 'song.mp4',
      source_file_size: 1000,
      model: 'htdemucs-fp16@a4a57cc',
      mime_type: 'audio/mp4',
      delay_seconds: 0.0479,
      vocals_path: null,
      instrumental_path: null,
    };
    const want = { fileName: 'song.mp4', fileSize: 1000, model: 'htdemucs-fp16@a4a57cc', mime: 'audio/mp4', delaySeconds: 0.048 };
    expect(reusablePendingStems([row], want, 'r1')).toBe(row);
    expect(reusablePendingStems([row], want, null)).toBeNull();
    expect(reusablePendingStems([row], want, 'other')).toBeNull();
    expect(reusablePendingStems([{ ...row, vocals_path: 'x', instrumental_path: 'y' }], want, 'r1')).toBeNull();
    expect(reusablePendingStems([row], { ...want, fileSize: 999 }, 'r1')).toBeNull();
    expect(reusablePendingStems([row], { ...want, model: 'htdemucs-fp32@92e33df' }, 'r1')).toBeNull();
    expect(reusablePendingStems([row], { ...want, delaySeconds: 0.06 }, 'r1')).toBeNull();
  });

  it('the longest song to separate depends on the memory', () => {
    expect(MAX_SEPARATE_SECONDS).toBe(600);
    expect(maxSeparateSeconds(null)).toBe(600);
    expect(maxSeparateSeconds(8)).toBe(600);
    expect(maxSeparateSeconds(4)).toBeLessThan(600);
  });

  it('formats sizes in Spanish', () => {
    expect(formatBytes(8.4 * 1024 * 1024)).toBe('8,4 MB');
    expect(formatBytes(126 * 1024 * 1024)).toBe('126 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1,0 GB');
  });
});

describe('estimateLag', () => {
  const noise = (n: number, seed = 1) => {
    let s = seed;
    return Float32Array.from({ length: n }, () => {
      s = (s * 16807) % 2147483647;
      return (s / 2147483647) * 2 - 1;
    });
  };

  it('finds the encoder delay of a shifted copy', () => {
    const ref = noise(48000 * 3);
    for (const delay of [0, 1024, 2112, 311, -40]) {
      const test = new Float32Array(ref.length);
      for (let i = 0; i < ref.length; i++) {
        const j = i - delay;
        test[i] = j >= 0 && j < ref.length ? ref[j]! * 0.9 : 0;
      }
      const lag = estimateLag(ref, test, 7200, 48000);
      expect(lag?.lag).toBe(delay);
      expect(lag!.confidence).toBeGreaterThan(0.9);
    }
  });

  it('in slices (global review 2 [3]): the same answer, with the thread given back between them', async () => {
    const ref = noise(48000 * 3, 5);
    const test = new Float32Array(ref.length);
    for (let i = 2112; i < ref.length; i++) test[i] = ref[i - 2112]! * 0.8;
    let pauses = 0;
    const sliced = await estimateLagSliced(ref, test, 7200, 48000, async () => void pauses++, 400);
    expect(sliced).toEqual(estimateLag(ref, test, 7200, 48000));
    expect(sliced?.lag).toBe(2112);
    // 2 × 1800 + 1 coarse lags in slices of 400: 9 pauses.
    expect(pauses).toBe(9);
    expect(await estimateLagSliced(noise(100), noise(100), 50, 40, async () => void pauses++)).toBeNull();
  });

  it('is unsure about unrelated signals and refuses too-short ones', () => {
    const lag = estimateLag(noise(48000 * 3, 3), noise(48000 * 3, 7), 2000, 24000);
    expect(lag!.confidence).toBeLessThan(0.2);
    expect(estimateLag(noise(100), noise(100), 50, 40)).toBeNull();
  });
});

describe('progress copy', () => {
  it('says what is happening, with the time left while separating', () => {
    expect(progressLabel({ phase: 'model', loaded: 63, total: 126 })).toBe('Bajando el modelo de IA: 50 %');
    expect(progressLabel({ phase: 'separate', done: 10, total: 40, etaSeconds: 150 })).toBe(
      'Separando la voz: 25 % · quedan unos 3 min',
    );
    expect(progressLabel({ phase: 'separate', done: 0, total: 40, etaSeconds: null })).toBe(
      'Separando la voz: 0 % · calculando el tiempo',
    );
    expect(progressLabel({ phase: 'separate', done: 39, total: 40, etaSeconds: 5 })).toContain('quedan menos de 1 min');
    expect(progressPercent({ phase: 'encode' })).toBeNull();
  });

  it('announces only every 25 %', () => {
    expect(progressMilestone({ phase: 'separate', done: 11, total: 40, etaSeconds: 9 })).toBe('Separando la voz: 25 %');
    expect(progressMilestone({ phase: 'separate', done: 13, total: 40, etaSeconds: 7 })).toBe('Separando la voz: 25 %');
    expect(progressMilestone({ phase: 'upload' })).toBe('Subiendo las pistas a la nube del grupo…');
  });
});

describe('modelCacheLooksBroken', () => {
  it('forgets the cached model only when its files cannot be read or do not fit', () => {
    expect(modelCacheLooksBroken('manifest')).toBe(true);
    expect(modelCacheLooksBroken('Failed to load model because protobuf parsing failed.')).toBe(true);
    expect(modelCacheLooksBroken("Can't create a session. invalid model")).toBe(true);
    expect(modelCacheLooksBroken('outputs')).toBe(true);
    expect(modelCacheLooksBroken('missing /encoder/Add_output_0')).toBe(true);
  });
  it('keeps it when the GPU is what failed', () => {
    expect(modelCacheLooksBroken('WebGPU device lost: out of memory')).toBe(false);
    expect(modelCacheLooksBroken('Failed to create session: GPU buffer allocation failed')).toBe(false);
    expect(modelCacheLooksBroken('Could not find an implementation for operator ScatterND (kernel not found)')).toBe(false);
    expect(modelCacheLooksBroken('')).toBe(false);
  });
});

describe('global review [5] · the delay measured on the start only', () => {
  const noise = (n: number, seed = 1) => {
    let x = seed;
    return Float32Array.from({ length: n }, () => {
      x = (x * 16807) % 2147483647;
      return (x / 2147483647) * 2 - 1;
    });
  };

  it('mixes only the first seconds to mono', () => {
    const left = Float32Array.from([1, 1, 0, 4]);
    const right = Float32Array.from([0, 1, 2, 4]);
    expect([...monoHead(left, right, 3)]).toEqual([0.5, 1, 1]);
    expect(monoHead(left, right, 99).length).toBe(4);
    expect(monoHead(left, right, -1).length).toBe(0);
  });

  it('counts the frames that cover the start', () => {
    expect(headFrameCount([1024, 1024, 1024, 1024], 2048)).toBe(2);
    expect(headFrameCount([1024, 1024, 1024, 1024], 2049)).toBe(3);
    expect(headFrameCount([1024, 1024], 1e9)).toBe(2);
    expect(headFrameCount([], 10)).toBe(0);
  });

  it('the start of a long track gives the same delay as the whole track', () => {
    const rate = 48000;
    const whole = noise(rate * 40, 5);
    const delay = 2112;
    const late = new Float32Array(whole.length);
    for (let i = delay; i < whole.length; i++) late[i] = whole[i - delay]! * 0.8;
    const maxLag = Math.round(rate * 0.15);
    const head = 10 * rate + 2 * maxLag;
    const fromHead = estimateLag(monoHead(whole, whole, head), monoHead(late, late, head), maxLag, rate);
    expect(fromHead?.lag).toBe(delay);
    expect(LAG_HEAD_SECONDS).toBeLessThanOrEqual(45);
  });
});

describe('global review BD [3] · a track over 16 MiB is never uploaded', () => {
  it('fits up to the cap', () => {
    expect(stemFits(STEM_MAX_BYTES)).toBe(true);
    expect(stemFits(STEM_MAX_BYTES + 1)).toBe(false);
    expect(stemFits(0)).toBe(false);
  });

  it('encodes again with less bitrate, under the cap with room', () => {
    const next = smallerStemBitrate(160_000, STEM_MAX_BYTES * 1.05)!;
    expect(next).toBeLessThan(160_000);
    expect(next % 1000).toBe(0);
    // The same song at the new rate lands under the cap.
    expect((STEM_MAX_BYTES * 1.05 * next) / 160_000).toBeLessThan(STEM_MAX_BYTES);
    // Always lower, even when only a byte over.
    expect(smallerStemBitrate(160_000, STEM_MAX_BYTES + 1)!).toBeLessThanOrEqual(144_000);
  });

  it('gives up under the floor', () => {
    expect(smallerStemBitrate(64_000, STEM_MAX_BYTES * 2)).toBeNull();
    expect(smallerStemBitrate(160_000, 0)).toBeNull();
  });
});

describe('global review [6] · the separation waits for the copy for the group', () => {
  it('says so', () => {
    expect(progressLabel({ phase: 'wait-copy' })).toBe('Esperando a que acabe la copia para el grupo…');
    expect(progressPercent({ phase: 'wait-copy' })).toBeNull();
  });
});
