import { describe, expect, it } from 'vitest';
import {
  clampAdjust,
  clampLead,
  clipInTake,
  followCorrection,
  formatLead,
  originalTime,
  SONG_LEAD_LIMIT,
  songTimeAt,
  takeRangeToSong,
  takeTimeAt,
} from './review';

const take = { songStart: 30, speed: 0.75, adjust: 0.1, duration: 40 };

describe('take ↔ song time', () => {
  it('maps a take moment to the song with start, speed and adjustment', () => {
    expect(songTimeAt(take, 0)).toBeCloseTo(30.1);
    expect(songTimeAt(take, 10)).toBeCloseTo(37.6); // 30 + 10 × 0.75 + 0.1
    expect(takeTimeAt(take, 37.6)).toBeCloseTo(10);
  });

  it('round-trips at normal speed', () => {
    const t = { songStart: 12.5, speed: 1 };
    for (const s of [0, 1.25, 30]) expect(takeTimeAt(t, songTimeAt(t, s))).toBeCloseTo(s);
  });

  it('keeps the adjustment within ±0.3 s', () => {
    expect(clampAdjust(0.5)).toBe(0.3);
    expect(clampAdjust(-1)).toBe(-0.3);
    expect(clampAdjust(Number.NaN)).toBe(0);
    expect(songTimeAt({ songStart: 0, speed: 1, adjust: 5 }, 0)).toBe(0.3);
  });

  it('places the original on the file through its offset (F1)', () => {
    expect(originalTime(40, 2, true)).toBe(42);
    expect(originalTime(40, 2, false)).toBe(40);
    expect(originalTime(40, null, true)).toBe(40);
  });
});

describe('followCorrection', () => {
  it('seeks on a big gap, nudges the rate on a small one, leaves it alone when close', () => {
    expect(followCorrection(0.6, 1)).toEqual({ kind: 'seek' });
    expect(followCorrection(0.1, 1)).toEqual({ kind: 'rate', rate: 0.95 });
    expect(followCorrection(-0.1, 0.75)).toEqual({ kind: 'rate', rate: 0.788 });
    expect(followCorrection(0.01, 1)).toEqual({ kind: 'none' });
  });
});

describe('clips and takes (F8)', () => {
  it('turns a song clip into a range of the take, clamped', () => {
    expect(clipInTake(take, { start: 37.6, end: 45.1 })).toEqual({ start: 10, end: 20 });
    expect(clipInTake(take, { start: 0, end: 31 })).toEqual({ start: 0, end: 1.2 });
    expect(clipInTake(take, { start: 100, end: 110 })).toBeNull();
  });

  it('turns a range marked on the take into a song range', () => {
    expect(takeRangeToSong(take, { start: 20, end: 10 })).toEqual({ start: 37.6, end: 45.1 });
  });
});

describe('the song starts later in the take (lead)', () => {
  const gallery = { songStart: 0, speed: 1, lead: 12.57 };

  it('maps the take onto the song from the lead on', () => {
    expect(songTimeAt(gallery, 12.57)).toBeCloseTo(0);
    expect(songTimeAt(gallery, 20)).toBeCloseTo(7.43);
    expect(takeTimeAt(gallery, 0)).toBeCloseTo(12.57);
    expect(takeTimeAt(gallery, 7.43)).toBeCloseTo(20);
  });

  it('is below the song start before the lead (negative for a whole song)', () => {
    expect(songTimeAt(gallery, 0)).toBeCloseTo(-12.57);
    expect(songTimeAt({ songStart: 30, speed: 1, lead: 5 }, 0)).toBeCloseTo(25);
  });

  it('combines with speed and the fine adjustment', () => {
    const t = { songStart: 10, speed: 0.5, adjust: 0.1, lead: 4 };
    expect(songTimeAt(t, 8)).toBeCloseTo(12.1); // 10 + (8 − 4) × 0.5 + 0.1
    for (const s of [0, 4, 9.5]) expect(takeTimeAt(t, songTimeAt(t, s))).toBeCloseTo(s);
  });

  it('keeps the lead within 0–600 s, in thousandths', () => {
    expect(clampLead(-3)).toBe(0);
    expect(clampLead(900)).toBe(SONG_LEAD_LIMIT);
    expect(clampLead(Number.NaN)).toBe(0);
    expect(clampLead(null)).toBe(0);
    expect(clampLead(12.5678)).toBe(12.568);
  });

  it('places clips and A–B ranges with the lead', () => {
    expect(clipInTake({ ...gallery, duration: 60 }, { start: 5, end: 10 })).toEqual({
      start: 17.57,
      end: 22.57,
    });
    // A clip that ends before the song starts in the take is never placed before the take's 0.
    expect(clipInTake({ ...gallery, duration: 60 }, { start: 0, end: 3 })).toEqual({
      start: 12.57,
      end: 15.57,
    });
    expect(takeRangeToSong(gallery, { start: 2, end: 15 })).toEqual({ start: 0, end: 2.43 });
  });

  it('shows the lead with hundredths', () => {
    expect(formatLead(12.57)).toBe('0:12,57');
    expect(formatLead(0)).toBe('0:00,00');
    expect(formatLead(75.051)).toBe('1:15,05');
    expect(formatLead(-1)).toBe('0:00,00');
  });
});
