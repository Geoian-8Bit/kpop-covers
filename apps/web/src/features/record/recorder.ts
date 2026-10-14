import type { Video } from '@coverscape/shared';

/** MP4 first: it plays everywhere and saves to the camera roll. Older Android Chrome falls back to WebM. */
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4;codecs=avc1,opus',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined';
}

/**
 * One take, possibly in several parts (pause / resume, like TikTok): a single file comes out at the end.
 * `seconds()` counts only the recorded time, not the pauses.
 */
export interface TakeRecorder {
  start(): void;
  pause(): void;
  /** False when the recorder can't go on (the browser stopped it): finish to keep what exists. */
  resume(): boolean;
  /** Ends the take; resolves with the file (empty if nothing was recorded). Never hangs. */
  finish(): Promise<Blob>;
  /** Drops the take without waiting for the file. */
  cancel(): void;
  seconds(): number;
}

/** How long the browser gets to hand over the last piece of the file after stopping. */
const FINISH_TIMEOUT_MS = 8000;

/** `onDead`: the browser stopped the recorder by itself (encoder error, capture ended in the background). */
export function createTakeRecorder(
  tracks: MediaStreamTrack[],
  pixels: number,
  onDead: () => void,
): TakeRecorder {
  const mimeType = pickMimeType();
  // ~0.1 bits per pixel per frame: ~6 Mbps at 1080p30, crisp for fast moves and light on a phone's memory.
  const videoBitsPerSecond = Math.round(Math.min(8_000_000, Math.max(2_500_000, pixels * 30 * 0.1)));
  const rec = new MediaRecorder(
    new MediaStream(tracks),
    mimeType ? { mimeType, videoBitsPerSecond, audioBitsPerSecond: 160_000 } : { videoBitsPerSecond },
  );
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  let total = 0;
  let since: number | null = null;
  const run = () => (since = performance.now());
  const hold = () => {
    if (since != null) total += performance.now() - since;
    since = null;
  };
  /** Set when we stop it ourselves; any other stop means the browser gave up on the take. */
  let ending = false;
  const died = () => {
    if (ending) return;
    ending = true;
    hold();
    onDead();
  };
  rec.addEventListener('stop', died);
  rec.addEventListener('error', died);

  return {
    start() {
      rec.start(1000);
      run();
    },
    pause() {
      if (rec.state !== 'recording') return;
      rec.pause();
      hold();
    },
    resume() {
      if (rec.state === 'recording') return true;
      if (rec.state !== 'paused') return false;
      rec.resume();
      run();
      return true;
    },
    finish() {
      ending = true;
      hold();
      return new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve(new Blob(chunks, { type: rec.mimeType || mimeType || 'video/webm' }));
        };
        if (rec.state === 'inactive') return done();
        rec.addEventListener('stop', done, { once: true });
        rec.addEventListener('error', done, { once: true });
        setTimeout(done, FINISH_TIMEOUT_MS);
        try {
          rec.stop();
        } catch {
          done();
        }
      });
    },
    cancel() {
      ending = true;
      hold();
      rec.ondataavailable = null;
      if (rec.state !== 'inactive') rec.stop();
    },
    seconds() {
      return (total + (since != null ? performance.now() - since : 0)) / 1000;
    },
  };
}

export function takeFileName(video: Video, type: string): string {
  const slug = video.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .toLowerCase();
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
  return `one-shoot-${slug || 'ensayo'}-${stamp}.${type.includes('mp4') ? 'mp4' : 'webm'}`;
}

/** iPhone/iPad: a download lands in Files, only the share sheet's "Guardar vídeo" reaches Photos. */
export const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function canShareFile(file: File): boolean {
  try {
    return Boolean(navigator.canShare?.({ files: [file] }));
  } catch {
    return false;
  }
}

/** 'cancelled' when the dancer backed out of the share sheet: the take is still only here. */
export async function shareFile(file: File, title: string): Promise<'shared' | 'cancelled' | 'failed'> {
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (err) {
    return err instanceof DOMException && err.name === 'AbortError' ? 'cancelled' : 'failed';
  }
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Long enough for the browser to start reading it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
