import { describe, expect, it } from 'vitest';
import {
  aspectOf,
  bestLayout,
  blendLatency,
  containArea,
  FRESH_SYNC,
  needsAlignOnPlay,
  panelBoxes,
  seekAhead,
  splitBounds,
  SYNC,
  syncCooldown,
  syncStep,
  takeSongZero,
  YOUTUBE_ASPECT,
  YOUTUBE_MIN_BOX,
  nextQuickOpacity,
  nextQuickRate,
  overlayStartOpacity,
  stageGesture,
  bottomSheetHeight,
  coverPanelWidth,
  TAKE_MIN_HEIGHT,
  type SyncInput,
  type SyncMemory,
} from './reviewRules';

const input = (patch: Partial<SyncInput>): SyncInput => ({
  kind: 'file',
  drift: 0,
  target: 10,
  baseRate: 1,
  now: 10_000,
  ready: true,
  seekLatencyMs: 0,
  ...patch,
});

/** Runs the follow frame by frame (60 fps) with a drift given per frame; returns every action taken. */
function simulate(kind: 'file' | 'youtube', driftAt: (ms: number) => number, ms: number) {
  let memory: SyncMemory = FRESH_SYNC;
  const actions: { at: number; kind: string }[] = [];
  for (let t = 0; t <= ms; t += 16) {
    const step = syncStep(input({ kind, drift: driftAt(t), now: 10_000 + t }), memory);
    memory = step.memory;
    if (step.action.kind !== 'none') actions.push({ at: t, kind: step.action.kind });
  }
  return actions;
}

describe('the original follows the take (51)', () => {
  it('does nothing while the original is loading or landing a jump', () => {
    expect(syncStep(input({ drift: 3, ready: false }), FRESH_SYNC).action).toEqual({ kind: 'none' });
    const justJumped = { ...FRESH_SYNC, lastFixAt: 10_000 - 100 };
    expect(syncStep(input({ drift: 3 }), justJumped).action).toEqual({ kind: 'none' });
    expect(syncStep(input({ drift: Number.NaN }), FRESH_SYNC).action).toEqual({ kind: 'none' });
  });

  it('nudges a file a little for small gaps, never more than ±6 %', () => {
    const ahead = syncStep(input({ drift: 0.1 }), FRESH_SYNC);
    expect(ahead.action).toEqual({ kind: 'rate', rate: 0.95 });
    const behind = syncStep(input({ drift: -0.4, baseRate: 0.75 }), FRESH_SYNC);
    expect(behind.action.kind).toBe('rate');
    if (behind.action.kind === 'rate') expect(behind.action.rate).toBeCloseTo(0.75 * 1.06, 3);
    // Back in step: the normal speed comes back once.
    const back = syncStep(input({ drift: 0.01 }), ahead.memory);
    expect(back.action).toEqual({ kind: 'base' });
    expect(syncStep(input({ drift: 0.01 }), back.memory).action).toEqual({ kind: 'none' });
  });

  it('while the original (a file) is heard, the muted take is nudged instead: the heard tempo never wobbles', () => {
    const ahead = syncStep(input({ drift: 0.1, heard: 'original', takeRate: 1 }), FRESH_SYNC);
    expect(ahead.action.kind).toBe('takeRate');
    // The original ahead: the take catches up a little faster.
    if (ahead.action.kind === 'takeRate') expect(ahead.action.rate).toBeGreaterThan(1);
    const behind = syncStep(input({ drift: -0.1, heard: 'original', takeRate: 0.75 }), FRESH_SYNC);
    if (behind.action.kind === 'takeRate') expect(behind.action.rate).toBeLessThan(0.75);
    else throw new Error('expected a take nudge');
    expect(syncStep(input({ drift: 0.01, heard: 'original' }), ahead.memory).action).toEqual({ kind: 'base' });
  });

  it('while the original is heard, big gaps move the take, never the heard sound', () => {
    // File: the original 1 s ahead (its seconds) at song speed 0,5 → the take forward 2 s.
    const file = syncStep(input({ drift: 1, heard: 'original', takeTime: 4, songSpeed: 0.5 }), FRESH_SYNC);
    expect(file.action).toEqual({ kind: 'takeSeek', to: 6 });
    // YouTube behind: the take goes back; never a hold or a jump of YouTube.
    const yt = syncStep(input({ kind: 'youtube', drift: -0.3, heard: 'original', takeTime: 4, songSpeed: 1 }), FRESH_SYNC);
    expect(yt.action).toEqual({ kind: 'takeSeek', to: 3.7 });
    const ahead = syncStep(input({ kind: 'youtube', drift: 0.12, heard: 'original', takeTime: 4 }), FRESH_SYNC);
    expect(ahead.action).toEqual({ kind: 'none' });
  });

  it('jumps a file only for big gaps, slightly ahead by its measured delay', () => {
    const step = syncStep(input({ drift: -2, target: 30, seekLatencyMs: 200, baseRate: 1 }), FRESH_SYNC);
    expect(step.action).toEqual({ kind: 'seek', to: 30.2 });
    expect(step.memory.streak).toBe(1);
  });

  it('never jumps in a loop: a gap that stays big jumps less and less often', () => {
    // An original that never catches up (a network that can't keep pace).
    const jumps = simulate('file', () => -1, 30_000).filter((a) => a.kind === 'seek');
    expect(jumps.length).toBeGreaterThan(1);
    expect(jumps.length).toBeLessThanOrEqual(6);
    const gaps = jumps.slice(1).map((j, i) => j.at - jumps[i]!.at);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeGreaterThanOrEqual(gaps[i - 1]! - 16);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(SYNC.maxCooldownMs + 16);
  });

  it('starts the backoff again after a calm stretch', () => {
    let memory: SyncMemory = { ...FRESH_SYNC, streak: 4, lastFixAt: 0 };
    for (let t = 1000; t <= 1000 + SYNC.calmMs + 32; t += 16) memory = syncStep(input({ drift: 0, now: t }), memory).memory;
    expect(memory.streak).toBe(0);
  });

  it('YouTube ahead holds still for the gap; behind, it jumps ahead', () => {
    const ahead = syncStep(input({ kind: 'youtube', drift: 0.3, baseRate: 1 }), FRESH_SYNC);
    expect(ahead.action).toEqual({ kind: 'hold', ms: 300 });
    // The next judgement waits for the hold to end and settle.
    expect(syncStep(input({ kind: 'youtube', drift: 0.3, now: 10_000 + 500 }), ahead.memory).action).toEqual({ kind: 'none' });
    const slow = syncStep(input({ kind: 'youtube', drift: 0.3, baseRate: 0.5 }), FRESH_SYNC);
    expect(slow.action).toEqual({ kind: 'hold', ms: 600 });
    // Shorter by half its restart delay; too short to be worth it, nothing.
    const measured = syncStep(input({ kind: 'youtube', drift: 0.3, seekLatencyMs: 200 }), FRESH_SYNC);
    expect(measured.action).toEqual({ kind: 'hold', ms: 200 });
    expect(syncStep(input({ kind: 'youtube', drift: 0.12, seekLatencyMs: 200 }), FRESH_SYNC).action).toEqual({ kind: 'none' });
    const far = syncStep(input({ kind: 'youtube', drift: 4, target: 20 }), FRESH_SYNC);
    expect(far.action).toEqual({ kind: 'seek', to: 20 });
    const behind = syncStep(input({ kind: 'youtube', drift: -0.5, target: 20, seekLatencyMs: 400 }), FRESH_SYNC);
    expect(behind.action).toEqual({ kind: 'seek', to: 20.4 });
    // Small gaps are left alone (YouTube can't take fine speeds).
    expect(syncStep(input({ kind: 'youtube', drift: -0.15 }), FRESH_SYNC).action).toEqual({ kind: 'none' });
    expect(syncStep(input({ kind: 'youtube', drift: 0.08 }), FRESH_SYNC).action).toEqual({ kind: 'none' });
  });

  it('YouTube that never catches up is corrected at most a handful of times in half a minute', () => {
    const fixes = simulate('youtube', () => -1, 30_000);
    expect(fixes.length).toBeLessThanOrEqual(6);
  });

  it('cooldown doubles up to the ceiling', () => {
    expect(syncCooldown('youtube', 0)).toBe(SYNC.youtube.cooldownMs);
    expect(syncCooldown('youtube', 1)).toBe(SYNC.youtube.cooldownMs * 2);
    expect(syncCooldown('file', 10)).toBe(SYNC.maxCooldownMs);
  });

  it('jumps ahead by the delay at the original speed, within bounds', () => {
    expect(seekAhead(10, 300, 1)).toBe(10.3);
    expect(seekAhead(10, 300, 0.5)).toBe(10.15);
    expect(seekAhead(10, 99_999, 1)).toBe(11.5);
    expect(seekAhead(0, Number.NaN, 1)).toBe(0);
  });

  it('blends measured delays', () => {
    expect(blendLatency(null, 400)).toBe(400);
    expect(blendLatency(400, 200)).toBe(320);
    expect(blendLatency(300, -5)).toBe(300);
    expect(blendLatency(null, 99_999)).toBe(3000);
  });

  it('a play from a pause jumps the original only when it is off', () => {
    expect(needsAlignOnPlay('file', 0.02)).toBe(false);
    expect(needsAlignOnPlay('file', 0.2)).toBe(true);
    expect(needsAlignOnPlay('youtube', 0.2)).toBe(false);
    expect(needsAlignOnPlay('youtube', -0.4)).toBe(true);
    expect(needsAlignOnPlay('youtube', Number.NaN)).toBe(true);
  });
});

describe('where the take starts in the song (43)', () => {
  it('uses the roll moment minus the sound delay at the take speed when the phone knows it', () => {
    expect(takeSongZero({ songStart: 10, speed: 1 }, { songAtRoll: 10.4, delayMs: 120 })).toBe(10.28);
    expect(takeSongZero({ songStart: 10, speed: 0.5 }, { songAtRoll: 10.4, delayMs: 120 })).toBe(10.34);
  });

  it('falls back to the saved start', () => {
    expect(takeSongZero({ songStart: 10, speed: 1 }, null)).toBe(10);
    expect(takeSongZero({ songStart: 10, speed: 1 }, { songAtRoll: null, delayMs: 120 })).toBe(10);
    expect(takeSongZero({ songStart: 10, speed: 1 }, { songAtRoll: 3, delayMs: Number.NaN })).toBe(10);
  });

  it('an odd reading (over 2 s away from the plan) is not trusted', () => {
    expect(takeSongZero({ songStart: 10, speed: 1 }, { songAtRoll: 14, delayMs: 100 })).toBe(10);
    expect(takeSongZero({ songStart: 10, speed: 1 }, { songAtRoll: 11.9, delayMs: 0 })).toBe(11.9);
  });

  it('never before the song', () => {
    expect(takeSongZero({ songStart: 0, speed: 1 }, { songAtRoll: 0.05, delayMs: 200 })).toBe(0);
  });
});

describe('room for the settings and notes (51)', () => {
  it('on its side: a comfortable panel over the take, YouTube keeps its minimum beside it', () => {
    // 844×390 (750 between the notch and the home side) and 667×375.
    expect(coverPanelWidth(750, true)).toBe(360);
    expect(750 - coverPanelWidth(750, true) - 10).toBeGreaterThanOrEqual(YOUTUBE_MIN_BOX.width);
    const narrow = coverPanelWidth(667, true);
    expect(narrow).toBe(667 - YOUTUBE_MIN_BOX.width - 10); // 299: covers the take whole
    expect(667 - narrow - 10).toBe(YOUTUBE_MIN_BOX.width);
  });

  it('with a file, half the stage within 300–360; nothing on no room', () => {
    expect(coverPanelWidth(750, false)).toBe(360);
    expect(coverPanelWidth(640, false)).toBe(320);
    expect(coverPanelWidth(280, false)).toBe(280);
    expect(coverPanelWidth(300, true)).toBe(0);
    expect(coverPanelWidth(0, true)).toBe(0);
  });

  it('in portrait the settings leave YouTube and a take of 120 px above them', () => {
    for (const available of [570, 660, 760]) {
      const h = bottomSheetHeight(available, true);
      expect(available - h).toBeGreaterThanOrEqual(YOUTUBE_MIN_BOX.height + 10 + TAKE_MIN_HEIGHT + 16);
      expect(h).toBeGreaterThanOrEqual(140);
    }
    // Very short: still some room for the settings, never more than 60 %.
    expect(bottomSheetHeight(300, true)).toBe(140);
    expect(bottomSheetHeight(200, true)).toBe(120);
    expect(bottomSheetHeight(0, true)).toBe(0);
  });
});

describe('two panels (51)', () => {
  it('reads aspects', () => {
    expect(aspectOf({ width: 1080, height: 1920 }, 1)).toBeCloseTo(0.5625);
    expect(aspectOf(null, YOUTUBE_ASPECT)).toBe(YOUTUBE_ASPECT);
    expect(aspectOf({ width: 0, height: 10 }, 2)).toBe(2);
  });

  it('measures what a picture shows in a box', () => {
    expect(containArea({ width: 160, height: 90 }, 16 / 9)).toBeCloseTo(14400);
    expect(containArea({ width: 160, height: 900 }, 16 / 9)).toBeCloseTo(14400);
    expect(containArea({ width: 0, height: 90 }, 1)).toBe(0);
  });

  it('phone in portrait: a portrait take and a YouTube video go one above the other, the video as tall as it needs', () => {
    const frame = { width: 374, height: 540 };
    const layout = bestLayout(frame, YOUTUBE_ASPECT, 9 / 16, 10);
    expect(layout.direction).toBe('column');
    // The video (first) needs about 374 / 1,78 ≈ 210 px of 530: a bit under 40 %.
    expect(layout.split).toBeGreaterThan(0.35);
    expect(layout.split).toBeLessThan(0.45);
  });

  it('phone in landscape: side by side', () => {
    const layout = bestLayout({ width: 800, height: 300 }, YOUTUBE_ASPECT, 9 / 16, 10);
    expect(layout.direction).toBe('row');
  });

  it('two portrait pictures in a portrait frame go side by side', () => {
    expect(bestLayout({ width: 374, height: 540 }, 9 / 16, 9 / 16).direction).toBe('row');
  });

  it('phone on its side (844×390 and 667×375): the take beside YouTube, YouTube never under 200×200', () => {
    for (const frame of [
      { width: 750, height: 334 },
      { width: 667, height: 319 },
      { width: 667, height: 230 }, // Safari's bars showing
    ]) {
      const mins = [YOUTUBE_MIN_BOX, null] as const;
      const layout = bestLayout(frame, YOUTUBE_ASPECT, 9 / 16, 10, mins);
      expect(layout.direction).toBe('row');
      const [yt, take] = panelBoxes(frame, layout.direction, layout.split, 10);
      expect(yt.width).toBeGreaterThanOrEqual(YOUTUBE_MIN_BOX.width);
      expect(yt.height).toBeGreaterThanOrEqual(YOUTUBE_MIN_BOX.height);
      // The portrait take gets about what it needs to show at full height, not a 30 % slab of black bands.
      expect(containArea(take, 9 / 16)).toBeGreaterThan(0.8 * containArea({ width: 9999, height: frame.height }, 9 / 16));
    }
  });

  it('portrait with Safari bars: YouTube keeps its 200 px of height', () => {
    const frame = { width: 374, height: 418 };
    const layout = bestLayout(frame, YOUTUBE_ASPECT, 9 / 16, 10, [YOUTUBE_MIN_BOX, null]);
    const [yt] = panelBoxes(frame, layout.direction, layout.split, 10);
    expect(layout.direction).toBe('column');
    expect(yt.height).toBeGreaterThanOrEqual(200);
    // Without the rule it would give YouTube less (to show the take bigger).
    const [free] = panelBoxes(frame, 'column', bestLayout(frame, YOUTUBE_ASPECT, 9 / 16, 10).split, 10);
    expect(free.height).toBeLessThan(200);
  });

  it('the hinge stops where YouTube would get too small', () => {
    const frame = { width: 374, height: 418 };
    const b = splitBounds(frame, 'column', 10, [YOUTUBE_MIN_BOX, null]);
    expect(panelBoxes(frame, 'column', b.min, 10)[0].height).toBeGreaterThanOrEqual(200);
    expect(b.max).toBeGreaterThan(b.min);
    // YouTube second: the bound is at the other end.
    const c = splitBounds(frame, 'column', 10, [null, YOUTUBE_MIN_BOX]);
    expect(panelBoxes(frame, 'column', c.max, 10)[1].height).toBeGreaterThanOrEqual(200);
    // A screen too small for it: one share, the closest.
    const tiny = splitBounds({ width: 300, height: 150 }, 'row', 10, [YOUTUBE_MIN_BOX, null]);
    expect(tiny.min).toBe(tiny.max);
  });

  it('a screen too small for YouTube gives it as much as it can', () => {
    const layout = bestLayout({ width: 300, height: 150 }, YOUTUBE_ASPECT, 9 / 16, 10, [YOUTUBE_MIN_BOX, null]);
    expect(layout.split).toBeGreaterThanOrEqual(0.8);
  });

  it('an empty frame falls back to halves', () => {
    expect(bestLayout({ width: 0, height: 0 }, 1, 1)).toEqual({ direction: 'row', split: 0.5 });
    expect(bestLayout({ width: 0, height: 10 }, 1, 1)).toEqual({ direction: 'column', split: 0.5 });
  });
});

describe('quick controls and the stage gestures', () => {
  it('the speed button goes 1× → 0,75× → 0,5× → 1×, and back to 1× from any other', () => {
    expect(nextQuickRate(1)).toBe(0.75);
    expect(nextQuickRate(0.75)).toBe(0.5);
    expect(nextQuickRate(0.5)).toBe(1);
    expect(nextQuickRate(1.25)).toBe(1);
  });

  it('the see-through button goes 50 → 75 → 25 → 50 %', () => {
    expect(nextQuickOpacity(0.5)).toBe(0.75);
    expect(nextQuickOpacity(0.75)).toBe(0.25);
    expect(nextQuickOpacity(0.25)).toBe(0.5);
    expect(nextQuickOpacity(0.9)).toBe(0.5);
  });

  it('«Superpuesto» never starts hiding the take', () => {
    expect(overlayStartOpacity(1)).toBe(0.5);
    expect(overlayStartOpacity(0.1)).toBe(0.5);
    expect(overlayStartOpacity(0.6)).toBe(0.6);
    expect(overlayStartOpacity(0.85)).toBe(0.85); // a choice above 80 % is kept
  });

  it('a resting finger never takes the stage; the original moves only while «Encajar» is on', () => {
    const base = { overlay: true, fitting: false, fingers: 1, zoomed: false, zoomable: true };
    expect(stageGesture(base)).toBe('none');
    expect(stageGesture({ ...base, fitting: true })).toBe('fit');
    expect(stageGesture({ ...base, fingers: 2 })).toBe('zoom');
    expect(stageGesture({ ...base, zoomed: true })).toBe('zoom');
    expect(stageGesture({ ...base, overlay: false, fitting: true })).toBe('none');
    expect(stageGesture({ ...base, zoomable: false, fingers: 2 })).toBe('none');
  });
});
