/**
 * REQ-11..13 · The index.css tokens as plain values, for drawings that can't take `var(--…)` (a canvas, WebGL).
 * Read once per token at run time, so the tokens stay the only source of colour.
 */

const tokenCache = new Map<string, string>();

/** A token (`--color-shu-500`) or a `var(--…)` string as a colour a canvas or three.js understands. */
export function cssColor(value: string): string {
  const name = /^var\((--[\w-]+)\)$/.exec(value.trim())?.[1] ?? (value.startsWith('--') ? value : null);
  if (!name) return value;
  let known = tokenCache.get(name);
  if (known == null) {
    known = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
    tokenCache.set(name, known);
  }
  return known;
}

/** Font stack of a token (`--font-sans`, `--font-display`). */
export function cssFont(name: '--font-sans' | '--font-display'): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'sans-serif';
}
