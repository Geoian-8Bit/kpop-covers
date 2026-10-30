import { describe, expect, it } from 'vitest';
import {
  lockTarget,
  needsCssRotation,
  nextOrientationPref,
  orientationButtonLabel,
  showOrientationButton,
  stageIsVertical,
  youtubeFrameRatio,
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
