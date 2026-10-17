import { describe, expect, it } from 'vitest';
import {
  buildRound,
  clampCount,
  clampPause,
  clipAnnouncement,
  clipEndAt,
  clipsForSource,
  DEFAULT_ROUND_SETUP,
  exitNeedsConfirm,
  historySettleStep,
  IDLE_ROUND,
  isLayerEntry,
  leadIn,
  leadStatus,
  leaveFallback,
  leaveRoundBy,
  liveClipIds,
  nextPlayable,
  OPENED_FROM_RPD,
  OPENED_IN_APP,
  optionsFromTrack,
  optionsSummary,
  positionPatches,
  reorder,
  roundKeyAction,
  roundLeadStatus,
  roundReducer,
  sanitizeOptions,
  sanitizeSetup,
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
    // A damaged storage: strings are not booleans (`"no"` would otherwise count as true).
    const damaged = sanitizeOptions({ countdown: 'no' as never, useClipSettings: 0 as never });
    expect(damaged.countdown).toBe(true);
    expect(damaged.useClipSettings).toBe(true);
    expect(sanitizeOptions({ countdown: false, useClipSettings: false })).toMatchObject({
      countdown: false,
      useClipSettings: false,
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

describe('the new-round page', () => {
  it('sums up the folded options in one line', () => {
    expect(
      optionsSummary({ pauseSeconds: 2, titleMode: 'before', countdown: true, useClipSettings: true }),
    ).toBe('Pausa 2 s · título antes · cuenta atrás · espejo y velocidad del clip');
    expect(
      optionsSummary({ pauseSeconds: 0, titleMode: 'after', countdown: false, useClipSettings: false }),
    ).toBe('Sin pausa · modo adivinar · sin cuenta atrás · velocidad normal');
    expect(
      optionsSummary({ pauseSeconds: 1.5, titleMode: 'before', countdown: true, useClipSettings: true }),
    ).toMatch(/^Pausa 1,5 s/);
  });

  it('restores a stored setup, or the defaults from anything broken', () => {
    for (const raw of [null, undefined, 'x', 3, [], ['bag']]) {
      expect(sanitizeSetup(raw)).toEqual(DEFAULT_ROUND_SETUP);
    }
    expect(
      sanitizeSetup({
        kind: 'songs',
        bagId: '',
        clipIds: ['a', 'a', 4, ''],
        videoIds: 'v',
        options: { count: 12, pauseSeconds: 9, countdown: false },
      }),
    ).toEqual({
      kind: 'songs',
      bagId: null,
      clipIds: ['a'],
      videoIds: [],
      options: { count: 12, pauseSeconds: 5, countdown: false, useClipSettings: true, titleMode: 'before' },
    });
    expect(sanitizeSetup({ kind: 'nope', bagId: 'b1' })).toMatchObject({ kind: 'bag', bagId: 'b1' });
  });
});

describe('the round screen', () => {
  it('asks before leaving only mid-round', () => {
    expect(exitNeedsConfirm('lead')).toBe(true);
    expect(exitNeedsConfirm('play')).toBe(true);
    expect(exitNeedsConfirm('idle')).toBe(false);
    expect(exitNeedsConfirm('done')).toBe(false);
  });

  it('keeps Space as the pause unless a button was reached with the keyboard', () => {
    expect(roundKeyAction(' ', { onButton: false, byPointer: false })).toBe('pause');
    // Clicked «Saltar» with the mouse, then Space: pause, not another skip.
    expect(roundKeyAction(' ', { onButton: true, byPointer: true })).toBe('pause');
    // Tabbed to a button: Space is that button's.
    expect(roundKeyAction(' ', { onButton: true, byPointer: false })).toBeNull();
    expect(roundKeyAction('ArrowRight', { onButton: true, byPointer: false })).toBe('skip');
    expect(roundKeyAction('r', { onButton: false, byPointer: false })).toBe('repeat');
    expect(roundKeyAction('R', { onButton: false, byPointer: false })).toBe('repeat');
    expect(roundKeyAction('Enter', { onButton: false, byPointer: false })).toBeNull();
  });

  it('announces the clip change politely, keeping modo adivinar a secret', () => {
    expect(clipAnnouncement({ index: 3, total: 8 }, 'Love Dive', false)).toBe('Clip 3 de 8: Love Dive');
    expect(clipAnnouncement({ index: 3, total: 8 }, 'Love Dive', true)).toBe('Clip 3 de 8: ¿qué canción es?');
    expect(clipAnnouncement({ index: 1, total: 2 }, '  ', false)).toBe('Clip 1 de 2: sin título');
    expect(clipAnnouncement({ index: 0, total: 8 }, 'Love Dive', false)).toBe('');
  });
});

describe('round keys and history', () => {
  it('counts a held key once and turns Esc into «Salir»', () => {
    expect(roundKeyAction(' ', { onButton: false, byPointer: false, repeat: true })).toBeNull();
    expect(roundKeyAction('ArrowRight', { onButton: false, byPointer: false, repeat: true })).toBeNull();
    expect(roundKeyAction('r', { onButton: false, byPointer: false, repeat: true })).toBeNull();
    expect(roundKeyAction(' ', { onButton: false, byPointer: false, repeat: false })).toBe('pause');
    expect(roundKeyAction('Escape', { onButton: false, byPointer: false })).toBe('exit');
    expect(roundKeyAction('Escape', { onButton: true, byPointer: false })).toBe('exit');
    expect(roundKeyAction('Escape', { onButton: false, byPointer: false, repeat: true })).toBeNull();
  });

  it('knows a layer’s own history entry', () => {
    expect(isLayerEntry({ usr: null, key: 'k', idx: 3, backToClose: 7 })).toBe(true);
    expect(isLayerEntry({ usr: null, key: 'k', idx: 3 })).toBe(false);
    expect(isLayerEntry(null)).toBe(false);
    expect(isLayerEntry('x')).toBe(false);
  });

  it('waits for a closing layer’s back() before stepping over stale entries', () => {
    // On the page's own entry: go ahead, whatever is in flight.
    expect(historySettleStep(false, false, false, 0)).toBe('ready');
    expect(historySettleStep(false, false, true, 0)).toBe('ready');
    expect(historySettleStep(false, true, false, 2)).toBe('ready');
    // A layer's entry still on top, a back() of ours on the way and no popstate yet: never step back blind.
    expect(historySettleStep(true, false, true, 0)).toBe('wait');
    // After a popstate, still on a layer's entry: a stale one, step back over it (a few at most).
    expect(historySettleStep(true, true, true, 0)).toBe('back');
    expect(historySettleStep(true, true, false, 0)).toBe('back');
    expect(historySettleStep(true, true, false, 2)).toBe('back');
    expect(historySettleStep(true, true, false, 3)).toBe('ready');
  });

  it('steps over the entry a reload left behind at once, without waiting for a popstate', () => {
    // Reloaded with the «Atrás» guard on: its entry stays on top, nobody's, and no back() of ours is on the way.
    expect(historySettleStep(true, false, false, 0)).toBe('back');
    // That back() is ours now: wait for it to land…
    expect(historySettleStep(true, false, true, 1)).toBe('wait');
    // …then on the round's own entry: ready (the guard, the dialog or leaving go ahead with no 400 ms wait).
    expect(historySettleStep(false, true, false, 1)).toBe('ready');
    // Never more than a few steps, even if stale entries keep coming.
    expect(historySettleStep(true, false, false, 3)).toBe('ready');
  });

  it('leaves to the entry it came from inside the app, or puts /rpd in its place', () => {
    expect(leaveRoundBy(OPENED_FROM_RPD)).toBe('back');
    expect(leaveRoundBy({ ...OPENED_FROM_RPD })).toBe('back');
    // From a bag or a track.
    expect(leaveRoundBy(OPENED_IN_APP)).toBe('back');
    expect(leaveRoundBy({ usr: 1, ...OPENED_IN_APP })).toBe('back');
    // A direct link: never a step out of the app.
    expect(leaveRoundBy(null)).toBe('replace');
    expect(leaveRoundBy(undefined)).toBe('replace');
    expect(leaveRoundBy({ openedFrom: 'bag' })).toBe('replace');
    expect(leaveRoundBy('rpd')).toBe('replace');
    // The history never settled (still on a layer's entry): a step back might not even change the page.
    expect(leaveRoundBy(OPENED_FROM_RPD, true)).toBe('replace');
    expect(leaveRoundBy(OPENED_IN_APP, false)).toBe('back');
  });

  it('never leaves «Salir» dead when leaving doesn’t change the page', () => {
    // Left the round: nothing more to do.
    expect(leaveFallback('back', false)).toBeNull();
    expect(leaveFallback('replace', false)).toBeNull();
    // The step back fell on a stale entry with the round's URL (after a reload): /rpd in place.
    expect(leaveFallback('back', true)).toBe('replace');
    // Even that didn't change the page: undo «leaving» so «Salir», the keys and the guard work again.
    expect(leaveFallback('replace', true)).toBe('reset');
  });
});
