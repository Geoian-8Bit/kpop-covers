/**
 * C4 / P24 · «Color de la luz»: how a white-balance preset reaches the camera, as pure steps a test can drive with a
 * simulated track.
 *
 * Some phones (a Samsung on Chrome, seen in the 17-10 test) did nothing when the mode and the temperature came in
 * one request, and showed the previous choice's tone on the *next* request. So a preset goes in steps: first the
 * manual mode, then the temperature (inside the camera's range, on its step), then the same again to settle it;
 * and `getSettings()` must show it took. «Auto» goes back to `continuous`, without a temperature. Requests are
 * serialised and only the latest one runs: tapping fast never leaves the camera on an older choice.
 */

export interface KelvinRange {
  min: number;
  max: number;
  step?: number;
}

export interface WhiteBalanceCaps {
  /** `whiteBalanceMode` values the camera lists (getCapabilities). */
  modes: readonly string[];
  /** `colorTemperature` range, when it has one. */
  range: KelvinRange | null;
}

export function canSetTemperature(caps: WhiteBalanceCaps): boolean {
  return Boolean(caps.range && caps.range.max > caps.range.min && caps.modes.includes('manual'));
}

/** The temperature to ask for: inside the range and on its step (counted from the minimum). */
export function pickTemperature(kelvin: number, range: KelvinRange): number {
  const lo = Math.min(range.min, range.max);
  const hi = Math.max(range.min, range.max);
  let k = Math.min(hi, Math.max(lo, kelvin));
  const step = range.step;
  if (step && step > 0 && Number.isFinite(step)) {
    k = lo + Math.round((k - lo) / step) * step;
    if (k > hi) k -= step;
    if (k < lo) k = lo;
    // Steps like 0.1 add float noise; the camera wants the value on its grid.
    k = Math.round(k * 1000) / 1000;
  }
  return k;
}

export interface WhiteBalancePlan {
  /** Each one goes in its own `applyConstraints({ advanced: [step] })`, in order. */
  steps: Record<string, string | number>[];
  /** What `getSettings()` must show afterwards. */
  expect: { mode: 'manual' | 'continuous'; kelvin: number | null; tolerance: number };
}

/** The steps for a preset (Kelvin) or for «Auto» (null); null when this camera can't do it. */
export function whiteBalancePlan(kelvin: number | null, caps: WhiteBalanceCaps): WhiteBalancePlan | null {
  if (kelvin == null) {
    if (!caps.modes.includes('continuous')) return null;
    const auto = { whiteBalanceMode: 'continuous' };
    return { steps: [auto, auto], expect: { mode: 'continuous', kelvin: null, tolerance: 0 } };
  }
  if (!canSetTemperature(caps) || !caps.range) return null;
  const k = pickTemperature(kelvin, caps.range);
  const set = { whiteBalanceMode: 'manual', colorTemperature: k };
  return {
    steps: [{ whiteBalanceMode: 'manual' }, set, set],
    expect: { mode: 'manual', kelvin: k, tolerance: Math.max(caps.range.step ?? 0, 50) },
  };
}

/** Did the camera take it? «Auto» is trusted when the camera doesn't report its mode at all. */
export function whiteBalanceTook(settings: Record<string, unknown>, expect: WhiteBalancePlan['expect']): boolean {
  const mode = settings.whiteBalanceMode;
  if (expect.kelvin == null) return mode === undefined || mode === 'continuous';
  const k = settings.colorTemperature;
  return mode === 'manual' && typeof k === 'number' && Math.abs(k - expect.kelvin) <= expect.tolerance;
}

/** The part of a MediaStreamTrack this needs (a test passes a simulated one). */
export interface WhiteBalanceTrack {
  readonly readyState: string;
  applyConstraints(constraints: { advanced: Record<string, unknown>[] }): Promise<void>;
  getSettings(): object;
}

/**
 * `applied`: getSettings shows it. `ignored`: accepted but not reflected (this phone doesn't really do it).
 * `refused`: the browser rejected a step. `unsupported`: the camera doesn't list it. `ended`: no live track.
 * `superseded`: a newer request came in, this one stopped.
 */
export type WhiteBalanceOutcome = 'applied' | 'ignored' | 'refused' | 'unsupported' | 'ended' | 'superseded';

/** Pause after each step, and between reads of the result (ms). */
export const WB_STEP_WAIT = 150;
export const WB_CHECKS = 3;

export async function runWhiteBalance(
  track: WhiteBalanceTrack,
  kelvin: number | null,
  caps: WhiteBalanceCaps,
  opts: { wait: (ms: number) => Promise<void>; isStale?: () => boolean },
): Promise<WhiteBalanceOutcome> {
  const plan = whiteBalancePlan(kelvin, caps);
  if (!plan) return 'unsupported';
  const stale = opts.isStale ?? (() => false);
  for (const step of plan.steps) {
    if (stale()) return 'superseded';
    if (track.readyState !== 'live') return 'ended';
    try {
      await track.applyConstraints({ advanced: [step] });
    } catch {
      return track.readyState === 'live' ? 'refused' : 'ended';
    }
    await opts.wait(WB_STEP_WAIT);
  }
  // Some cameras report the new value a moment later.
  for (let i = 0; i < WB_CHECKS; i++) {
    if (stale()) return 'superseded';
    if (whiteBalanceTook(track.getSettings() as Record<string, unknown>, plan.expect)) return 'applied';
    if (i < WB_CHECKS - 1) await opts.wait(WB_STEP_WAIT);
  }
  return 'ignored';
}

/**
 * Runs jobs one after another; a job queued behind a newer one is skipped (resolves `skipped`), and a running job
 * can ask `isStale()` to stop early. The last request always wins.
 */
export function createLatestQueue() {
  let seq = 0;
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(job: (isStale: () => boolean) => Promise<T>, skipped: T): Promise<T> {
    const mine = ++seq;
    const isStale = () => mine !== seq;
    const run = tail.then(() => (isStale() ? skipped : job(isStale)));
    tail = run.catch(() => undefined);
    return run;
  };
}

/** Cameras (by label) where a preset was accepted but never showed: stored as a JSON list. */
export function parseIgnoredCameras(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string').slice(-20) : [];
  } catch {
    return [];
  }
}

/**
 * P24 review · What this phone remembers about cameras whose colour presets didn't show: how many times in a row a
 * preset was accepted and not reflected (`ignored`), when, and with which browser. The option hides only after
 * `WB_HIDE_AFTER` of those (one can be passing: another change to the camera at the same moment, the camera
 * reopening), for `WB_TTL_MS` and this browser version; a refusal never counts, and a preset that works clears it.
 */
export interface WbMemoryEntry {
  label: string;
  fails: number;
  at: number;
  ua: string;
}

export const WB_HIDE_AFTER = 2;
export const WB_TTL_MS = 30 * 24 * 60 * 60_000;
const WB_MAX_ENTRIES = 20;

/** The stored list, without what expired or belongs to another browser version. The old format (a list of labels, one failure each) still reads. */
export function parseWbMemory(raw: string | null, now: number, ua: string): WbMemoryEntry[] {
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: WbMemoryEntry[] = [];
  for (const item of list) {
    if (typeof item === 'string') out.push({ label: item, fails: 1, at: now, ua });
    else if (item && typeof item === 'object') {
      const e = item as Partial<WbMemoryEntry>;
      if (typeof e.label !== 'string' || typeof e.fails !== 'number' || typeof e.at !== 'number' || typeof e.ua !== 'string') continue;
      if (e.ua !== ua || now - e.at > WB_TTL_MS || e.fails < 1) continue;
      out.push({ label: e.label, fails: e.fails, at: e.at, ua: e.ua });
    }
  }
  return out.slice(-WB_MAX_ENTRIES);
}

/** The list after a preset's outcome on the camera `label` (the same list when nothing changes). */
export function noteWbOutcome(
  list: WbMemoryEntry[],
  label: string,
  outcome: WhiteBalanceOutcome,
  now: number,
  ua: string,
): WbMemoryEntry[] {
  const i = list.findIndex((e) => e.label === label);
  if (outcome === 'applied') return i < 0 ? list : list.filter((_, k) => k !== i);
  if (outcome !== 'ignored') return list;
  const fails = (i < 0 ? 0 : list[i]!.fails) + 1;
  const rest = i < 0 ? list : list.filter((_, k) => k !== i);
  return [...rest, { label, fails, at: now, ua }].slice(-WB_MAX_ENTRIES);
}

export function wbHidden(list: WbMemoryEntry[], label: string): boolean {
  return list.some((e) => e.label === label && e.fails >= WB_HIDE_AFTER);
}
