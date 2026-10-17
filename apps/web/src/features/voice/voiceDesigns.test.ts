import { describe, expect, it } from 'vitest';
import { registryProblems } from '@/features/lab/labState';
import { voiceMoment } from '@/features/lab/moments/voice';
import { isVoiceDesign, VOICE_DESIGNS } from './waveRules';

describe('lab moment voice-split', () => {
  it('offers exactly the designs VoiceSplitControl can draw, with «La ola partida» by default', () => {
    expect(voiceMoment.variants.map((v) => v.id)).toEqual([...VOICE_DESIGNS]);
    expect(voiceMoment.defaultVariant).toBe('onda');
    expect(voiceMoment.appliesLive).toBe(true);
    expect(registryProblems([voiceMoment])).toEqual([]);
  });

  it('isVoiceDesign knows the ids and nothing else', () => {
    for (const id of VOICE_DESIGNS) expect(isVoiceDesign(id)).toBe(true);
    expect(isVoiceDesign('ola')).toBe(false);
    expect(isVoiceDesign('')).toBe(false);
  });
});
