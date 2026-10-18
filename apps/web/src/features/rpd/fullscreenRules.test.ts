import { describe, expect, it } from 'vitest';
import { barLayout, escapeInFullscreen, fullscreenStep, stageTap } from './fullscreenRules';

describe('the round in full screen (54)', () => {
  it('asks the browser first, and falls back to the CSS layout where it can’t (iPhone)', () => {
    expect(fullscreenStep('none', true)).toBe('request-native');
    expect(fullscreenStep('none', false)).toBe('enter-css');
  });

  it('the same button leaves either kind of full screen', () => {
    expect(fullscreenStep('native', true)).toBe('exit-native');
    expect(fullscreenStep('css', false)).toBe('leave-css');
    expect(fullscreenStep('css', true)).toBe('leave-css');
  });

  it('Esc leaves full screen, never the round, while it is on', () => {
    expect(escapeInFullscreen('native')).toBe('browser');
    expect(escapeInFullscreen('css')).toBe('leave-css');
    expect(escapeInFullscreen('none')).toBeNull();
  });

  it('sideways the bar sits on the edge (it hides by itself); upright under the picture', () => {
    expect(barLayout(true, true)).toBe('overlay');
    expect(barLayout(true, false)).toBe('below');
    expect(barLayout(false, true)).toBe('normal');
    expect(barLayout(false, false)).toBe('normal');
  });

  it('a tap on the picture shows or hides the edge bar; elsewhere it pauses', () => {
    expect(stageTap('overlay', false)).toBe('show-bar');
    expect(stageTap('overlay', true)).toBe('hide-bar');
    expect(stageTap('below', true)).toBe('toggle-pause');
    expect(stageTap('normal', false)).toBe('toggle-pause');
  });
});
