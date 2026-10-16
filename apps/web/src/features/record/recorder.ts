import {
  AUDIO_BITS_PER_SECOND,
  codecFamily,
  isHevcMime,
  mimeCandidates,
  pickMime,
  targetVideoBitrate,
  type RecordCodec,
  type RecordQuality,
  type Video,
} from '@coverscape/shared';
import type { TakeSink } from './takeStore';

export function canRecord(): boolean {
  return typeof MediaRecorder !== 'undefined';
}

/** What a take will be recorded with: the picture's size and rate plus the chosen quality and format. */
export interface RecordPlan {
  width: number;
  height: number;
  fps: number;
  quality: RecordQuality;
  codec: RecordCodec;
}

export interface RecordFormat {
  /** '' when the browser picks (no candidate was accepted). */
  mimeType: string;
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
}

/**
 * Types the browser said it could record but whose encoder then failed on this phone (an empty take, or a
 * recorder that refused to start). Remembered per device, so the next take goes straight to the next format.
 */
const BAD_KEY = 'oneshoot.record.badFamilies';
/** A browser update may fix the encoder: marks expire, and are dropped when the browser changes. */
const BAD_TTL_MS = 30 * 24 * 60 * 60_000;

interface BadFormats {
  ua: string;
  at: number;
  families: string[];
}

function badFamilies(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(BAD_KEY) ?? 'null') as BadFormats | null;
    if (!raw || raw.ua !== navigator.userAgent || Date.now() - raw.at > BAD_TTL_MS) return new Set();
    return new Set(raw.families);
  } catch {
    return new Set();
  }
}

/** The encoder family of this type failed on this phone: the next take uses the next family. */
export function markFormatBad(mimeType: string): void {
  if (!mimeType) return;
  const bad = badFamilies();
  bad.add(codecFamily(mimeType));
  try {
    localStorage.setItem(BAD_KEY, JSON.stringify({ ua: navigator.userAgent, at: Date.now(), families: [...bad] }));
  } catch {
    /* for this visit only */
  }
  remembered.clear();
  badVersion++;
}

/** Families skipped on this phone (shown in the «i» panel, where they can be tried again). */
export function failedFamilies(): string[] {
  return [...badFamilies()];
}

export function clearFailedFormats(): void {
  try {
    localStorage.removeItem(BAD_KEY);
  } catch {
    /* nothing stored */
  }
  remembered.clear();
  badVersion++;
}

/** Bumped when the marks change: callers that memoise a format include it. */
export let badVersion = 0;

/** isTypeSupported answers once per plan (it's asked on every render of the recorder otherwise). */
const remembered = new Map<string, RecordFormat>();

function recorderOptions(format: RecordFormat): MediaRecorderOptions {
  const { mimeType, videoBitsPerSecond, audioBitsPerSecond } = format;
  return mimeType ? { mimeType, videoBitsPerSecond, audioBitsPerSecond } : { videoBitsPerSecond, audioBitsPerSecond };
}

/**
 * Best format this browser records for the plan: HEVC (if allowed and available), else H.264 High at the right
 * level, Baseline as a last MP4, WebM only when there's no MP4 at all; the bitrate follows the quality table.
 * Types that already failed on this phone are skipped.
 */
export function chooseFormat(plan: RecordPlan): RecordFormat {
  const key = `${plan.width}x${plan.height}@${plan.fps}|${plan.quality}|${plan.codec}`;
  const known = remembered.get(key);
  if (known) return known;
  const bad = badFamilies();
  const supported = (t: string) =>
    !bad.has(codecFamily(t)) && typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t);
  const mimeType = pickMime(mimeCandidates(plan), supported);
  const format = {
    mimeType,
    videoBitsPerSecond: targetVideoBitrate({ ...plan, hevc: isHevcMime(mimeType) }),
    audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
  };
  remembered.set(key, format);
  return format;
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
  /** The type the browser really records (known once started). */
  mimeType(): string;
  /** Pieces the encoder has handed over (0 = it never produced anything). */
  pieces(): number;
}

/** A working encoder hands over its first 1-second piece well within this. */
const NO_DATA_MS = 7000;

/** How long the browser gets to hand over the last piece of the file after stopping. */
const FINISH_TIMEOUT_MS = 8000;

/** `onDead`: the browser stopped the recorder by itself (encoder error, capture ended in the background). */
export function createTakeRecorder(
  tracks: MediaStreamTrack[],
  format: RecordFormat,
  /** Where the pieces go as they come (the phone's storage, R1). */
  sink: TakeSink,
  onDead: () => void,
): TakeRecorder {
  const { mimeType } = format;
  // Throws when the browser refuses these options: the caller marks the type bad and tries the next one.
  const rec = new MediaRecorder(new MediaStream(tracks), recorderOptions(format));
  let pieces = 0;
  rec.ondataavailable = (e) => {
    if (e.data.size === 0) return;
    pieces++;
    sink.write(e.data);
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
      // An encoder that accepted the format but produces nothing: after a few seconds without a single piece,
      // treat the recorder as dead (the take ends empty and the format is skipped from then on).
      // First ask for whatever is buffered (some MP4 muxers group fragments), then judge.
      setTimeout(() => {
        if (pieces === 0 && rec.state === 'recording') {
          try {
            rec.requestData();
          } catch {
            /* stopped meanwhile */
          }
        }
      }, NO_DATA_MS / 2);
      setTimeout(() => {
        if (pieces === 0 && rec.state === 'recording') died();
      }, NO_DATA_MS);
    },
    pause() {
      if (rec.state !== 'recording') return;
      // Hand over what's buffered: if the phone kills the app while paused, it's already on disk.
      try {
        rec.requestData();
      } catch {
        /* not recording any more */
      }
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
          void sink.finish(rec.mimeType || mimeType || 'video/webm').then(resolve);
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
      void sink.discard();
    },
    mimeType() {
      return rec.mimeType || mimeType;
    },
    pieces: () => pieces,
    seconds() {
      return (total + (since != null ? performance.now() - since : 0)) / 1000;
    },
  };
}

export function takeFileName(video: Pick<Video, 'title'>, type: string, at?: string): string {
  const slug = video.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .toLowerCase();
  const when = at ? new Date(at) : new Date();
  const d = Number.isNaN(when.getTime()) ? new Date() : when;
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
