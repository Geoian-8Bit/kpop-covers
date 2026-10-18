import { describe, expect, it } from 'vitest';
import {
  createLatestQueue,
  noteWbOutcome,
  parseIgnoredCameras,
  parseWbMemory,
  presetLabel,
  visiblePresets,
  requestWhiteBalance,
  wbHidden,
  pickTemperature,
  runWhiteBalance,
  whiteBalancePlan,
  whiteBalanceTook,
  WB_NEAR_K,
  WB_PRESETS,
  type WhiteBalanceCaps,
  type WhiteBalanceOutcome,
  type WhiteBalanceTrack,
} from './whiteBalanceRules';

const CAPS: WhiteBalanceCaps = { modes: ['continuous', 'manual'], range: { min: 2850, max: 7000, step: 50 } };
const noWait = () => Promise.resolve();

type Settings = { whiteBalanceMode?: string; colorTemperature?: number };

/** Chrome on Android: the camera's presets, by the temperature Chrome gives each one. */
const CHROME_PRESETS = [2850, 2950, 4250, 4600, 5000, 6000, 7000];
const nearestPreset = (k: number) =>
  CHROME_PRESETS.reduce((best, p) => (Math.abs(p - k) < Math.abs(best - k) ? p : best), CHROME_PRESETS[0]!);

/**
 * A simulated camera track. `kind`:
 *  - `normal`: each request takes effect at once;
 *  - `late`: each request takes effect only when the next one arrives (the Samsung seen in the test);
 *  - `modeFirst`: a temperature is dropped unless the camera was already in manual mode;
 *  - `deaf`: accepts everything, changes nothing;
 *  - `strict`: rejects a temperature off its 50 K grid;
 *  - `chrome`: lands on the nearest preset and reports its value; keeps that temperature after `continuous` (still
 *    reported as a manual balance) for as long as the camera is open (P48);
 *  - `silent`: applies it but reports neither mode nor temperature.
 */
function fakeTrack(kind: 'normal' | 'late' | 'modeFirst' | 'deaf' | 'strict' | 'chrome' | 'silent') {
  const live: Settings = { whiteBalanceMode: 'continuous', colorTemperature: 5000 };
  let pending: Settings | null = null;
  /** Chrome: the temperature it keeps for as long as the camera is open. */
  let kept: number | null = null;
  const log: Record<string, unknown>[] = [];
  const take = (set: Settings) => {
    if (kind === 'deaf') return;
    if (kind === 'modeFirst' && set.colorTemperature != null && live.whiteBalanceMode !== 'manual') {
      if (set.whiteBalanceMode) live.whiteBalanceMode = set.whiteBalanceMode;
      return;
    }
    if (kind === 'chrome') {
      if (set.colorTemperature != null) kept = nearestPreset(set.colorTemperature);
      live.whiteBalanceMode = kept != null ? 'manual' : (set.whiteBalanceMode ?? live.whiteBalanceMode);
      if (kept != null) live.colorTemperature = kept;
      return;
    }
    Object.assign(live, set);
  };
  const track: WhiteBalanceTrack & { readyState: string } = {
    readyState: 'live',
    async applyConstraints({ advanced }) {
      const set = advanced[0] as Settings;
      log.push(set);
      if (kind === 'strict' && set.colorTemperature != null && set.colorTemperature % 50 !== 0)
        throw new DOMException('off grid', 'OverconstrainedError');
      if (kind === 'late') {
        if (pending) take(pending);
        pending = { ...set };
      } else take(set);
    },
    getSettings() {
      if (kind === 'silent') return {};
      // Chrome reports what was asked, even on the phone that shows it late.
      return kind === 'late' && pending ? { ...live, ...pending } : { ...live };
    },
  };
  return { track, live, log };
}

describe('P48 · the presets go by the tone of the picture', () => {
  it('cooler to warmer: a low Kelvin corrects orange light (bluer picture), a high one warms it', () => {
    const presets = WB_PRESETS.filter((p) => p.kelvin != null);
    const kelvins = presets.map((p) => p.kelvin!);
    expect(kelvins).toEqual([...kelvins].sort((a, b) => a - b));
    expect(presets.find((p) => p.label === 'Cálida')!.kelvin).toBeGreaterThan(5500);
    expect(presets.find((p) => p.label === 'Fría')!.kelvin).toBeLessThan(4000);
    expect(WB_PRESETS[0]).toEqual({ label: 'Auto', kelvin: null });
  });

  it('no fluorescent preset (its magenta tint was the «lila» of the test), and each lands on its own camera preset', () => {
    const landed = WB_PRESETS.filter((p) => p.kelvin != null).map((p) => nearestPreset(p.kelvin!));
    expect(landed).not.toContain(4250);
    expect(landed).not.toContain(2950);
    expect(new Set(landed).size).toBe(landed.length);
    for (const p of WB_PRESETS) if (p.kelvin != null) expect(nearestPreset(p.kelvin)).toBe(p.kelvin);
  });

  it('presetLabel names a stored value', () => {
    expect(presetLabel(6000)).toBe('Cálida');
    expect(presetLabel(null)).toBe('Auto');
    expect(presetLabel(4321)).toBe('4321 K');
  });
});

describe('pickTemperature', () => {
  it('keeps the value inside the range, on its step', () => {
    expect(pickTemperature(3000, CAPS.range!)).toBe(3000);
    expect(pickTemperature(2000, CAPS.range!)).toBe(2850);
    expect(pickTemperature(9000, CAPS.range!)).toBe(7000);
    expect(pickTemperature(3010, { min: 2850, max: 7000, step: 100 })).toBe(3050);
    expect(pickTemperature(6990, { min: 2850, max: 7000, step: 100 })).toBe(6950);
    expect(pickTemperature(4000, { min: 2500, max: 7500 })).toBe(4000);
    expect(pickTemperature(5500, { min: 0, max: 1, step: 0.1 })).toBe(1);
  });
});

describe('whiteBalancePlan', () => {
  it('a preset: mode and temperature together, twice (no step leaves the mode without its temperature)', () => {
    const plan = whiteBalancePlan(3000, CAPS)!;
    expect(plan.steps).toEqual([
      { whiteBalanceMode: 'manual', colorTemperature: 3000 },
      { whiteBalanceMode: 'manual', colorTemperature: 3000 },
    ]);
    expect(plan.expect).toEqual({ mode: 'manual', kelvin: 3000, tolerance: WB_NEAR_K });
  });

  it('«Auto» goes back to continuous, with no temperature', () => {
    const plan = whiteBalancePlan(null, CAPS)!;
    expect(plan.steps.every((s) => s.whiteBalanceMode === 'continuous' && !('colorTemperature' in s))).toBe(true);
  });

  it('nothing to do when the camera does not list it', () => {
    expect(whiteBalancePlan(3000, { modes: ['continuous'], range: CAPS.range })).toBeNull();
    expect(whiteBalancePlan(3000, { modes: ['manual'], range: null })).toBeNull();
    expect(whiteBalancePlan(null, { modes: ['manual'], range: CAPS.range })).toBeNull();
  });

  it('whiteBalanceTook: a manual balance has taken, whatever number the camera chose', () => {
    const e = whiteBalancePlan(4000, CAPS)!.expect;
    expect(whiteBalanceTook({ whiteBalanceMode: 'manual', colorTemperature: 4020 }, e)).toBe(true);
    // P48: Chrome's nearest preset is not «not applied».
    expect(whiteBalanceTook({ whiteBalanceMode: 'manual', colorTemperature: 4250 }, e)).toBe(true);
    expect(whiteBalanceTook({ whiteBalanceMode: 'manual', colorTemperature: 6000 }, e)).toBe(true);
    // Still on automatic: not taken.
    expect(whiteBalanceTook({ whiteBalanceMode: 'continuous', colorTemperature: 4000 }, e)).toBe(false);
    // Only a number: near the ask, or moved from where it was.
    expect(whiteBalanceTook({ colorTemperature: 4250 }, e)).toBe(true);
    expect(whiteBalanceTook({ colorTemperature: 6000 }, e, { colorTemperature: 6000 })).toBe(false);
    expect(whiteBalanceTook({ colorTemperature: 6000 }, e, { colorTemperature: 5000 })).toBe(true);
    // Nothing reported: can't tell, never counted as ignored.
    expect(whiteBalanceTook({}, e)).toBe(true);
    const auto = whiteBalancePlan(null, CAPS)!.expect;
    expect(whiteBalanceTook({ whiteBalanceMode: 'continuous' }, auto)).toBe(true);
    expect(whiteBalanceTook({}, auto)).toBe(true);
    expect(whiteBalanceTook({ whiteBalanceMode: 'manual' }, auto)).toBe(false);
  });
});

describe('runWhiteBalance on simulated cameras', () => {
  it('a normal camera: applied', async () => {
    const { track, live } = fakeTrack('normal');
    expect(await runWhiteBalance(track, 3000, CAPS, { wait: noWait })).toBe('applied');
    expect(live).toEqual({ whiteBalanceMode: 'manual', colorTemperature: 3000 });
    expect(await runWhiteBalance(track, null, CAPS, { wait: noWait })).toBe('applied');
    expect(live.whiteBalanceMode).toBe('continuous');
  });

  it('the camera that shows each change one request late ends on the choice, not the one before', async () => {
    const { track, live } = fakeTrack('late');
    expect(await runWhiteBalance(track, 3000, CAPS, { wait: noWait })).toBe('applied');
    // What the picture really shows: the repeated step pushed the temperature through.
    expect(live).toEqual({ whiteBalanceMode: 'manual', colorTemperature: 3000 });
    await runWhiteBalance(track, null, CAPS, { wait: noWait });
    expect(live.whiteBalanceMode).toBe('continuous');
  });

  it('the camera that needs manual mode before a temperature gets it', async () => {
    const { track, live } = fakeTrack('modeFirst');
    expect(await runWhiteBalance(track, 6000, CAPS, { wait: noWait })).toBe('applied');
    expect(live).toEqual({ whiteBalanceMode: 'manual', colorTemperature: 6000 });
  });

  it('P48 · Chrome landing on its nearest preset counts as applied (it changed)', async () => {
    const { track, live } = fakeTrack('chrome');
    expect(await runWhiteBalance(track, 4000, CAPS, { wait: noWait })).toBe('applied');
    expect(live).toEqual({ whiteBalanceMode: 'manual', colorTemperature: 4250 });
  });

  it('P48 · Chrome keeping the preset after «Auto» is found out (ignored), not trusted', async () => {
    const { track } = fakeTrack('chrome');
    await runWhiteBalance(track, 6000, CAPS, { wait: noWait });
    expect(await runWhiteBalance(track, null, CAPS, { wait: noWait })).toBe('ignored');
  });

  it('a camera that ignores it is found out, after waiting for it to show', async () => {
    const { track } = fakeTrack('deaf');
    const waits: number[] = [];
    const wait = (ms: number) => {
      waits.push(ms);
      return Promise.resolve();
    };
    expect(await runWhiteBalance(track, 3000, CAPS, { wait })).toBe('ignored');
    // The two steps, then reads for about 1.2 s.
    expect(waits.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1200);
  });

  it('a camera that reports nothing is not taken for one that ignores it', async () => {
    const { track } = fakeTrack('silent');
    expect(await runWhiteBalance(track, 3000, CAPS, { wait: noWait })).toBe('applied');
  });

  it('a temperature off the camera grid is snapped onto it before asking', async () => {
    const { track, log } = fakeTrack('strict');
    const caps = { modes: CAPS.modes, range: { min: 2850, max: 7000, step: 50 } };
    expect(await runWhiteBalance(track, 3025, caps, { wait: noWait })).toBe('applied');
    expect(log.at(-1)).toEqual({ whiteBalanceMode: 'manual', colorTemperature: 3050 });
  });

  it('a refusal and an ended track are told apart', async () => {
    const { track } = fakeTrack('normal');
    track.applyConstraints = () => Promise.reject(new Error('no'));
    expect(await runWhiteBalance(track, 3000, CAPS, { wait: noWait })).toBe('refused');
    track.readyState = 'ended';
    expect(await runWhiteBalance(track, 3000, CAPS, { wait: noWait })).toBe('ended');
    expect(await runWhiteBalance(track, 3000, { modes: [], range: null }, { wait: noWait })).toBe('unsupported');
  });

  it('stops between steps when a newer request came in', async () => {
    const { track, log } = fakeTrack('normal');
    let stale = false;
    const wait = () => {
      stale = true;
      return Promise.resolve();
    };
    expect(await runWhiteBalance(track, 3000, CAPS, { wait, isStale: () => stale })).toBe('superseded');
    expect(log).toHaveLength(1);
  });
});

describe('P48 · requestWhiteBalance: what the recorder is told', () => {
  it('a preset that shows: applied, and its outcome is noted', async () => {
    const { track } = fakeTrack('chrome');
    const noted: WhiteBalanceOutcome[] = [];
    const opts = { wait: noWait, onPresetOutcome: (o: WhiteBalanceOutcome) => noted.push(o) };
    expect(await requestWhiteBalance(track, 6000, CAPS, opts)).toBe('applied');
    expect(noted).toEqual(['applied']);
  });

  it('«Auto» on a normal camera: applied; on Chrome after a preset: stuck (the camera must be reopened)', async () => {
    const normal = fakeTrack('normal');
    await requestWhiteBalance(normal.track, 6000, CAPS, { wait: noWait });
    expect(await requestWhiteBalance(normal.track, null, CAPS, { wait: noWait })).toBe('applied');
    expect(normal.live.whiteBalanceMode).toBe('continuous');
    const chrome = fakeTrack('chrome');
    await requestWhiteBalance(chrome.track, 6000, CAPS, { wait: noWait });
    expect(await requestWhiteBalance(chrome.track, null, CAPS, { wait: noWait })).toBe('stuck');
  });

  it('a preset the camera ignores: back to automatic, checked (auto), and noted as ignored', async () => {
    const { track, log } = fakeTrack('deaf');
    const noted: WhiteBalanceOutcome[] = [];
    const opts = { wait: noWait, onPresetOutcome: (o: WhiteBalanceOutcome) => noted.push(o) };
    expect(await requestWhiteBalance(track, 2850, CAPS, opts)).toBe('auto');
    expect(noted).toEqual(['ignored']);
    expect(log.at(-1)).toEqual({ whiteBalanceMode: 'continuous' });
  });

  it('a refused preset puts automatic back; «Auto» never counts towards hiding the option', async () => {
    const { track } = fakeTrack('normal');
    const apply = track.applyConstraints.bind(track);
    track.applyConstraints = (c) =>
      (c.advanced[0] as Settings).colorTemperature != null ? Promise.reject(new Error('no')) : apply(c);
    const noted: WhiteBalanceOutcome[] = [];
    const opts = { wait: noWait, onPresetOutcome: (o: WhiteBalanceOutcome) => noted.push(o) };
    expect(await requestWhiteBalance(track, 6000, CAPS, opts)).toBe('auto');
    expect(await requestWhiteBalance(track, null, CAPS, opts)).toBe('applied');
    expect(noted).toEqual(['refused']);
  });

  it('an overtaken request says so and does nothing more', async () => {
    const { track, log } = fakeTrack('normal');
    let stale = false;
    const wait = () => {
      stale = true;
      return Promise.resolve();
    };
    expect(await requestWhiteBalance(track, 6000, CAPS, { wait, isStale: () => stale })).toBe('superseded');
    expect(log).toHaveLength(1);
  });
});

describe('createLatestQueue', () => {
  it('fast taps: runs one at a time, skips the ones overtaken, the last one wins', async () => {
    const { track, live } = fakeTrack('late');
    const queue = createLatestQueue();
    let running = 0;
    let overlap = false;
    const tap = (kelvin: number | null) =>
      queue(async (isStale) => {
        running++;
        if (running > 1) overlap = true;
        const tick = () => new Promise<void>((r) => setTimeout(r, 1));
        const out = await runWhiteBalance(track, kelvin, CAPS, { wait: tick, isStale });
        running--;
        return out;
      }, 'superseded' as const);
    const results = await Promise.all([tap(2850), tap(5000), tap(6000), tap(7000)]);
    expect(overlap).toBe(false);
    expect(results.at(-1)).toBe('applied');
    expect(results.slice(0, -1).every((r) => r === 'superseded')).toBe(true);
    expect(live).toEqual({ whiteBalanceMode: 'manual', colorTemperature: 7000 });
  });

  it('a failing job does not block the next one', async () => {
    const queue = createLatestQueue();
    const a = queue(() => Promise.reject(new Error('x')), 0);
    const b = queue(() => Promise.resolve(2), 0);
    await expect(a).resolves.toBe(0); // overtaken before it started
    await expect(b).resolves.toBe(2);
    const c = queue(() => Promise.reject(new Error('y')), 0);
    await expect(c).rejects.toThrow('y');
    await expect(queue(() => Promise.resolve(3), 0)).resolves.toBe(3);
  });
});

describe('parseIgnoredCameras', () => {
  it('reads a stored list, tolerating junk', () => {
    expect(parseIgnoredCameras(null)).toEqual([]);
    expect(parseIgnoredCameras('nope')).toEqual([]);
    expect(parseIgnoredCameras('{"a":1}')).toEqual([]);
    expect(parseIgnoredCameras('["camera2 0, facing back", 3, ""]')).toEqual(['camera2 0, facing back', '']);
  });
});

describe('white balance memory (P24 review)', () => {
  const ua = 'Chrome/130';
  const day = 24 * 60 * 60_000;

  it('hides the option only after two ignored presets in a row', () => {
    let list = noteWbOutcome([], 'back', 'ignored', 0, ua);
    expect(wbHidden(list, 'back')).toBe(false);
    list = noteWbOutcome(list, 'back', 'ignored', 1, ua);
    expect(wbHidden(list, 'back')).toBe(true);
    expect(wbHidden(list, 'front')).toBe(false);
  });

  it('a refusal never counts, and a preset that works clears the count', () => {
    let list = noteWbOutcome([], 'back', 'refused', 0, ua);
    expect(list).toEqual([]);
    list = noteWbOutcome(list, 'back', 'ignored', 0, ua);
    list = noteWbOutcome(list, 'back', 'applied', 1, ua);
    list = noteWbOutcome(list, 'back', 'ignored', 2, ua);
    expect(wbHidden(list, 'back')).toBe(false);
  });

  it('forgets after 30 days or with another browser version', () => {
    const list = noteWbOutcome(noteWbOutcome([], 'back', 'ignored', 0, ua), 'back', 'ignored', 0, ua);
    const raw = JSON.stringify(list);
    expect(wbHidden(parseWbMemory(raw, 29 * day, ua), 'back')).toBe(true);
    expect(parseWbMemory(raw, 31 * day, ua)).toEqual([]);
    expect(parseWbMemory(raw, day, 'Chrome/131')).toEqual([]);
  });

  it('reads the old list of labels as one failure each, and tolerates junk', () => {
    const old = parseWbMemory('["back", 3]', 5, ua);
    expect(old).toEqual([{ label: 'back', fails: 1, at: 5, ua }]);
    expect(wbHidden(old, 'back')).toBe(false);
    expect(parseWbMemory('nope', 0, ua)).toEqual([]);
    expect(parseWbMemory('{"a":1}', 0, ua)).toEqual([]);
    expect(parseWbMemory(null, 0, ua)).toEqual([]);
  });
});

describe('visiblePresets (ronda 2 · review)', () => {
  const labels = (r: Parameters<typeof visiblePresets>[0]) => visiblePresets(r).map((p) => p.label);

  it('every chip on a camera that covers the whole range', () => {
    expect(labels(CAPS.range)).toEqual(['Auto', 'Fría', 'Día', 'Cálida', 'Muy cálida']);
    expect(labels(null)).toEqual(['Auto', 'Fría', 'Día', 'Cálida', 'Muy cálida']);
  });

  it('two chips that would land on the same temperature show once', () => {
    // No «shade»: «Muy cálida» would be another «Cálida».
    expect(labels({ min: 2850, max: 6000, step: 50 })).toEqual(['Auto', 'Fría', 'Día', 'Cálida']);
  });

  it('of two that land together, the one whose name still fits stays', () => {
    // «Fría» lands on 5000 there and cools nothing: «Día» stays, and «Cálida» rather than «Muy cálida».
    expect(labels({ min: 5000, max: 6000, step: 50 })).toEqual(['Auto', 'Día', 'Cálida']);
    // A high minimum: «Fría» lands on «Día»'s 5000.
    expect(labels({ min: 5000, max: 7000, step: 50 })).toEqual(['Auto', 'Día', 'Cálida', 'Muy cálida']);
  });
});
