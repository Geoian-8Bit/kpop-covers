import { describe, expect, it } from 'vitest';
import { stickyBarPad } from './stickyBarPadding';

describe('stickyBarPad', () => {
  it('is 0 without bars', () => {
    expect(stickyBarPad([])).toBe(0);
  });

  it('takes the tallest bar, rounded up, ignoring junk', () => {
    expect(stickyBarPad([60.2, 84.4, 72])).toBe(85);
    expect(stickyBarPad([Number.NaN, -4, 40])).toBe(40);
  });
});
