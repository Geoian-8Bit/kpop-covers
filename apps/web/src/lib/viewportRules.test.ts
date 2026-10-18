import { describe, expect, it } from 'vitest';
import { pinnedViewport, strayScrollX } from './viewportRules';

const BASE =
  'width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content';

describe('pinnedViewport (47)', () => {
  it('pins the three scales to 1 instead of repeating the base’s own', () => {
    const pinned = pinnedViewport(BASE);
    expect(pinned).toBe(
      'width=device-width, viewport-fit=cover, interactive-widget=resizes-content, initial-scale=1, minimum-scale=1, maximum-scale=1',
    );
    expect(pinned.match(/maximum-scale/g)).toHaveLength(1);
  });

  it('differs from the base, so writing it always makes the browser re-measure', () => {
    expect(pinnedViewport(BASE)).not.toBe(BASE);
    expect(pinnedViewport('width=device-width')).toBe('width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1');
  });

  it('keeps everything else and ignores empty entries and odd spacing', () => {
    expect(pinnedViewport(' width=device-width ,, Minimum-Scale = 0.5 ,viewport-fit=cover')).toBe(
      'width=device-width, viewport-fit=cover, initial-scale=1, minimum-scale=1, maximum-scale=1',
    );
  });
});

describe('strayScrollX (47)', () => {
  it('flags any sideways offset, sub-pixel ones too', () => {
    expect(strayScrollX(0)).toBe(false);
    expect(strayScrollX(0.2)).toBe(false);
    expect(strayScrollX(0.6)).toBe(true);
    expect(strayScrollX(227)).toBe(true);
    expect(strayScrollX(-3)).toBe(true);
  });

  it('ignores readings that are not numbers', () => {
    expect(strayScrollX(Number.NaN)).toBe(false);
  });
});
