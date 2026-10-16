import type { ClipColor, MemberColor } from '@coverscape/shared';

/**
 * One palette for whatever comes out of a bag or plays in a round: the app's pigments (tokens in index.css).
 * Static class strings so Tailwind sees them; `fill` for SVG, `bg` / `text` for HTML.
 */
export type Tone =
  'shu' | 'ai' | 'kin' | 'enji' | 'murasaki' | 'fuji' | 'sakura' | 'rokusho' | 'kiji' | 'washi';

export const TONE: Record<Tone, { fill: string; stroke: string; bg: string; ink: string }> = {
  shu: { fill: 'fill-shu-500', stroke: 'stroke-shu-500', bg: 'bg-shu-500', ink: 'text-washi' },
  ai: { fill: 'fill-ai-500', stroke: 'stroke-ai-500', bg: 'bg-ai-500', ink: 'text-washi' },
  kin: { fill: 'fill-kin-400', stroke: 'stroke-kin-400', bg: 'bg-kin-400', ink: 'text-sumi-900' },
  enji: { fill: 'fill-enji-500', stroke: 'stroke-enji-500', bg: 'bg-enji-500', ink: 'text-washi' },
  murasaki: { fill: 'fill-murasaki', stroke: 'stroke-murasaki', bg: 'bg-murasaki', ink: 'text-washi' },
  fuji: { fill: 'fill-fuji', stroke: 'stroke-fuji', bg: 'bg-fuji', ink: 'text-sumi-900' },
  sakura: { fill: 'fill-sakura', stroke: 'stroke-sakura', bg: 'bg-sakura', ink: 'text-sumi-900' },
  rokusho: { fill: 'fill-rokusho', stroke: 'stroke-rokusho', bg: 'bg-rokusho', ink: 'text-washi' },
  kiji: { fill: 'fill-kiji-400', stroke: 'stroke-kiji-400', bg: 'bg-kiji-400', ink: 'text-sumi-900' },
  washi: { fill: 'fill-washi', stroke: 'stroke-washi', bg: 'bg-washi', ink: 'text-sumi-900' },
};

const CLIP_TONE: Record<ClipColor, Tone> = {
  wine: 'enji',
  plum: 'murasaki',
  orchid: 'fuji',
  rose: 'sakura',
  gold: 'kin',
  teal: 'rokusho',
};

export function clipTone(color: ClipColor | string | null | undefined): Tone {
  return CLIP_TONE[color as ClipColor] ?? 'enji';
}

export function memberTone(color: MemberColor | string | null | undefined): Tone {
  return color && color in TONE ? (color as Tone) : 'washi';
}

/** What a draw shows: the name big, a smaller line, its pigment and the one-kanji mark of its kind. */
export interface DrawShown {
  label: string;
  sub?: string;
  tone: Tone;
  glyph: string;
}
