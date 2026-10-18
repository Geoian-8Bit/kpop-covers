/**
 * 43 · A take's sound and picture in step with what the dancer lived.
 *
 * The dancer moves to what comes out of the speaker. In the file, though:
 *
 * - the song is recorded before the speaker: the track handed to the recorder (the element's capture, or the Web
 *   Audio tap of the voice split) carries each sample when it is rendered, and the speaker plays it
 *   `outputLatency` (+ the render buffer, `baseLatency`) later: tens of ms on a phone's speaker, 150–300 ms over
 *   Bluetooth. So the recorded song runs AHEAD of what the dancer heard;
 * - the picture is stamped late: a camera frame reaches the browser some time after the moment it shows (exposure,
 *   readout, the camera's own pipeline; browsers stamp it on arrival, so this part can't be read from the page),
 *   and a canvas take stamps each frame when it is drawn, later again (measured: draw time − `captureTime`).
 *
 * Both push the same way (the picture after the music), which is what was seen. The fix delays the recorded sound
 * by their sum, in the recorder's own sound path (a DelayNode, syncAudio.ts): the file is right in any player and
 * when shared, and the preview is untouched.
 *
 *   delay = speaker (song only) + camera + canvas draw (canvas takes only) − hop
 *
 * - speaker: (outputLatency + baseLatency) of a running AudioContext on this phone, or how far it renders ahead of
 *   the speaker (getOutputTimestamp), or DEFAULT_SPEAKER_MS;
 * - camera: CAMERA_FIXED_MS + one frame at the mode's rate (an estimate: it can't be measured from the page);
 * - draw: the median draw lag of the last frames before the take, or DEFAULT_DRAW_MS when the browser gives no
 *   capture times;
 * - hop: what a delay line in a second context adds (its render buffer, ≈ baseLatency). Only taken off the song
 *   when it crosses into that second context (the element's capture on Android); a song from the engine's own graph
 *   is delayed inside that graph (no hop).
 *
 * With the microphone the sound is recorded as it happens in the room (the dancer hears the same speaker at the same
 * moment), so only the picture's part is compensated, and no hop is taken off it (not measured: erring on the side
 * of more delay is the safer side).
 *
 * `trimMs` is the dancer's own fine adjustment (Ajustes del grabador): + when the steps look late against the music.
 *
 * Erring on the side of a bit more delay is the safer side: sound that comes early is noticed from ~45 ms, sound
 * that comes late only from ~125 ms (ITU-R BT.1359).
 */

export type SyncSound = 'song' | 'mic';
export type SyncPath = 'direct' | 'canvas';

/** Speaker latency (outputLatency + baseLatency) when the phone doesn't say. */
export const DEFAULT_SPEAKER_MS = 50;
/** The camera's latency the page can't see (exposure → the frame reaching the browser), on top of one frame. */
export const CAMERA_FIXED_MS = 45;
/** A canvas frame's draw lag (capture → drawn) when the browser gives no capture times: about one refresh. */
export const DEFAULT_DRAW_MS = 25;
/** Never delay the sound by more than this (the delay line is sized for it). */
export const MAX_AUDIO_DELAY_MS = 600;
/** Latencies above this are not believed (Bluetooth stays well below). */
const MAX_PLAUSIBLE_SPEAKER_MS = 800;
const MAX_PLAUSIBLE_BASE_MS = 200;
const MAX_PLAUSIBLE_DRAW_MS = 300;
/** Manual fine adjustment range and step (ms). */
export const MAX_TRIM_MS = 150;
export const TRIM_STEP_MS = 10;

export interface SyncInput {
  sound: SyncSound;
  path: SyncPath;
  /** The camera mode's frame rate (30, 60…). */
  fps: number;
  /** AudioContext.outputLatency, in seconds (0 / missing: unknown). */
  outputLatency?: number | null;
  /** AudioContext.baseLatency, in seconds (missing: unknown). */
  baseLatency?: number | null;
  /** How far the context renders ahead of the speaker, in ms (getOutputTimestamp; null: unknown). */
  renderAheadMs?: number | null;
  /** Canvas take: median capture → draw delay of the last frames (null: the browser gives no capture times). */
  drawLagMs?: number | null;
  /** Manual fine adjustment (ms): + delays the sound more (the picture looked late), − less. */
  trimMs?: number;
  /** The delay line sits in a second context (its render buffer adds to the delay): true for the element's capture. */
  crossContext?: boolean;
}

/** What was applied to a take, kept with it for diagnosis. */
export interface SyncPlan {
  /** Delay applied to the recorded sound (ms, ≥ 0). */
  delayMs: number;
  /** Speaker part (0 with the microphone) and whether it was measured on this phone. */
  speakerMs: number;
  speakerMeasured: boolean;
  /** The camera's estimated hidden latency. */
  cameraMs: number;
  /** Canvas draw lag (0 for a direct take) and whether it was measured. */
  drawMs: number;
  drawMeasured: boolean;
  /** The delay line's own latency, taken off. */
  hopMs: number;
  trimMs: number;
}

const finitePositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Seconds → ms, or null when not plausible. */
function plausibleMs(seconds: unknown, max: number): number | null {
  if (!finitePositive(seconds)) return null;
  const ms = seconds * 1000;
  return ms <= max ? ms : null;
}

/** The speaker's latency: measured (outputLatency first, then how far the context renders ahead) or the default. */
export function speakerLatency(input: Pick<SyncInput, 'outputLatency' | 'baseLatency' | 'renderAheadMs'>): {
  ms: number;
  measured: boolean;
} {
  const out = plausibleMs(input.outputLatency, MAX_PLAUSIBLE_SPEAKER_MS);
  const base = plausibleMs(input.baseLatency, MAX_PLAUSIBLE_BASE_MS) ?? 0;
  if (out != null) return { ms: out + base, measured: true };
  const ahead = input.renderAheadMs;
  if (finitePositive(ahead) && ahead <= MAX_PLAUSIBLE_SPEAKER_MS) return { ms: ahead, measured: true };
  return { ms: DEFAULT_SPEAKER_MS, measured: false };
}

/** The camera's hidden latency at a frame rate: a fixed part plus one frame. */
export function cameraLatencyMs(fps: number): number {
  const rate = Number.isFinite(fps) && fps > 0 ? Math.min(120, Math.max(15, fps)) : 30;
  return CAMERA_FIXED_MS + 1000 / rate;
}

/** The fine adjustment within ±MAX_TRIM_MS, on its 10 ms steps (anything unreadable: 0). */
export function clampTrim(ms: unknown): number {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return 0;
  const stepped = Math.round(Math.max(-MAX_TRIM_MS, Math.min(MAX_TRIM_MS, ms)) / TRIM_STEP_MS) * TRIM_STEP_MS;
  return stepped === 0 ? 0 : stepped;
}

/** The fine adjustment as said in the settings: «+30 ms», «−20 ms», «0 ms». */
export function trimLabel(ms: number): string {
  const v = clampTrim(ms);
  return v > 0 ? `+${v} ms` : v < 0 ? `−${-v} ms` : '0 ms';
}

/** «i» panel line for a take's applied delay. */
export function syncSummary(s: {
  delayMs: number;
  applied: boolean;
  sound: SyncSound;
  path: SyncPath;
  speakerMs: number;
  speakerMeasured: boolean;
  cameraMs: number;
  drawMs: number;
  hopMs: number;
  trimMs: number;
}): string {
  const parts: string[] = [];
  if (s.sound === 'song') parts.push(`altavoz ${s.speakerMs} ms ${s.speakerMeasured ? 'medido' : 'estimado'}`);
  parts.push(`cámara ${s.cameraMs} ms`);
  if (s.path === 'canvas') parts.push(`lienzo ${s.drawMs} ms`);
  if (s.hopMs) parts.push(`−${s.hopMs} ms de paso`);
  if (s.trimMs) parts.push(`ajuste fino ${trimLabel(s.trimMs)}`);
  // Nothing to delay is not a failure: the fine adjustment (or a delay line that wasn't needed) left it at 0.
  if (s.delayMs <= 0) return `Sin retraso${s.trimMs < 0 ? ' (ajuste fino)' : ''} · ${parts.join(', ')}`;
  return `${s.applied ? 'Sonido retrasado' : 'Sin retraso aplicado; tocaba'} ${s.delayMs} ms (${parts.join(', ')})`;
}

/** How much to delay a take's recorded sound, and why. */
export function planSync(input: SyncInput): SyncPlan {
  const speaker = input.sound === 'song' ? speakerLatency(input) : { ms: 0, measured: false };
  const cameraMs = cameraLatencyMs(input.fps);
  const lag = input.drawLagMs;
  const drawMeasured = input.path === 'canvas' && typeof lag === 'number' && Number.isFinite(lag) && lag >= 0 && lag <= MAX_PLAUSIBLE_DRAW_MS;
  const drawMs = input.path === 'canvas' ? (drawMeasured ? (lag as number) : DEFAULT_DRAW_MS) : 0;
  const hopMs = input.sound === 'song' && input.crossContext ? (plausibleMs(input.baseLatency, MAX_PLAUSIBLE_BASE_MS) ?? 0) : 0;
  const trimMs = clampTrim(input.trimMs);
  const raw = speaker.ms + cameraMs + drawMs - hopMs + trimMs;
  const delayMs = Math.round(Math.max(0, Math.min(MAX_AUDIO_DELAY_MS, raw)));
  return {
    delayMs,
    speakerMs: Math.round(speaker.ms),
    speakerMeasured: speaker.measured,
    cameraMs: Math.round(cameraMs),
    drawMs: Math.round(drawMs),
    drawMeasured,
    hopMs: Math.round(hopMs),
    trimMs,
  };
}

/** A delay in ms as seconds on whole samples (a fractional delay would be interpolated: a slight low-pass). */
export function delaySeconds(ms: number, sampleRate: number): number {
  if (!(ms > 0) || !(sampleRate > 0)) return 0;
  return Math.round((ms / 1000) * sampleRate) / sampleRate;
}

/**
 * How far an AudioContext renders ahead of what the speaker plays (ms), from `currentTime` and
 * `getOutputTimestamp().contextTime`: null before it really plays, or when not plausible.
 */
export function renderAheadMs(currentTime: number, outputContextTime: number | undefined): number | null {
  if (!finitePositive(currentTime) || !finitePositive(outputContextTime)) return null;
  const ms = (currentTime - outputContextTime) * 1000;
  return ms > 0 && ms <= MAX_PLAUSIBLE_SPEAKER_MS ? ms : null;
}

/** Median of the first `count` values of a buffer (null when empty). Copies; meant for a few dozen values. */
export function medianOf(values: ArrayLike<number>, count = values.length): number | null {
  const n = Math.max(0, Math.min(count, values.length));
  if (n === 0) return null;
  const sorted = Array.from({ length: n }, (_, i) => values[i]!).sort((a, b) => a - b);
  const mid = n >> 1;
  return n % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
