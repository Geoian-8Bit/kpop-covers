import { clipTone } from '@/features/bags/tones';
import type { ClipWithVideo } from '@/lib/backend';
import type { PlayCard } from './RandomPlayScreen';
import type { RoundOptions } from './roundRules';

// REQ-27 · Split out of RpdPlayPage.tsx: the round's entries as the screen's cards.

export interface Entry {
  key: string;
  clip: ClipWithVideo | null;
}

export function toCard(entry: Entry): PlayCard | null {
  const clip = entry.clip;
  if (!clip) return null;
  return {
    key: entry.key,
    title: clip.video?.title ?? 'Sin título',
    artist: clip.video?.artist ?? null,
    clipName: clip.name,
    tone: clipTone(clip.color),
  };
}

export function roundOptions(options: RoundOptions, count: number): RoundOptions {
  return { ...options, count };
}
