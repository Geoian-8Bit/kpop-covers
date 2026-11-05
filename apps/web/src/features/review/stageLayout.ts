import type { Size } from './reviewRules';

/** What a gesture works on. */
export type Target = 'fit' | 'take' | 'original' | 'both';

/** The hinge between the panels (px). */
export const HINGE = 10;

export type Rect = { left: number; top: number; width: number; height: number };

export function panelRects(size: Size, row: boolean, split: number): [Rect, Rect] {
  const total = (row ? size.width : size.height) - HINGE;
  const first = Math.max(0, Math.round(total * split));
  const second = Math.max(0, total - first);
  if (row) {
    return [
      { left: 0, top: 0, width: first, height: size.height },
      { left: first + HINGE, top: 0, width: second, height: size.height },
    ];
  }
  return [
    { left: 0, top: 0, width: size.width, height: first },
    { left: 0, top: first + HINGE, width: size.width, height: second },
  ];
}

export const rectStyle = (r: Rect) => ({ left: r.left, top: r.top, width: r.width, height: r.height });
