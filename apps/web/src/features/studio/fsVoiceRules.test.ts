import { describe, expect, it } from 'vitest';
import { fsVoiceButton, voiceModeName } from './fsVoiceRules';

describe('fullscreen voice button (46)', () => {
  it('shows only where the split works (a file, never YouTube)', () => {
    expect(fsVoiceButton('original', false).shown).toBe(false);
    expect(fsVoiceButton('original', true).shown).toBe(true);
  });

  it('names the mode in use, and tags it beside the icon only when it is not the whole song', () => {
    expect(fsVoiceButton('original', true)).toEqual({ shown: true, label: 'Voz y música: Todo', tag: null });
    expect(fsVoiceButton('sin-voz', true)).toEqual({ shown: true, label: 'Voz y música: Sin voz', tag: 'Sin voz' });
    expect(fsVoiceButton('voz', true).tag).toBe('Voz');
  });

  it('uses the same names as the control under the player', () => {
    expect(['original', 'sin-voz', 'voz'].map((m) => voiceModeName(m as 'original'))).toEqual(['Todo', 'Sin voz', 'Voz']);
  });
});
