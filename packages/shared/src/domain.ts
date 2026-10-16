import type { Tables } from './database.types';

export const CLIP_COLORS = ['wine', 'plum', 'orchid', 'rose', 'gold', 'teal'] as const;
export type ClipColor = (typeof CLIP_COLORS)[number];

export type VideoSource = 'youtube' | 'upload';

export type Crew = Tables<'crews'>;
export type Profile = Tables<'profiles'>;
export type CrewMember = Tables<'crew_members'> & { role: 'owner' | 'member' };
export type Video = Omit<Tables<'videos'>, 'source'> & { source: VideoSource };
export type Clip = Omit<Tables<'clips'>, 'color'> & { color: ClipColor };
export type Note = Tables<'notes'>;

/** Member colours (F2): traditional pigments, the same names as the tokens in index.css. */
export const MEMBER_COLORS = ['shu', 'ai', 'kin', 'enji', 'murasaki', 'fuji', 'sakura', 'rokusho', 'kiji', 'washi'] as const;
export type MemberColor = (typeof MEMBER_COLORS)[number];
export type Member = Omit<Tables<'members'>, 'color'> & { color: MemberColor };

export function isMemberColor(value: string): value is MemberColor {
  return (MEMBER_COLORS as readonly string[]).includes(value);
}

/** A YouTube entry with its own file attached (F1). */
export function hasLinkedFile(video: Pick<Tables<'videos'>, 'source' | 'file_name'>): boolean {
  return video.source === 'youtube' && Boolean(video.file_name);
}

export function isClipColor(value: string): value is ClipColor {
  return (CLIP_COLORS as readonly string[]).includes(value);
}
