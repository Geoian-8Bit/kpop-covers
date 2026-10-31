import { describe, expect, it } from 'vitest';
import {
  axisFraction,
  layerPoint,
  lockTarget,
  needsCssRotation,
  nextOrientationPref,
  orientationButtonLabel,
  showOrientationButton,
  stageIsVertical,
  youtubeFrameRatio,
  youtubeFsBox,
  youtubeInlineBox,
  needsAspectProbe,
  resolveAspect,
  VERTICAL_FILL_ZOOM,
} from './fullscreenRules';

describe('fixed orientation', () => {
  it('cycles auto → portrait → landscape → auto', () => {
    expect(nextOrientationPref('auto')).toBe('portrait');
    expect(nextOrientationPref('portrait')).toBe('landscape');
    expect(nextOrientationPref('landscape')).toBe('auto');
  });

  it('names the state and the next one', () => {
    expect(orientationButtonLabel('auto')).toBe('Fijar orientación: automática. Cambiar a vertical');
    expect(orientationButtonLabel('landscape')).toContain('horizontal');
  });

  it('locks only a fixed orientation', () => {
    expect(lockTarget('auto')).toBeNull();
    expect(lockTarget('portrait')).toBe('portrait');
    expect(lockTarget('landscape')).toBe('landscape');
  });

  it('rotates with CSS only when the device does not match and no lock holds', () => {
    expect(needsCssRotation({ pref: 'auto', deviceLandscape: false, lockHeld: false })).toBe(false);
    expect(needsCssRotation({ pref: 'portrait', deviceLandscape: false, lockHeld: false })).toBe(false);
    expect(needsCssRotation({ pref: 'portrait', deviceLandscape: true, lockHeld: false })).toBe(true);
    expect(needsCssRotation({ pref: 'landscape', deviceLandscape: false, lockHeld: false })).toBe(true);
    expect(needsCssRotation({ pref: 'landscape', deviceLandscape: true, lockHeld: false })).toBe(false);
    expect(needsCssRotation({ pref: 'landscape', deviceLandscape: false, lockHeld: true })).toBe(false);
  });

  it('shows the button on touch screens and in the CSS fullscreen only', () => {
    expect(showOrientationButton({ cssMode: false, touch: false })).toBe(false);
    expect(showOrientationButton({ cssMode: false, touch: true })).toBe(true);
    expect(showOrientationButton({ cssMode: true, touch: false })).toBe(true);
  });
});

describe('vertical video on the stage', () => {
  it('trusts the file size over the stored ratio', () => {
    expect(stageIsVertical({ media: { width: 1080, height: 1920 }, aspectRatio: null })).toBe(true);
    expect(stageIsVertical({ media: { width: 1920, height: 1080 }, aspectRatio: 0.5 })).toBe(false);
  });

  it('falls back to the stored ratio; unknown is horizontal', () => {
    expect(stageIsVertical({ media: null, aspectRatio: 9 / 16 })).toBe(true);
    expect(stageIsVertical({ media: null, aspectRatio: 1.77 })).toBe(false);
    expect(stageIsVertical({ media: null, aspectRatio: null })).toBe(false);
  });

  it('keeps 16:9 for horizontal YouTube and uses the real shape for vertical', () => {
    expect(youtubeFrameRatio(null)).toBe(16 / 9);
    expect(youtubeFrameRatio(1.7778)).toBe(16 / 9);
    expect(youtubeFrameRatio(9 / 16)).toBe(9 / 16);
  });
});

describe('pointer along a turned layer', () => {
  const rect = { left: 10, top: 100, width: 40, height: 400 };
  it('reads the horizontal axis normally', () => {
    expect(axisFraction({ clientX: 30, clientY: 0 }, { left: 10, top: 0, width: 40, height: 10 }, false)).toBeCloseTo(0.5);
  });
  it('reads the screen vertical when the layer is turned 90°', () => {
    expect(axisFraction({ clientX: 0, clientY: 200 }, rect, true)).toBeCloseTo(0.25);
    expect(axisFraction({ clientX: 0, clientY: 900 }, rect, true)).toBe(1);
    expect(axisFraction({ clientX: 0, clientY: 0 }, rect, true)).toBe(0);
  });
});

describe('layerPoint', () => {
  it('is the offset from the top-left corner when nothing is turned', () => {
    expect(layerPoint({ clientX: 30, clientY: 50 }, { left: 10, top: 20, width: 200, height: 100 }, false)).toEqual({ x: 20, y: 30 });
  });
  it('maps screen axes to the layer turned 90° clockwise', () => {
    // A 400×200 box turned on screen: its bounding rect is 200 wide and 400 tall.
    const rect = { left: 100, top: 0, width: 200, height: 400 };
    // The box's top-left corner sits at the screen's top-right of the rect.
    expect(layerPoint({ clientX: 300, clientY: 0 }, rect, true)).toEqual({ x: 0, y: 0 });
    // Its bottom-right corner at the rect's bottom-left.
    expect(layerPoint({ clientX: 100, clientY: 400 }, rect, true)).toEqual({ x: 400, y: 200 });
    // Moving down the screen moves along the box's width.
    expect(layerPoint({ clientX: 250, clientY: 100 }, rect, true)).toEqual({ x: 100, y: 50 });
  });
});

describe('vertical YouTube box (REQ-02)', () => {
  it('a horizontal or unknown video keeps the 16:9 contain box', () => {
    expect(youtubeFsBox(null)).toEqual({ aspectRatio: String(16 / 9), width: `min(100cqw, calc(100cqh * ${16 / 9}))` });
    expect(youtubeFsBox(1.77)).toEqual(youtubeFsBox(null));
  });

  it('a vertical video is as tall as the screen and crops only its sides', () => {
    expect(youtubeFsBox(0.5625)).toEqual({
      aspectRatio: '0.5625',
      width: `min(calc(100cqh * 0.5625), calc(100cqw * ${VERTICAL_FILL_ZOOM}))`,
    });
  });

  it('the zoom covers a 9:16 short on a 390×844 phone and on 20:9', () => {
    expect((844 * (9 / 16)) / 390).toBeLessThanOrEqual(VERTICAL_FILL_ZOOM);
    expect((20 * (9 / 16)) / 9).toBeLessThanOrEqual(VERTICAL_FILL_ZOOM);
  });

  it('outside fullscreen only a vertical video gets its own box', () => {
    expect(youtubeInlineBox(null)).toBeNull();
    expect(youtubeInlineBox(1.77)).toBeNull();
    expect(youtubeInlineBox(0.5625)).toEqual({ aspectRatio: '0.5625', width: 'min(100%, calc(60dvh * 0.5625))' });
  });

  it('probes YouTube videos not stored as vertical', () => {
    expect(needsAspectProbe({ youtube_id: 'abcdefghijk', aspect_ratio: null })).toBe(true);
    expect(needsAspectProbe({ youtube_id: 'abcdefghijk', aspect_ratio: 1.7699 })).toBe(true);
    expect(needsAspectProbe({ youtube_id: 'abcdefghijk', aspect_ratio: 0.565 })).toBe(false);
    expect(needsAspectProbe({ youtube_id: null, aspect_ratio: null })).toBe(false);
  });

  it('a fresh measurement wins over the stored ratio', () => {
    expect(resolveAspect(null, 0.565)).toBe(0.565);
    expect(resolveAspect(1.7699, 0.565)).toBe(0.565);
    expect(resolveAspect(1.7699, undefined)).toBe(1.7699);
    expect(resolveAspect(undefined, null)).toBeNull();
    expect(resolveAspect(0.5625, Number.NaN)).toBe(0.5625);
  });
});
