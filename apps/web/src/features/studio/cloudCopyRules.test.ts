import { describe, expect, it } from 'vitest';
import {
  acceptableBytes,
  avcLevel,
  CLOUD_SPACE,
  cloudDecision,
  COPY,
  copyEncoding,
  copyHoldText,
  copyPace,
  estimateCopySeconds,
  etaSeconds,
  formatEta,
  formatMaxLength,
  maxCopySeconds,
  maxOriginalBytes,
  neededVideoBps,
  overshooting,
  projectBytes,
  retryVideoBps,
  sameLength,
  scaledSize,
  shiftSamples,
  videosBucketHasRoom,
  videosUploadNeeds,
  workingSeconds,
} from './cloudCopyRules';
import * as space from './cloudSpace';

const MB = 1024 ** 2;
const LIMIT = 50 * MB;

describe('cloudDecision', () => {
  it('uploads the original when it fits in the file limit and the group space', () => {
    expect(cloudDecision({ fileBytes: 30 * MB, durationSeconds: 180, usedBytes: 100 * MB, limitBytes: LIMIT })).toEqual({
      kind: 'original',
    });
  });

  it('makes a copy of about 48 MB when the file is over 50 MB (the 55,8 MB case)', () => {
    const d = cloudDecision({ fileBytes: 58_477_041, durationSeconds: 182, usedBytes: 200 * MB, limitBytes: LIMIT });
    expect(d.kind).toBe('copy');
    if (d.kind === 'copy') {
      expect(d.targetBytes).toBeLessThan(LIMIT);
      expect(d.targetBytes).toBe(Math.floor(LIMIT * COPY.targetRatio));
    }
  });

  it('mirrors the database: an upload needs its 50 MB plus the 50 MB kept for one take', () => {
    const line = CLOUD_SPACE.quotaBytes - CLOUD_SPACE.takesReserveBytes;
    expect(videosBucketHasRoom(line - LIMIT - 1, LIMIT)).toBe(true);
    expect(videosBucketHasRoom(line - LIMIT, LIMIT)).toBe(false);
    expect(videosUploadNeeds(LIMIT)).toBe(LIMIT + CLOUD_SPACE.takesReserveBytes);
    // 20 MB original, 95 MB free: the database would refuse it (it counts every upload as 50 MB).
    const used = CLOUD_SPACE.quotaBytes - 95 * MB;
    expect(cloudDecision({ fileBytes: 20 * MB, durationSeconds: 100, usedBytes: used, limitBytes: LIMIT })).toEqual({
      kind: 'no-space',
      freeBytes: 95 * MB,
      needBytes: LIMIT + CLOUD_SPACE.takesReserveBytes,
    });
  });

  it('says there is no space (with sizes) for a copy either', () => {
    const used = COPY.quotaBytes - 3 * MB;
    const d = cloudDecision({ fileBytes: 80 * MB, durationSeconds: 200, usedBytes: used, limitBytes: LIMIT });
    expect(d).toEqual({ kind: 'no-space', freeBytes: 3 * MB, needBytes: videosUploadNeeds(LIMIT) });
  });

  it('an original too heavy to read on this device: do it from a computer', () => {
    const max = maxOriginalBytes({ mobile: true, memoryGb: 6 });
    expect(max).toBe(400 * MB);
    expect(cloudDecision({ fileBytes: 1500 * MB, durationSeconds: 200, usedBytes: 0, limitBytes: LIMIT, maxOriginalBytes: max })).toEqual({
      kind: 'too-heavy',
      maxBytes: max,
    });
    expect(cloudDecision({ fileBytes: 300 * MB, durationSeconds: 200, usedBytes: 0, limitBytes: LIMIT, maxOriginalBytes: max }).kind).toBe('copy');
    // A file that fits as it is is never «too heavy» (it isn't decoded).
    expect(cloudDecision({ fileBytes: 30 * MB, durationSeconds: 200, usedBytes: 0, limitBytes: LIMIT, maxOriginalBytes: 10 * MB }).kind).toBe('original');
    expect(maxOriginalBytes({ mobile: true, memoryGb: 3 })).toBeLessThan(max);
    expect(maxOriginalBytes({ mobile: false, memoryGb: null })).toBeGreaterThan(max);
  });

  it('says the video is too long when the smallest copy wouldn’t fit in one file', () => {
    const d = cloudDecision({ fileBytes: 900 * MB, durationSeconds: 3600, usedBytes: 0, limitBytes: LIMIT });
    expect(d).toEqual({ kind: 'too-long', maxSeconds: maxCopySeconds(LIMIT) });
    expect(maxCopySeconds(LIMIT)).toBeGreaterThan(10 * 60);
  });

  it('ignores the group space when it could not be read', () => {
    expect(cloudDecision({ fileBytes: 20 * MB, durationSeconds: 100, usedBytes: null, limitBytes: LIMIT }).kind).toBe('original');
    expect(cloudDecision({ fileBytes: 70 * MB, durationSeconds: 100, usedBytes: null, limitBytes: LIMIT }).kind).toBe('copy');
  });

  it('works with the small test limit of the demo', () => {
    const d = cloudDecision({ fileBytes: 12 * MB, durationSeconds: 60, usedBytes: 0, limitBytes: 5 * MB });
    expect(d).toEqual({ kind: 'copy', targetBytes: Math.floor(5 * MB * COPY.targetRatio) });
  });
});

describe('copyEncoding', () => {
  it('fits a 3-minute song in 48 MB at 720p with good sound', () => {
    const e = copyEncoding({ seconds: 182, targetBytes: 48 * MB, srcWidth: 1920, srcHeight: 1080 })!;
    expect(e.width).toBe(1280);
    expect(e.height).toBe(720);
    expect(e.audioBps).toBe(COPY.audioBps);
    const bytes = ((e.videoBps + e.audioBps) / 8) * 182;
    expect(bytes).toBeLessThan(48 * MB);
    expect(bytes).toBeGreaterThan(40 * MB);
  });

  it('keeps 1080p for a short video', () => {
    const e = copyEncoding({ seconds: 60, targetBytes: 48 * MB, srcWidth: 1920, srcHeight: 1080 })!;
    expect([e.width, e.height]).toEqual([1920, 1080]);
    expect(e.videoBps).toBeLessThanOrEqual(COPY.maxVideoBps[1920]!);
  });

  it('goes under 720p only for long videos, and never above the source', () => {
    const long = copyEncoding({ seconds: 9 * 60, targetBytes: 48 * MB, srcWidth: 1920, srcHeight: 1080 })!;
    expect(long.width).toBeLessThan(1280);
    const small = copyEncoding({ seconds: 60, targetBytes: 48 * MB, srcWidth: 640, srcHeight: 360 })!;
    expect([small.width, small.height]).toEqual([640, 360]);
  });

  it('keeps a vertical video vertical, with even sides', () => {
    const e = copyEncoding({ seconds: 200, targetBytes: 48 * MB, srcWidth: 1080, srcHeight: 1920 })!;
    expect(e.height).toBeGreaterThan(e.width);
    expect(e.width % 2).toBe(0);
    expect(e.height % 2).toBe(0);
  });

  it('never asks for more than the original had', () => {
    const e = copyEncoding({ seconds: 60, targetBytes: 48 * MB, srcWidth: 1280, srcHeight: 720, sourceBps: 1_000_000 })!;
    expect(e.videoBps).toBeLessThanOrEqual(900_000);
  });

  it('follows a cap from a previous attempt, and gives up below the minimum', () => {
    const e = copyEncoding({ seconds: 180, targetBytes: 48 * MB, srcWidth: 1920, srcHeight: 1080, videoBpsCap: 1_000_000 })!;
    expect(e.videoBps).toBeLessThanOrEqual(1_000_000);
    expect(copyEncoding({ seconds: 180, targetBytes: 48 * MB, srcWidth: 1920, srcHeight: 1080, videoBpsCap: 100_000 })).toBeNull();
    expect(copyEncoding({ seconds: 0, targetBytes: 48 * MB, srcWidth: 1920, srcHeight: 1080 })).toBeNull();
  });
});

describe('sizes', () => {
  it('scales to a long side without upscaling', () => {
    expect(scaledSize(1920, 1080, 1280)).toEqual({ width: 1280, height: 720 });
    expect(scaledSize(640, 360, 1280)).toEqual({ width: 640, height: 360 });
    expect(scaledSize(1440, 1080, 1280)).toEqual({ width: 1280, height: 960 });
  });

  it('picks the H.264 level each size needs at 30 fps', () => {
    expect(avcLevel(640, 360)).toBe('1e');
    expect(avcLevel(854, 480)).toBe('1f');
    expect(avcLevel(960, 540)).toBe('1f');
    expect(avcLevel(1280, 720)).toBe('1f');
    expect(avcLevel(720, 1280)).toBe('1f');
    expect(avcLevel(1920, 1080)).toBe('28');
  });

  it('needs more bitrate for a bigger picture', () => {
    expect(neededVideoBps(1920, 1080)).toBeGreaterThan(neededVideoBps(1280, 720));
  });
});

describe('retries', () => {
  it('lowers the bitrate after an attempt that came out too big', () => {
    const next = retryVideoBps({ videoBps: 2_000_000, projectedBytes: 60 * MB, audioBytes: 3 * MB, targetBytes: 48 * MB })!;
    expect(next).toBeLessThan(2_000_000);
    // The new attempt would weigh under the target.
    expect(3 * MB + (57 * MB * next) / 2_000_000).toBeLessThan(48 * MB);
  });

  it('always goes lower, even when the attempt was only a little over', () => {
    const next = retryVideoBps({ videoBps: 2_000_000, projectedBytes: 48.5 * MB, audioBytes: 3 * MB, targetBytes: 48 * MB })!;
    expect(next).toBeLessThanOrEqual(1_840_000);
  });

  it('gives up under the minimum bitrate', () => {
    expect(retryVideoBps({ videoBps: 260_000, projectedBytes: 80 * MB, audioBytes: 3 * MB, targetBytes: 48 * MB })).toBeNull();
  });

  it('projects the final size and stops early only when clearly over', () => {
    expect(projectBytes(10 * MB, 0.25, 2 * MB)).toBe(42 * MB);
    expect(overshooting({ projectedBytes: 60 * MB, progress: 0.2, limitBytes: LIMIT })).toBe(true);
    expect(overshooting({ projectedBytes: 60 * MB, progress: 0.1, limitBytes: LIMIT })).toBe(false);
    expect(overshooting({ projectedBytes: 49 * MB, progress: 0.5, limitBytes: LIMIT })).toBe(false);
    expect(acceptableBytes(LIMIT, 48 * MB)).toBeLessThan(LIMIT);
  });
});

describe('time left', () => {
  it('estimates about the video length before starting', () => {
    expect(estimateCopySeconds(180)).toBeGreaterThan(180);
    expect(estimateCopySeconds(180, 2)).toBeLessThan(100);
  });

  it('uses the estimate at first and the real pace later', () => {
    expect(etaSeconds({ elapsedSeconds: 1, progress: 0.01, estimateSeconds: 190 })).toBe(189);
    // Halfway after 60 s: about 60 s left whatever the estimate said.
    expect(etaSeconds({ elapsedSeconds: 60, progress: 0.5, estimateSeconds: 400 })).toBe(60);
    expect(etaSeconds({ elapsedSeconds: 60, progress: 1, estimateSeconds: 400 })).toBe(0);
  });

  it('reads well in Spanish', () => {
    expect(formatEta(5)).toBe('unos segundos');
    expect(formatEta(38)).toBe('unos 40 s');
    expect(formatEta(70)).toBe('alrededor de un minuto');
    expect(formatEta(185)).toBe('unos 3 min');
  });

  it('a maximum length never says «unos 1 minutos» nor «unos 0 minutos»', () => {
    expect(formatMaxLength(45)).toBe('menos de un minuto');
    expect(formatMaxLength(0)).toBe('menos de un minuto');
    expect(formatMaxLength(Number.NaN)).toBe('menos de un minuto');
    expect(formatMaxLength(113)).toBe('1 min y 53 s');
    expect(formatMaxLength(120)).toBe('2 min');
    expect(formatMaxLength(maxCopySeconds(5 * MB))).toBe('1 min y 53 s');
    expect(formatMaxLength(18 * 60 + 40)).toBe('unos 18 minutos');
  });
});

describe('same video', () => {
  it('checks the length with a frame of leeway', () => {
    expect(sameLength(182.4, 182.45)).toBe(true);
    expect(sameLength(182.4, 181.9)).toBe(false);
    expect(sameLength(182.4, 0)).toBe(false);
  });

  it('turns a measured shift into samples to drop or add', () => {
    expect(shiftSamples(0.0213, 48000)).toBe(1022);
    expect(shiftSamples(-0.005, 48000)).toBe(-240);
    expect(shiftSamples(0.0001, 48000)).toBe(0);
    expect(shiftSamples(Number.NaN, 48000)).toBe(0);
  });
});

describe('global review [6] · the copy shares the device', () => {
  const free = { covered: false, separating: false, studioPlaying: false };
  it('goes at up to 2× while nothing else needs the phone', () => {
    expect(copyPace(free)).toEqual({ hold: null, maxRate: COPY.maxRate });
    expect(COPY.maxRate).toBe(2);
  });
  it('no faster than 1× while the studio plays', () => {
    expect(copyPace({ ...free, studioPlaying: true })).toEqual({ hold: null, maxRate: 1 });
  });
  it('waits while the recorder covers the studio, and while the voice is separated', () => {
    expect(copyPace({ ...free, covered: true }).hold).toBe('recording');
    expect(copyPace({ ...free, separating: true }).hold).toBe('voice');
    expect(copyPace({ covered: true, separating: true, studioPlaying: true }).hold).toBe('recording');
  });
  it('says why it waits', () => {
    expect(copyHoldText('recording')).toBe('En pausa mientras grabas…');
    expect(copyHoldText('voice')).toBe('En pausa mientras se separa la voz…');
  });
  it('the time left leaves the pauses out', () => {
    expect(workingSeconds(90_000, 30_000)).toBe(60);
    expect(workingSeconds(10_000, 20_000)).toBe(0);
    expect(workingSeconds(5000, -1)).toBe(5);
  });
  it('the group space rules are the small module the data layer uses', () => {
    expect(videosBucketHasRoom).toBe(space.videosBucketHasRoom);
    expect(CLOUD_SPACE).toBe(space.CLOUD_SPACE);
  });
});
