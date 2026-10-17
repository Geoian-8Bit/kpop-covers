import { avcLevel, COPY, type CopyEncoding } from './cloudCopyRules';

/**
 * 13 · Whether this browser can make the copy for the group, and which encoder settings it takes. Apart from the
 * copy itself (`cloudCopy.ts`, loaded only when a copy starts) so the studio can ask without loading the encoder.
 */

/** Sound of the copy (both AAC and Opus take it). */
export const SAMPLE_RATE = 48_000;

export const UNSUPPORTED_COPY =
  'Este navegador no puede preparar la copia para el grupo. Hazlo desde un ordenador con Chrome o Edge: abre allí esta canción y elige el mismo archivo.';

type OfflineCtor = typeof OfflineAudioContext;

export function offlineAudio(): OfflineCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: OfflineCtor }).webkitOfflineAudioContext) as
    | OfflineCtor
    | undefined;
}

export function hasApis(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof AudioData !== 'undefined' &&
    offlineAudio() != null &&
    typeof HTMLVideoElement !== 'undefined' &&
    'requestVideoFrameCallback' in HTMLVideoElement.prototype
  );
}

export interface PickedVideo {
  codec: 'avc1' | 'vp09';
  config: VideoEncoderConfig;
}

export async function pickVideoConfig(enc: Pick<CopyEncoding, 'width' | 'height' | 'videoBps' | 'fps'>): Promise<PickedVideo | null> {
  const base = {
    width: enc.width,
    height: enc.height,
    bitrate: enc.videoBps,
    framerate: enc.fps,
    bitrateMode: 'variable' as const,
    latencyMode: 'quality' as const,
  };
  const level = avcLevel(enc.width, enc.height);
  const candidates: PickedVideo[] = [
    // High, Main, Baseline: phones' hardware encoders often only do the last two.
    ...['6400', '4d00', '42e0'].map((p) => ({
      codec: 'avc1' as const,
      config: { ...base, codec: `avc1.${p}${level}`, avc: { format: 'avc' as const } } as VideoEncoderConfig,
    })),
    { codec: 'vp09' as const, config: { ...base, codec: enc.width * enc.height > 1280 * 720 ? 'vp09.00.40.08' : 'vp09.00.31.08' } },
  ];
  for (const candidate of candidates) {
    for (const hardwareAcceleration of ['no-preference', 'prefer-software'] as const) {
      const config = { ...candidate.config, hardwareAcceleration };
      try {
        const support = await VideoEncoder.isConfigSupported(config);
        if (support.supported) return { codec: candidate.codec, config: (support.config as VideoEncoderConfig) ?? config };
      } catch {
        /* this one isn't */
      }
    }
  }
  return null;
}

export interface PickedAudio {
  codec: 'mp4a' | 'Opus';
  config: AudioEncoderConfig;
}

export async function pickAudioConfig(channels: number, bitrate: number): Promise<PickedAudio | null> {
  const candidates: PickedAudio[] = [
    // AAC first: every phone plays it in MP4 (iPhone included).
    {
      codec: 'mp4a',
      config: { codec: 'mp4a.40.2', sampleRate: SAMPLE_RATE, numberOfChannels: channels, bitrate, aac: { format: 'aac' } } as AudioEncoderConfig,
    },
    { codec: 'Opus', config: { codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: channels, bitrate } },
  ];
  for (const candidate of candidates) {
    try {
      const support = await AudioEncoder.isConfigSupported(candidate.config);
      if (support.supported) return candidate;
    } catch {
      /* this one isn't */
    }
  }
  return null;
}

/** Whether this browser can make the copy (asks the encoders; a few milliseconds). */
export async function canMakeCloudCopy(): Promise<boolean> {
  if (!hasApis()) return false;
  const [video, audio] = await Promise.all([
    pickVideoConfig({ width: 1280, height: 720, videoBps: 2_000_000, fps: COPY.fps }),
    pickAudioConfig(2, COPY.audioBps),
  ]);
  return video != null && audio != null;
}
