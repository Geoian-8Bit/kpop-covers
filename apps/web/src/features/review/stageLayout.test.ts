import { describe, expect, it } from 'vitest';
import { HINGE, panelRects, rectStyle } from './stageLayout';

describe('stage layout (REQ-27)', () => {
  it('shares a row between the panels around the hinge', () => {
    const [a, b] = panelRects({ width: 410, height: 200 }, true, 0.5);
    expect(a).toEqual({ left: 0, top: 0, width: 200, height: 200 });
    expect(b).toEqual({ left: 200 + HINGE, top: 0, width: 200, height: 200 });
  });

  it('shares a column, rounding the first panel and giving the rest to the second', () => {
    const [a, b] = panelRects({ width: 300, height: 611 }, false, 0.333);
    expect(a).toEqual({ left: 0, top: 0, width: 300, height: 200 });
    expect(b).toEqual({ left: 0, top: 200 + HINGE, width: 300, height: 401 });
  });

  it('never gives a negative size on a frame smaller than the hinge', () => {
    const [a, b] = panelRects({ width: 4, height: 100 }, true, 0.5);
    expect(a.width).toBe(0);
    expect(b.width).toBe(0);
  });

  it('turns a rect into its style', () => {
    expect(rectStyle({ left: 1, top: 2, width: 3, height: 4 })).toEqual({
      left: 1,
      top: 2,
      width: 3,
      height: 4,
    });
  });
});
