import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from '../settings';

describe('clap sensitivity in the stored settings (P42: back to the three F7 levels)', () => {
  it('«Muy alta», from the four-level scale (P21), becomes «Alta»', () => {
    expect(sanitizeSettings({ clapSensitivity: 'max', clapScale: 2 }).clapSensitivity).toBe('high');
    expect(sanitizeSettings({ clapSensitivity: 'max' }).clapSensitivity).toBe('high');
  });

  it('«Baja», «Media» and «Alta» stay as they are, whatever scale they were saved on', () => {
    for (const scale of [undefined, 2]) {
      expect(sanitizeSettings({ clapSensitivity: 'low', clapScale: scale }).clapSensitivity).toBe('low');
      expect(sanitizeSettings({ clapSensitivity: 'medium', clapScale: scale }).clapSensitivity).toBe('medium');
      expect(sanitizeSettings({ clapSensitivity: 'high', clapScale: scale }).clapSensitivity).toBe('high');
    }
  });

  it('missing or unknown values fall back to «Media», the default', () => {
    expect(sanitizeSettings(null).clapSensitivity).toBe('medium');
    expect(sanitizeSettings({}).clapSensitivity).toBe('medium');
    expect(sanitizeSettings({ clapSensitivity: 'loud' }).clapSensitivity).toBe('medium');
  });

  it('the old scale marker is dropped and the rest of the settings are untouched', () => {
    const s = sanitizeSettings({ clapSensitivity: 'max', clapScale: 2, grid: true });
    expect(s.grid).toBe(true);
    expect('clapScale' in s).toBe(false);
  });
});
