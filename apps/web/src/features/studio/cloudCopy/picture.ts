import { FriendlyError } from '@/lib/supabase';
import { COPY, overshooting, projectBytes, type CopyEncoding, type CopyHold } from '../cloudCopyRules';
import { UNSUPPORTED_COPY, type PickedVideo } from '../cloudCopySupport';
import { vpcConfig, type MuxSample, type MuxVideoTrack } from '../mp4Mux';
import {
  abortError,
  FREE,
  hiddenVideo,
  isAbort,
  releaseVideo,
  throwIfAborted,
  toBytes,
  waitFor,
  type CloudCopyOptions,
} from './media';

/** 13 · REQ-27 · The copy's picture: the original plays muted in a hidden <video> and each frame is encoded. */

const MIN_RATE = 0.5;

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
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA)
        await waitFor(video, 'loadeddata', signal, 30_000);
    }
  }
  if (video.currentTime > 0.001) {
    video.currentTime = 0;
    await waitFor(video, 'seeked', signal, 10_000);
  }
}

export type PictureResult =
  { ok: true; track: MuxVideoTrack; bytes: number } | { ok: false; projectedBytes: number };

/** Plays the original muted and encodes each frame with its own time; gives up early if it's heading too big. */
export async function encodePicture(
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
        samples.push({
          data,
          time: chunk.timestamp,
          duration: chunk.duration ?? 0,
          key: chunk.type === 'key',
        });
        bytes += data.byteLength;
        if (!description) description = toBytes(meta?.decoderConfig?.description);
      },
      error: (e) => {
        console.error('[cloudCopy] picture', e);
        fail?.(
          new FriendlyError(
            'El codificador de vídeo de este dispositivo ha fallado. Prueba desde un ordenador con Chrome o Edge.',
          ),
        );
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
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(t * 1e6),
        duration: Math.round(interval * 1e6),
      });
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
        fail?.(
          new FriendlyError(
            'El vídeo se atascó al preparar la copia. Inténtalo otra vez con la app abierta y a la vista.',
          ),
        );
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
    if (!desc)
      throw new FriendlyError(
        'El codificador de vídeo no dio su configuración. Prueba desde un ordenador con Chrome o Edge.',
      );
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
