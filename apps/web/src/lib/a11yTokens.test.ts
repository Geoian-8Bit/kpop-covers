import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Colour tokens straight from index.css, so a retuned token that breaks a pairing fails here. */
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`token --color-${name} not found`);
  return match[1]!;
}

type Rgb = [number, number, number];
const rgb = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
/** `top` at `alpha` over `base`. */
const over = (base: Rgb, top: Rgb, alpha: number): Rgb => base.map((v, i) => v * (1 - alpha) + top[i]! * alpha) as Rgb;
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
/** WCAG 2.x contrast ratio. */
function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('accessible colour pairs (WCAG AA, 4.5:1 for text)', () => {
  const washi = rgb(token('washi'));

  it('the contrast helper matches known values', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrast(rgb('#777777'), [255, 255, 255])).toBeCloseTo(4.48, 2);
  });

  it('washi on the primary fill, at rest and on hover', () => {
    expect(contrast(washi, rgb(token('shu-700')))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(washi, rgb(token('shu-600')))).toBeGreaterThanOrEqual(4.5);
  });

  it('the old vermilion fill was the problem (3.9:1)', () => {
    expect(contrast(washi, rgb(token('shu-500')))).toBeLessThan(4.5);
  });

  it('shu-300 danger text on paper-raised, with its sheen and the hover tint', () => {
    // paper-raised: sumi-800 under a 7.5% warm sheen at the top; menu rows add washi at 6% on hover/focus.
    const raised = over(rgb(token('sumi-800')), [255, 246, 230], 0.075);
    const hovered = over(raised, washi, 0.06);
    const text = rgb(token('shu-300'));
    expect(contrast(text, rgb(token('sumi-800')))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, raised)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, hovered)).toBeGreaterThanOrEqual(4.5);
  });

  it('the kin-300 focus ring stands out from the sumi ground (≥ 3:1)', () => {
    expect(contrast(rgb(token('kin-300')), rgb(token('sumi-900')))).toBeGreaterThanOrEqual(3);
    expect(contrast(rgb(token('kin-300')), rgb(token('sumi-850')))).toBeGreaterThanOrEqual(3);
  });
});
