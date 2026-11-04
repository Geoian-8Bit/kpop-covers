import { describe, expect, it } from 'vitest';
import { easeOut, trailEnds, trailKeyframes } from './voteTrails';

describe('voteTrails (REQ-22)', () => {
  it('easeOut is motion’s cubic-bezier(0, 0, 0.58, 1)', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
    expect(easeOut(0.25)).toBeLessThan(easeOut(0.5));
  });

  it('starts flat at the bottom, y1 reaches y + 26 halfway, both end at y', () => {
    expect(trailEnds(74, 0)).toEqual({ y1: 200, y2: 200 });
    expect(trailEnds(74, 250).y1).toBeCloseTo(100, 6);
    const end = trailEnds(74, 500);
    expect(end.y1).toBeCloseTo(74, 6);
    expect(end.y2).toBeCloseTo(74, 6);
  });

  it('y1 runs above y2 early on (the segment between them is drawn either way)', () => {
    const { y1, y2 } = trailEnds(74, 150);
    expect(y1).toBeLessThan(y2);
  });

  it('writes one keyframes rule per trail, sampled every 10 ms', () => {
    const css = trailKeyframes([74, 62]);
    expect(css.match(/@keyframes/g)).toHaveLength(2);
    expect(css).toContain('@keyframes vote-trail-body-1{');
    expect(css.split('\n')[0]!.match(/%\{/g)).toHaveLength(51);
  });
});
