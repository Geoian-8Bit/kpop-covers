import type { MemberColor } from '@coverscape/shared';
import type { FormationMember } from '@/data/formations';

/** Member colours as the index.css tokens (SVG fills can't take the Tailwind bg classes). */
const FILL: Record<MemberColor, { fill: string; ink: string }> = {
  shu: { fill: 'var(--color-shu-500)', ink: 'var(--color-washi)' },
  ai: { fill: 'var(--color-ai-500)', ink: 'var(--color-washi)' },
  kin: { fill: 'var(--color-kin-400)', ink: 'var(--color-sumi-900)' },
  enji: { fill: 'var(--color-enji-500)', ink: 'var(--color-washi)' },
  murasaki: { fill: 'var(--color-murasaki)', ink: 'var(--color-washi)' },
  fuji: { fill: 'var(--color-fuji)', ink: 'var(--color-sumi-900)' },
  sakura: { fill: 'var(--color-sakura)', ink: 'var(--color-sumi-900)' },
  rokusho: { fill: 'var(--color-rokusho)', ink: 'var(--color-washi)' },
  kiji: { fill: 'var(--color-kiji-400)', ink: 'var(--color-sumi-900)' },
  washi: { fill: 'var(--color-washi)', ink: 'var(--color-sumi-900)' },
};
const ARCHIVED = { fill: 'var(--color-sumi-600)', ink: 'var(--color-washi-subtle)' };
export const CLASH = 'var(--color-shu-400)';

export function personColors(person: FormationMember | undefined) {
  return !person || person.archived ? ARCHIVED : FILL[person.color];
}

export const initialOf = (name: string | undefined) => (name ?? '?').trim().charAt(0).toUpperCase() || '?';

/** The name under a point: its first word, cut to fit between neighbours. */
export function shortName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first.length > 7 ? `${first.slice(0, 6)}…` : first;
}
