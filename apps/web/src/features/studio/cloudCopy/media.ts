import { abortError as cancelled } from '@/lib/async';
import { FriendlyError } from '@/lib/supabase';
import { COPY, type CopyHold } from '../cloudCopyRules';
import { offlineAudio, SAMPLE_RATE, UNSUPPORTED_COPY } from '../cloudCopySupport';

/**
 * 13 · REQ-27 · What every part of the copy for the cloud shares: its public types, cancelling, and reading the
 * original (its length and size, its sound).
 */

export type CopyPhase = 'sound' | 'picture' | 'checking';

export interface CopyProgress {
  phase: CopyPhase;
  /** 0–1 of the whole copy. */
  progress: number;
  attempt: number;
  width?: number;
  height?: number;
}

export interface CloudCopyResult {
  blob: Blob;
  width: number;
  height: number;
  durationSeconds: number;
  /** How late the encoder had put the sound before it was corrected (seconds). */
  correctedShiftSeconds: number;
}

/** What the rest of the device allows the copy right now (see `copyPace`). */
export interface CopyPaceNow {
  hold: CopyHold | null;
  maxRate: number;
}

export interface CloudCopyOptions {
  targetBytes: number;
  limitBytes: number;
  signal?: AbortSignal;
  onProgress?: (p: CopyProgress) => void;
  /** Asked several times a second: wait (no frames, no encoder) or go no faster than `maxRate`. */
  pace?: () => CopyPaceNow;
  /** The copy started waiting (why) or goes on (null). */
  onHold?: (hold: CopyHold | null) => void;
}

export const FREE: CopyPaceNow = { hold: null, maxRate: COPY.maxRate };

export const abortError = () => cancelled('Copia cancelada');
export { isAbort, sleep } from '@/lib/async';

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

export function toBytes(source: AllowSharedBufferSource | undefined): Uint8Array | undefined {
  if (!source) return undefined;
  if (source instanceof ArrayBuffer) return new Uint8Array(source.slice(0));
  const view = source as ArrayBufferView;
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer);
}

// ───────────── Reading the original ─────────────

interface Probe {
  duration: number;
  width: number;
  height: number;
}

export function hiddenVideo(url: string): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  // On the page (some browsers stop decoding detached videos) but invisible and out of the way.
  video.style.cssText =
    'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1';
  video.src = url;
  document.body.appendChild(video);
  return video;
}

export function releaseVideo(video: HTMLVideoElement, url: string) {
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.remove();
  URL.revokeObjectURL(url);
}

export function waitFor(
  target: EventTarget,
  event: string,
  signal?: AbortSignal,
  timeoutMs?: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      target.removeEventListener('error', onError);
    };
    const onAbort = () => {
      done();
      reject(abortError());
    };
    const onError = () => {
      done();
      reject(new FriendlyError('El navegador no puede abrir este vídeo para preparar la copia.'));
    };
    target.addEventListener(
      event,
      () => {
        done();
        resolve();
      },
      { once: true },
    );
    target.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (timeoutMs) {
      timer = setTimeout(() => {
        done();
        reject(new FriendlyError('El vídeo tardó demasiado en abrirse para preparar la copia.'));
      }, timeoutMs);
    }
  });
}

/** Length and picture size of a video file, as the browser plays it. */
export async function probeVideo(blob: Blob, signal?: AbortSignal): Promise<Probe> {
  const url = URL.createObjectURL(blob);
  const video = hiddenVideo(url);
  try {
    if (video.readyState < HTMLMediaElement.HAVE_METADATA)
      await waitFor(video, 'loadedmetadata', signal, 20_000);
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new FriendlyError('No se ha podido leer la duración del vídeo.');
    }
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
  } finally {
    releaseVideo(video, url);
  }
}

export interface Sound {
  channels: Float32Array[];
  sampleRate: number;
}

/** The whole sound of a file, at 48 kHz (at most two channels). */
export async function decodeSound(blob: Blob): Promise<Sound> {
  const Ctor = offlineAudio();
  if (!Ctor) throw new FriendlyError(UNSUPPORTED_COPY);
  let data: ArrayBuffer;
  try {
    data = await blob.arrayBuffer();
  } catch {
    throw new FriendlyError('No hay memoria para leer el archivo entero. Prueba desde un ordenador.');
  }
  const ctx = new Ctor(2, 1, SAMPLE_RATE);
  let buffer: AudioBuffer;
  try {
    buffer = await new Promise<AudioBuffer>((resolve, reject) => {
      const p = ctx.decodeAudioData(data, resolve, reject);
      // Older Safari returns nothing; newer browsers return a promise too.
      (p as Promise<AudioBuffer> | undefined)?.then?.(resolve, reject);
    });
  } catch {
    throw new FriendlyError(
      'No se ha podido leer el sonido del archivo para preparar la copia. Prueba desde un ordenador con Chrome o Edge.',
    );
  }
  const count = Math.min(2, buffer.numberOfChannels);
  const channels = Array.from({ length: count }, (_, i) => buffer.getChannelData(i));
  return { channels, sampleRate: buffer.sampleRate };
}
