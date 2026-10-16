import { formatBytes, pickMime, type Take } from '@coverscape/shared';
import { backend, type UploadFailure } from '@/lib/backend';
import { FriendlyError } from '@/lib/supabase';
import {
  containerOf,
  maxShareSeconds,
  SHARE,
  shareDimensions,
  shareMimeCandidates,
  sharedPath,
  shareVideoBitrate,
} from './takeRules';

/**
 * F3 · «Compartir con el grupo»: a reduced 720p copy (≈ 2 Mbps video + 128 kbps sound, ≈ 16 MB a minute) goes to
 * the private `takes` bucket; the original stays on the phone that recorded it.
 *
 * The copy is made by playing the take at 1× in a hidden <video>, drawing each frame on a canvas and recording the
 * canvas plus the take's sound with MediaRecorder. Sound goes through Web Audio (the element's own captureStream
 * doesn't exist on iPhone, and this way the dancer doesn't hear it); the element's captureStream is the fallback.
 *
 * iPhone: a video with sound only plays from a tap. `reduceTake` (and `shareTake`) do everything that needs the
 * tap *before their first await*, so call them straight from the click handler with the take's Blob already
 * loaded (load it when the share dialog opens, not on the tap).
 */

export const SHARE_PRIVACY_NOTICE =
  'Las tomas compartidas son vídeos personales: las ve cualquiera que tenga el enlace de la app.';

export type SharePhase = 'reducing' | 'uploading' | 'saving';

export interface ReducedTake {
  blob: Blob;
  extension: 'mp4' | 'webm';
  width: number;
  height: number;
}

export interface ReduceOptions {
  /** Seconds of the take (MediaRecorder WebM files often don't say their length). */
  durationHint?: number;
  signal?: AbortSignal;
  /** 0–1 while the copy is being made. */
  onProgress?: (progress: number) => void;
}

/** This browser can make the reduced copy. */
export function canReduceTakes(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

const abortError = () => new DOMException('Compartir cancelado', 'AbortError');

export function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

type CaptureElement = HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
type AudioCtor = typeof AudioContext;

/**
 * Makes the 720p copy of a take. Starts playing synchronously (keep the tap: see above); resolves with the copy,
 * rejects with an AbortError when cancelled or a FriendlyError with Spanish copy. Everything it created (URL,
 * element, tracks, audio graph) is released whatever happens.
 */
export async function reduceTake(source: Blob, opts: ReduceOptions = {}): Promise<ReducedTake> {
  const { signal, onProgress } = opts;
  if (signal?.aborted) throw abortError();
  if (!canReduceTakes()) throw new FriendlyError('Este navegador no puede preparar la copia para compartir.');

  const hint = opts.durationHint && opts.durationHint > 0 ? opts.durationHint : 0;
  const videoBps = shareVideoBitrate(hint);
  if (videoBps == null) {
    throw new FriendlyError(
      `La toma dura demasiado para compartirla: el máximo son unos ${Math.floor(maxShareSeconds() / 60)} minutos.`,
    );
  }

  // ── Synchronous part: everything the tap must cover. ──
  const url = URL.createObjectURL(source);
  const video = document.createElement('video') as CaptureElement;
  video.playsInline = true;
  video.preload = 'auto';
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  // On the page (some browsers stop decoding detached videos) but invisible and out of the way.
  video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1';
  video.src = url;
  document.body.appendChild(video);

  let audioCtx: AudioContext | null = null;
  let audioStream: MediaStream | null = null;
  try {
    const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) as
      | AudioCtor
      | undefined;
    if (Ctor) {
      audioCtx = new Ctor();
      const node = audioCtx.createMediaElementSource(video);
      const dest = audioCtx.createMediaStreamDestination();
      node.connect(dest); // not to the speakers: the copy is made in silence
      audioStream = dest.stream;
      void audioCtx.resume().catch(() => undefined);
    }
  } catch {
    audioCtx?.close().catch(() => undefined);
    audioCtx = null;
    audioStream = null;
  }
  // The tap unlocks this element for the later play() calls.
  const unlock = video.play();

  let canvasStream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let frameHandle: number | null = null;
  let rafHandle: number | null = null;
  let watchdog: ReturnType<typeof setInterval> | null = null;
  let onVisibility: (() => void) | null = null;
  let onAbort: (() => void) | null = null;

  const cleanup = () => {
    if (frameHandle != null) video.cancelVideoFrameCallback?.(frameHandle);
    if (rafHandle != null) cancelAnimationFrame(rafHandle);
    if (watchdog) clearInterval(watchdog);
    if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* already stopping */
      }
    }
    canvasStream?.getTracks().forEach((t) => t.stop());
    audioStream?.getTracks().forEach((t) => t.stop());
    void audioCtx?.close().catch(() => undefined);
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    URL.revokeObjectURL(url);
  };

  try {
    // ── Ready: unlocked, paused at the start, size and length known. ──
    const aborted = new Promise<never>((_, reject) => {
      if (signal?.aborted) reject(abortError());
      onAbort = () => reject(abortError());
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    aborted.catch(() => undefined);

    try {
      await Promise.race([unlock, aborted]);
    } catch (err) {
      if (isAbort(err)) throw err;
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        throw new FriendlyError('El navegador no dejó reproducir la toma. Vuelve a pulsar «Compartir».');
      }
      throw new FriendlyError('No se pudo abrir la toma para prepararla.');
    }
    video.pause();
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) await Promise.race([once(video, 'loadedmetadata'), aborted]);

    let duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : hint;
    if (!duration) duration = await Promise.race([measureDuration(video), aborted]);
    if (duration && hint === 0 && shareVideoBitrate(duration) == null) {
      throw new FriendlyError(
        `La toma dura demasiado para compartirla: el máximo son unos ${Math.floor(maxShareSeconds() / 60)} minutos.`,
      );
    }
    const bitrate = shareVideoBitrate(duration) ?? SHARE.minVideoBps;

    if (video.currentTime > 0.01) {
      video.currentTime = 0;
      await Promise.race([once(video, 'seeked'), aborted]);
    }
    const size = shareDimensions(video.videoWidth, video.videoHeight);
    if (!video.videoWidth || !video.videoHeight) throw new FriendlyError('La toma no tiene imagen que compartir.');

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const g = canvas.getContext('2d', { alpha: false });
    if (!g) throw new FriendlyError('Este navegador no puede preparar la copia para compartir.');
    const draw = () => g.drawImage(video, 0, 0, size.width, size.height);
    draw();

    canvasStream = canvas.captureStream(SHARE.fps);
    let soundTracks = audioStream?.getAudioTracks() ?? [];
    if (!soundTracks.length) {
      // Fallback: the element's own capture (the take may then be heard while it's prepared).
      const captured = video.captureStream?.() ?? video.mozCaptureStream?.();
      soundTracks = captured?.getAudioTracks() ?? [];
      if (captured) audioStream = captured;
    }
    const stream = new MediaStream([...canvasStream.getVideoTracks(), ...soundTracks]);
    const mimeType = pickMime(shareMimeCandidates(), (t) => MediaRecorder.isTypeSupported(t));
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: bitrate,
        audioBitsPerSecond: SHARE.audioBps,
      });
    } catch {
      recorder = new MediaRecorder(stream, { videoBitsPerSecond: bitrate, audioBitsPerSecond: SHARE.audioBps });
    }
    const rec = recorder;
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve, reject) => {
      rec.onstop = () => resolve();
      rec.onerror = () => reject(new FriendlyError('La copia para compartir falló a medias. Inténtalo otra vez.'));
    });
    stopped.catch(() => undefined);

    // ── Play and draw every frame. ──
    let lastProgressAt = performance.now();
    let lastTime = 0;
    const report = () => {
      const t = video.currentTime;
      if (t !== lastTime) {
        lastTime = t;
        lastProgressAt = performance.now();
      }
      if (duration > 0) onProgress?.(Math.min(0.99, t / duration));
    };
    const hasFrameCallback = 'requestVideoFrameCallback' in video;
    const onFrame = () => {
      draw();
      report();
      if (hasFrameCallback) frameHandle = video.requestVideoFrameCallback(onFrame);
      else rafHandle = requestAnimationFrame(onFrame);
    };

    // The copy only records while the take really plays: whatever pauses it (hidden page, a call, the browser),
    // no frozen frames end up in the copy.
    video.addEventListener('pause', () => {
      if (rec.state === 'recording') rec.pause();
    });
    video.addEventListener('playing', () => {
      if (rec.state === 'paused') rec.resume();
      lastProgressAt = performance.now();
    });
    // Hidden page: frames stop being drawn, so pause and go on when the app is back.
    onVisibility = () => {
      if (document.hidden) video.pause();
      else if (!video.ended) {
        void video.play().catch(() => undefined);
        lastProgressAt = performance.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const ended = once(video, 'ended');
    const stalled = new Promise<never>((_, reject) => {
      watchdog = setInterval(() => {
        if (document.hidden || video.ended) return;
        if (video.paused) void video.play().catch(() => undefined);
        if (performance.now() - lastProgressAt > 20_000) {
          reject(new FriendlyError('La toma se atascó al prepararla. Inténtalo otra vez con la app abierta.'));
        }
      }, 1000);
    });
    stalled.catch(() => undefined);

    rec.start(1000);
    // Waits paused until the take really plays (the 'playing' listener resumes it).
    if (video.paused) rec.pause();
    onProgress?.(0);
    onFrame();
    try {
      await video.play();
    } catch {
      throw new FriendlyError('El navegador no dejó reproducir la toma. Vuelve a pulsar «Compartir».');
    }
    if (document.hidden) video.pause();
    await Promise.race([ended, aborted, stalled, stopped.then(() => Promise.reject(new FriendlyError('La copia se cortó.')))]);

    draw();
    rec.stop();
    await Promise.race([stopped, aborted]);
    onProgress?.(1);

    const container = containerOf(rec.mimeType || mimeType);
    // Plain container type: the bucket checks `video/*` and codec parameters only get in the way.
    const blob = new Blob(chunks, { type: container.type });
    if (!blob.size) throw new FriendlyError('La copia salió vacía. Inténtalo otra vez.');
    return { blob, extension: container.extension, width: size.width, height: size.height };
  } finally {
    cleanup();
  }
}

function once(target: EventTarget, event: string): Promise<void> {
  return new Promise((resolve) => target.addEventListener(event, () => resolve(), { once: true }));
}

/** WebM files from MediaRecorder say «Infinity»: seeking far makes the browser find the real end. */
async function measureDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  const found = new Promise<void>((resolve) => {
    const check = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        video.removeEventListener('durationchange', check);
        resolve();
      }
    };
    video.addEventListener('durationchange', check);
    setTimeout(() => {
      video.removeEventListener('durationchange', check);
      resolve();
    }, 4000);
  });
  video.currentTime = 1e7;
  await found;
  const d = Number.isFinite(video.duration) ? video.duration : 0;
  video.currentTime = 0;
  await Promise.race([once(video, 'seeked'), new Promise((r) => setTimeout(r, 1500))]);
  return d;
}

const UPLOAD_COPY: Record<UploadFailure, string> = {
  'too-big': 'La copia no cabe en la nube (máximo 50 MB por toma).',
  type: 'La nube no acepta este formato de vídeo.',
  network: 'Sin conexión. La toma sigue en este móvil: compártela cuando tengas red.',
  denied: 'La nube no aceptó la toma: puede que esté llena. Inténtalo más tarde.',
  exists: 'Esta toma ya tiene una copia en la nube.',
  unavailable: 'Compartir con el grupo no está disponible en esta versión.',
};

export interface ShareTakeInput {
  take: Pick<Take, 'id' | 'crew_id' | 'duration_seconds' | 'shared_path'>;
  /** The take's video, already loaded (see the iPhone note above). */
  source: Blob;
  signal?: AbortSignal;
  onProgress?: (phase: SharePhase, progress: number) => void;
}

/**
 * Reduce, upload as `<group>/<take id>.<ext>` and note `shared_path`/`shared_size` on the row. Resolves with the
 * updated row. Can be cancelled while the copy is made (the upload itself, once started, finishes).
 */
export async function shareTake({ take, source, signal, onProgress }: ShareTakeInput): Promise<Take> {
  if (take.shared_path) throw new FriendlyError('Esta toma ya está compartida.');
  // No await before this call: it needs the tap.
  const reduced = await reduceTake(source, {
    durationHint: Number(take.duration_seconds) || undefined,
    signal,
    onProgress: (p) => onProgress?.('reducing', p),
  });
  if (reduced.blob.size > SHARE.maxBytes) {
    throw new FriendlyError(
      `La copia ocupa ${formatBytes(reduced.blob.size)} y la nube admite 50 MB por toma. Prueba con una toma más corta.`,
    );
  }
  if (signal?.aborted) throw abortError();

  onProgress?.('uploading', 0);
  const path = sharedPath(take, reduced.extension);
  const upload = await backend.uploadTakeFile(path, reduced.blob);
  // A second try after an upload whose row update failed finds the file already there ('exists', or 'denied' by
  // the one-file-per-take rule): then only the row is missing it. The database only accepts the path if the file
  // really is in the bucket (and takes its real size), so a refused upload can never leave a take «shared» with
  // nothing behind it.
  if (!upload.ok && upload.reason !== 'denied' && upload.reason !== 'exists') {
    throw new FriendlyError(UPLOAD_COPY[upload.reason]);
  }

  onProgress?.('saving', 1);
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await backend.updateTake(take.id, { shared_path: path, shared_size: reduced.blob.size });
    } catch (err) {
      lastError = err;
      if (!upload.ok) break; // nothing was uploaded by us: don't insist
      if (/shared_file_missing|shared_path_locked/.test(String((err as { message?: string })?.message))) break;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  if (!upload.ok) throw new FriendlyError(UPLOAD_COPY.denied);
  console.error('[shareTake]', lastError);
  throw new FriendlyError('La copia se subió, pero no se pudo apuntar en la toma. Vuelve a pulsar «Compartir».');
}
