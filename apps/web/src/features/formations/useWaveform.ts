import type { Video } from '@coverscape/shared';
import { useEffect, useState } from 'react';
import { useFileSource } from '@/features/studio/fileSource';
import { WAVE_MAX_BYTES, waveBuckets, wavePeaks } from './waveformRules';

export interface Wave {
  peaks: number[];
  /** Seconds of audio the peaks cover (the file's own length). */
  seconds: number;
  /** Where the file starts on the video's clock (a linked file can be offset, F1). */
  offset: number;
}

/** Decoded waves of this visit, by file URL key (a second visit to the plan doesn't decode again). */
const cache = new Map<string, Wave>();

/**
 * REQ-09 · The real wave of the song's file (never with YouTube: its audio can't be reached). Decoded once with an
 * OfflineAudioContext, which never makes a sound. Null while loading, when there's no file on this device or the
 * file is too big to decode.
 */
export function useWaveform(video: Video, enabled: boolean): Wave | null {
  const file = useFileSource(video, 0, enabled);
  const [wave, setWave] = useState<Wave | null>(null);
  const offset = video.source === 'youtube' ? Number(video.file_offset_seconds ?? 0) : 0;
  const key = `${video.id}:${video.file_size ?? ''}:${video.file_name ?? ''}`;

  useEffect(() => {
    setWave(null);
    if (!enabled || file.status !== 'ready') return;
    const known = cache.get(key);
    if (known) {
      setWave({ ...known, offset });
      return;
    }
    const size = file.local?.size ?? video.file_size ?? null;
    if (size != null && size > WAVE_MAX_BYTES) return;
    if (typeof OfflineAudioContext === 'undefined') return;
    let cancelled = false;
    void (async () => {
      try {
        const data = file.local ? await file.local.arrayBuffer() : await (await fetch(file.url)).arrayBuffer();
        if (cancelled) return;
        const ctx = new OfflineAudioContext(1, 1, 44100);
        const audio = await ctx.decodeAudioData(data);
        if (cancelled) return;
        const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
        const result: Wave = { peaks: wavePeaks(channels, waveBuckets(audio.duration, size)), seconds: audio.duration, offset };
        cache.set(key, result);
        setWave(result);
      } catch {
        // No audio track or a codec the browser can't decode: no wave, nothing else changes.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, file, key, offset, video.file_size]);

  return wave;
}
