import type { VoiceMode } from '@/features/voice/voiceRules';

/** 46 · Short names of the modes, as the control under the player shows them. */
const MODE_NAME: Record<VoiceMode, string> = { original: 'Todo', 'sin-voz': 'Sin voz', voz: 'Voz' };

export function voiceModeName(mode: VoiceMode): string {
  return MODE_NAME[mode];
}

/**
 * 46 · Fullscreen's «Voz y música» button: only where the split works (a file on the stage; never with YouTube),
 * as under the player. Its name says the mode in use; beside the icon, the mode only when it isn't the whole song.
 */
export function fsVoiceButton(mode: VoiceMode, available: boolean): { shown: boolean; label: string; tag: string | null } {
  return {
    shown: available,
    label: `Voz y música: ${voiceModeName(mode)}`,
    tag: mode === 'original' ? null : voiceModeName(mode),
  };
}
