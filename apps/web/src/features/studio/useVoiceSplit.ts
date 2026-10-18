import { useEffect, useState } from 'react';
import { usePlayer } from '@/player/store';
import type { VoiceMode } from '@/features/voice/voiceRules';

/**
 * F17 · 46 · «Todo / Sin voz / Voz» as the studio shows it, under the player and in fullscreen: one state, the
 * player's (store.ts), so both views always agree. `available`: the stage's engine can split (a file; YouTube's sound
 * can't be reached). While a split is on, the graph is asked now and then whether the song is mono (then «sin voz»
 * can't work) — only while `watch` (the control is on screen).
 */
export function useVoiceSplit(watch = true): {
  mode: VoiceMode;
  available: boolean;
  monoLike: boolean;
  setMode: (mode: VoiceMode) => void;
} {
  const mode = usePlayer((s) => s.voiceMode);
  const available = usePlayer((s) => Boolean(s.engine?.setVoiceMode));
  const [monoLike, setMonoLike] = useState(false);
  useEffect(() => {
    if (!watch || !available || mode === 'original') return;
    const id = setInterval(() => {
      const info = usePlayer.getState().engine?.voiceInfo?.();
      if (info?.settled) setMonoLike(info.monoLike);
    }, 600);
    return () => clearInterval(id);
  }, [watch, available, mode]);
  return { mode, available, monoLike, setMode: setVoiceMode };
}

const setVoiceMode = (mode: VoiceMode) => usePlayer.getState().setVoiceMode(mode);
