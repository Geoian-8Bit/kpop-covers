import { describe, expect, it } from 'vitest';
import {
  actionsWidth,
  fullSwipeArmed,
  hintPending,
  maxDrag,
  settleSwipe,
  SWIPE_ACTION_WIDTH,
} from './swipeRowRules';

const base = { velocity: 0, actionsWidth: 228, rowWidth: 360, hasPrimary: false };

describe('settleSwipe', () => {
  it('stays closed when not dragged left', () => {
    expect(settleSwipe({ ...base, offset: 0 })).toBe('closed');
    expect(settleSwipe({ ...base, offset: 20 })).toBe('closed');
  });

  it('opens past 40% of the actions, closes before', () => {
    expect(settleSwipe({ ...base, offset: -91 })).toBe('closed');
    expect(settleSwipe({ ...base, offset: -92 })).toBe('open');
  });

  it('a flick wins over the distance', () => {
    expect(settleSwipe({ ...base, offset: -30, velocity: -600 })).toBe('open');
    expect(settleSwipe({ ...base, offset: -200, velocity: 600 })).toBe('closed');
  });

  it('runs the primary action past 70% of the row only when there is one', () => {
    expect(settleSwipe({ ...base, offset: -260 })).toBe('open');
    expect(settleSwipe({ ...base, offset: -260, hasPrimary: true })).toBe('primary');
    expect(settleSwipe({ ...base, offset: -240, hasPrimary: true })).toBe('open');
  });

  it('no actions: never opens', () => {
    expect(settleSwipe({ ...base, actionsWidth: 0, offset: -300 })).toBe('closed');
  });
});

describe('helpers', () => {
  it('actionsWidth', () => {
    expect(actionsWidth(3)).toBe(3 * SWIPE_ACTION_WIDTH);
    expect(actionsWidth(-1)).toBe(0);
  });

  it('fullSwipeArmed', () => {
    expect(fullSwipeArmed(252, 360)).toBe(true);
    expect(fullSwipeArmed(251, 360)).toBe(false);
    expect(fullSwipeArmed(500, 0)).toBe(false);
  });

  it('maxDrag', () => {
    expect(maxDrag(152, 360, false)).toBe(152);
    expect(maxDrag(152, 360, true)).toBe(360);
    expect(maxDrag(152, 0, true)).toBe(152);
  });

  it('hintPending', () => {
    expect(hintPending(() => null)).toBe(true);
    expect(hintPending(() => '1')).toBe(false);
    expect(
      hintPending(() => {
        throw new Error('blocked');
      }),
    ).toBe(false);
  });
});
