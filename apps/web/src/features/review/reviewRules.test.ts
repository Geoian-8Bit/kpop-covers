import type { Clip, Note } from '@coverscape/shared';
import { describe, expect, it } from 'vitest';
import {
  arrowHead,
  atNoteMoment,
  categoryLabel,
  clampFit,
  clampReviewRate,
  clampSplit,
  clampWipe,
  cleanNoteBody,
  clipsInTake,
  crossedNote,
  DEFAULT_PREFS,
  defaultReviewTake,
  ellipseOf,
  encodeSketch,
  fitOf,
  gestureFit,
  isNoteCategory,
  isShape,
  isValidSketch,
  keyFit,
  NO_FIT,
  noteStatus,
  originalRate,
  parseViewPrefs,
  songNotes,
  takeLength,
  takeNotes,
  takeTiming,
  wheelFit,
  type SketchEncoder,
} from './reviewRules';

const frame = { width: 400, height: 300 };

describe('layout limits', () => {
  it('keeps the stacked split between 30 and 70 %', () => {
    expect(clampSplit(0.1)).toBe(0.3);
    expect(clampSplit(0.9)).toBe(0.7);
    expect(clampSplit(0.55)).toBe(0.55);
    expect(clampSplit(Number.NaN)).toBe(0.5);
  });

  it('keeps the curtain grabbable', () => {
    expect(clampWipe(0)).toBe(0.04);
    expect(clampWipe(1)).toBe(0.96);
    expect(clampWipe(Number.POSITIVE_INFINITY)).toBe(0.5);
  });

  it('limits the common speed to 0.5–1.25×', () => {
    expect(clampReviewRate(0.25)).toBe(0.5);
    expect(clampReviewRate(2)).toBe(1.25);
    expect(clampReviewRate(0.75)).toBe(0.75);
  });

  it('plays the original at the take speed times the common speed', () => {
    expect(originalRate(0.75, 1)).toBe(0.75);
    expect(originalRate(0.75, 0.5)).toBe(0.375);
    expect(originalRate(1, 1.25)).toBe(1.25);
    expect(originalRate(null, 1)).toBe(1);
    expect(originalRate(0.25, 0.5)).toBe(0.25);
  });

  it('trusts the media length, else the saved one', () => {
    expect(takeLength(Number.POSITIVE_INFINITY, 42)).toBe(42);
    expect(takeLength(0, 42)).toBe(42);
    expect(takeLength(40.5, 42)).toBe(40.5);
    expect(takeLength(Number.NaN, null)).toBe(0);
  });

  it('reads an old demo take without the review columns', () => {
    const timing = takeTiming({ song_start_seconds: 12, speed: 0.75, duration_seconds: 30 } as never);
    expect(timing).toEqual({ songStart: 12, speed: 0.75, adjust: 0, duration: 30 });
  });
});

describe('view preferences', () => {
  it('survives garbage', () => {
    expect(parseViewPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parseViewPrefs('{nope')).toEqual(DEFAULT_PREFS);
    expect(parseViewPrefs('[1,2]')).toEqual(DEFAULT_PREFS);
  });

  it('repairs each field on its own', () => {
    expect(
      parseViewPrefs(JSON.stringify({ mode: 'overlay', order: 'take-first', split: 0.95, wipe: -1, opacity: 3, onTop: 'take' })),
    ).toEqual({ mode: 'overlay', order: 'take-first', split: 0.7, wipe: 0.04, opacity: 1, onTop: 'take' });
    expect(parseViewPrefs(JSON.stringify({ mode: 'side', split: '0.4', opacity: Number.NaN })).mode).toBe('stacked');
  });
});

describe('clips inside a take', () => {
  const clip = (id: string, start: number, end: number) => ({ id, start_seconds: start, end_seconds: end }) as Clip;
  const take = { song_start_seconds: 10, speed: 0.5, sync_adjust_seconds: 0, duration_seconds: 40 };

  it('maps song ranges to take ranges, in order, dropping the ones outside', () => {
    const out = clipsInTake([clip('b', 25, 28), clip('a', 12, 14), clip('far', 100, 110)], take);
    expect(out.map((c) => [c.clip.id, c.start, c.end])).toEqual([
      ['a', 4, 8],
      ['b', 30, 36],
    ]);
  });

  it('is empty without a length', () => {
    expect(clipsInTake([clip('a', 12, 14)], { ...take, duration_seconds: 0 })).toEqual([]);
  });
});

describe('overlay fit', () => {
  it('clamps to the database limits and rounds', () => {
    expect(clampFit({ scale: 9, x: 3, y: -3 })).toEqual({ scale: 5, x: 1, y: -1 });
    expect(clampFit({ scale: 0.01, x: 0.123456, y: Number.NaN })).toEqual({ scale: 0.2, x: 0.1235, y: 0 });
  });

  it('reads defaults from a take that lacks the columns', () => {
    expect(fitOf({})).toEqual(NO_FIT);
    expect(fitOf({ fit_scale: 1.5, fit_x: 0.1, fit_y: -0.2 })).toEqual({ scale: 1.5, x: 0.1, y: -0.2 });
  });

  it('pans with one finger', () => {
    const fit = gestureFit(NO_FIT, [{ x: 0, y: 0 }], [{ x: 40, y: -30 }], frame);
    expect(fit).toEqual({ scale: 1, x: 0.1, y: -0.1 });
  });

  it('scales around the midpoint of two fingers, keeping it under them', () => {
    const from = [
      { x: -50, y: 0 },
      { x: 50, y: 0 },
    ];
    const to = [
      { x: -100, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(gestureFit(NO_FIT, from, to, frame)).toEqual({ scale: 2, x: 0, y: 0 });
    // Pinching around a point right of centre moves the original left, so that point stays put.
    const off = gestureFit(
      NO_FIT,
      [
        { x: 50, y: 0 },
        { x: 150, y: 0 },
      ],
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
      frame,
    );
    expect(off.scale).toBe(2);
    expect(off.x).toBe(-0.25);
  });

  it('ignores mismatched gestures and an empty frame', () => {
    expect(gestureFit(NO_FIT, [{ x: 0, y: 0 }], [], frame)).toBe(NO_FIT);
    expect(gestureFit(NO_FIT, [{ x: 0, y: 0 }], [{ x: 9, y: 9 }], { width: 0, height: 0 })).toBe(NO_FIT);
  });

  it('never scales past the limits with two fingers', () => {
    const fit = gestureFit(
      NO_FIT,
      [
        { x: -5, y: 0 },
        { x: 5, y: 0 },
      ],
      [
        { x: -500, y: 0 },
        { x: 500, y: 0 },
      ],
      frame,
    );
    expect(fit.scale).toBe(5);
  });

  it('zooms in with the wheel up, around the cursor', () => {
    const bigger = wheelFit(NO_FIT, -100, { x: 0, y: 0 }, frame);
    expect(bigger.scale).toBeGreaterThan(1);
    expect(bigger.x).toBe(0);
    const smaller = wheelFit(NO_FIT, 100, { x: 100, y: 0 }, frame);
    expect(smaller.scale).toBeLessThan(1);
    expect(smaller.x).toBeGreaterThan(0);
  });

  it('nudges with the keyboard', () => {
    expect(keyFit(NO_FIT, 'ArrowRight')).toEqual({ scale: 1, x: 0.02, y: 0 });
    expect(keyFit(NO_FIT, '+')!.scale).toBe(1.04);
    expect(keyFit(NO_FIT, 'x')).toBeNull();
  });
});

describe('default take of the review (F4)', () => {
  const t = (id: string, over: Partial<{ where: 'here' | 'cloud' | 'elsewhere'; member_id: string | null; is_best: boolean; recorded_at: string }>) => ({
    id,
    where: 'here' as const,
    member_id: null,
    is_best: false,
    recorded_at: '2026-10-10T10:00:00Z',
    ...over,
  });

  it('opens my best take first', () => {
    const takes = [
      t('mine-new', { member_id: 'me', recorded_at: '2026-10-12T10:00:00Z' }),
      t('mine-best', { member_id: 'me', is_best: true }),
      t('other-best', { member_id: 'ana', is_best: true, recorded_at: '2026-10-13T10:00:00Z' }),
    ];
    expect(defaultReviewTake(takes, 'me')?.id).toBe('mine-best');
  });

  it('else my newest take', () => {
    const takes = [t('mine-old', { member_id: 'me' }), t('mine-new', { member_id: 'me', recorded_at: '2026-10-12T10:00:00Z' })];
    expect(defaultReviewTake(takes, 'me')?.id).toBe('mine-new');
  });

  it('else the newest on this phone, then the newest anywhere playable', () => {
    const takes = [
      t('cloud-new', { where: 'cloud', recorded_at: '2026-10-14T10:00:00Z' }),
      t('here', {}),
      t('elsewhere', { where: 'elsewhere', recorded_at: '2026-10-15T10:00:00Z' }),
    ];
    expect(defaultReviewTake(takes, null)?.id).toBe('here');
    expect(defaultReviewTake([takes[0]!, takes[2]!], 'me')?.id).toBe('cloud-new');
  });

  it('never picks a take that is on another phone', () => {
    expect(defaultReviewTake([t('x', { where: 'elsewhere', member_id: 'me', is_best: true })], 'me')).toBeNull();
  });
});

describe('notes on a take (F6)', () => {
  const note = (id: string, over: Partial<Note>): Note =>
    ({
      id,
      take_id: null,
      take_seconds: null,
      for_member_id: null,
      status: 'open',
      at_seconds: 0,
      body: id,
      ...over,
    }) as Note;

  it('knows the seven categories', () => {
    expect(isNoteCategory('direccion')).toBe(true);
    expect(isNoteCategory('cabeza')).toBe(false);
    expect(categoryLabel('energia')).toBe('Energía');
    expect(categoryLabel(null)).toBeNull();
  });

  it('defaults the status to pending', () => {
    expect(noteStatus({})).toBe('open');
    expect(noteStatus({ status: 'done' })).toBe('done');
    expect(noteStatus({ status: 'weird' })).toBe('open');
  });

  it('trims the text and refuses an empty one', () => {
    expect(cleanNoteBody('  brazos  ')).toBe('brazos');
    expect(cleanNoteBody('   ')).toBeNull();
    expect(cleanNoteBody('x'.repeat(600))).toHaveLength(500);
  });

  it('lists a take’s notes in take order', () => {
    const notes = [
      note('b', { take_id: 't1', take_seconds: 9 }),
      note('song', {}),
      note('a', { take_id: 't1', take_seconds: 2 }),
      note('other', { take_id: 't2', take_seconds: 1 }),
    ];
    expect(takeNotes(notes, 't1').map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('shows a take’s notes on the song only to their recipient', () => {
    const notes = [
      note('song', {}),
      note('for-me', { take_id: 't', for_member_id: 'me' }),
      note('for-ana', { take_id: 't', for_member_id: 'ana' }),
      note('for-all', { take_id: 't', for_member_id: null }),
    ];
    expect(songNotes(notes, 'me').map((n) => n.id)).toEqual(['song', 'for-me', 'for-all']);
    expect(songNotes(notes, null).map((n) => n.id)).toEqual(['song', 'for-all']);
  });

  it('announces a note only on natural forward playback', () => {
    const notes = [note('a', { take_id: 't', take_seconds: 5 })];
    expect(crossedNote(notes, 4.9, 5.02)?.id).toBe('a');
    expect(crossedNote(notes, 5.02, 5.1)).toBeNull();
    expect(crossedNote(notes, 1, 6)).toBeNull(); // a jump
    expect(crossedNote(notes, 6, 4)).toBeNull(); // backwards
  });
});

describe('the drawing over the frame', () => {
  const fake = (sizes: Record<string, number>, webp = true): SketchEncoder => (type, quality, width) => {
    const t = type === 'image/webp' && !webp ? 'image/png' : type;
    const n = sizes[`${t}:${width}:${quality}`] ?? 999_999;
    return `data:${t};base64,${'A'.repeat(n)}`;
  };

  it('takes the best WebP that fits', () => {
    const out = encodeSketch(fake({ 'image/webp:320:0.8': 70_000, 'image/webp:320:0.62': 40_000 }));
    expect(out?.startsWith('data:image/webp')).toBe(true);
    expect(out!.length).toBeLessThanOrEqual(60_000);
  });

  it('goes narrower when no quality fits', () => {
    const out = encodeSketch(fake({ 'image/webp:240:0.8': 50_000 }));
    expect(out).toBe(`data:image/webp;base64,${'A'.repeat(50_000)}`);
  });

  it('falls back to JPEG when the browser does not make WebP', () => {
    const out = encodeSketch(fake({ 'image/jpeg:320:0.62': 30_000 }, false));
    expect(out?.startsWith('data:image/jpeg')).toBe(true);
  });

  it('gives up when nothing fits', () => {
    expect(encodeSketch(fake({}))).toBeNull();
    expect(encodeSketch(() => null)).toBeNull();
  });

  it('checks the same shape as the database', () => {
    expect(isValidSketch('data:image/webp;base64,AAAA')).toBe(true);
    expect(isValidSketch('data:image/gif;base64,AAAA')).toBe(false);
    expect(isValidSketch(`data:image/webp;base64,${'A'.repeat(60_000)}`)).toBe(false);
    expect(isValidSketch('data:image/webp;base64,<script>')).toBe(false);
  });

  it('draws circles in the drag box and arrows with two barbs', () => {
    expect(ellipseOf({ kind: 'circle', from: { x: 10, y: 10 }, to: { x: 50, y: 30 } })).toEqual({ cx: 30, cy: 20, rx: 20, ry: 10 });
    const [a, b] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(a.x).toBeLessThan(100);
    expect(b.x).toBeLessThan(100);
    expect(Math.sign(a.y)).toBe(-Math.sign(b.y));
    expect(isShape({ kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 3, y: 3 } })).toBe(false);
  });
});

describe('atNoteMoment (P1)', () => {
  it('is true only within 0.2 s of the note', () => {
    expect(atNoteMoment(10.1, 10)).toBe(true);
    expect(atNoteMoment(9.85, 10)).toBe(true);
    expect(atNoteMoment(10.25, 10)).toBe(false);
    expect(atNoteMoment(0, null)).toBe(false);
    expect(atNoteMoment(0, undefined)).toBe(false);
    expect(atNoteMoment(3, '3.1')).toBe(true);
    expect(atNoteMoment(3, 'x')).toBe(false);
  });
});
