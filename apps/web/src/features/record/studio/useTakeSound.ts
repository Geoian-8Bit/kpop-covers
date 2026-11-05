import { useEffect } from 'react';
import { usePlayer } from '@/player/store';
import { openMic } from '../camera';
import { primeSyncAudio } from '../syncAudio';
import type { Studio } from './useStudioSession';

/**
 * The take's sound (S3): the song's own sound when the source allows it (files) and the settings ask for it,
 * otherwise the microphone, raw and in stereo when possible (S2). Chosen again when the setting changes
 * between takes; a take in progress keeps the sound it started with.
 */
export function useTakeSound(S: Studio, open: boolean) {
  const { settings, recorder, session, songTrack, micTrack, setSound } = S;
  const songPossible = usePlayer((s) => Boolean(s.engine?.captureAudio));
  // F17: the take records what is heard, voice mode included.
  const voiceMode = usePlayer((s) => s.voiceMode);
  const songSoundLabel =
    voiceMode === 'sin-voz'
      ? 'la canción sin voz'
      : voiceMode === 'voz'
        ? 'la voz de la canción al frente'
        : 'el audio original de la canción';
  useEffect(() => {
    if (!open || recorder.current) return;
    const id = session.current;
    let live = true;
    const tap = settings.sound === 'song' ? (usePlayer.getState().engine?.captureAudio?.() ?? null) : null;
    songTrack.current = tap;
    micTrack.current?.stop();
    micTrack.current = null;
    // 43 · The context that will delay this sound, woken early (Chrome allows it after any tap): one that just
    // started may not know its latency yet. Only when this sound needs it (see primeSyncAudio).
    if (tap) primeSyncAudio(tap);
    if (tap) setSound('song');
    else {
      setSound('pending');
      void openMic(settings.micChannels).then((track) => {
        if (!live || id !== session.current) {
          track?.stop();
          return;
        }
        micTrack.current = track;
        primeSyncAudio(track);
        setSound(track ? 'mic' : 'none');
      });
    }
    return () => {
      live = false;
    };
  }, [
    open,
    settings.sound,
    settings.micChannels,
    songPossible,
    recorder,
    session,
    songTrack,
    micTrack,
    setSound,
  ]);
  return { songPossible, songSoundLabel };
}
