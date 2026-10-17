/**
 * 13 · Pure rules of the reduced copy for the group's cloud: when a file needs one, how big it may be, which size
 * and bitrate it gets, what to try after an attempt that came out too big, and how long it has left. No DOM.
 *
 * The cloud takes 50 MB per file (free plan) and the whole group shares 1 GiB between videos and takes. A linked
 * (or uploaded) file bigger than that stays on the device that has it; that device makes a copy that fits
 * (1080p or 720p, lower bitrate) and sends it, and keeps playing its original.
 */

import { CLOUD_SPACE, videosBucketHasRoom, videosUploadNeeds } from './cloudSpace';

// The group's space lives in `cloudSpace.ts` (the data layer, in the app's entry, needs only that).
export { CLOUD_SPACE, videosBucketHasRoom, videosUploadNeeds };

/**
 * Biggest original this device reads whole into memory (the copy and the separation decode its whole sound): a
 * phone that tries more can close the tab without a word. About 400 MB on a phone (less with little memory), 1–2 GB
 * on a computer.
 */
export function maxOriginalBytes(device: { mobile: boolean; memoryGb: number | null }): number {
  const MiB = 1024 ** 2;
  if (device.mobile) return device.memoryGb != null && device.memoryGb < 4 ? 250 * MiB : 400 * MiB;
  return device.memoryGb != null && device.memoryGb < 8 ? 1024 * MiB : 2048 * MiB;
}

export const COPY = {
  /** The group's storage on the free plan (videos and takes together). */
  quotaBytes: CLOUD_SPACE.quotaBytes,
  /** Aim this far under the per-file limit (≈ 48 MB under 50 MB): encoders overshoot a little. */
  targetRatio: 0.96,
  /** An attempt above this share of the limit is redone with less bitrate. */
  acceptRatio: 0.985,
  /** Container and rounding overhead on top of the bitrates. */
  overhead: 0.975,
  audioBps: 160_000,
  minAudioBps: 96_000,
  /** Below this the picture isn't worth watching: the video is too long for one file. */
  minVideoBps: 250_000,
  fps: 30,
  /** Bits per pixel per frame a size needs to look clean (H.264 at these sizes). */
  bitsPerPixel: 0.045,
  /** Long sides tried, biggest first (1080p, 720p, then smaller only for long videos). */
  longSides: [1920, 1280, 960, 854, 640] as readonly number[],
  /** No point in more than this per size (the copy isn't for archiving). */
  maxVideoBps: { 1920: 6_000_000, 1280: 3_500_000 } as Readonly<Record<number, number>>,
  /** A key frame every this many seconds (the studio seeks a lot: loops, clips). */
  keyEverySeconds: 2,
  maxAttempts: 3,
  /** Check an attempt's size once this share of it is done. */
  projectFrom: 0.15,
  /** The hidden original plays at most this fast while nothing else needs the phone… */
  maxRate: 2,
  /** …and at most at 1× while the studio plays (its A–B loop and clips need the main thread on time). */
  playingRate: 1,
} as const;

// ───────────── Sharing the device ─────────────

/** Why the copy waits: the recorder covers the studio, or the AI voice separation is running (one encoder at a time). */
export type CopyHold = 'recording' | 'voice';

/**
 * How the copy may go given what else this device is doing: paused (no frames drawn or encoded; the copy's times
 * come from the original, so a pause shifts nothing) while the recorder is open or the voice is being separated,
 * and no faster than 1× while the studio plays.
 */
export function copyPace(input: { covered: boolean; separating: boolean; studioPlaying: boolean }): {
  hold: CopyHold | null;
  maxRate: number;
} {
  const hold: CopyHold | null = input.covered ? 'recording' : input.separating ? 'voice' : null;
  return { hold, maxRate: input.studioPlaying ? COPY.playingRate : COPY.maxRate };
}

/** «En pausa mientras grabas»: what the copy's row says while it waits. */
export function copyHoldText(hold: CopyHold): string {
  return hold === 'recording' ? 'En pausa mientras grabas…' : 'En pausa mientras se separa la voz…';
}

/** The copy's own clock without its pauses (for the time left). */
export function workingSeconds(elapsedMs: number, pausedMs: number): number {
  return Math.max(0, elapsedMs - Math.max(0, pausedMs)) / 1000;
}

export interface CopyEncoding {
  width: number;
  height: number;
  videoBps: number;
  audioBps: number;
  fps: number;
  /** What the copy should weigh. */
  targetBytes: number;
}

export type CloudDecision =
  /** The original fits: upload it as it is. */
  | { kind: 'original' }
  /** Make a copy of at most `targetBytes`. */
  | { kind: 'copy'; targetBytes: number }
  /** The group's cloud has no room for one more file (`needBytes` must be free, `freeBytes` are). */
  | { kind: 'no-space'; freeBytes: number; needBytes: number }
  /** Too heavy to read whole on this device: make the copy on a computer. */
  | { kind: 'too-heavy'; maxBytes: number }
  /** So long that even the smallest copy wouldn't fit in one file. */
  | { kind: 'too-long'; maxSeconds: number };

/** Smallest copy worth making for `seconds` (lowest bitrates), in bytes. */
export function minCopyBytes(seconds: number): number {
  if (!(seconds > 0)) return 0;
  return Math.ceil((((COPY.minVideoBps + COPY.minAudioBps) / 8) * seconds) / COPY.overhead);
}

/** Longest video that still fits in one file of `limitBytes` as a copy, in seconds. */
export function maxCopySeconds(limitBytes: number): number {
  return Math.floor((limitBytes * COPY.targetRatio * 8 * COPY.overhead) / (COPY.minVideoBps + COPY.minAudioBps));
}

/**
 * Original, copy, or why not. `usedBytes` null: the group's usage couldn't be read (then only the per-file limit
 * counts; the upload itself still has the last word). `maxOriginalBytes`: the biggest original this device can
 * read whole (see `maxOriginalBytes`); only matters when a copy has to be made.
 */
export function cloudDecision(input: {
  fileBytes: number;
  durationSeconds: number | null;
  usedBytes: number | null;
  limitBytes: number;
  quotaBytes?: number;
  maxOriginalBytes?: number;
}): CloudDecision {
  const quota = input.quotaBytes ?? COPY.quotaBytes;
  const room = input.usedBytes == null || videosBucketHasRoom(input.usedBytes, input.limitBytes, quota);
  const noSpace = (): CloudDecision => ({
    kind: 'no-space',
    freeBytes: Math.max(0, quota - Math.max(0, input.usedBytes ?? 0)),
    needBytes: videosUploadNeeds(input.limitBytes),
  });
  if (input.fileBytes <= input.limitBytes) return room ? { kind: 'original' } : noSpace();

  const seconds = input.durationSeconds && input.durationSeconds > 0 ? input.durationSeconds : null;
  const perFile = Math.floor(input.limitBytes * COPY.targetRatio);
  if (seconds != null && minCopyBytes(seconds) > perFile) {
    return { kind: 'too-long', maxSeconds: maxCopySeconds(input.limitBytes) };
  }
  if (input.maxOriginalBytes != null && input.fileBytes > input.maxOriginalBytes) {
    return { kind: 'too-heavy', maxBytes: input.maxOriginalBytes };
  }
  if (!room) return noSpace();
  return { kind: 'copy', targetBytes: perFile };
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Picture size for a long side, keeping the source's shape (never bigger than the source). */
export function scaledSize(srcWidth: number, srcHeight: number, longSide: number): { width: number; height: number } {
  if (!(srcWidth > 0) || !(srcHeight > 0)) return { width: even(longSide), height: even((longSide * 9) / 16) };
  const scale = Math.min(1, longSide / Math.max(srcWidth, srcHeight));
  return { width: even(srcWidth * scale), height: even(srcHeight * scale) };
}

/** Bitrate a size needs to look clean at `fps`. */
export function neededVideoBps(width: number, height: number, fps: number = COPY.fps): number {
  return Math.round(width * height * fps * COPY.bitsPerPixel);
}

/**
 * Size and bitrates for a copy of `seconds` that weighs about `targetBytes`: the biggest size (1080p, then 720p…)
 * the bitrate can carry. `sourceBps`: the original's own bitrate (the copy never asks for more than it had).
 * Null when not even the lowest bitrates fit.
 */
export function copyEncoding(input: {
  seconds: number;
  targetBytes: number;
  srcWidth: number;
  srcHeight: number;
  sourceBps?: number;
  /** A previous attempt asked for this and came out too big: go under it. */
  videoBpsCap?: number;
}): CopyEncoding | null {
  if (!(input.seconds > 0) || !(input.targetBytes > 0)) return null;
  const totalBps = (input.targetBytes * 8 * COPY.overhead) / input.seconds;
  const audioBps = totalBps >= 1_200_000 ? COPY.audioBps : totalBps >= 600_000 ? 128_000 : COPY.minAudioBps;
  let budget = totalBps - audioBps;
  if (input.sourceBps && input.sourceBps > 0) budget = Math.min(budget, input.sourceBps * 0.9);
  if (input.videoBpsCap != null) budget = Math.min(budget, input.videoBpsCap);
  if (budget < COPY.minVideoBps) return null;

  const srcLong = Math.max(input.srcWidth, input.srcHeight) || 1280;
  const sides = COPY.longSides.filter((s) => s <= srcLong);
  if (!sides.length) sides.push(srcLong);
  let chosen = sides[sides.length - 1]!;
  for (const side of sides) {
    const size = scaledSize(input.srcWidth, input.srcHeight, side);
    if (neededVideoBps(size.width, size.height) <= budget) {
      chosen = side;
      break;
    }
  }
  const size = scaledSize(input.srcWidth, input.srcHeight, chosen);
  const cap = COPY.maxVideoBps[chosen] ?? Math.round(neededVideoBps(size.width, size.height) * 2);
  const videoBps = Math.floor(Math.min(budget, cap) / 1000) * 1000;
  return { ...size, videoBps, audioBps, fps: COPY.fps, targetBytes: Math.floor(input.targetBytes) };
}

/** H.264 level (hex) for a size at 30 fps, by macroblocks per frame: 3.0 (480p), 3.1 (720p), 4.0 (1080p), 5.0. */
export function avcLevel(width: number, height: number): string {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  return mbs <= 1350 ? '1e' : mbs <= 3600 ? '1f' : mbs <= 8192 ? '28' : '32';
}

/** Bytes a finished attempt may weigh to be kept. */
export function acceptableBytes(limitBytes: number, targetBytes: number): number {
  return Math.max(targetBytes, Math.floor(limitBytes * COPY.acceptRatio));
}

/**
 * Video bitrate for the next attempt after one that would weigh `projectedBytes` (audio included): scaled to the
 * target with some room, and always lower than before. Null when that would go under the minimum.
 */
export function retryVideoBps(input: {
  videoBps: number;
  projectedBytes: number;
  audioBytes: number;
  targetBytes: number;
}): number | null {
  const projectedVideo = Math.max(1, input.projectedBytes - input.audioBytes);
  const room = Math.max(0, input.targetBytes * COPY.overhead - input.audioBytes);
  const next = Math.floor(Math.min(input.videoBps * 0.92, input.videoBps * (room / projectedVideo) * 0.93) / 1000) * 1000;
  return next >= COPY.minVideoBps ? next : null;
}

/** What a whole attempt will weigh, from what it weighs `progress` of the way in. */
export function projectBytes(videoBytesSoFar: number, progress: number, audioBytes: number): number {
  if (!(progress > 0)) return audioBytes;
  return Math.round(audioBytes + videoBytesSoFar / Math.min(1, progress));
}

/** Give up on an attempt early when it's clearly heading over the limit (saves minutes on a phone). */
export function overshooting(input: { projectedBytes: number; progress: number; limitBytes: number }): boolean {
  return input.progress >= COPY.projectFrom && input.projectedBytes > input.limitBytes * COPY.acceptRatio * 1.03;
}

// ───────────── Time left ─────────────

/** Rough length of the whole job before it starts: the copy plays the video once (at 1× or a little faster). */
export function estimateCopySeconds(durationSeconds: number, rate = 1): number {
  if (!(durationSeconds > 0)) return 0;
  return Math.round(durationSeconds / Math.max(0.5, rate) + 8);
}

/** Seconds left from what has been done so far; early on, from the estimate. */
export function etaSeconds(input: { elapsedSeconds: number; progress: number; estimateSeconds: number }): number {
  const p = Math.min(1, Math.max(0, input.progress));
  if (p >= 1) return 0;
  const fromEstimate = Math.max(0, input.estimateSeconds - input.elapsedSeconds);
  if (p < 0.05 || input.elapsedSeconds < 3) return Math.round(fromEstimate);
  const fromPace = (input.elapsedSeconds * (1 - p)) / p;
  // Lean on the real pace as it gets surer.
  const w = Math.min(1, (p - 0.05) / 0.25);
  return Math.max(0, Math.round(fromEstimate * (1 - w) + fromPace * w));
}

/** «unos segundos», «unos 40 s», «alrededor de un minuto», «unos 3 min». */
export function formatEta(seconds: number): string {
  if (!(seconds > 10)) return 'unos segundos';
  if (seconds < 55) return `unos ${Math.round(seconds / 10) * 10} s`;
  if (seconds < 90) return 'alrededor de un minuto';
  return `unos ${Math.round(seconds / 60)} min`;
}

/**
 * A maximum length for the copy: «menos de un minuto», «1 min y 53 s», «2 min», «unos 18 minutos». Shared by the
 * cloud copy (13) and the shared takes (F3), which say «máximo: …».
 */
export function formatMaxLength(seconds: number): string {
  const s = Math.floor(Number.isFinite(seconds) ? seconds : 0);
  if (s < 60) return 'menos de un minuto';
  if (s >= 10 * 60) return `unos ${Math.floor(s / 60)} minutos`;
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return sec ? `${min} min y ${sec} s` : `${min} min`;
}

// ───────────── Same video: length and start ─────────────

/** The copy lasts as long as the original (a frame and a bit of leeway). */
export function sameLength(originalSeconds: number, copySeconds: number, fps: number = COPY.fps): boolean {
  if (!(originalSeconds > 0) || !(copySeconds > 0)) return false;
  return Math.abs(originalSeconds - copySeconds) <= Math.max(0.15, 2 / fps);
}

/** A measured start shift smaller than this is left alone (half a millisecond). */
export const SHIFT_TOLERANCE_SECONDS = 0.0005;
/** After correcting, the check accepts this much (a hundredth: the smallest nudge of the sync panel). */
export const SHIFT_ACCEPT_SECONDS = 0.01;

/**
 * Samples to drop (positive) or silence to add (negative) at the start of the sound fed to the encoder so the copy
 * starts exactly with the original, given that the copy came out `shiftSeconds` late.
 */
export function shiftSamples(shiftSeconds: number, sampleRate: number): number {
  if (!Number.isFinite(shiftSeconds) || Math.abs(shiftSeconds) < SHIFT_TOLERANCE_SECONDS) return 0;
  return Math.round(shiftSeconds * sampleRate);
}
