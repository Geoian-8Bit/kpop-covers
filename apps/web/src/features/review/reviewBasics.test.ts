import type { Clip } from '@coverscape/shared';
import { describe, expect, it } from 'vitest';
import {
  clampReviewRate,
  clampSplit,
  clipsInTake,
  DEFAULT_PREFS,
  defaultReviewTake,
  parseViewPrefs,
  takeLength,
  takeTiming,
} from './reviewBasics';

describe('layout limits', () => {
  it('keeps the split between 15 and 85 %', () => {
    expect(clampSplit(0.1)).toBe(0.15);
    expect(clampSplit(0.9)).toBe(0.85);
    expect(clampSplit(0.55)).toBe(0.55);
    expect(clampSplit(Number.NaN)).toBe(0.5);
  });

  it('limits the common speed to 0.5–1.25×', () => {
    expect(clampReviewRate(0.25)).toBe(0.5);
    expect(clampReviewRate(2)).toBe(1.25);
    expect(clampReviewRate(0.75)).toBe(0.75);
  });

  it('trusts the media length, else the saved one', () => {
    expect(takeLength(Number.POSITIVE_INFINITY, 42)).toBe(42);
    expect(takeLength(0, 42)).toBe(42);
    expect(takeLength(40.5, 42)).toBe(40.5);
    expect(takeLength(Number.NaN, null)).toBe(0);
  });

  it('reads an old demo take without the review columns', () => {
    const timing = takeTiming({ song_start_seconds: 12, speed: 0.75, duration_seconds: 30 } as never);
    expect(timing).toEqual({ songStart: 12, speed: 0.75, takeSpeed: 1, adjust: 0, lead: 0, duration: 30 });
  });
});

describe('view preferences', () => {
  it('survives garbage', () => {
    expect(parseViewPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parseViewPrefs('{nope')).toEqual(DEFAULT_PREFS);
    expect(parseViewPrefs('[1,2]')).toEqual(DEFAULT_PREFS);
  });

  it('repairs each field on its own and drops fields no longer used', () => {
    expect(
      parseViewPrefs(
        JSON.stringify({
          mode: 'overlay',
          order: 'take-first',
          split: 0.95,
          wipe: -1,
          opacity: 3,
          onTop: 'take',
        }),
      ),
    ).toEqual({ mode: 'overlay', order: 'take-first', split: 0.85, opacity: 1, onTop: 'take' });
    expect(parseViewPrefs(JSON.stringify({ mode: 'side', split: '0.4', opacity: Number.NaN })).mode).toBe(
      'stacked',
    );
  });
});

describe('clips inside a take', () => {
  const clip = (id: string, start: number, end: number) =>
    ({ id, start_seconds: start, end_seconds: end }) as Clip;
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

  it('places clips after the song starts in the take (a video from the gallery)', () => {
    const gallery = { song_start_seconds: 0, speed: 1, sync_adjust_seconds: 0, duration_seconds: 60 };
    const out = clipsInTake([clip('a', 5, 10)], { ...gallery, song_lead_seconds: 12.57 });
    expect(out.map((c) => [c.start, c.end])).toEqual([[17.57, 22.57]]);
  });
});

describe('take timing', () => {
  it('reads the song start in the take, clamped (old rows have none)', () => {
    const row = { song_start_seconds: 3, speed: 1, sync_adjust_seconds: 0.1, duration_seconds: 20 };
    expect(takeTiming(row).lead).toBe(0);
    expect(takeTiming({ ...row, song_lead_seconds: 12.57 }).lead).toBe(12.57);
    expect(takeTiming({ ...row, song_lead_seconds: -4 }).lead).toBe(0);
    expect(takeTiming({ ...row, song_lead_seconds: 9999 }).lead).toBe(600);
  });

  it('reads each video its own speed (old rows: the take at 1×)', () => {
    const row = { song_start_seconds: 0, speed: 0.75, sync_adjust_seconds: 0, duration_seconds: 20 };
    expect(takeTiming(row)).toMatchObject({ speed: 0.75, takeSpeed: 1 });
    expect(takeTiming({ ...row, take_speed: 1.25 }).takeSpeed).toBe(1.25);
    expect(takeTiming({ ...row, speed: 9, take_speed: 0 })).toMatchObject({ speed: 2, takeSpeed: 1 });
  });

  it('places the song clips with the ratio of both speeds', () => {
    const clip = { id: 'a', start_seconds: 5, end_seconds: 10 } as Clip;
    const row = {
      song_start_seconds: 0,
      speed: 1,
      take_speed: 0.5,
      sync_adjust_seconds: 0,
      duration_seconds: 60,
    };
    expect(clipsInTake([clip], row)[0]).toMatchObject({ start: 2.5, end: 5 });
  });
});

describe('default take of the review (F4)', () => {
  const t = (
    id: string,
    over: Partial<{
      where: 'here' | 'cloud' | 'elsewhere';
      member_id: string | null;
      is_best: boolean;
      recorded_at: string;
    }>,
  ) => ({
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
    const takes = [
      t('mine-old', { member_id: 'me' }),
      t('mine-new', { member_id: 'me', recorded_at: '2026-10-12T10:00:00Z' }),
    ];
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
    expect(
      defaultReviewTake([t('x', { where: 'elsewhere', member_id: 'me', is_best: true })], 'me'),
    ).toBeNull();
  });
});
