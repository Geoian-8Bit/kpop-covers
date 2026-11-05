import { afterEach, describe, expect, it, vi } from 'vitest';
import { audioContextCtor, offlineAudioContextCtor } from './audioCtor';

class Plain {}
class Prefixed {}

describe('audio constructors', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('null without a window', () => {
    expect(audioContextCtor()).toBeNull();
    expect(offlineAudioContextCtor()).toBeNull();
  });

  it('prefers the standard constructor, falls back to the WebKit one', () => {
    vi.stubGlobal('window', {
      AudioContext: Plain,
      webkitAudioContext: Prefixed,
      webkitOfflineAudioContext: Prefixed,
    });
    expect(audioContextCtor()).toBe(Plain);
    expect(offlineAudioContextCtor()).toBe(Prefixed);
  });

  it('null when the browser has neither', () => {
    vi.stubGlobal('window', {});
    expect(audioContextCtor()).toBeNull();
    expect(offlineAudioContextCtor()).toBeNull();
  });
});
