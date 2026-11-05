import { directTakeVerdict, droppedFrames, takeVerdict } from '@coverscape/shared';
import { describe, expect, it } from 'vitest';
import { judgeTake, takeFrames } from './takeVerdict';

const MODE_1080_60 = { width: 1920, height: 1080, fps: 60 };

describe('takeFrames', () => {
  it('counts losses only on a canvas take that had camera frames', () => {
    expect(takeFrames({ drawn: 570, delivered: 600, canvas: true, seconds: 10 })).toEqual({
      expected: 600,
      dropped: droppedFrames({ expected: 600, delivered: 570 }),
      realFps: 57,
    });
    expect(takeFrames({ drawn: 0, delivered: 0, canvas: true, seconds: 10 })).toEqual({
      expected: 0,
      dropped: null,
      realFps: null,
    });
  });

  it('gives a direct take its real rate and no losses', () => {
    expect(takeFrames({ drawn: 290, delivered: 0, canvas: false, seconds: 10 })).toEqual({
      expected: 0,
      dropped: null,
      realFps: 29,
    });
    expect(takeFrames({ drawn: 290, delivered: 0, canvas: false, seconds: 0 }).realFps).toBeNull();
  });
});

describe('judgeTake', () => {
  const counted = { frames: 1000, delivered: 1180, missed: 4, seconds: 20 };

  it('is unknown without a mode or counted seconds', () => {
    const base = { canvas: true, wantFps: 60, lagMs: 40, rest: null, countdown: null };
    expect(judgeTake({ ...base, mode: null, counted })).toBe('unknown');
    expect(judgeTake({ ...base, mode: MODE_1080_60, counted: null })).toBe('unknown');
    expect(judgeTake({ ...base, mode: MODE_1080_60, counted: { ...counted, seconds: 0 } })).toBe('unknown');
  });

  it('judges a canvas take against the frames the camera delivered', () => {
    for (const lagMs of [null, 30, 400]) {
      expect(
        judgeTake({
          canvas: true,
          mode: MODE_1080_60,
          wantFps: 60,
          counted,
          lagMs,
          rest: { lagMs: 35 },
          countdown: null,
        }),
      ).toBe(
        takeVerdict({
          wantFps: 60,
          cameraFps: counted.delivered / counted.seconds,
          frames: counted.frames,
          seconds: counted.seconds,
          resolution: '1080p',
          lagMs,
          restLagMs: 35,
        }),
      );
    }
  });

  it('judges a direct take by its delay against the countdown, then the rehearsal', () => {
    const cases = [
      { countdown: { fps: 58, lagMs: 50 }, rest: { lagMs: 20 } },
      { countdown: { fps: null, lagMs: null }, rest: { lagMs: 20 } },
      { countdown: null, rest: null },
    ];
    for (const { countdown, rest } of cases) {
      expect(
        judgeTake({ canvas: false, mode: MODE_1080_60, wantFps: 60, counted, lagMs: 300, rest, countdown }),
      ).toBe(
        directTakeVerdict({
          wantFps: 60,
          modeFps: 60,
          presented: counted.frames,
          seconds: counted.seconds,
          restFps: countdown?.fps ?? null,
          resolution: '1080p',
          lagMs: 300,
          restLagMs: countdown?.lagMs ?? rest?.lagMs ?? null,
        }),
      );
    }
  });
});
