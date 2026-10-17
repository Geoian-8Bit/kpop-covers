import { CLAP_SCALE } from '@coverscape/shared';
import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from '../settings';

describe('clap sensitivity in the stored settings (P21: 3 levels → 4)', () => {
  it('an entry from the old scale maps to its equivalent: «Alta» was the new «Muy alta»', () => {
    expect(sanitizeSettings({ clapSensitivity: 'high' }).clapSensitivity).toBe('max');
    expect(sanitizeSettings({ clapSensitivity: 'medium' }).clapSensitivity).toBe('medium');
    expect(sanitizeSettings({ clapSensitivity: 'low' }).clapSensitivity).toBe('low');
  });

  it('an entry on the current scale stays as it is', () => {
    expect(sanitizeSettings({ clapSensitivity: 'high', clapScale: CLAP_SCALE }).clapSensitivity).toBe('high');
    expect(sanitizeSettings({ clapSensitivity: 'max', clapScale: CLAP_SCALE }).clapSensitivity).toBe('max');
  });

  it('missing or unknown values fall back to «Media», the default', () => {
    expect(sanitizeSettings(null).clapSensitivity).toBe('medium');
    expect(sanitizeSettings({}).clapSensitivity).toBe('medium');
    expect(sanitizeSettings({ clapSensitivity: 'loud', clapScale: CLAP_SCALE }).clapSensitivity).toBe('medium');
  });

  it('the rest of the settings are untouched by the migration', () => {
    expect(sanitizeSettings({ clapSensitivity: 'high', grid: true }).grid).toBe(true);
  });
});
