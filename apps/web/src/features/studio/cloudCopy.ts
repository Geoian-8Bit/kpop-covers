import { FriendlyError } from '@/lib/supabase';
import { measureShift } from './audioAlign';
import {
  acceptableBytes,
  COPY,
  copyEncoding,
  overshooting,
  projectBytes,
  retryVideoBps,
  sameLength,
  SHIFT_ACCEPT_SECONDS,
  SHIFT_TOLERANCE_SECONDS,
  shiftSamples,
  type CopyEncoding,
  type CopyHold,
} from './cloudCopyRules';
import {
  hasApis,
  offlineAudio,
  pickAudioConfig,
  pickVideoConfig,
  SAMPLE_RATE,
  UNSUPPORTED_COPY,
  type PickedAudio,
  type PickedVideo,
} from './cloudCopySupport';
import { muxMp4, vpcConfig, type MuxAudioTrack, type MuxSample, type MuxVideoTrack } from './mp4Mux';

/**
 * 13 · Makes, on this device, the reduced copy of a video for the group's cloud (under ~48 MB): same video, same
 * timeline, smaller picture and bitrate. The original stays here and keeps being the one this device plays.
 *
 * How (WebCodecs, no extra libraries):
 *  - Sound: the original's whole sound is decoded (`decodeAudioData`) and encoded again (AAC, or Opus) from its
 *    very first sample. Then the encoded sound is decoded back and compared with the original: if the encoder
 *    delayed it (AAC adds some silence at the start), the sound is encoded again moved by exactly that much, and
 *    checked again. So the copy's sound starts with the original's, to the sample.
 *  - Picture: the original plays muted in a hidden <video> (1× to 2×, slower if frames get lost, at most 1× while
 *    the studio plays) and each frame is drawn smaller and encoded (H.264, or VP9) with the frame's own time in the
 *    original (`mediaTime`). Pausing (hidden app, busy encoder, the recorder open, the voice being separated) can't
 *    shift anything: times come from the original, not from the clock.
 *  - Our own MP4 writer puts both together with those exact times.
 *  - Check: the finished file must open in the browser and last as long as the original.
 * Too big after an attempt (or heading there): again with less bitrate, up to 3 times.
 */

const MIN_RATE = 0.5;
/** Seconds of sound compared to find the start shift. */
const CHECK_SECONDS = 45;

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

const FREE: CopyPaceNow = { hold: null, maxRate: COPY.maxRate };

const abortError = () => new DOMException('Copia cancelada', 'AbortError');

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toBytes(source: AllowSharedBufferSource | undefined): Uint8Array | undefined {
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

function hiddenVideo(url: string): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  // On the page (some browsers stop decoding detached videos) but invisible and out of the way.
  video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1';
  video.src = url;
  document.body.appendChild(video);
  return video;
}

function releaseVideo(video: HTMLVideoElement, url: string) {
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.remove();
  URL.revokeObjectURL(url);
}

function waitFor(target: EventTarget, event: string, signal?: AbortSignal, timeoutMs?: number): Promise<void> {
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
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) await waitFor(video, 'loadedmetadata', signal, 20_000);
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new FriendlyError('No se ha podido leer la duración del vídeo.');
    }
    return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
  } finally {
    releaseVideo(video, url);
  }
}

interface Sound {
  channels: Float32Array[];
  sampleRate: number;
}

/** The whole sound of a file, at 48 kHz (at most two channels). */
async function decodeSound(blob: Blob): Promise<Sound> {
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
    throw new FriendlyError('No se ha podido leer el sonido del archivo para preparar la copia. Prueba desde un ordenador con Chrome o Edge.');
  }
  const count = Math.min(2, buffer.numberOfChannels);
  const channels = Array.from({ length: count }, (_, i) => buffer.getChannelData(i));
  return { channels, sampleRate: buffer.sampleRate };
}

// ───────────── Sound ─────────────

interface EncodedSound {
  track: MuxAudioTrack;
  bytes: number;
}

/**
 * Encodes the sound from its first sample. `shift` > 0 drops that many samples at the start, < 0 adds that much
 * silence (to undo a delay the encoder adds).
 */
async function encodeSound(sound: Sound, picked: PickedAudio, bitrate: number, shift: number, signal?: AbortSignal): Promise<EncodedSound> {
  const channels = picked.config.numberOfChannels;
  const total = sound.channels[0]!.length;
  const skip = Math.max(0, shift);
  const pad = Math.max(0, -shift);
  const length = total - skip + pad;
  const samples: MuxSample[] = [];
  let description: Uint8Array | undefined;
  let failure: unknown = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({ data, time: chunk.timestamp, duration: chunk.duration ?? 0, key: true });
      if (!description) description = toBytes(meta?.decoderConfig?.description);
    },
    error: (e) => {
      failure = e;
    },
  });
  try {
    encoder.configure({ ...picked.config, bitrate });
    const block = 4800; // 0,1 s
    for (let pos = 0; pos < length; pos += block) {
      throwIfAborted(signal);
      if (failure) throw failure;
      const n = Math.min(block, length - pos);
      const planar = new Float32Array(n * channels);
      for (let c = 0; c < channels; c++) {
        const src = sound.channels[Math.min(c, sound.channels.length - 1)]!;
        const offset = pos - pad + skip;
        for (let i = 0; i < n; i++) {
          const j = offset + i;
          planar[c * n + i] = j >= 0 && j < total ? src[j]! : 0;
        }
      }
      const data = new AudioData({
        format: 'f32-planar',
        sampleRate: sound.sampleRate,
        numberOfFrames: n,
        numberOfChannels: channels,
        timestamp: Math.round((pos / sound.sampleRate) * 1e6),
        data: planar,
      });
      encoder.encode(data);
      data.close();
      while (encoder.encodeQueueSize > 8 && !failure) await sleep(4);
    }
    await encoder.flush();
    if (failure) throw failure;
  } catch (error) {
    if (isAbort(error) || error instanceof FriendlyError) throw error;
    console.error('[cloudCopy] sound', error);
    throw new FriendlyError('No se pudo preparar el sonido de la copia.');
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  // Opus: the decoder must not drop anything we didn't ask for; our own shift takes care of the delay.
  const track: MuxAudioTrack = {
    codec: picked.codec,
    sampleRate: sound.sampleRate,
    channels,
    description: picked.codec === 'mp4a' ? description : undefined,
    preSkip: 0,
    bitrate,
    samples,
  };
  return { track, bytes: samples.reduce((n, s) => n + s.data.byteLength, 0) };
}

/** How late the encoded sound starts against the original (decoded back from a short MP4 of its start). */
async function soundShift(original: Sound, encoded: EncodedSound): Promise<{ seconds: number; confidence: number } | null> {
  const end = CHECK_SECONDS * 1e6;
  const head = encoded.track.samples.filter((s) => s.time < end);
  if (!head.length) return null;
  const file = new Blob(muxMp4({ audio: { ...encoded.track, samples: head } }) as BlobPart[], { type: 'audio/mp4' });
  const back = await decodeSound(file);
  return measureShift(original.channels, back.channels, original.sampleRate, { windowSeconds: CHECK_SECONDS - 5 });
}

/** Encode, measure the start, correct it if needed and check again. */
async function encodeAlignedSound(
  original: Sound,
  picked: PickedAudio,
  bitrate: number,
  signal: AbortSignal | undefined,
  onStep: (fraction: number) => void,
  /** Global review 2 [4] · Waits between the steps while the device is asked for (the recorder opened meanwhile). */
  between: () => Promise<void> = async () => undefined,
): Promise<{ sound: EncodedSound; corrected: number }> {
  let shift = 0;
  let sound = await encodeSound(original, picked, bitrate, shift, signal);
  onStep(0.4);
  await between();
  let first = await soundShift(original, sound).catch(() => null);
  // AAC starts late by its priming. The standard fix is an edit list that tells every player to drop exactly that
  // (so the copy plays in step on any browser, not only on one that decodes like this one). Kept only if this
  // browser honours it too; otherwise the sound itself is moved, as before.
  if (
    picked.codec === 'mp4a' &&
    first &&
    first.confidence >= 0.5 &&
    first.seconds > SHIFT_TOLERANCE_SECONDS &&
    first.seconds < 0.15
  ) {
    const priming = shiftSamples(first.seconds, original.sampleRate);
    const edited: EncodedSound = { ...sound, track: { ...sound.track, primingSamples: priming } };
    await between();
    const check = await soundShift(original, edited).catch(() => null);
    if (check && check.confidence >= 0.5 && Math.abs(check.seconds) <= SHIFT_ACCEPT_SECONDS) {
      onStep(1);
      return { sound: edited, corrected: 0 };
    }
    console.info('[cloudCopy] this browser ignores the AAC edit list; moving the sound instead');
  }
  for (let round = 0; round < 2; round++) {
    throwIfAborted(signal);
    if (round > 0) await between();
    const measured = round === 0 ? first : await soundShift(original, sound).catch(() => null);
    first = null;
    onStep(0.6 + round * 0.2);
    // Nothing to compare (silence) or not alike enough to trust: leave it as it is.
    if (!measured || measured.confidence < 0.5) break;
    if (Math.abs(measured.seconds) <= (round === 0 ? SHIFT_TOLERANCE_SECONDS : SHIFT_ACCEPT_SECONDS)) break;
    if (round === 1) {
      throw new FriendlyError('No se ha podido ajustar el inicio del sonido de la copia. Prueba desde un ordenador con Chrome o Edge.');
    }
    shift += shiftSamples(measured.seconds, original.sampleRate);
    await between();
    sound = await encodeSound(original, picked, bitrate, shift, signal);
  }
  onStep(1);
  return { sound, corrected: shift / original.sampleRate };
}

// ───────────── Picture ─────────────

/**
 * Waits until the first frame can be drawn, paused at 0. Some browsers (iPhone) load nothing until asked to play:
 * then it plays for a moment (muted) and goes back to the start.
 */
async function firstFrame(video: HTMLVideoElement, signal?: AbortSignal) {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    try {
      await waitFor(video, 'loadeddata', signal, 4000);
    } catch (error) {
      if (isAbort(error)) throw error;
      await video.play().catch(() => {
        throw new FriendlyError('El navegador no dejó abrir el vídeo para preparar la copia.');
      });
      video.pause();
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitFor(video, 'loadeddata', signal, 30_000);
    }
  }
  if (video.currentTime > 0.001) {
    video.currentTime = 0;
    await waitFor(video, 'seeked', signal, 10_000);
  }
}

type PictureResult =
  | { ok: true; track: MuxVideoTrack; bytes: number }
  | { ok: false; projectedBytes: number };

/** Plays the original muted and encodes each frame with its own time; gives up early if it's heading too big. */
async function encodePicture(
  source: Blob,
  enc: CopyEncoding,
  picked: PickedVideo,
  duration: number,
  guard: { audioBytes: number; limitBytes: number },
  signal: AbortSignal | undefined,
  onProgress: (fraction: number) => void,
  share: Pick<CloudCopyOptions, 'pace' | 'onHold'> = {},
): Promise<PictureResult> {
  throwIfAborted(signal);
  const url = URL.createObjectURL(source);
  const video = hiddenVideo(url);
  const samples: MuxSample[] = [];
  let description: Uint8Array | undefined;
  let bytes = 0;
  let encoder: VideoEncoder | null = null;
  let frameHandle: number | null = null;
  let pump: ReturnType<typeof setInterval> | null = null;
  let onVisibility: (() => void) | null = null;
  /** `null`: played to the end · a number: stopped early, heading for that many bytes. */
  let finish: ((overBytes: number | null) => void) | null = null;
  let fail: ((e: unknown) => void) | null = null;
  const onAbort = () => fail?.(abortError());

  try {
    await firstFrame(video, signal);

    const canvas = document.createElement('canvas');
    canvas.width = enc.width;
    canvas.height = enc.height;
    const g = canvas.getContext('2d', { alpha: false });
    if (!g) throw new FriendlyError(UNSUPPORTED_COPY);
    g.imageSmoothingQuality = 'high';

    const result = new Promise<number | null>((resolve, reject) => {
      finish = resolve;
      fail = reject;
    });
    result.catch(() => undefined);
    signal?.addEventListener('abort', onAbort, { once: true });

    encoder = new VideoEncoder({
      output: (chunk, meta) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        samples.push({ data, time: chunk.timestamp, duration: chunk.duration ?? 0, key: chunk.type === 'key' });
        bytes += data.byteLength;
        if (!description) description = toBytes(meta?.decoderConfig?.description);
      },
      error: (e) => {
        console.error('[cloudCopy] picture', e);
        fail?.(new FriendlyError('El codificador de vídeo de este dispositivo ha fallado. Prueba desde un ordenador con Chrome o Edge.'));
      },
    });
    encoder.configure(picked.config);
    const enc2 = encoder;

    const interval = 1 / enc.fps;
    let lastCaptured = -Infinity;
    let lastKey = -Infinity;
    let lastSeen = -Infinity;
    let lastFrameAt = performance.now();
    let held = false; // paused by us: the encoder is behind
    let hiddenPause = false;
    let paced = false; // paused for the rest of the device (the recorder open, the voice being separated)
    let shownHold: CopyHold | null = null;
    let rateCap: number = COPY.maxRate;
    let rate = 1;
    let windowStart = 0;
    let drops = 0;
    let maxQueue = 0;
    let finished = false;

    const capture = (t: number) => {
      g.drawImage(video, 0, 0, enc.width, enc.height);
      const key = lastKey === -Infinity || t - lastKey >= COPY.keyEverySeconds - interval / 2;
      const frame = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6), duration: Math.round(interval * 1e6) });
      try {
        enc2.encode(frame, { keyFrame: key });
      } finally {
        frame.close();
      }
      if (key) lastKey = t;
      lastCaptured = t;
      lastFrameAt = performance.now();
      maxQueue = Math.max(maxQueue, enc2.encodeQueueSize);
      const progress = Math.min(0.999, t / duration);
      onProgress(progress);
      const projected = projectBytes(bytes, progress, guard.audioBytes);
      if (overshooting({ projectedBytes: projected, progress, limitBytes: guard.limitBytes })) {
        finished = true;
        finish?.(projected);
        return;
      }
      if (enc2.encodeQueueSize > 6 && !video.paused) {
        held = true;
        video.pause();
      }
    };

    const onFrame: VideoFrameRequestCallback = (_now, meta) => {
      if (finished) return;
      frameHandle = video.requestVideoFrameCallback(onFrame);
      const t = meta.mediaTime;
      if (lastSeen > -Infinity && t > lastSeen && t - lastSeen > 1.5 * interval) drops++;
      lastSeen = Math.max(lastSeen, t);
      if (t < lastCaptured + 0.75 * interval) return;
      capture(t);
      // Speed: up while nothing is lost and the encoder keeps up; down when frames go missing.
      if (t - windowStart >= 4) {
        if (drops === 0 && maxQueue <= 3 && rate < rateCap) rate = Math.min(rateCap, rate + 0.25);
        else if (drops >= 2 && rate > MIN_RATE) rate = Math.max(MIN_RATE, rate - 0.25);
        video.playbackRate = rate;
        windowStart = t;
        drops = 0;
        maxQueue = 0;
      }
    };

    /** Reads what the rest of the device allows now; true while the copy has to wait. */
    const readPace = () => {
      const now = share.pace?.() ?? FREE;
      rateCap = now.maxRate;
      if (rate > rateCap) {
        rate = Math.max(MIN_RATE, rateCap);
        video.playbackRate = rate;
      }
      if (now.hold) {
        if (!paced) video.pause();
        paced = true;
        // Waiting for someone else is no sign of being stuck.
        lastFrameAt = performance.now();
      } else if (paced) {
        paced = false;
        lastFrameAt = performance.now();
      }
      if (now.hold !== shownHold) {
        shownHold = now.hold;
        share.onHold?.(now.hold);
      }
      return paced;
    };

    const resume = () => {
      if (finished || video.ended || hiddenPause || paced) return;
      if (held && enc2.encodeQueueSize > 2) return;
      held = false;
      lastFrameAt = performance.now();
      if (video.paused) void video.play().catch(() => undefined);
    };
    enc2.addEventListener?.('dequeue', resume);
    onVisibility = () => {
      if (document.hidden) {
        hiddenPause = true;
        video.pause();
      } else {
        hiddenPause = false;
        resume();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    pump = setInterval(() => {
      if (finished || readPace() || document.hidden) return;
      resume();
      // Nothing new for a long while with the app in sight: stuck (longer if it's the encoder that's behind).
      if (performance.now() - lastFrameAt > (held ? 60_000 : 25_000)) {
        fail?.(new FriendlyError('El vídeo se atascó al preparar la copia. Inténtalo otra vez con la app abierta y a la vista.'));
      }
    }, 250);

    video.addEventListener('ended', () => {
      if (finished) return;
      finished = true;
      void enc2.flush().then(
        () => finish?.(null),
        (e) => fail?.(e),
      );
    });

    // The first frame, as it is before playing (the frame callback may only start at the second one).
    capture(0);
    frameHandle = video.requestVideoFrameCallback(onFrame);
    hiddenPause = document.hidden;
    if (!readPace() && !hiddenPause) {
      try {
        await video.play();
      } catch {
        throw new FriendlyError('El navegador no dejó reproducir el vídeo para preparar la copia.');
      }
    }

    const over = await result;
    if (over != null) return { ok: false, projectedBytes: over };
    if (!samples.length) throw new FriendlyError('La copia salió vacía. Inténtalo otra vez.');
    // The last frame lasts until the original ends.
    const last = samples.reduce((a, b) => (b.time > a.time ? b : a));
    last.duration = Math.round(Math.min(1, Math.max(interval, duration - last.time / 1e6)) * 1e6);
    let desc = description;
    if (picked.codec === 'vp09') desc = vpcConfig(enc.width * enc.height > 1280 * 720 ? 40 : 31);
    if (!desc) throw new FriendlyError('El codificador de vídeo no dio su configuración. Prueba desde un ordenador con Chrome o Edge.');
    return {
      ok: true,
      bytes,
      track: { codec: picked.codec, width: enc.width, height: enc.height, description: desc, samples },
    };
  } finally {
    if (frameHandle != null) video.cancelVideoFrameCallback?.(frameHandle);
    if (pump) clearInterval(pump);
    if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
    signal?.removeEventListener('abort', onAbort);
    // A hold shown by this attempt ends with it (the next one asks again).
    share.onHold?.(null);
    if (encoder && encoder.state !== 'closed') encoder.close();
    releaseVideo(video, url);
  }
}

// ───────────── The whole copy ─────────────

/** Waits while the rest of the device asks the copy to (the recorder open, the voice being separated). */
async function untilFree(opts: CloudCopyOptions): Promise<void> {
  let shown: CopyHold | null = null;
  for (let hold = opts.pace?.().hold ?? null; hold; hold = opts.pace?.().hold ?? null) {
    throwIfAborted(opts.signal);
    if (hold !== shown) opts.onHold?.((shown = hold));
    await sleep(250);
  }
  throwIfAborted(opts.signal);
  if (shown) opts.onHold?.(null);
}

/**
 * The copy for the group: resolves with an MP4 under the limit, rejects with an AbortError when cancelled or a
 * FriendlyError with Spanish copy.
 */
export async function makeCloudCopy(source: Blob, opts: CloudCopyOptions): Promise<CloudCopyResult> {
  const { signal } = opts;
  throwIfAborted(signal);
  if (!hasApis()) throw new FriendlyError(UNSUPPORTED_COPY);
  const report = (p: CopyProgress) => opts.onProgress?.(p);
  report({ phase: 'sound', progress: 0, attempt: 1 });

  const probe = await probeVideo(source, signal);
  if (!probe.width || !probe.height) throw new FriendlyError('El archivo no tiene imagen.');
  const planned = copyEncoding({
    seconds: probe.duration,
    targetBytes: opts.targetBytes,
    srcWidth: probe.width,
    srcHeight: probe.height,
    sourceBps: (source.size * 8) / probe.duration,
  });
  if (!planned) throw new FriendlyError('El vídeo dura demasiado para que su copia quepa en un solo archivo de la nube.');
  let enc: CopyEncoding = planned;

  const pickedAudio = await pickAudioConfig(2, enc.audioBps);
  if (!pickedAudio) throw new FriendlyError(UNSUPPORTED_COPY);

  // The sound is encoded on this thread too: not while the recorder or the separation needs the device.
  await untilFree(opts);

  // Sound: 0–8 % of the bar. The decoded original (~90 MB of samples for 4 min) only lives inside this block: it
  // is let go before the picture pass, which takes most of the time and memory.
  const { sound, corrected } = await (async () => {
    const original = await decodeSound(source);
    throwIfAborted(signal);
    report({ phase: 'sound', progress: 0.02, attempt: 1 });
    // Global review 2 [4] · Each step of the sound is seconds of work on a phone: the recorder opened (or the
    // separation started) meanwhile is waited for between them, not only before the first.
    await untilFree(opts);
    const channels = Math.min(2, original.channels.length);
    const audioPicked = { ...pickedAudio, config: { ...pickedAudio.config, numberOfChannels: channels } };
    return encodeAlignedSound(
      original,
      audioPicked,
      enc.audioBps,
      signal,
      (f) => report({ phase: 'sound', progress: 0.02 + 0.06 * f, attempt: 1 }),
      () => untilFree(opts),
    );
  })();

  // Picture: 8–96 %, up to three attempts.
  let picture: Extract<PictureResult, { ok: true }> | null = null;
  let blob: Blob | null = null;
  for (let attempt = 1; attempt <= COPY.maxAttempts; attempt++) {
    const picked = await pickVideoConfig(enc);
    if (!picked) throw new FriendlyError(UNSUPPORTED_COPY);
    const current = enc;
    const result = await encodePicture(
      source,
      current,
      picked,
      probe.duration,
      { audioBytes: sound.bytes, limitBytes: opts.limitBytes },
      signal,
      (f) => report({ phase: 'picture', progress: 0.08 + 0.88 * f, attempt, width: current.width, height: current.height }),
      { pace: opts.pace, onHold: opts.onHold },
    );
    let projected: number;
    if (result.ok) {
      picture = result;
      blob = new Blob(muxMp4({ video: result.track, audio: sound.track }) as BlobPart[], { type: 'video/mp4' });
      if (blob.size <= acceptableBytes(opts.limitBytes, opts.targetBytes)) break;
      projected = blob.size;
    } else {
      projected = result.projectedBytes;
    }
    picture = null;
    blob = null;
    const next = retryVideoBps({ videoBps: current.videoBps, projectedBytes: projected, audioBytes: sound.bytes, targetBytes: opts.targetBytes });
    const retry =
      next == null
        ? null
        : copyEncoding({
            seconds: probe.duration,
            targetBytes: opts.targetBytes,
            srcWidth: probe.width,
            srcHeight: probe.height,
            videoBpsCap: next,
          });
    if (!retry || attempt === COPY.maxAttempts) {
      throw new FriendlyError('No se ha conseguido una copia que quepa en la nube (50 MB por archivo).');
    }
    // The sound stays as it is: only the picture is made again.
    enc = { ...retry, audioBps: current.audioBps };
  }
  if (!picture || !blob) throw new FriendlyError('No se ha conseguido una copia que quepa en la nube (50 MB por archivo).');

  // Check: the browser opens it and it lasts as long as the original.
  report({ phase: 'checking', progress: 0.97, attempt: 1, width: enc.width, height: enc.height });
  const check = await probeVideo(blob, signal).catch((e) => {
    if (isAbort(e)) throw e;
    throw new FriendlyError('La copia ha salido mal (el navegador no la abre). Prueba desde un ordenador con Chrome o Edge.');
  });
  if (!sameLength(probe.duration, check.duration, enc.fps)) {
    console.error('[cloudCopy] length', probe.duration, check.duration);
    throw new FriendlyError('La copia no dura lo mismo que el original, así que no se ha subido. Inténtalo otra vez.');
  }
  report({ phase: 'checking', progress: 1, attempt: 1, width: enc.width, height: enc.height });
  return { blob, width: enc.width, height: enc.height, durationSeconds: check.duration, correctedShiftSeconds: corrected };
}
