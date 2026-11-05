import { describe, expect, it } from 'vitest';
import { emptyLoop, hasRange, markEndLoop, markStartLoop, toggleLoopState } from './loopActions';

describe('loopActions · the A–B maths shared by the studio and the review', () => {
  it('A keeps the old B only when the loop stays long enough', () => {
    expect(markStartLoop({ start: 10, end: 20, enabled: true }, 12.12345)).toEqual({
      start: 12.123,
      end: 20,
      enabled: true,
    });
    const tooShort = markStartLoop({ start: 10, end: 20, enabled: false }, 19.95);
    expect(tooShort.end).toBeNull();
    expect(tooShort.enabled).toBe(false);
  });

  it('B against A (or 0) gives an enabled range', () => {
    expect(markEndLoop({ start: 5, end: null, enabled: false }, 9, 100)).toEqual({
      start: 5,
      end: 9,
      enabled: true,
    });
    expect(markEndLoop(emptyLoop, 4, 0)).toEqual({ start: 0, end: 4, enabled: true });
    // B on A: stretched to the shortest loop allowed (normalizeRange).
    expect(markEndLoop({ start: 5, end: null, enabled: false }, 5, 100)).toEqual({ start: 5, end: 5.2, enabled: true });
  });

  it('toggles only an existing range', () => {
    expect(toggleLoopState(emptyLoop)).toBeNull();
    expect(toggleLoopState({ start: 1, end: 3, enabled: true })).toEqual({
      start: 1,
      end: 3,
      enabled: false,
    });
    expect(hasRange({ start: 1, end: null, enabled: false })).toBe(false);
  });
});
