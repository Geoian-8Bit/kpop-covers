import type { Tables } from './database.types';

export const CLIP_COLORS = ['wine', 'plum', 'orchid', 'rose', 'gold', 'teal'] as const;
export type ClipColor = (typeof CLIP_COLORS)[number];

export type VideoSource = 'youtube' | 'upload';

export type Crew = Tables<'crews'>;
export type Profile = Tables<'profiles'>;
export type CrewMember = Tables<'crew_members'> & { role: 'owner' | 'member' };
export type Video = Omit<Tables<'videos'>, 'source'> & { source: VideoSource };
export type Clip = Omit<Tables<'clips'>, 'color'> & { color: ClipColor };

export function isClipColor(value: string): value is ClipColor {
  return (CLIP_COLORS as readonly string[]).includes(value);
}
