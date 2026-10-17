import { describe, expect, it } from 'vitest';
import {
  buildRound,
  clampCount,
  clampPause,
  clipEndAt,
  clipsForSource,
  IDLE_ROUND,
  leadIn,
  leadStatus,
  liveClipIds,
  nextPlayable,
  optionsFromTrack,
  positionPatches,
  reorder,
  roundLeadStatus,
  roundReducer,
  sanitizeOptions,
  spreadBy,
  titleShown,
  type RoundState,
} from './roundRules';

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clip = (id: string, video_id: string) => ({ id, video_id });
const clashes = (list: { video_id: string }[]) =>
  list.filter((c, i) => i > 0 && c.video_id === list[i - 1]!.video_id).length;

describe('options', () => {
  it('keeps the pause within 0–5 s in half seconds', () => {
    expect(clampPause(-1)).toBe(0);
    expect(clampPause(9)).toBe(5);
    expect(clampPause(1.3)).toBe(1.5);
    expect(clampPause(Number.NaN)).toBe(2);
  });

  it('keeps the count between 1 and what is available', () => {
    expect(clampCount(0, 5)).toBe(1);
    expect(clampCount(9, 5)).toBe(5);
    expect(clampCount(200)).toBe(50);
  });

  it('sanitises anything into valid options', () => {
    expect(sanitizeOptions({ pauseSeconds: 7, titleMode: 'x' as never, count: -3 })).toEqual({
      count: 1,
      pauseSeconds: 5,
      countdown: true,
      useClipSettings: true,
      titleMode: 'before',
    });
    expect(
      optionsFromTrack(
        { pause_seconds: 3, countdown: false, use_clip_settings: false, title_mode: 'after' },
        4,
      ),
    ).toEqual({
      count: 4,
      pauseSeconds: 3,
      countdown: false,
      useClipSettings: false,
      titleMode: 'after',
    });
  });
});

describe('building a round', () => {
  const all = [clip('a1', 'A'), clip('a2', 'A'), clip('b1', 'B'), clip('c1', 'C'), clip('c2', 'C')];

  it('takes the clips of each source', () => {
    expect(clipsForSource({ kind: 'bag', bagId: 'x' }, all, ['b1', 'zz', 'b1']).map((c) => c.id)).toEqual([
      'b1',
    ]);
    expect(clipsForSource({ kind: 'manual', clipIds: ['c2', 'a1'] }, all).map((c) => c.id)).toEqual([
      'c2',
      'a1',
    ]);
    expect(clipsForSource({ kind: 'songs', videoIds: ['A', 'C'] }, all).map((c) => c.id)).toEqual([
      'a1',
      'a2',
      'c1',
      'c2',
    ]);
  });

  it('shuffles, keeps each clip once and stops at the count', () => {
    const round = buildRound([...all, all[0]!], 4, seeded(5));
    expect(round).toHaveLength(4);
    expect(new Set(round.map((c) => c.id)).size).toBe(4);
    expect(buildRound(all, 99, seeded(5))).toHaveLength(5);
  });

  it('avoids the same song twice in a row when it can', () => {
    for (let seed = 1; seed < 60; seed++) {
      expect(clashes(buildRound(all, 5, seeded(seed)))).toBe(0);
    }
  });

  it('spreads even when the clashes pile up at the end', () => {
    const list = [clip('a', 'A'), clip('b', 'B'), clip('c1', 'C'), clip('c2', 'C'), clip('c3', 'C')];
    const out = spreadBy(list, (c) => c.video_id);
    expect(clashes(out)).toBe(0);
    expect(out.map((c) => c.id).sort()).toEqual(['a', 'b', 'c1', 'c2', 'c3']);
  });

  it('keeps everything when spreading is impossible', () => {
    const list = [clip('a1', 'A'), clip('a2', 'A'), clip('a3', 'A'), clip('b', 'B')];
    const out = spreadBy(list, (c) => c.video_id);
    expect(out).toHaveLength(4);
    expect(clashes(out)).toBe(1);
  });
});

describe('reordering a track', () => {
  const items = [
    { id: 'x', position: 0 },
    { id: 'y', position: 1 },
    { id: 'z', position: 2 },
  ];

  it('moves one item', () => {
    expect(reorder(items, 2, 0).map((i) => i.id)).toEqual(['z', 'x', 'y']);
    expect(reorder(items, 0, 1).map((i) => i.id)).toEqual(['y', 'x', 'z']);
    expect(reorder(items, 0, 5).map((i) => i.id)).toEqual(['x', 'y', 'z']);
  });

  it('writes only the positions that changed', () => {
    expect(positionPatches(reorder(items, 2, 1))).toEqual([
      { id: 'z', position: 1 },
      { id: 'y', position: 2 },
    ]);
    expect(positionPatches(items)).toEqual([]);
    // Gaps left by removed items are closed too.
    expect(
      positionPatches([
        { id: 'a', position: 0 },
        { id: 'c', position: 2 },
      ]),
    ).toEqual([{ id: 'c', position: 1 }]);
  });
});

describe('skipping unavailable clips', () => {
  it('finds the next playable one', () => {
    const available = [false, true, false, false, true];
    expect(nextPlayable(available, 0)).toBe(1);
    expect(nextPlayable(available, 2)).toBe(4);
    expect(nextPlayable(available, 5)).toBe(-1);
    expect(nextPlayable([false, false], 0)).toBe(-1);
  });

  it('saves a track only with the clips that still exist, in order', () => {
    expect(liveClipIds(['a', 'x', 'b', 'a', 'y'], ['a', 'b'])).toEqual({ kept: ['a', 'b', 'a'], dropped: 2 });
    expect(liveClipIds(['a', 'b'], new Set(['a', 'b']))).toEqual({ kept: ['a', 'b'], dropped: 0 });
    expect(liveClipIds(['x'], [])).toEqual({ kept: [], dropped: 1 });
    expect(liveClipIds([], ['a'])).toEqual({ kept: [], dropped: 0 });
  });
});

describe('timing', () => {
  it('pauses (not before the first) and counts down', () => {
    expect(leadIn({ pauseSeconds: 2, countdown: true }, true)).toEqual({ pauseMs: 2000, countdownMs: 3000 });
    expect(leadIn({ pauseSeconds: 2, countdown: true }, false)).toEqual({ pauseMs: 0, countdownMs: 3000 });
    expect(leadIn({ pauseSeconds: 0, countdown: false }, true)).toEqual({ pauseMs: 0, countdownMs: 0 });
  });

  it('reads the phase at any moment', () => {
    const lead = { pauseMs: 2000, countdownMs: 3000 };
    expect(leadStatus(0, lead)).toEqual({ phase: 'pause', count: null, remainingMs: 2000 });
    expect(leadStatus(2000, lead)).toMatchObject({ phase: 'countdown', count: 3 });
    expect(leadStatus(3999, lead)).toMatchObject({ phase: 'countdown', count: 2 });
    expect(leadStatus(4500, lead)).toMatchObject({ phase: 'countdown', count: 1 });
    expect(leadStatus(5000, lead)).toEqual({ phase: 'go', count: null, remainingMs: 0 });
    expect(leadStatus(0, { pauseMs: 0, countdownMs: 0 }).phase).toBe('go');
  });

  it('ends a clip just before its end and before the song’s end', () => {
    expect(clipEndAt(30, 200)).toBeCloseTo(29.94);
    expect(clipEndAt(200, 200)).toBeCloseTo(199.59);
    expect(clipEndAt(30, 0)).toBeCloseTo(29.94);
  });

  it('modo adivinar shows the title once it has sounded a while', () => {
    expect(titleShown('before', false, 0, 20)).toBe(true);
    expect(titleShown('after', false, 0, 20)).toBe(false);
    expect(titleShown('after', true, 1, 20)).toBe(false);
    expect(titleShown('after', true, 4, 20)).toBe(true);
    expect(titleShown('after', true, 2, 4)).toBe(true);
  });
});

describe('roundReducer', () => {
  const ctx = { available: [true, false, true, true], options: { pauseSeconds: 2, countdown: true } };
  const run = (state: RoundState, ...actions: Parameters<typeof roundReducer>[1][]) =>
    actions.reduce((s, a) => roundReducer(s, a, ctx), state);

  it('starts on the first playable clip, without a pause', () => {
    const s = run(IDLE_ROUND, { type: 'start', now: 1000 });
    expect(s).toMatchObject({ phase: 'lead', index: 0, lead: { pauseMs: 0, countdownMs: 3000 } });
  });

  it('skips unavailable clips and finishes after the last one', () => {
    let s = run(IDLE_ROUND, { type: 'start', now: 0 }, { type: 'go' });
    expect(s.phase).toBe('play');
    s = run(s, { type: 'advance', now: 10_000 });
    expect(s).toMatchObject({ phase: 'lead', index: 2, lead: { pauseMs: 2000 } });
    s = run(s, { type: 'go' }, { type: 'advance', now: 20_000 }, { type: 'go' });
    expect(s.index).toBe(3);
    s = run(s, { type: 'advance', now: 30_000 });
    expect(s).toMatchObject({ phase: 'done', index: -1, played: 3 });
  });

  it('starts done when nothing is playable', () => {
    const s = roundReducer(IDLE_ROUND, { type: 'start', now: 0 }, { ...ctx, available: [false] });
    expect(s.phase).toBe('done');
  });

  it('repeats the same clip with the countdown, no pause', () => {
    const s = run(
      IDLE_ROUND,
      { type: 'start', now: 0 },
      { type: 'go' },
      { type: 'advance', now: 5000 },
      { type: 'go' },
      { type: 'repeat', now: 9000 },
    );
    expect(s).toMatchObject({
      phase: 'lead',
      index: 2,
      leadStart: 9000,
      lead: { pauseMs: 0, countdownMs: 3000 },
    });
  });

  it('freezes the lead-in while paused', () => {
    let s = run(IDLE_ROUND, { type: 'start', now: 0 }, { type: 'pause', now: 1000 });
    expect(roundLeadStatus(s, 60_000)).toMatchObject({ phase: 'countdown', count: 2 });
    s = run(s, { type: 'resume', now: 61_000 });
    expect(roundLeadStatus(s, 61_000)).toMatchObject({ phase: 'countdown', count: 2 });
    expect(roundLeadStatus(s, 63_000)?.phase).toBe('go');
  });

  it('finishes at once', () => {
    expect(run(IDLE_ROUND, { type: 'start', now: 0 }, { type: 'finish' }).phase).toBe('done');
  });
});
