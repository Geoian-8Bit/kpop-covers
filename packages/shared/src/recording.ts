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

// ───────────── Pace (P19): does this phone keep up with the camera mode while it records? ─────────────

/** What a short measurement saw: the rate asked for, the camera's own rate and the frames that really reached the screen / take. */
export interface PaceSample {
  /** Rate the settings ask for (30 or 60). */
  wantFps: number;
  /** Rate the camera says it gives in this mode. */
  cameraFps: number;
  /** Frames per second that really got through while recording (presented on screen, or drawn into the take). */
  measuredFps: number;
  /** How long it was measured. */
  seconds: number;
  /** Size class of the picture. */
  resolution: ResolutionClass;
  /** Median camera → screen delay while it was measured (ms), when the browser tells it. */
  lagMs?: number | null;
  /** The same delay with nothing recording (the camera's own), to compare with. */
  restLagMs?: number | null;
}

/**
 * 'ok' · 'fps30' (60 doesn't flow on this phone: record at 30) · 'smaller' (already at 30 but above 1080p: go down
 * to 1080p) · 'warn' (nothing lighter to offer: say so). 'unknown' when the sample is too short to judge.
 * Below 85 % of the camera's rate the picture visibly stutters and lags.
 */
export type PaceVerdict = 'ok' | 'fps30' | 'smaller' | 'warn' | 'unknown';

/** Shortest measurement that says anything (the first frames of a recorder are always uneven). */
export const PACE_MIN_SECONDS = 1.5;
/** Share of the camera's rate that still looks fluid. */
export const PACE_OK_RATIO = 0.85;

/**
 * Preview delay (P19 review): a preview can show every frame and still trail the dancer by half a second. The
 * camera's own delay at rest is not the phone being slow (a lighter mode wouldn't change it), so what counts is how
 * much it grows while encoding; with nothing to compare with, only a delay nobody could miss.
 */
export const PACE_LAG_GROWTH_MS = 80;
export const PACE_LAG_MAX_MS = 150;
export const PACE_LAG_ALONE_MS = 250;

export function lagging(lagMs: number | null | undefined, restLagMs: number | null | undefined): boolean {
  if (lagMs == null || !Number.isFinite(lagMs)) return false;
  if (restLagMs == null || !Number.isFinite(restLagMs)) return lagMs > PACE_LAG_ALONE_MS;
  const growth = lagMs - restLagMs;
  return growth > PACE_LAG_GROWTH_MS || (lagMs > PACE_LAG_MAX_MS && growth > PACE_LAG_GROWTH_MS / 2);
}

export function paceVerdict(sample: PaceSample): PaceVerdict {
  const target = Math.min(sample.cameraFps || sample.wantFps, sample.wantFps);
  if (!(sample.seconds >= PACE_MIN_SECONDS) || !(target > 0) || !(sample.measuredFps >= 0)) return 'unknown';
  if (sample.measuredFps >= target * PACE_OK_RATIO && !lagging(sample.lagMs, sample.restLagMs)) return 'ok';
  return stepDown(target, sample.resolution);
}

/** The lighter mode for a mode of `fps` that didn't flow: 30 fps, else 1080p, else nothing lighter. */
function stepDown(fps: number, resolution: ResolutionClass): 'fps30' | 'smaller' | 'warn' {
  if (fps >= 45) return 'fps30';
  if (CLASS_RANK[resolution] > CLASS_RANK['1080p']) return 'smaller';
  return 'warn';
}

/** Lighter modes this phone needs, learnt from its own measurements: 30 fps per size class, and a size ceiling. */
export interface PaceCap {
  /** Size classes where 60 fps didn't flow. */
  fps30: ResolutionClass[];
  /** Largest size class that flowed (null: no ceiling). */
  maxResolution: ResolutionClass | null;
}

export const NO_PACE_CAP: PaceCap = { fps30: [], maxResolution: null };

/** The cap after a verdict on a mode of `resolution` (unchanged for 'ok', 'warn' and 'unknown'). */
export function capAfter(cap: PaceCap, verdict: PaceVerdict, resolution: ResolutionClass): PaceCap {
  if (verdict === 'fps30') {
    return cap.fps30.includes(resolution) ? cap : { ...cap, fps30: [...cap.fps30, resolution] };
  }
  if (verdict === 'smaller') {
    const ceiling: ResolutionClass = '1080p';
    if (cap.maxResolution && CLASS_RANK[cap.maxResolution] <= CLASS_RANK[ceiling]) return cap;
    return { ...cap, maxResolution: ceiling };
  }
  return cap;
}

/** A camera request made lighter by what this phone has shown it can't sustain. */
export function capRequest(
  want: { width: number; height: number; fps: 30 | 60 },
  cap: PaceCap,
): { width: number; height: number; fps: 30 | 60; capped: boolean } {
  let { width, height, fps } = want;
  let capped = false;
  if (cap.maxResolution && CLASS_RANK[resolutionClass(width, height)] > CLASS_RANK[cap.maxResolution]) {
    const [w, h] = LONG_SIDE[cap.maxResolution === '4k' ? '4k' : cap.maxResolution];
    width = w;
    height = h;
    capped = true;
  }
  if (fps === 60 && cap.fps30.includes(resolutionClass(width, height))) {
    fps = 30;
    capped = true;
  }
  return { width, height, fps, capped };
}

/** Frames per second of a measurement (0 when nothing was measured). */
export function framesPerSecond(frames: number, seconds: number): number {
  return seconds > 0 && frames > 0 ? frames / seconds : 0;
}

/** The cap without its size ceiling (the dancer asked for a bigger size again: the next measurement judges afresh). */
export function capWithoutSize(cap: PaceCap): PaceCap {
  return cap.maxResolution == null ? cap : { ...cap, maxResolution: null };
}

/** The cap without its 30-fps steps (the dancer asked for 60 again). */
export function capWithoutFps(cap: PaceCap): PaceCap {
  return cap.fps30.length ? { ...cap, fps30: [] } : cap;
}

/** True when `cap` makes this request smaller (not just slower). */
export function sizeCapped(want: { width: number; height: number; fps: 30 | 60 }, cap: PaceCap): boolean {
  const capped = capRequest(want, cap);
  return capped.width !== want.width || capped.height !== want.height;
}

/** True when `a` is a bigger size class than `b`. */
export function largerClass(a: ResolutionClass, b: ResolutionClass): boolean {
  return CLASS_RANK[a] > CLASS_RANK[b];
}

/**
 * Camera → screen delay of one frame (ms) from requestVideoFrameCallback's metadata: when the camera captured it
 * and when it is expected on screen (Chrome gives `captureTime` for local cameras). Null when unknown or implausible
 * (another clock, a frame from before a pause).
 */
export function frameLagMs(meta: { captureTime?: number; expectedDisplayTime?: number }): number | null {
  const { captureTime, expectedDisplayTime } = meta;
  if (typeof captureTime !== 'number' || typeof expectedDisplayTime !== 'number') return null;
  if (!(captureTime > 0) || !Number.isFinite(expectedDisplayTime)) return null;
  const lag = expectedDisplayTime - captureTime;
  return lag >= 0 && lag <= 2000 ? lag : null;
}

/**
 * Every value seen since the last `clear` (a fixed histogram of `max / step` buckets: nothing allocated per frame,
 * whatever the take's length), and their median when asked. Values are kept to `step` (floored) and clamped to
 * [0, max].
 */
export function createMedianLog(max: number, step: number) {
  const buckets = new Uint32Array(Math.max(1, Math.floor(max / step) + 1));
  let size = 0;
  /** The value of the k-th smallest sample (0-based). */
  const nth = (k: number): number => {
    let seen = 0;
    for (let i = 0; i < buckets.length; i++) {
      seen += buckets[i]!;
      if (seen > k) return i * step;
    }
    return (buckets.length - 1) * step;
  };
  return {
    add(value: number) {
      if (!Number.isFinite(value)) return;
      const i = Math.min(buckets.length - 1, Math.max(0, Math.floor(value / step + 1e-9)));
      buckets[i]!++;
      size++;
    },
    clear() {
      if (!size) return;
      buckets.fill(0);
      size = 0;
    },
    size: () => size,
    median(): number | null {
      if (!size) return null;
      return size % 2 ? nth(size >> 1) : (nth((size >> 1) - 1) + nth(size >> 1)) / 2;
    },
  };
}
export type MedianLog = ReturnType<typeof createMedianLog>;

/** Camera → screen delays (0–2 s, to the millisecond) of a whole take, or of a rehearsal's stretch. */
export function createLagLog(): MedianLog {
  return createMedianLog(2000, 1);
}
export type LagLog = MedianLog;

/** Time between two camera frames (ms, to 0.1 ms), from their `captureTime`: the camera's real rate meanwhile. */
export function createFrameIntervalLog(): MedianLog {
  return createMedianLog(500, 0.1);
}

/**
 * The camera's real rate from the median time between its frames (null with too few to say): a dark room makes
 * most cameras slow down from 60 to 30 (or 24) on their own, whatever the phone.
 */
export const CAMERA_RATE_MIN_SAMPLES = 30;
export function cameraRateFps(intervals: Pick<MedianLog, 'size' | 'median'>): number | null {
  if (intervals.size() < CAMERA_RATE_MIN_SAMPLES) return null;
  const ms = intervals.median();
  return ms != null && ms > 1 ? 1000 / ms : null;
}

/**
 * The time between two frames the page saw, per camera frame (`presentedFrames` may jump), or null when it says
 * nothing (no capture time, a pause, another clock).
 */
export function frameIntervalMs(
  prev: { presentedFrames: number; captureTime?: number } | null,
  cur: { presentedFrames: number; captureTime?: number },
): number | null {
  if (!prev || typeof prev.captureTime !== 'number' || typeof cur.captureTime !== 'number') return null;
  if (!(prev.captureTime > 0) || !(cur.captureTime > 0)) return null;
  const frames = cur.presentedFrames - prev.presentedFrames;
  if (!(frames >= 1)) return null;
  const ms = (cur.captureTime - prev.captureTime) / frames;
  return ms > 1 && ms < 500 ? ms : null;
}

/**
 * A take teaches the pace only when it is long enough and counted from its second 2 (the start always stutters a
 * little: the song starting, the file being opened), and a step down needs a real loss of frames, not one stall.
 */
export const PACE_TAKE_MIN_SECONDS = 10;
export const PACE_TAKE_SKIP_SECONDS = 2;
export const PACE_TAKE_MIN_LOST = 30;

/** Verdict of a finished take; `frames` and `seconds` are counted after its first `PACE_TAKE_SKIP_SECONDS`. */
export function takeVerdict(t: {
  wantFps: number;
  /** What the camera gave meanwhile (canvas takes: frames delivered; direct takes: see `directTakeVerdict`). */
  cameraFps: number;
  frames: number;
  seconds: number;
  resolution: ResolutionClass;
  lagMs?: number | null;
  restLagMs?: number | null;
}): PaceVerdict {
  if (!(t.seconds >= PACE_TAKE_MIN_SECONDS - PACE_TAKE_SKIP_SECONDS)) return 'unknown';
  const sample: PaceSample = {
    wantFps: t.wantFps,
    cameraFps: t.cameraFps,
    measuredFps: framesPerSecond(t.frames, t.seconds),
    seconds: t.seconds,
    resolution: t.resolution,
    lagMs: t.lagMs,
    restLagMs: t.restLagMs,
  };
  const verdict = paceVerdict(sample);
  if (verdict === 'ok' || verdict === 'unknown') return verdict;
  const target = Math.min(t.cameraFps || t.wantFps, t.wantFps);
  const lost = target * t.seconds - t.frames;
  // A lagging preview is the phone not keeping up whatever the frames; otherwise a handful of lost frames isn't.
  if (lost < PACE_TAKE_MIN_LOST && !lagging(t.lagMs, t.restLagMs)) return 'ok';
  return verdict;
}

/**
 * Direct takes · the camera's mean rate in the take falls clearly below its mean rate in the countdown just before
 * (same session and light, camera open, nothing encoding): with a delay that grows too, it is the load slowing the
 * camera down (a busy or hot phone), not the light.
 */
export const PACE_DIRECT_RATE_DROP = 0.75;
/** A delay this much above rest backs a rate drop (alone it is not lagging: see `lagging`). */
export const PACE_LAG_SOME_GROWTH_MS = 30;

/**
 * The camera's mean rate in a countdown (frames the camera presented / seconds), or null when too short to say.
 * Measured with the same frame watch as the take, so both count frames the same way.
 */
export function restRateFps(frames: number, seconds: number): number | null {
  if (!(seconds >= PACE_MIN_SECONDS) || !(frames >= CAMERA_RATE_MIN_SAMPLES)) return null;
  return frames / seconds;
}

/**
 * Verdict of a finished direct take (the recorder gets every camera frame, whether the page painted it or not),
 * judged by the preview's delay. Never by callbacks the page missed (a 60 Hz or battery-capped screen, or the
 * YouTube player on the same thread, makes the page miss frames the file still gets), nor by the median time between
 * frames (a camera at 60 half the time and at 30 the other half has a median of 60 but a mean of 45), nor by the
 * rate at rest of an earlier rehearsal (a darker room slows the camera down by itself). Missed callbacks and rates
 * are for the log only. The one rate signal: the take's mean rate against the countdown's (`restFps`), and only
 * with a delay that grows too. Nothing presented (no frame callbacks) says nothing.
 */
export function directTakeVerdict(t: {
  wantFps: number;
  /** The mode's rate (the camera never gives more). */
  modeFps: number;
  /** Frames the camera presented to the page (counted after the skips; the page may have missed some callbacks). */
  presented: number;
  seconds: number;
  /** The camera's mean rate in this take's countdown (null without one, or too short). */
  restFps?: number | null;
  resolution: ResolutionClass;
  lagMs?: number | null;
  restLagMs?: number | null;
}): PaceVerdict {
  if (!(t.seconds >= PACE_TAKE_MIN_SECONDS - PACE_TAKE_SKIP_SECONDS)) return 'unknown';
  if (!(t.presented > 0)) return 'unknown';
  const target = t.modeFps > 0 ? Math.min(t.modeFps, t.wantFps) : t.wantFps;
  if (!(target > 0)) return 'unknown';
  const takeFps = t.presented / t.seconds;
  const slowed = t.restFps != null && t.restFps > 0 && takeFps < t.restFps * PACE_DIRECT_RATE_DROP;
  const lagGrew =
    t.lagMs != null && t.restLagMs != null && Number.isFinite(t.lagMs) && t.lagMs - t.restLagMs > PACE_LAG_SOME_GROWTH_MS;
  if (!lagging(t.lagMs, t.restLagMs) && !(slowed && lagGrew)) return 'ok';
  return stepDown(target, t.resolution);
}

/** A step down seen once, waiting for a second measurement to agree. */
export interface PacePending {
  verdict: 'fps30' | 'smaller';
  resolution: ResolutionClass;
}

/**
 * A step down is learnt only when two measurements in a row (the rehearsal of two openings, or takes) say the same
 * for the same size: one bad measurement (the phone busy with something else) must not cost 30 days of quality.
 * An 'ok' for that size clears what was waiting; 'warn' and 'unknown' leave it.
 */
export function confirmPace(
  pending: PacePending | null,
  verdict: PaceVerdict,
  resolution: ResolutionClass,
): { learn: boolean; pending: PacePending | null } {
  if (verdict === 'fps30' || verdict === 'smaller') {
    if (pending && pending.verdict === verdict && pending.resolution === resolution) return { learn: true, pending: null };
    return { learn: false, pending: { verdict, resolution } };
  }
  if (verdict === 'ok' && pending?.resolution === resolution) return { learn: false, pending: null };
  return { learn: false, pending };
}
