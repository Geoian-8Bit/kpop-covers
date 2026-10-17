import {
  capAfter,
  capWithoutFps,
  capWithoutSize,
  confirmPace,
  framesPerSecond,
  largerClass,
  NO_PACE_CAP,
  paceVerdict,
  resolutionClass,
  type PaceCap,
  type PacePending,
  type PaceVerdict,
  type ResolutionClass,
} from '@coverscape/shared';
import { create } from 'zustand';
import { watchPresentedFrames } from './compositor';
import type { RecordFormat } from './recorder';
import { recordSettings } from './settings';

/**
 * P19 · Does this phone keep up with the camera mode while it records? A phone that can't encode 1080p at 60
 * shows it as a preview that lags and stutters (the whole system is busy copying and encoding frames), and the
 * take loses frames. Two measurements answer it:
 *
 * - a short silent rehearsal when the recorder is ready (picture only, thrown away): the frames that reach the
 *   screen while the encoder runs, and how late they show (camera → screen), against the same at rest;
 * - every take of 10 s or more, afterwards (from its second 2): the frames that really reached it and, again, the
 *   preview's delay. A real take carries the real load (the song playing, the file being written), so it weighs as
 *   much as a rehearsal.
 *
 * A step down is learnt only when two measurements in a row agree (`confirmPace`): one bad rehearsal (the page
 * hidden, another app busy) must not cost quality for a month. What a phone can't sustain is remembered here (per
 * browser version, 30 days) and the camera is asked for less: 60 → 30 first, then a smaller size. The recorder says
 * so every time it steps down. Asking again for 60 or for a bigger size in the settings forgets that part.
 */

const CAP_KEY = 'oneshoot.record.paceCap';
const BENCH_KEY = 'oneshoot.record.paceBench';
const PENDING_KEY = 'oneshoot.record.pacePending';
const REST_KEY = 'oneshoot.record.paceRest';
const TTL_MS = 30 * 24 * 60 * 60_000;

interface Stored<T> {
  ua: string;
  at: number;
  value: T;
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as Stored<T> | null;
    if (!raw || raw.ua !== navigator.userAgent || Date.now() - raw.at > TTL_MS) return fallback;
    return raw.value;
  } catch {
    return fallback;
  }
}

function writeStored<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ ua: navigator.userAgent, at: Date.now(), value }));
  } catch {
    /* for this visit only */
  }
}

function removeStored(...keys: string[]): void {
  try {
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* nothing stored */
  }
}

const CLASSES: ResolutionClass[] = ['720p', '1080p', '1440p', '4k'];

function sanitizeCap(raw: unknown): PaceCap {
  if (!raw || typeof raw !== 'object') return NO_PACE_CAP;
  const r = raw as Partial<PaceCap>;
  return {
    fps30: Array.isArray(r.fps30) ? r.fps30.filter((c): c is ResolutionClass => CLASSES.includes(c)) : [],
    maxResolution: CLASSES.includes(r.maxResolution as ResolutionClass) ? (r.maxResolution as ResolutionClass) : null,
  };
}

/** The phone's learnt cap, reactive: a new cap reopens the camera with the lighter mode. */
export const usePaceCap = create<{ cap: PaceCap }>()(() => ({ cap: sanitizeCap(readStored(CAP_KEY, NO_PACE_CAP)) }));

export function paceCap(): PaceCap {
  return usePaceCap.getState().cap;
}

function setCap(next: PaceCap): void {
  if (next === paceCap()) return;
  if (next.fps30.length || next.maxResolution) writeStored(CAP_KEY, next);
  else removeStored(CAP_KEY);
  usePaceCap.setState({ cap: next });
}

/** Applies a verdict straight away; true when the cap changed (the camera reopens lighter). */
export function learnPace(verdict: PaceVerdict, resolution: ResolutionClass): boolean {
  const before = paceCap();
  const after = capAfter(before, verdict, resolution);
  if (after === before) return false;
  setCap(after);
  return true;
}

function readPending(): PacePending | null {
  const raw = readStored<PacePending | null>(PENDING_KEY, null);
  if (!raw || (raw.verdict !== 'fps30' && raw.verdict !== 'smaller') || !CLASSES.includes(raw.resolution)) return null;
  return raw;
}

function writePending(next: PacePending | null): void {
  if (next) writeStored(PENDING_KEY, next);
  else removeStored(PENDING_KEY);
}

/**
 * A measurement's verdict (rehearsal or take): 'learnt' when it confirmed a step down seen before (the camera
 * reopens lighter), 'pending' when it is the first one (said, not acted on), 'none' otherwise.
 */
export function judgePace(verdict: PaceVerdict, resolution: ResolutionClass): 'learnt' | 'pending' | 'none' {
  const before = readPending();
  const { learn, pending } = confirmPace(before, verdict, resolution);
  if (pending !== before) writePending(pending);
  if (learn) return learnPace(verdict, resolution) ? 'learnt' : 'none';
  return pending && pending !== before ? 'pending' : 'none';
}

/** A first «too slow» waits for a second measurement. */
export function pacePending(): boolean {
  return readPending() != null;
}

/** Modes that are measured (something lighter exists to step down to): 60 fps, or above 1080p. */
export function heavyMode(mode: { width: number; height: number; fps: number }): boolean {
  const cls = resolutionClass(mode.width, mode.height);
  return mode.fps >= 45 || cls === '1440p' || cls === '4k';
}

/** «Volver a medir»: forget everything learnt and measured; the next rehearsal judges afresh. */
export function forgetPace(): void {
  // The rest numbers too: the panel would show the old ones until the new rehearsal ends.
  removeStored(CAP_KEY, BENCH_KEY, PENDING_KEY, REST_KEY);
  usePaceCap.setState({ cap: NO_PACE_CAP });
}

/** The dancer asks for a size above the learnt ceiling: forget the ceiling and the rehearsals of bigger sizes. */
export function forgetPaceSize(): void {
  const ceiling = paceCap().maxResolution;
  if (!ceiling) return;
  const done = readBench();
  for (const key of Object.keys(done)) {
    const cls = key.split('@')[0] as ResolutionClass;
    if (largerClass(cls, ceiling)) delete done[key];
  }
  writeStored(BENCH_KEY, done);
  if (readPending()?.verdict === 'smaller') writePending(null);
  setCap(capWithoutSize(paceCap()));
}

/** The dancer asks for 60 again: forget the 30-fps steps and the rehearsals at 60. */
export function forgetPaceFps(): void {
  const done = readBench();
  for (const key of Object.keys(done)) if (key.includes('@60|')) delete done[key];
  writeStored(BENCH_KEY, done);
  if (readPending()?.verdict === 'fps30') writePending(null);
  setCap(capWithoutFps(paceCap()));
}

// ───────────── Rehearsals done, and what the camera gives at rest ─────────────

type ModeLike = { width: number; height: number; fps: number };

const modeKey = (mode: ModeLike) => `${resolutionClass(mode.width, mode.height)}@${Math.round(mode.fps) >= 45 ? 60 : 30}`;

/** Rehearsals already done on this phone (mode + format + path → verdict). */
function benchKey(mode: ModeLike, format: RecordFormat, path: string): string {
  return `${modeKey(mode)}|${format.mimeType || 'default'}|${path}`;
}

function readBench(): Record<string, PaceVerdict> {
  const raw = readStored<Record<string, unknown>>(BENCH_KEY, {});
  const out: Record<string, PaceVerdict> = {};
  for (const [k, v] of Object.entries(raw ?? {})) if (typeof v === 'string') out[k] = v as PaceVerdict;
  return out;
}

export function benchDone(mode: ModeLike, format: RecordFormat, path: string): boolean {
  return Boolean(readBench()[benchKey(mode, format, path)]);
}

/** Only a final verdict is remembered: a first «too slow» waits for the next opening's rehearsal to agree. */
function rememberBench(mode: ModeLike, format: RecordFormat, path: string, verdict: PaceVerdict) {
  const done = readBench();
  done[benchKey(mode, format, path)] = verdict;
  writeStored(BENCH_KEY, done);
}

/**
 * What the camera gives with nothing recording, per mode. A take's delay is compared with this delay; its rate is
 * only shown (a direct take is judged against the camera's own rate during the take: the light changes it).
 */
export interface PaceRest {
  fps: number;
  lagMs: number | null;
}

export function paceRest(mode: ModeLike): PaceRest | null {
  const all = readStored<Record<string, PaceRest>>(REST_KEY, {});
  const r = all?.[modeKey(mode)];
  return r && typeof r.fps === 'number' && r.fps > 0 ? { fps: r.fps, lagMs: typeof r.lagMs === 'number' ? r.lagMs : null } : null;
}

function rememberRest(mode: ModeLike, rest: PaceRest): void {
  const all = readStored<Record<string, PaceRest>>(REST_KEY, {});
  all[modeKey(mode)] = rest;
  writeStored(REST_KEY, all);
}

// ───────────── Log for a remote trace (Chrome remote debugging on the phone) ─────────────

/** Whether to write the measurements to the console: in development, or with «Información técnica» on. */
export function techLogging(): boolean {
  try {
    return import.meta.env.DEV || recordSettings().info || localStorage.getItem('oneshoot.debug') === '1';
  } catch {
    return false;
  }
}

/** One line per measurement, «[oneshoot:pace] …», readable in chrome://inspect from a computer. */
export function paceLog(event: string, data: Record<string, unknown>): void {
  if (!techLogging()) return;
  console.info(`[oneshoot:pace] ${event}`, data);
}

// ───────────── The silent rehearsal ─────────────

export interface BenchResult {
  verdict: PaceVerdict;
  /** Frames per second while encoding, and at rest. */
  fps: number;
  restFps: number;
  /** Median camera → screen delay while encoding, and at rest (null where the browser doesn't tell). */
  lagMs: number | null;
  restLagMs: number | null;
}

export interface Bench {
  /** Resolves with the result, or null when cancelled / impossible here. Always resolves. */
  done: Promise<BenchResult | null>;
  cancel(): void;
}

const BASE_MS = 1000;
const WARM_MS = 600;
const MEASURE_MS = 2000;

/**
 * The silent rehearsal: picture only, through the same recorder and format as a take, nothing kept.
 * 1. 1 s at rest: the frames the preview gets without encoding and their delay (what this camera gives here: less
 *    light, fewer frames on many phones; that is not the phone being slow).
 * 2. 2 s encoding (after a short warm-up): the frames a direct take records (presented on screen), or a canvas take
 *    records (drawn on the canvas), and the preview's delay meanwhile. Clearly fewer frames, or a delay that grows,
 *    = the phone doesn't keep up while it encodes.
 * Anything that disturbs the camera meanwhile cancels it without judging: the page hidden, the phone turned, the
 * picture changing size (and, from the recorder, a tap on zoom, flash, focus or light).
 *
 * It runs without the song: playing it, even muted, would move the studio's clock and risk sound. Its load is
 * lighter than a take's, which is why every long take is judged too.
 */
export function runBench(opts: {
  video: HTMLVideoElement;
  track: MediaStreamTrack;
  format: RecordFormat;
  mode: ModeLike;
  wantFps: number;
  path: 'direct' | 'canvas';
  /** Canvas path: the track to record and its frame counter. */
  canvas?: { track: MediaStreamTrack; frames: () => number };
}): Bench {
  let finished = false;
  let rec: MediaRecorder | null = null;
  let watch: ReturnType<typeof watchPresentedFrames> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settle: (result: BenchResult | null) => void = () => undefined;

  const onHidden = () => {
    if (document.visibilityState === 'hidden') stop('page hidden');
  };
  const onDisturbed = () => stop('camera disturbed');
  const listen = (on: boolean) => {
    const targets: [EventTarget | undefined, string, () => void][] = [
      [document, 'visibilitychange', onHidden],
      [window, 'pagehide', onDisturbed],
      [window, 'orientationchange', onDisturbed],
      [typeof screen !== 'undefined' ? screen.orientation : undefined, 'change', onDisturbed],
      [opts.video, 'resize', onDisturbed],
    ];
    for (const [target, type, fn] of targets) {
      if (on) target?.addEventListener(type, fn);
      else target?.removeEventListener(type, fn);
    }
  };
  const cleanup = () => {
    clearTimeout(timer);
    listen(false);
    watch?.stop();
    watch = null;
    if (rec) {
      rec.ondataavailable = null;
      try {
        if (rec.state !== 'inactive') rec.stop();
      } catch {
        /* already stopped */
      }
      rec = null;
    }
  };
  const end = (result: BenchResult | null) => {
    if (finished) return;
    finished = true;
    cleanup();
    settle(result);
  };
  function stop(reason: string) {
    if (finished) return;
    paceLog('rehearsal cancelled', { reason });
    end(null);
  }

  const done = new Promise<BenchResult | null>((resolve) => {
    settle = resolve;
    if (typeof MediaRecorder === 'undefined') return end(null);
    const recordTrack = opts.path === 'canvas' && opts.canvas ? opts.canvas.track : opts.track;
    const w = watchPresentedFrames(opts.video);
    watch = w;
    // No frame callbacks here: nothing can be measured.
    if (typeof (opts.video as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback !== 'function') return end(null);
    listen(true);
    const restStart = performance.now();
    // 1 · At rest.
    timer = setTimeout(() => {
      if (finished) return;
      const restFps = framesPerSecond(w.count(), (performance.now() - restStart) / 1000);
      const restLagMs = w.lag.median();
      // No frames at rest (a hidden or stalled preview): nothing to compare with.
      if (restFps < 5) return stop('no frames at rest');
      // 2 · Encoding.
      try {
        const { mimeType, videoBitsPerSecond } = opts.format;
        rec = new MediaRecorder(new MediaStream([recordTrack]), mimeType ? { mimeType, videoBitsPerSecond } : { videoBitsPerSecond });
        // Nothing is kept: the pieces are dropped as they come.
        rec.ondataavailable = () => undefined;
        rec.start(1000);
      } catch {
        return stop('recorder refused');
      }
      timer = setTimeout(() => {
        if (finished) return;
        const read = () => (opts.path === 'canvas' && opts.canvas ? opts.canvas.frames() : w.count());
        const startFrames = read();
        const started = performance.now();
        w.lag.clear();
        timer = setTimeout(() => {
          if (finished) return;
          const seconds = (performance.now() - started) / 1000;
          const fps = framesPerSecond(read() - startFrames, seconds);
          const lagMs = w.lag.median();
          const verdict = paceVerdict({
            wantFps: opts.wantFps,
            // What this camera gives here at rest, never more than its mode.
            cameraFps: Math.min(opts.mode.fps || restFps, restFps),
            measuredFps: fps,
            seconds,
            resolution: resolutionClass(opts.mode.width, opts.mode.height),
            lagMs,
            restLagMs,
          });
          rememberRest(opts.mode, { fps: restFps, lagMs: restLagMs });
          const result: BenchResult = { verdict, fps, restFps, lagMs, restLagMs };
          paceLog('rehearsal', { path: opts.path, mode: modeKey(opts.mode), format: opts.format.mimeType, ...result });
          end(result);
        }, MEASURE_MS);
      }, WARM_MS);
    }, BASE_MS);
  });
  return {
    done,
    cancel: () => stop('cancelled by the recorder'),
  };
}

/** Called once a rehearsal's verdict was judged: remembered (not run again) unless it waits for a second opinion. */
export function settleBench(mode: ModeLike, format: RecordFormat, path: string, verdict: PaceVerdict, judged: 'learnt' | 'pending' | 'none'): void {
  if (verdict === 'unknown' || judged === 'pending') return;
  rememberBench(mode, format, path, verdict);
}

/** The notice for a step down (or for a phone already at its lightest). */
export function paceNotice(verdict: PaceVerdict, label: string): string | null {
  if (verdict === 'fps30') return `Este móvil no va fluido a 60 fps en ${label}: graba a 30. Puedes volver a 60 en Ajustes › Calidad.`;
  if (verdict === 'smaller') return `Este móvil no va fluido en ${label}: graba en 1080p. Puedes cambiarlo en Ajustes › Calidad.`;
  if (verdict === 'warn') return `El móvil va justo en ${label}: cierra otras apps o elige Ahorro en Ajustes › Calidad.`;
  return null;
}

/** A first «too slow», not acted on yet. */
export function pacePendingNotice(label: string): string {
  return `El móvil ha ido justo en ${label}. Si vuelve a pasar, se grabará más ligero. Cierra otras apps si puedes.`;
}
