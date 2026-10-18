import { describe, expect, it } from 'vitest';
import { DEFAULT_RECORD_SETTINGS, initialFacing, sanitizeSettings } from './settings';

describe('recorder settings', () => {
  it('opens with the back camera the first time', () => {
    expect(initialFacing(sanitizeSettings(null))).toBe('environment');
  });

  it('opens with the camera used last', () => {
    expect(initialFacing(sanitizeSettings({ lastFacing: 'user' }))).toBe('user');
  });

  it('P25 · migrates the old «Cámara al abrir» setting to the camera it opened with', () => {
    expect(sanitizeSettings({ startCamera: 'front', lastFacing: 'environment' }).lastFacing).toBe('user');
    expect(sanitizeSettings({ startCamera: 'back', lastFacing: 'user' }).lastFacing).toBe('environment');
    expect(sanitizeSettings({ startCamera: 'last', lastFacing: 'user' }).lastFacing).toBe('user');
    expect('startCamera' in sanitizeSettings({ startCamera: 'front' })).toBe(false);
  });

  it('keeps known values and drops unknown ones', () => {
    const s = sanitizeSettings({ quality: 'max', fps: 45, grid: true, nonsense: 1 });
    expect(s.quality).toBe('max');
    expect(s.fps).toBe(DEFAULT_RECORD_SETTINGS.fps);
    expect(s.grid).toBe(true);
    expect('nonsense' in s).toBe(false);
  });

  it('43 · keeps the sync fine adjustment only on its ±150 ms steps of 10', () => {
    expect(sanitizeSettings(null).syncTrimMs).toBe(0);
    expect(sanitizeSettings({ syncTrimMs: -40 }).syncTrimMs).toBe(-40);
    expect(sanitizeSettings({ syncTrimMs: 150 }).syncTrimMs).toBe(150);
    expect(sanitizeSettings({ syncTrimMs: 160 }).syncTrimMs).toBe(0);
    expect(sanitizeSettings({ syncTrimMs: 15 }).syncTrimMs).toBe(0);
    expect(sanitizeSettings({ syncTrimMs: '30' }).syncTrimMs).toBe(0);
  });
});
