import { describe, expect, it } from 'vitest';
import {
  createLatestQueue,
  noteWbOutcome,
  parseIgnoredCameras,
  parseWbMemory,
  wbHidden,
  pickTemperature,
  runWhiteBalance,
  whiteBalancePlan,
  whiteBalanceTook,
  type WhiteBalanceCaps,
  type WhiteBalanceTrack,
} from './whiteBalanceRules';

const CAPS: WhiteBalanceCaps = { modes: ['continuous', 'manual'], range: { min: 2850, max: 7000, step: 50 } };
const noWait = () => Promise.resolve();

type Settings = { whiteBalanceMode?: string; colorTemperature?: number };

/**
 * A simulated camera track. `kind`:
 *  - `normal`: each request takes effect at once;
 *  - `late`: each request takes effect only when the next one arrives (the Samsung seen in the test);
 *  - `modeFirst`: a temperature is dropped unless the camera was already in manual mode;
 *  - `deaf`: accepts everything, changes nothing;
 *  - `strict`: rejects a temperature off its 50 K grid.
 */
function fakeTrack(kind: 'normal' | 'late' | 'modeFirst' | 'deaf' | 'strict') {
  const live: Settings = { whiteBalanceMode: 'continuous', colorTemperature: 5000 };
  let pending: Settings | null = null;
  const log: Record<string, unknown>[] = [];
  const take = (set: Settings) => {
    if (kind === 'deaf') return;
    if (kind === 'modeFirst' && set.colorTemperature != null && live.whiteBalanceMode !== 'manual') {
      if (set.whiteBalanceMode) live.whiteBalanceMode = set.whiteBalanceMode;
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
      // Chrome reports what was asked, even on the phone that shows it late.
      return kind === 'late' && pending ? { ...live, ...pending } : { ...live };
    },
  };
  return { track, live, log };
}

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
  it('a preset: manual mode first, then the temperature, then the same again', () => {
    const plan = whiteBalancePlan(3000, CAPS)!;
    expect(plan.steps).toEqual([
      { whiteBalanceMode: 'manual' },
      { whiteBalanceMode: 'manual', colorTemperature: 3000 },
      { whiteBalanceMode: 'manual', colorTemperature: 3000 },
    ]);
    expect(plan.expect).toEqual({ mode: 'manual', kelvin: 3000, tolerance: 50 });
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

  it('whiteBalanceTook', () => {
    const e = whiteBalancePlan(4000, CAPS)!.expect;
    expect(whiteBalanceTook({ whiteBalanceMode: 'manual', colorTemperature: 4020 }, e)).toBe(true);
    expect(whiteBalanceTook({ whiteBalanceMode: 'manual', colorTemperature: 5000 }, e)).toBe(false);
    expect(whiteBalanceTook({ whiteBalanceMode: 'continuous', colorTemperature: 4000 }, e)).toBe(false);
    expect(whiteBalanceTook({}, e)).toBe(false);
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
    expect(await runWhiteBalance(track, 6500, CAPS, { wait: noWait })).toBe('applied');
    expect(live).toEqual({ whiteBalanceMode: 'manual', colorTemperature: 6500 });
  });

  it('a camera that ignores it is found out', async () => {
    const { track } = fakeTrack('deaf');
    expect(await runWhiteBalance(track, 3000, CAPS, { wait: noWait })).toBe('ignored');
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
    const results = await Promise.all([tap(3000), tap(4000), tap(5500), tap(6500)]);
    expect(overlap).toBe(false);
    expect(results.at(-1)).toBe('applied');
    expect(results.slice(0, -1).every((r) => r === 'superseded')).toBe(true);
    expect(live).toEqual({ whiteBalanceMode: 'manual', colorTemperature: 6500 });
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
