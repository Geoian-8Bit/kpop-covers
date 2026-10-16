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

/** H.264 level for the picture size and rate (High profile, `avc1.64LL`). */
export function h264Level(width: number, height: number, fps: number): string {
  const rate = width * height * Math.max(1, fps);
  // Max luma samples per second: 4.0 ≈ 62.9M · 4.2 ≈ 133.7M · 5.0 ≈ 150.9M · 5.1 ≈ 251.7M · 5.2 ≈ 530.8M.
  if (rate <= 62_914_560 && Math.max(width, height) <= 2048) return '28'; // 4.0
  if (rate <= 133_693_440 && Math.max(width, height) <= 2048) return '2A'; // 4.2
  if (rate <= 150_994_944) return '32'; // 5.0
  if (rate <= 251_658_240) return '33'; // 5.1
  return '34'; // 5.2
}

/** HEVC Main level (`L` value = level × 30). */
export function hevcLevel(width: number, height: number, fps: number): number {
  const rate = width * height * Math.max(1, fps);
  if (rate <= 66_846_720 && Math.max(width, height) <= 2048) return 120; // 4.0
  if (rate <= 133_693_440 && Math.max(width, height) <= 2048) return 123; // 4.1
  if (rate <= 267_386_880) return 150; // 5.0 (4K30)
  return 153; // 5.1 (4K60)
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

/** Long takes at Máxima heat the phone (R3): warn past this many minutes. */
export const HEAT_WARN_MINUTES = 6;

export function resolutionLabel(width: number, height: number): string {
  const cls = resolutionClass(width, height);
  return cls === '4k' ? '4K' : cls;
}
