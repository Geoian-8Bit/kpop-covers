import { describe, expect, it } from 'vitest';
import {
  belowRequested,
  cameraRequest,
  codecFamily,
  describeMime,
  droppedFrames,
  formatMbps,
  h264Level,
  hevcLevel,
  leftoverAction,
  measuredBitrate,
  minutesPhrase,
  mimeCandidates,
  minutesLeft,
  pickMime,
  resolutionClass,
  resolutionLabel,
  targetVideoBitrate,
  tooManyDrops,
  paceVerdict,
  capAfter,
  capRequest,
  NO_PACE_CAP,
  framesPerSecond,
  frameLagMs,
  createLagLog,
  createFrameIntervalLog,
  cameraRateFps,
  frameIntervalMs,
  directTakeVerdict,
  restRateFps,
  lagging,
  takeVerdict,
  confirmPace,
  capWithoutSize,
  capWithoutFps,
  sizeCapped,
  largerClass,
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

  it('treats 45+ fps as 60 and 24–30 as 30', () => {
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

  it('checks the frame size too, not only the rate (4:3 and vertical pictures)', () => {
    // 1920×1440 is 10 800 macroblocks: over 4.x's 8 192 per frame, so 5.0 even at 30 fps.
    expect(h264Level(1920, 1440, 30)).toBe('32');
    expect(h264Level(1440, 1920, 30)).toBe('32');
    expect(h264Level(1080, 1920, 60)).toBe('2A');
    // 2.76 M luma samples per picture: over level 4's 2.23 M.
    expect(hevcLevel(1920, 1440, 30)).toBe(150);
    expect(hevcLevel(2160, 3840, 30)).toBe(150);
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

describe('codecFamily', () => {
  it('groups the strings that share an encoder', () => {
    expect(codecFamily('video/mp4;codecs=hvc1.1.6.L120.B0,mp4a.40.2')).toBe('hevc');
    expect(codecFamily('video/mp4;codecs=hev1,mp4a.40.2')).toBe('hevc');
    expect(codecFamily('video/mp4;codecs=avc1.640028,mp4a.40.2')).toBe('avc-high');
    expect(codecFamily('video/mp4;codecs=avc1.64002A,mp4a.40.2')).toBe('avc-high');
    expect(codecFamily('video/mp4;codecs=avc1.4D0028,mp4a.40.2')).toBe('avc-main');
    expect(codecFamily('video/mp4;codecs=avc1.42E01E,mp4a.40.2')).toBe('avc-baseline');
    expect(codecFamily('video/mp4;codecs=avc1,mp4a.40.2')).toBe('avc');
    expect(codecFamily('video/webm;codecs=vp9,opus')).toBe('vp9');
    expect(codecFamily('video/mp4')).toBe('type:video/mp4');
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

describe('cameraRequest', () => {
  it('auto follows the quality', () => {
    expect(cameraRequest({ quality: 'auto', resolution: 'auto', fps: 60 })).toEqual({ width: 1920, height: 1080, fps: 60 });
    expect(cameraRequest({ quality: 'high', resolution: 'auto', fps: 30 })).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(cameraRequest({ quality: 'saver', resolution: 'auto', fps: 60 })).toEqual({ width: 1280, height: 720, fps: 30 });
    expect(cameraRequest({ quality: 'max', resolution: 'auto', fps: 60 })).toEqual({ width: 3840, height: 2160, fps: 30 });
  });

  it('an explicit resolution wins, and 4K is never asked at 60', () => {
    expect(cameraRequest({ quality: 'saver', resolution: '1440p', fps: 60 })).toEqual({ width: 2560, height: 1440, fps: 60 });
    expect(cameraRequest({ quality: 'high', resolution: '4k', fps: 60 })).toEqual({ width: 3840, height: 2160, fps: 30 });
  });

  it('detects a camera that gave less than asked, whatever the orientation', () => {
    expect(belowRequested({ width: 720, height: 1280 }, { width: 1920, height: 1080 })).toBe(true);
    expect(belowRequested({ width: 1080, height: 1920 }, { width: 1920, height: 1080 })).toBe(false);
    expect(belowRequested({ width: 3840, height: 2160 }, { width: 1920, height: 1080 })).toBe(false);
  });
});

describe('leftoverAction', () => {
  const now = Date.parse('2026-10-16T18:00:00Z');
  const base = { startedAt: '2026-10-16T17:00:00Z', savedAt: null, bytes: 5_000_000, locked: false };

  it('offers a take that was never saved', () => {
    expect(leftoverAction(base, now)).toBe('offer');
  });

  it('never touches a take saved in the app (F3), whatever its age', () => {
    expect(leftoverAction({ ...base, kept: true, savedAt: '2026-01-01T00:00:00Z' }, now)).toBe('keep');
    expect(leftoverAction({ ...base, kept: true }, now)).toBe('keep');
  });

  it('never touches a take another window is using', () => {
    expect(leftoverAction({ ...base, locked: true, bytes: 0 }, now)).toBe('keep');
    expect(leftoverAction({ ...base, locked: true, savedAt: '2026-10-01T00:00:00Z' }, now)).toBe('keep');
  });

  it('keeps a saved take for a while (a download may still read it), then deletes it', () => {
    expect(leftoverAction({ ...base, savedAt: '2026-10-16T17:55:00Z' }, now)).toBe('keep');
    expect(leftoverAction({ ...base, savedAt: '2026-10-16T17:40:00Z' }, now)).toBe('delete');
  });

  it('deletes empty takes only once they are old enough not to be starting elsewhere', () => {
    expect(leftoverAction({ ...base, bytes: 0, startedAt: '2026-10-16T17:59:30Z' }, now)).toBe('keep');
    expect(leftoverAction({ ...base, bytes: 0 }, now)).toBe('delete');
  });

  it('keeps unreadable takes to retry, gives up after a week', () => {
    expect(leftoverAction({ ...base, unreadable: true }, now)).toBe('keep');
    expect(leftoverAction({ ...base, unreadable: true, startedAt: '2026-10-01T00:00:00Z' }, now)).toBe('delete');
  });

  it('phrases the minutes left', () => {
    expect(minutesPhrase(0)).toBe('menos de 1 min');
    expect(minutesPhrase(12)).toBe('unos 12 min');
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

describe('pace (P19)', () => {
  const s = { wantFps: 60, cameraFps: 60, measuredFps: 59, seconds: 2, resolution: '1080p' as const };

  it('needs a long enough sample', () => {
    expect(paceVerdict({ ...s, seconds: 1 })).toBe('unknown');
    expect(paceVerdict({ ...s, cameraFps: 0, wantFps: 0 })).toBe('unknown');
  });

  it('accepts a phone that keeps up (small losses are fine)', () => {
    expect(paceVerdict(s)).toBe('ok');
    expect(paceVerdict({ ...s, measuredFps: 52 })).toBe('ok');
  });

  it('drops to 30 when 60 does not flow', () => {
    expect(paceVerdict({ ...s, measuredFps: 40 })).toBe('fps30');
  });

  it('judges against what the camera really gives', () => {
    // Asked 60, camera gives 30: 29 measured is fine.
    expect(paceVerdict({ ...s, cameraFps: 30, measuredFps: 29 })).toBe('ok');
  });

  it('at 30 above 1080p goes smaller; at 1080p30 only warns', () => {
    expect(paceVerdict({ ...s, wantFps: 30, cameraFps: 30, measuredFps: 18, resolution: '4k' })).toBe('smaller');
    expect(paceVerdict({ ...s, wantFps: 30, cameraFps: 30, measuredFps: 18 })).toBe('warn');
  });

  it('caps requests by what the phone showed', () => {
    let cap = capAfter(NO_PACE_CAP, 'fps30', '1080p');
    expect(capAfter(cap, 'fps30', '1080p')).toBe(cap);
    expect(capRequest({ width: 1920, height: 1080, fps: 60 }, cap)).toEqual({ width: 1920, height: 1080, fps: 30, capped: true });
    expect(capRequest({ width: 1280, height: 720, fps: 60 }, cap)).toEqual({ width: 1280, height: 720, fps: 60, capped: false });
    cap = capAfter(cap, 'smaller', '4k');
    expect(cap.maxResolution).toBe('1080p');
    expect(capRequest({ width: 3840, height: 2160, fps: 30 }, cap)).toEqual({ width: 1920, height: 1080, fps: 30, capped: true });
    expect(capAfter(cap, 'ok', '1080p')).toBe(cap);
    expect(capAfter(cap, 'warn', '1080p')).toBe(cap);
  });

  it('frames per second', () => {
    expect(framesPerSecond(120, 2)).toBe(60);
    expect(framesPerSecond(0, 2)).toBe(0);
    expect(framesPerSecond(10, 0)).toBe(0);
  });
});

describe('pace · preview delay and takes (P19 review)', () => {
  it('reads a frame delay from the frame callback, ignoring other clocks', () => {
    expect(frameLagMs({ captureTime: 1000, expectedDisplayTime: 1090 })).toBe(90);
    expect(frameLagMs({ expectedDisplayTime: 1090 })).toBeNull();
    expect(frameLagMs({ captureTime: 0, expectedDisplayTime: 50 })).toBeNull();
    expect(frameLagMs({ captureTime: 5000, expectedDisplayTime: 1000 })).toBeNull();
    expect(frameLagMs({ captureTime: 1, expectedDisplayTime: 9000 })).toBeNull();
  });

  it('keeps every delay of a take in a fixed histogram and gives their median', () => {
    const log = createLagLog();
    expect(log.median()).toBeNull();
    [10, 30, 20].forEach(log.add);
    expect(log.median()).toBe(20);
    [100, 200].forEach(log.add);
    expect(log.size()).toBe(5);
    expect(log.median()).toBe(30);
    log.add(250);
    expect(log.median()).toBe(65); // 10 20 30 100 200 250
    log.clear();
    expect(log.median()).toBeNull();
  });

  it('the median covers the whole take, not only its last seconds', () => {
    const log = createLagLog();
    // 3 minutes at 60 fps: 2 at 80 ms, then 1 at 400 ms. A ring of the last 10 s would only see 400.
    for (let i = 0; i < 7200; i++) log.add(80);
    for (let i = 0; i < 3600; i++) log.add(400);
    expect(log.median()).toBe(80);
    log.add(5000); // clamped, never out of the histogram
    expect(log.size()).toBe(10801);
  });

  it('reads the camera’s real rate from the time between its frames', () => {
    expect(frameIntervalMs(null, { presentedFrames: 2, captureTime: 1033 })).toBeNull();
    expect(frameIntervalMs({ presentedFrames: 1, captureTime: 1000 }, { presentedFrames: 2, captureTime: 1033.3 })).toBeCloseTo(33.3);
    // The page missed a frame: the time is shared between the two.
    expect(frameIntervalMs({ presentedFrames: 1, captureTime: 1000 }, { presentedFrames: 3, captureTime: 1033.4 })).toBeCloseTo(16.7);
    expect(frameIntervalMs({ presentedFrames: 1 }, { presentedFrames: 2, captureTime: 1033 })).toBeNull();
    expect(frameIntervalMs({ presentedFrames: 1, captureTime: 1000 }, { presentedFrames: 2, captureTime: 3000 })).toBeNull();
    const log = createFrameIntervalLog();
    for (let i = 0; i < 10; i++) log.add(33.3);
    expect(cameraRateFps(log)).toBeNull(); // too few
    for (let i = 0; i < 40; i++) log.add(33.3);
    log.add(66.7); // one late frame changes nothing
    expect(cameraRateFps(log)).toBeCloseTo(30, 0);
  });

  it('a direct take in a dark room (camera at 30, rest at 60, no delay) is ok', () => {
    const t = { wantFps: 60, modeFps: 60, resolution: '4k' as const, seconds: 30, restLagMs: 90 };
    // The camera slowed down to 30 by itself (the countdown was as dark): every frame reached the file.
    expect(directTakeVerdict({ ...t, presented: 900, restFps: 30, lagMs: 95 })).toBe('ok');
    // Same without capture times: judged by its delay only, and there is none.
    expect(directTakeVerdict({ ...t, presented: 900, lagMs: null })).toBe('ok');
    // 1440p at 30 in a dark room, camera at 22.
    expect(
      directTakeVerdict({ ...t, wantFps: 30, modeFps: 30, resolution: '1440p', presented: 660, restFps: 22, lagMs: 100 }),
    ).toBe('ok');
  });

  it('a direct take at 60 with no delay is ok even when the page missed half of its callbacks', () => {
    // A 30 Hz screen (battery saver) or the YouTube player on the same thread: the page sees every other frame,
    // but `presented` counts every camera frame and the file gets them all.
    const t = { wantFps: 60, modeFps: 60, resolution: '1080p' as const, seconds: 30, restLagMs: 90, restFps: 60 };
    expect(directTakeVerdict({ ...t, presented: 1800, lagMs: 95 })).toBe('ok');
  });

  it('a direct take whose camera goes 60 half the time and 30 the other half, with no delay, is ok', () => {
    // Light «a medias»: a mean of 45 (a median of 60). Neither rate says the phone failed.
    const t = { wantFps: 60, modeFps: 60, resolution: '1080p' as const, seconds: 30, restLagMs: 90 };
    expect(directTakeVerdict({ ...t, presented: 15 * 60 + 15 * 30, restFps: 60, lagMs: 95 })).toBe('ok');
    expect(directTakeVerdict({ ...t, presented: 15 * 60 + 15 * 30, restFps: null, lagMs: 95 })).toBe('ok');
    // Even darker in the take than in the countdown (below 75 %), the delay didn't grow: the light, not the load.
    expect(directTakeVerdict({ ...t, presented: 1080, restFps: 60, lagMs: 100 })).toBe('ok');
  });

  it('a direct take without frame callbacks (nothing presented) says nothing', () => {
    const t = { wantFps: 60, modeFps: 60, resolution: '1080p' as const, restLagMs: null, lagMs: null };
    expect(directTakeVerdict({ ...t, presented: 0, seconds: 30 })).toBe('unknown');
    expect(directTakeVerdict({ ...t, wantFps: 30, modeFps: 30, resolution: '4k', presented: 0, seconds: 30 })).toBe('unknown');
    expect(directTakeVerdict({ ...t, presented: 0, seconds: 0 })).toBe('unknown');
    // Too short to judge.
    expect(directTakeVerdict({ ...t, presented: 300, seconds: 5 })).toBe('unknown');
  });

  it('a direct take that lags, or whose camera the load slows down, still steps down', () => {
    const t = { wantFps: 60, modeFps: 60, resolution: '1080p' as const, seconds: 30, restLagMs: 90 };
    // Every frame, but the preview trails by half a second.
    expect(directTakeVerdict({ ...t, presented: 1800, restFps: 60, lagMs: 500 })).toBe('fps30');
    expect(directTakeVerdict({ ...t, presented: 1800, lagMs: 500 })).toBe('fps30');
    // A busy, hot phone: 60 in the countdown, 40 in the take, and the delay grows a bit (+40 ms).
    expect(directTakeVerdict({ ...t, presented: 1200, restFps: 60, lagMs: 130 })).toBe('fps30');
    // The same drop without a growing delay is the light.
    expect(directTakeVerdict({ ...t, presented: 1200, restFps: 60, lagMs: 105 })).toBe('ok');
    // A small drop (60 → 50) with that delay is not clear enough.
    expect(directTakeVerdict({ ...t, presented: 1500, restFps: 60, lagMs: 130 })).toBe('ok');
    // Without a countdown, only the delay: +40 ms alone is not lagging.
    expect(directTakeVerdict({ ...t, presented: 1200, restFps: null, lagMs: 130 })).toBe('ok');
    // At 30 in 4K, slowed to 20 with a growing delay: smaller.
    expect(
      directTakeVerdict({ ...t, wantFps: 30, modeFps: 30, resolution: '4k', presented: 600, restFps: 30, lagMs: 130 }),
    ).toBe('smaller');
    // 1080p at 30: nothing lighter.
    expect(directTakeVerdict({ ...t, wantFps: 30, modeFps: 30, presented: 900, restFps: 30, lagMs: 400 })).toBe('warn');
  });

  it('the countdown’s mean rate needs a long enough countdown', () => {
    expect(restRateFps(180, 3)).toBe(60);
    expect(restRateFps(40, 1)).toBeNull(); // too short
    expect(restRateFps(10, 3)).toBeNull(); // too few frames (no callbacks)
    expect(restRateFps(0, 0)).toBeNull();
  });

  it('a delay that grows while encoding is lagging; the camera’s own delay is not', () => {
    expect(lagging(220, 120)).toBe(true); // +100
    expect(lagging(170, 120)).toBe(true); // over 150 and +50
    expect(lagging(160, 140)).toBe(false); // the camera is just slow at rest
    expect(lagging(145, 60)).toBe(true); // +85
    expect(lagging(140, 60)).toBe(false); // +80 exactly: not yet
    expect(lagging(200, null)).toBe(false);
    expect(lagging(300, null)).toBe(true);
    expect(lagging(null, 50)).toBe(false);
  });

  it('a full frame rate with a growing delay still steps down', () => {
    const s = { wantFps: 60, cameraFps: 60, measuredFps: 59, seconds: 2, resolution: '1080p' as const };
    expect(paceVerdict({ ...s, lagMs: 90, restLagMs: 80 })).toBe('ok');
    expect(paceVerdict({ ...s, lagMs: 260, restLagMs: 80 })).toBe('fps30');
  });

  it('a take teaches only when long enough and clearly short of frames', () => {
    const t = { wantFps: 60, cameraFps: 60, resolution: '1080p' as const };
    // 3 s take (1 s after the skip): too short.
    expect(takeVerdict({ ...t, frames: 20, seconds: 1 })).toBe('unknown');
    // 8 s counted, one stall of 20 frames: 7 % short but 20 frames only → ok.
    expect(takeVerdict({ ...t, frames: 460, seconds: 8 })).toBe('ok');
    // 8 s at 40 fps: steps down.
    expect(takeVerdict({ ...t, frames: 320, seconds: 8 })).toBe('fps30');
    // All the frames but a preview half a second behind: steps down.
    expect(takeVerdict({ ...t, frames: 478, seconds: 8, lagMs: 500, restLagMs: 90 })).toBe('fps30');
  });

  it('a step down needs two measurements in a row that agree', () => {
    let r = confirmPace(null, 'fps30', '1080p');
    expect(r).toEqual({ learn: false, pending: { verdict: 'fps30', resolution: '1080p' } });
    r = confirmPace(r.pending, 'fps30', '1080p');
    expect(r).toEqual({ learn: true, pending: null });
    // Another size or another verdict starts again.
    const p = confirmPace(null, 'fps30', '1080p').pending;
    expect(confirmPace(p, 'smaller', '4k')).toEqual({ learn: false, pending: { verdict: 'smaller', resolution: '4k' } });
    // A good measurement of that size forgets it; one of another size or a warning leaves it.
    expect(confirmPace(p, 'ok', '1080p').pending).toBeNull();
    expect(confirmPace(p, 'ok', '720p').pending).toBe(p);
    expect(confirmPace(p, 'warn', '1080p').pending).toBe(p);
    expect(confirmPace(p, 'unknown', '1080p').pending).toBe(p);
  });

  it('a learnt cap can be dropped part by part', () => {
    const cap = { fps30: ['1080p' as const], maxResolution: '1080p' as const };
    expect(capWithoutSize(cap)).toEqual({ fps30: ['1080p'], maxResolution: null });
    expect(capWithoutFps(cap)).toEqual({ fps30: [], maxResolution: '1080p' });
    expect(capWithoutSize(NO_PACE_CAP)).toBe(NO_PACE_CAP);
    expect(sizeCapped({ width: 3840, height: 2160, fps: 30 }, cap)).toBe(true);
    expect(sizeCapped({ width: 1920, height: 1080, fps: 60 }, cap)).toBe(false);
    expect(largerClass('4k', '1080p')).toBe(true);
    expect(largerClass('1080p', '1080p')).toBe(false);
  });
});
