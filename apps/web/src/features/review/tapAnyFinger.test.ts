import { describe, expect, it } from 'vitest';
import { isCleanTap, needsTapHelp, TAP_SLOP } from './tapAnyFinger';

describe('buttons that answer to any finger', () => {
  it('helps only a touch that is not the first finger (the first one gets its click)', () => {
    expect(needsTapHelp({ pointerType: 'touch', isPrimary: false })).toBe(true);
    expect(needsTapHelp({ pointerType: 'touch', isPrimary: true })).toBe(false);
    expect(needsTapHelp({ pointerType: 'mouse', isPrimary: false })).toBe(false);
    expect(needsTapHelp({ pointerType: 'pen', isPrimary: false })).toBe(false);
  });

  it('a tap is the same finger lifted within a few px', () => {
    const start = { id: 3, x: 100, y: 100 };
    expect(isCleanTap(start, { id: 3, x: 104, y: 103 })).toBe(true);
    expect(isCleanTap(start, { id: 3, x: 100 + TAP_SLOP + 1, y: 100 })).toBe(false);
    expect(isCleanTap(start, { id: 4, x: 100, y: 100 })).toBe(false);
    expect(isCleanTap(null, { id: 3, x: 100, y: 100 })).toBe(false);
  });
});
