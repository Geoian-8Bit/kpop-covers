import { describe, expect, it } from 'vitest';
import {
  exportFileName,
  exportPercent,
  fitStage,
  formatClock,
  frameCount,
  frameStamp,
  frameTime,
  isKeyFrame,
  pngSize,
  slugify,
  soundWindow,
  STAGE_PAD,
  stageExtent,
  VIDEO_LEAD,
  VIDEO_MAX_SECONDS,
  VIDEO_TAIL,
  videoRange,
  videoSize,
} from './exportRules';

const f = (id: string, at: number) => ({ id, at, transition: 2, positions: {} });
const noLoop = { enabled: false, start: null, end: null };

describe('stage on a picture', () => {
  it('keeps the proportion and centres the floor', () => {
    const stage = { width: 8, depth: 6 };
    const ext = stageExtent(stage);
    expect(ext).toEqual({ w: 8 + STAGE_PAD * 2, h: 6 + 0.7 + 0.9 });
    const fit = fitStage(stage, { x: 0, y: 0, w: 1000, h: 1000 });
    expect(fit.scale).toBeCloseTo(1000 / ext.w);
    expect(fit.originX).toBeCloseTo(STAGE_PAD * fit.scale);
    // Vertically centred: the drawing is shorter than the box.
    expect(fit.originY).toBeGreaterThan(STAGE_PAD * fit.scale);
  });

  it('PNG has the fixed width and the stage proportion', () => {
    const size = pngSize({ width: 8, depth: 6 });
    expect(size.width).toBe(1600);
    expect(size.stage.w / size.stage.h).toBeCloseTo(stageExtent({ width: 8, depth: 6 }).w / stageExtent({ width: 8, depth: 6 }).h, 2);
    expect(size.height).toBeGreaterThan(size.stage.h);
  });
});

describe('names', () => {
  it('slugs without accents or symbols', () => {
    expect(slugify('Con 5 · Ñoño «Supernova»')).toBe('con-5-nono-supernova');
    expect(slugify('***')).toBe('');
  });

  it('file names per kind', () => {
    expect(exportFileName('Con 5', 'png', 70.4)).toBe('formacion-con-5-1m10s.png');
    expect(exportFileName('Con 5', 'pdf')).toBe('formaciones-con-5.pdf');
    expect(exportFileName('', 'mp4')).toBe('formaciones-plan.mp4');
  });

  it('m:ss clock', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9.6)).toBe('0:10');
    expect(formatClock(125)).toBe('2:05');
  });
});

describe('video range', () => {
  it('covers the plan with a lead and a tail', () => {
    const r = videoRange([f('a', 10), f('b', 0), f('c', 20)], noLoop, 0);
    expect(r).toEqual({ ok: true, start: 0, end: 20 + VIDEO_TAIL });
    const later = videoRange([f('a', 10), f('b', 30)], noLoop, 0);
    expect(later).toEqual({ ok: true, start: 10 - VIDEO_LEAD, end: 30 + VIDEO_TAIL });
  });

  it('never past the end of the song', () => {
    expect(videoRange([f('a', 0), f('b', 20)], noLoop, 21)).toEqual({ ok: true, start: 0, end: 21 });
  });

  it('the A–B loop wins when on', () => {
    expect(videoRange([f('a', 0)], { enabled: true, start: 5, end: 12 }, 0)).toEqual({ ok: true, start: 5, end: 12 });
    // Off, or without a range: the plan.
    expect(videoRange([f('a', 3)], { enabled: false, start: 5, end: 12 }, 0)).toEqual({ ok: true, start: 2, end: 3 + VIDEO_TAIL });
  });

  it('refuses an empty plan and one longer than 10 minutes', () => {
    expect(videoRange([], noLoop, 0)).toEqual({ ok: false, reason: 'empty' });
    expect(videoRange([f('a', 0), f('b', VIDEO_MAX_SECONDS + 5)], noLoop, 0)).toEqual({ ok: false, reason: 'too_long' });
    expect(videoRange([], { enabled: true, start: 0, end: VIDEO_MAX_SECONDS }, 0).ok).toBe(true);
  });
});

describe('frames', () => {
  it('count, time and stamps on the grid', () => {
    expect(frameCount(10)).toBe(300);
    expect(frameCount(0)).toBe(1);
    expect(frameTime(30, 5)).toBe(6);
    const stamps = Array.from({ length: 31 }, (_, i) => frameStamp(i));
    expect(stamps[30]!.timestamp).toBe(1_000_000);
    // Durations add up exactly to the next stamp (no drift).
    for (let i = 0; i < 30; i++) expect(stamps[i]!.timestamp + stamps[i]!.duration).toBe(stamps[i + 1]!.timestamp);
  });

  it('a key frame every two seconds', () => {
    expect(isKeyFrame(0)).toBe(true);
    expect(isKeyFrame(59)).toBe(false);
    expect(isKeyFrame(60)).toBe(true);
  });

  it('even video size', () => {
    const s = videoSize({ width: 8, depth: 6 });
    expect(s.width % 2).toBe(0);
    expect(s.height % 2).toBe(0);
    expect(s.width).toBe(1280);
  });

  it('percent stops at 99 until the file is made', () => {
    expect(exportPercent(0, 100)).toBe(0);
    expect(exportPercent(50, 100)).toBe(49);
    expect(exportPercent(100, 100)).toBe(99);
    expect(exportPercent(1, 0)).toBe(0);
  });
});

describe('sound window', () => {
  it('cuts the song between two moments', () => {
    expect(soundWindow(2, 4, 0, 48_000, 48_000 * 10)).toEqual({ from: 96_000, count: 96_000, pad: 0 });
  });

  it('follows the file offset, with silence before the file starts', () => {
    expect(soundWindow(1, 2, 0.5, 48_000, 48_000 * 10)).toEqual({ from: 72_000, count: 48_000, pad: 0 });
    expect(soundWindow(0, 2, -0.5, 48_000, 48_000 * 10)).toEqual({ from: 0, count: 96_000, pad: 24_000 });
  });
});
