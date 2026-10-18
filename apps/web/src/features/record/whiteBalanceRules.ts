/**
 * C4 / P24 / P48 · «Color de la luz»: how a white-balance preset reaches the camera, as pure steps a test can drive
 * with a simulated track.
 *
 * What `colorTemperature` means: the temperature of the light the camera should *correct* (the scene's light), not
 * the tone wanted. Asking for a low value (2850 K, a bulb) tells the camera the light is orange, so it adds blue: on a
 * daylight scene the picture turns blue. A high value (7000 K, shade) adds orange. P48: «Cálida» asked 3000 K and
 * turned the picture blue; the presets now go by the tone the dancer sees (`WB_PRESETS`).
 *
 * Chrome on Android has no free temperature: it picks the camera's nearest preset (incandescent 2850, warm
 * fluorescent 2950, fluorescent 4250, daylight 5000, cloudy 6000, shade 7000…) and reports *that* value. P48: a
 * 4000 K ask landed on fluorescent (a magenta, «lila», tint), reported 4250 and was taken for «not applied» (the old
 * check wanted ±50 K): the option hid although the camera had changed. Now the presets sit on the values those
 * presets have (no fluorescent one), and a camera that reports a manual balance has taken it, whatever its number.
 *
 * Chrome also keeps the last temperature for as long as the camera is open: asking `continuous` again may still
 * leave the preset on. «Auto» is therefore checked like a preset; when the camera still shows a manual balance it is
 * `ignored` (the app then reopens the camera, the only sure way back, or says so mid-take).
 *
 * A request goes twice (some phones showed each change one request late, others dropped a temperature that came with
 * the mode) and `getSettings()` is read until it shows it or `WB_SETTLE_MS` passes. Requests are serialised and
 * only the latest one runs: tapping fast never leaves the camera on an older choice.
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

export interface WhiteBalancePreset {
  /** Chip label, by the tone the picture takes. */
  label: string;
  /** The light the camera corrects for (Kelvin); null = automatic. */
  kelvin: number | null;
}

/**
 * From the coolest picture to the warmest, each on one of Chrome's camera presets (so the camera lands where asked):
 * incandescent (the picture turns blue: right for orange bulbs), daylight, cloudy, shade. No fluorescent preset:
 * it tints the picture magenta.
 */
export const WB_PRESETS: readonly WhiteBalancePreset[] = [
  { label: 'Auto', kelvin: null },
  { label: 'Fría', kelvin: 2850 },
  { label: 'Día', kelvin: 5000 },
  { label: 'Cálida', kelvin: 6000 },
  { label: 'Muy cálida', kelvin: 7000 },
];

/**
 * The presets worth a chip on this camera: once fitted to its range, two that land on the same temperature would
 * do the same (a camera without «shade» makes «Muy cálida» another «Cálida»): only one of them is shown, the one
 * whose own temperature is nearest to where they land, so its name still fits (on a 5000–6000 K camera «Fría» lands
 * on 5000 and doesn't cool anything: «Día» stays). Equally near: the first one.
 */
export function visiblePresets(range: KelvinRange | null): WhiteBalancePreset[] {
  if (!range) return [...WB_PRESETS];
  const best = new Map<number, WhiteBalancePreset>();
  for (const p of WB_PRESETS) {
    if (p.kelvin == null) continue;
    const k = pickTemperature(p.kelvin, range);
    const kept = best.get(k);
    if (!kept || Math.abs(p.kelvin - k) < Math.abs(kept.kelvin! - k)) best.set(k, p);
  }
  const shown = new Set(best.values());
  return WB_PRESETS.filter((p) => p.kelvin == null || shown.has(p));
}

/** The chip a stored value belongs to (an unknown value reads as its Kelvin). */
export function presetLabel(kelvin: number | null): string {
  return WB_PRESETS.find((p) => p.kelvin === kelvin)?.label ?? `${kelvin} K`;
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

/** A camera that reports only a number is near enough within this (its nearest preset may be ~500 K off). */
export const WB_NEAR_K = 750;

export interface WhiteBalancePlan {
  /** Each one goes in its own `applyConstraints({ advanced: [step] })`, in order. */
  steps: Record<string, string | number>[];
  /** What `getSettings()` should show afterwards. */
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
    steps: [set, set],
    expect: { mode: 'manual', kelvin: k, tolerance: Math.max(caps.range.step ?? 0, WB_NEAR_K) },
  };
}

type WbSettings = Record<string, unknown>;

/**
 * Does the camera show it? A preset: a manual balance (whatever number the camera chose), or — when the mode isn't
 * reported — a temperature near the one asked or moved from where it was. «Auto»: `continuous`, or no mode reported.
 * A camera that reports nothing at all can't be checked: taken as applied (it is never hidden for that).
 */
export function whiteBalanceTook(settings: WbSettings, expect: WhiteBalancePlan['expect'], before: WbSettings = {}): boolean {
  const mode = settings.whiteBalanceMode;
  if (expect.kelvin == null) return mode === undefined || mode === 'continuous';
  if (mode === 'continuous') return false;
  if (mode !== undefined) return true;
  const k = settings.colorTemperature;
  if (typeof k !== 'number') return true;
  if (Math.abs(k - expect.kelvin) <= expect.tolerance) return true;
  const was = before.colorTemperature;
  return typeof was === 'number' && Math.abs(k - was) > Math.max(1, expect.tolerance / 10);
}

/** The part of a MediaStreamTrack this needs (a test passes a simulated one). */
export interface WhiteBalanceTrack {
  readonly readyState: string;
  applyConstraints(constraints: { advanced: Record<string, unknown>[] }): Promise<void>;
  getSettings(): object;
}

/**
 * `applied`: getSettings shows it (or can't tell). `ignored`: accepted but not shown — for a preset, the camera
 * stayed on automatic; for «Auto», it still shows a manual balance. `refused`: the browser rejected a step.
 * `unsupported`: the camera doesn't list it. `ended`: no live track. `superseded`: a newer request came in.
 */
export type WhiteBalanceOutcome = 'applied' | 'ignored' | 'refused' | 'unsupported' | 'ended' | 'superseded';

/** Pause after each step and between reads of the result (ms), and how long a camera gets to show it. */
export const WB_STEP_WAIT = 150;
export const WB_SETTLE_MS = 1200;

export async function runWhiteBalance(
  track: WhiteBalanceTrack,
  kelvin: number | null,
  caps: WhiteBalanceCaps,
  opts: { wait: (ms: number) => Promise<void>; isStale?: () => boolean },
): Promise<WhiteBalanceOutcome> {
  const plan = whiteBalancePlan(kelvin, caps);
  if (!plan) return 'unsupported';
  const stale = opts.isStale ?? (() => false);
  const read = () => (track.getSettings() ?? {}) as WbSettings;
  const before = read();
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
  // The track answers before the camera does: read until it shows, for a while.
  for (let waited = 0; ; waited += WB_STEP_WAIT) {
    if (stale()) return 'superseded';
    if (track.readyState !== 'live') return 'ended';
    if (whiteBalanceTook(read(), plan.expect, before)) return 'applied';
    if (waited >= WB_SETTLE_MS) return 'ignored';
    await opts.wait(WB_STEP_WAIT);
  }
}

/**
 * What the recorder is told about a request. `applied`: it shows. `auto`: the preset didn't take and the camera is
 * on automatic. `stuck`: automatic was asked (or put back after a failed preset) and the camera still shows a manual
 * balance: only reopening the camera brings automatic back. `superseded`: a newer request took over.
 */
export type WhiteBalanceResult = 'applied' | 'auto' | 'stuck' | 'superseded';

/**
 * The whole request: the preset or «Auto», and after a preset that didn't take, automatic again (checked, so a
 * camera that keeps the preset says `stuck` instead of leaving a tint behind while the panel says «Auto»).
 */
export async function requestWhiteBalance(
  track: WhiteBalanceTrack,
  kelvin: number | null,
  caps: WhiteBalanceCaps,
  opts: { wait: (ms: number) => Promise<void>; isStale?: () => boolean; onPresetOutcome?: (o: WhiteBalanceOutcome) => void },
): Promise<WhiteBalanceResult> {
  const showsAuto = () =>
    whiteBalanceTook((track.getSettings() ?? {}) as WbSettings, { mode: 'continuous', kelvin: null, tolerance: 0 });
  const outcome = await runWhiteBalance(track, kelvin, caps, opts);
  if (outcome === 'superseded') return 'superseded';
  if (kelvin != null) opts.onPresetOutcome?.(outcome);
  if (outcome === 'applied') return 'applied';
  if (outcome === 'ended') return 'auto'; // a new camera opens on automatic
  if (kelvin == null) {
    if (outcome === 'ignored') return 'stuck';
    return showsAuto() ? 'applied' : 'stuck';
  }
  if (outcome === 'unsupported') return 'auto';
  const back = await runWhiteBalance(track, null, caps, opts);
  if (back === 'superseded') return 'superseded';
  if (back === 'ignored') return 'stuck';
  if (back === 'refused' || back === 'unsupported') return showsAuto() ? 'auto' : 'stuck';
  return 'auto';
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
