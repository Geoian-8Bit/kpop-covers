/**
 * Recording quality: pure rules shared by the recorder and its tests (no browser APIs here).
 * Numbers follow docs/plan/grabacion-calidad-maxima-one-shoot.md (Q1–Q4, R2, R4, A1).
 */

/** Ahorro · Alta · Máxima · Auto (Auto = Alta's compression on the best stable camera mode). */
export type RecordQuality = 'saver' | 'high' | 'max' | 'auto';
/** Automático: HEVC when the browser can, else H.264 High. Compatible: H.264 only (High, then Baseline). */
export type RecordCodec = 'auto' | 'h264';

export const QUALITY_LABEL: Record<RecordQuality, string> = {
  saver: 'Ahorro',
  high: 'Alta',
  max: 'Máxima',
  auto: 'Auto',
};

/** Resolution classes by the picture's long side. */
export type ResolutionClass = '720p' | '1080p' | '1440p' | '4k';
export type FpsClass = 30 | 60;

export function resolutionClass(width: number, height: number): ResolutionClass {
  const long = Math.max(width, height);
  if (long <= 1280) return '720p';
  if (long <= 1920) return '1080p';
  if (long <= 2560) return '1440p';
  return '4k';
}

export function fpsClass(fps: number): FpsClass {
  return fps >= 45 ? 60 : 30;
}

/** Video bitrate in Mbps per quality, resolution and frame rate (plan §4 Q1 and §8 table). */
const MBPS: Record<Exclude<RecordQuality, 'auto'>, Record<ResolutionClass, Record<FpsClass, number>>> = {
  saver: { '720p': { 30: 5, 60: 7.5 }, '1080p': { 30: 8, 60: 12 }, '1440p': { 30: 12, 60: 16 }, '4k': { 30: 16, 60: 24 } },
  high: { '720p': { 30: 8, 60: 12 }, '1080p': { 30: 12, 60: 18 }, '1440p': { 30: 20, 60: 28 }, '4k': { 30: 30, 60: 45 } },
  max: { '720p': { 30: 10, 60: 15 }, '1080p': { 30: 16, 60: 24 }, '1440p': { 30: 28, 60: 36 }, '4k': { 30: 40, 60: 60 } },
};

/** HEVC needs about half the bits of H.264 for the same picture (plan Q2); keep a margin: ×0.65. */
export const HEVC_FACTOR = 0.65;

export function targetVideoBitrate(opts: {
  width: number;
  height: number;
  fps: number;
  quality: RecordQuality;
  hevc?: boolean;
}): number {
  const level = opts.quality === 'auto' ? 'high' : opts.quality;
  const mbps = MBPS[level][resolutionClass(opts.width, opts.height)][fpsClass(opts.fps)];
  return Math.round(mbps * (opts.hevc ? HEVC_FACTOR : 1) * 1_000_000);
}

/** AAC in MP4 takes 256 kbps without trouble (S1); Opus/WebM gets the same. */
export const AUDIO_BITS_PER_SECOND = 256_000;

/** H.264 levels (Annex A): max macroblocks per frame and per second. */
const H264_LEVELS: { hex: string; frame: number; rate: number }[] = [
  { hex: '28', frame: 8_192, rate: 245_760 }, // 4.0
  { hex: '2A', frame: 8_704, rate: 522_240 }, // 4.2
  { hex: '32', frame: 22_080, rate: 589_824 }, // 5.0
  { hex: '33', frame: 36_864, rate: 983_040 }, // 5.1
  { hex: '34', frame: 36_864, rate: 2_073_600 }, // 5.2
];

/** H.264 level for the picture size and rate (High profile, `avc1.64LL`): the lowest that fits both. */
export function h264Level(width: number, height: number, fps: number): string {
  const frame = Math.ceil(width / 16) * Math.ceil(height / 16);
  const rate = frame * Math.max(1, fps);
  // Each side is also capped at sqrt(8 × max frame size) macroblocks.
  const side = Math.max(Math.ceil(width / 16), Math.ceil(height / 16));
  const level = H264_LEVELS.find((l) => frame <= l.frame && rate <= l.rate && side * side <= 8 * l.frame);
  return (level ?? H264_LEVELS[H264_LEVELS.length - 1]!).hex;
}

/** HEVC levels (Annex A): max luma samples per picture and per second; `L` value = level × 30. */
const HEVC_LEVELS: { l: number; picture: number; rate: number }[] = [
  { l: 120, picture: 2_228_224, rate: 66_846_720 }, // 4.0
  { l: 123, picture: 2_228_224, rate: 133_693_440 }, // 4.1
  { l: 150, picture: 8_912_896, rate: 267_386_880 }, // 5.0
  { l: 153, picture: 8_912_896, rate: 534_773_760 }, // 5.1
  { l: 156, picture: 8_912_896, rate: 1_069_547_520 }, // 5.2
];

/** HEVC Main level for the picture: the lowest whose picture size, side length and sample rate fit. */
export function hevcLevel(width: number, height: number, fps: number): number {
  const picture = width * height;
  const rate = picture * Math.max(1, fps);
  const side = Math.max(width, height);
  const level = HEVC_LEVELS.find((l) => picture <= l.picture && rate <= l.rate && side * side <= 8 * l.picture);
  return (level ?? HEVC_LEVELS[HEVC_LEVELS.length - 1]!).l;
}

/**
 * MIME types to try with `MediaRecorder.isTypeSupported`, best first: MP4 always before WebM (it reaches
 * the Galería and WhatsApp), HEVC first when allowed, then H.264 High at the right level, then Baseline.
 */
export function mimeCandidates(opts: { codec: RecordCodec; width: number; height: number; fps: number }): string[] {
  const { width, height, fps } = opts;
  const list: string[] = [];
  if (opts.codec === 'auto') {
    const l = hevcLevel(width, height, fps);
    list.push(
      `video/mp4;codecs=hvc1.1.6.L${l}.B0,mp4a.40.2`,
      `video/mp4;codecs=hev1.1.6.L${l}.B0,mp4a.40.2`,
      'video/mp4;codecs=hvc1,mp4a.40.2',
      'video/mp4;codecs=hev1,mp4a.40.2',
    );
  }
  const level = h264Level(width, height, fps);
  list.push(
    `video/mp4;codecs=avc1.6400${level},mp4a.40.2`,
    `video/mp4;codecs=avc1.4D00${level},mp4a.40.2`,
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4;codecs=avc1,opus',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  );
  return list;
}

/** First candidate the browser says it can record, or '' (let the browser choose). */
export function pickMime(candidates: string[], isSupported: (type: string) => boolean): string {
  for (const type of candidates) {
    try {
      if (isSupported(type)) return type;
    } catch {
      /* a malformed type for this browser: next */
    }
  }
  return '';
}

/**
 * The encoder family behind a MIME type: when one HEVC string fails on a phone, the other HEVC strings would fail
 * the same way, so failures are remembered per family (H.264 profiles are separate encoders' settings).
 */
export function codecFamily(mime: string): string {
  if (isHevcMime(mime)) return 'hevc';
  const avc = /avc1\.([0-9A-Fa-f]{2})/.exec(mime);
  if (avc) {
    const p = avc[1]!.toUpperCase();
    return p === '64' ? 'avc-high' : p === '4D' ? 'avc-main' : p === '42' ? 'avc-baseline' : `avc-${p}`;
  }
  if (/avc1|h264/i.test(mime)) return 'avc';
  if (/vp9/i.test(mime)) return 'vp9';
  if (/vp8/i.test(mime)) return 'vp8';
  return `type:${mime}`;
}

export function isHevcMime(mime: string): boolean {
  return /hvc1|hev1|hevc|h265/i.test(mime);
}

/** Human name of a MIME type for the «i» panel. */
export function describeMime(mime: string): string {
  if (!mime) return 'El que elija el navegador';
  const box = /webm/i.test(mime) ? 'WebM' : 'MP4';
  if (isHevcMime(mime)) return `${box} · HEVC (H.265)`;
  const avc = /avc1\.([0-9A-Fa-f]{2})/.exec(mime);
  if (avc) {
    const profile = avc[1]!.toUpperCase();
    const name = profile === '64' ? 'High' : profile === '4D' ? 'Main' : profile === '42' ? 'Baseline' : profile;
    return `${box} · H.264 ${name}`;
  }
  if (/avc1|h264/i.test(mime)) return `${box} · H.264`;
  if (/vp9/i.test(mime)) return `${box} · VP9`;
  if (/vp8/i.test(mime)) return `${box} · VP8`;
  if (/av01|av1/i.test(mime)) return `${box} · AV1`;
  return box;
}

/** Real average bitrate of a finished file, in bits per second (size ÷ duration). */
export function measuredBitrate(bytes: number, seconds: number): number {
  return seconds > 0 ? Math.round((bytes * 8) / seconds) : 0;
}

export function formatMbps(bitsPerSecond: number): string {
  const mbps = bitsPerSecond / 1_000_000;
  return `${(mbps >= 10 ? Math.round(mbps) : Math.round(mbps * 10) / 10).toString().replace('.', ',')} Mbps`;
}

/** Megabytes per minute at a total bitrate (video + audio). */
export function mbPerMinute(bitsPerSecond: number): number {
  return ((bitsPerSecond / 8) * 60) / 1_000_000;
}

/**
 * Minutes of recording that fit in `freeBytes`, keeping a safety margin (the browser may refuse writes a bit
 * before the quota, and the finished take is copied once when saved). R2.
 */
export function minutesLeft(freeBytes: number, bitsPerSecond: number, margin = 0.85): number {
  if (!(freeBytes > 0) || !(bitsPerSecond > 0)) return 0;
  return Math.floor((freeBytes * margin) / (bitsPerSecond / 8) / 60);
}

/** Below this many minutes the recorder suggests a lower quality (R2). */
export const LOW_SPACE_MINUTES = 5;

/**
 * Frames lost during a take (R4): what the camera should have delivered at its rate minus what reached the
 * recording. Never negative; null when nothing was measured.
 */
export function droppedFrames(opts: { expected: number; delivered: number }): number | null {
  if (!(opts.expected > 0)) return null;
  return Math.max(0, Math.round(opts.expected - opts.delivered));
}

/** More than 5 % of the frames lost (and at least a dozen) is visible stutter: warn after the take. */
export function tooManyDrops(dropped: number | null, expected: number): boolean {
  if (dropped == null || !(expected > 0)) return false;
  return dropped >= 12 && dropped / expected > 0.05;
}

/** A take on the phone's storage, as the recorder's clean-up sees it (R1). */
export interface StoredTakeState {
  /** ISO time the take started. */
  startedAt: string;
  /** ISO time it was downloaded or shared, null if never. */
  savedAt: string | null;
  /** Bytes written. */
  bytes: number;
  /** Another window of the app is still using it (recording or reviewing it). */
  locked: boolean;
  /** The meta could be read but the pieces couldn't (a transient error). */
  unreadable?: boolean;
  /** Saved in the app's «Tomas» (F3): it's the take's home now, never cleaned up on its own. */
  kept?: boolean;
}

/** A saved take keeps its working copy this long: a download of a big file may still be reading it. */
export const SAVED_GRACE_MS = 10 * 60_000;
/** Empty or unreadable takes younger than this may still be starting in another window. */
const YOUNG_MS = 2 * 60_000;
/** Unreadable takes are retried; after this long they are given up. */
const UNREADABLE_GIVE_UP_MS = 7 * 24 * 60 * 60_000;

/**
 * What to do with a take found on the phone's storage: offer it back (never saved), leave it alone (in use,
 * saved recently, or maybe still starting) or delete it (saved long enough ago, or empty and old).
 */
export function leftoverAction(take: StoredTakeState, now: number): 'offer' | 'keep' | 'delete' {
  if (take.locked || take.kept) return 'keep';
  const started = Date.parse(take.startedAt);
  const age = Number.isFinite(started) ? now - started : Number.POSITIVE_INFINITY;
  if (take.unreadable) return age > UNREADABLE_GIVE_UP_MS ? 'delete' : 'keep';
  if (take.bytes <= 0) return age > YOUNG_MS ? 'delete' : 'keep';
  if (take.savedAt) {
    const saved = Date.parse(take.savedAt);
    return Number.isFinite(saved) && now - saved < SAVED_GRACE_MS ? 'keep' : 'delete';
  }
  return 'offer';
}

/** "unos 12 min" / "menos de 1 min" for the space line (R2). */
export function minutesPhrase(minutes: number): string {
  return minutes < 1 ? 'menos de 1 min' : `unos ${minutes} min`;
}

/** Long takes at Máxima heat the phone (R3): warn past this many minutes. */
export const HEAT_WARN_MINUTES = 6;

/** Resolution choice in the recorder's settings (A1). */
export type ResolutionChoice = 'auto' | '4k' | '1440p' | '1080p' | '720p';

const LONG_SIDE: Record<Exclude<ResolutionChoice, 'auto'>, [number, number]> = {
  '4k': [3840, 2160],
  '1440p': [2560, 1440],
  '1080p': [1920, 1080],
  '720p': [1280, 720],
};

const CLASS_RANK: Record<ResolutionClass, number> = { '720p': 0, '1080p': 1, '1440p': 2, '4k': 3 };

/**
 * What to ask the camera for (landscape numbers: phones turn them to how they're held). Auto follows the
 * quality: Ahorro → 720p30, Alta/Auto → 1080p at 60 when allowed, Máxima → 4K at 30 (plan §8).
 */
export function cameraRequest(opts: {
  quality: RecordQuality;
  resolution: ResolutionChoice;
  fps: 30 | 60;
}): { width: number; height: number; fps: 30 | 60 } {
  let res: Exclude<ResolutionChoice, 'auto'>;
  let fps: 30 | 60 = opts.fps;
  if (opts.resolution !== 'auto') res = opts.resolution;
  else if (opts.quality === 'saver') {
    res = '720p';
    fps = 30;
  } else if (opts.quality === 'max') {
    res = '4k';
    fps = 30;
  } else res = '1080p';
  // 4K at 60 is beyond what the browser gives (plan §9): 4K is always asked at 30.
  if (res === '4k') fps = 30;
  const [width, height] = LONG_SIDE[res];
  return { width, height, fps };
}

/** True when the camera gave a smaller picture than asked (e.g. it traded size for 60 fps). */
export function belowRequested(actual: { width: number; height: number }, wanted: { width: number; height: number }): boolean {
  return CLASS_RANK[resolutionClass(actual.width, actual.height)] < CLASS_RANK[resolutionClass(wanted.width, wanted.height)];
}

export function resolutionLabel(width: number, height: number): string {
  const cls = resolutionClass(width, height);
  return cls === '4k' ? '4K' : cls;
}
