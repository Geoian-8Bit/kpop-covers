import { describe, expect, it } from 'vitest';
import {
  arrowHead,
  ellipseOf,
  encodeSketch,
  isShape,
  isValidSketch,
  type SketchEncoder,
} from './reviewSketch';

describe('the drawing over the frame', () => {
  const fake =
    (sizes: Record<string, number>, webp = true): SketchEncoder =>
    (type, quality, width) => {
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
    expect(ellipseOf({ kind: 'circle', from: { x: 10, y: 10 }, to: { x: 50, y: 30 } })).toEqual({
      cx: 30,
      cy: 20,
      rx: 20,
      ry: 10,
    });
    const [a, b] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(a.x).toBeLessThan(100);
    expect(b.x).toBeLessThan(100);
    expect(Math.sign(a.y)).toBe(-Math.sign(b.y));
    expect(isShape({ kind: 'arrow', from: { x: 0, y: 0 }, to: { x: 3, y: 3 } })).toBe(false);
  });
});
