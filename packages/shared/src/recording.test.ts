import { describe, expect, it } from 'vitest';
import {
  describeMime,
  droppedFrames,
  formatMbps,
  h264Level,
  hevcLevel,
  measuredBitrate,
  mimeCandidates,
  minutesLeft,
  pickMime,
  resolutionClass,
  resolutionLabel,
  targetVideoBitrate,
  tooManyDrops,
} from './recording';

describe('targetVideoBitrate', () => {
  it('follows the plan table for H.264', () => {
    expect(targetVideoBitrate({ width: 1920, height: 1080, fps: 30, quality: 'high' })).toBe(12_000_000);
    expect(targetVideoBitrate({ width: 1920, height: 1080, fps: 30, quality: 'max' })).toBe(16_000_000);
    expect(targetVideoBitrate({ width: 1920, height: 1080, fps: 60, quality: 'high' })).toBe(18_000_000);
    expect(targetVideoBitrate({ width: 1920, height: 1080, fps: 60, quality: 'max' })).toBe(24_000_000);
    expect(targetVideoBitrate({ width: 3840, height: 2160, fps: 30, quality: 'max' })).toBe(40_000_000);
    expect(targetVideoBitrate({ width: 1280, height: 720, fps: 30, quality: 'saver' })).toBe(5_000_000);
  });

  it('treats a vertical picture like its landscape twin', () => {
    expect(targetVideoBitrate({ width: 1080, height: 1920, fps: 30, quality: 'max' })).toBe(16_000_000);
  });

  it('auto uses Alta and HEVC needs fewer bits', () => {
    expect(targetVideoBitrate({ width: 1920, height: 1080, fps: 30, quality: 'auto' })).toBe(12_000_000);
    expect(targetVideoBitrate({ width: 1920, height: 1080, fps: 30, quality: 'max', hevc: true })).toBe(10_400_000);
  });

  it('treats 50+ fps as 60 and 24–30 as 30', () => {
    expect(targetVideoBitrate({ width: 1920, height: 1080, fps: 59.94, quality: 'high' })).toBe(18_000_000);
    expect(targetVideoBitrate({ width: 1920, height: 1080, fps: 24, quality: 'high' })).toBe(12_000_000);
  });
});

describe('resolution classes', () => {
  it('classifies by the long side', () => {
    expect(resolutionClass(1280, 720)).toBe('720p');
    expect(resolutionClass(1080, 1920)).toBe('1080p');
    expect(resolutionClass(2560, 1440)).toBe('1440p');
    expect(resolutionClass(3840, 2160)).toBe('4k');
    expect(resolutionLabel(2160, 3840)).toBe('4K');
  });
});

describe('codec levels', () => {
  it('picks H.264 levels that fit the picture', () => {
    expect(h264Level(1920, 1080, 30)).toBe('28');
    expect(h264Level(1920, 1080, 60)).toBe('2A');
    expect(h264Level(2560, 1440, 30)).toBe('32');
    expect(h264Level(3840, 2160, 30)).toBe('33');
    expect(h264Level(3840, 2160, 60)).toBe('34');
  });

  it('picks HEVC levels', () => {
    expect(hevcLevel(1920, 1080, 30)).toBe(120);
    expect(hevcLevel(1920, 1080, 60)).toBe(123);
    expect(hevcLevel(3840, 2160, 30)).toBe(150);
    expect(hevcLevel(3840, 2160, 60)).toBe(153);
  });
});

describe('mimeCandidates / pickMime', () => {
  it('tries HEVC first in auto, then H.264 High, MP4 before WebM', () => {
    const list = mimeCandidates({ codec: 'auto', width: 1920, height: 1080, fps: 60 });
    expect(list[0]).toBe('video/mp4;codecs=hvc1.1.6.L123.B0,mp4a.40.2');
    const high = list.indexOf('video/mp4;codecs=avc1.64002A,mp4a.40.2');
    const baseline = list.indexOf('video/mp4;codecs=avc1.42E01E,mp4a.40.2');
    const webm = list.findIndex((t) => t.startsWith('video/webm'));
    expect(high).toBeGreaterThan(0);
    expect(baseline).toBeGreaterThan(high);
    expect(webm).toBeGreaterThan(baseline);
  });

  it('compatible mode never offers HEVC', () => {
    const list = mimeCandidates({ codec: 'h264', width: 1920, height: 1080, fps: 30 });
    expect(list.some((t) => /hvc1|hev1/.test(t))).toBe(false);
    expect(list[0]).toBe('video/mp4;codecs=avc1.640028,mp4a.40.2');
  });

  it('returns the first supported type and survives a throwing check', () => {
    const supported = new Set(['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm']);
    const list = mimeCandidates({ codec: 'auto', width: 1920, height: 1080, fps: 30 });
    expect(pickMime(list, (t) => supported.has(t))).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2');
    expect(
      pickMime(['bad', 'video/webm'], (t) => {
        if (t === 'bad') throw new Error('nope');
        return true;
      }),
    ).toBe('video/webm');
    expect(pickMime(list, () => false)).toBe('');
  });
});

describe('describeMime', () => {
  it('names what the panel shows', () => {
    expect(describeMime('video/mp4;codecs=avc1.640028,mp4a.40.2')).toBe('MP4 · H.264 High');
    expect(describeMime('video/mp4;codecs=avc1.42E01E,mp4a.40.2')).toBe('MP4 · H.264 Baseline');
    expect(describeMime('video/mp4;codecs=hvc1.1.6.L120.B0,mp4a.40.2')).toBe('MP4 · HEVC (H.265)');
    expect(describeMime('video/webm;codecs=vp9,opus')).toBe('WebM · VP9');
    expect(describeMime('')).toBe('El que elija el navegador');
  });
});

describe('sizes and space', () => {
  it('measures the real bitrate of a file', () => {
    // 120 MB in 60 s = 16 Mbps.
    expect(measuredBitrate(120_000_000, 60)).toBe(16_000_000);
    expect(measuredBitrate(1000, 0)).toBe(0);
    expect(formatMbps(16_000_000)).toBe('16 Mbps');
    expect(formatMbps(5_400_000)).toBe('5,4 Mbps');
  });

  it('counts the minutes that fit with a margin', () => {
    // 1 GB free at 16 Mbps: 2 MB/s → ~8.3 min raw, 85 % → 7 min.
    expect(minutesLeft(1_000_000_000, 16_000_000)).toBe(7);
    expect(minutesLeft(0, 16_000_000)).toBe(0);
    expect(minutesLeft(Number.NaN, 16_000_000)).toBe(0);
  });
});

describe('dropped frames', () => {
  it('never goes negative and needs something measured', () => {
    expect(droppedFrames({ expected: 1800, delivered: 1790 })).toBe(10);
    expect(droppedFrames({ expected: 1800, delivered: 1805 })).toBe(0);
    expect(droppedFrames({ expected: 0, delivered: 0 })).toBeNull();
  });

  it('warns only for visible stutter', () => {
    expect(tooManyDrops(10, 1800)).toBe(false); // 10 frames
    expect(tooManyDrops(50, 1800)).toBe(false); // 2.8 %
    expect(tooManyDrops(200, 1800)).toBe(true); // 11 %
    expect(tooManyDrops(null, 1800)).toBe(false);
  });
});
