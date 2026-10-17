import { youTubeThumbnail } from '@coverscape/shared';

/**
 * Point 28 · Pure rules for the songs of a bag: library videos, wishes and YouTube songs that live only in the bag.
 * The database checks the same (migration `20261017120000_bag_youtube_items`); the demo backend uses these.
 * No React, no storage — covered by `songRules.test.ts`.
 */

/** Same format as `videos.youtube_id` and `wishes.youtube_id`. */
export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const THUMB_RE = /^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/[a-z0-9_]+\.jpg$/;
export const SONG_TITLE_MAX = 200;
export const SONG_ARTIST_MAX = 120;

export interface YouTubeSongInput {
  youtubeId: string;
  title: string;
  artist?: string | null;
  thumbnailUrl?: string | null;
  durationSeconds?: number | null;
}

export interface YouTubeSongRow {
  youtube_id: string;
  title: string;
  artist: string | null;
  thumbnail_url: string;
  duration_seconds: number | null;
}

/**
 * A chosen YouTube video → the columns of a bag item, within the database's limits (title trimmed and cut to 200,
 * artist to 120 or none, a thumbnail from i.ytimg.com, a duration in range or none). null when it can't go in:
 * a bad id or no title.
 */
export function youtubeSongRow(input: YouTubeSongInput): YouTubeSongRow | null {
  const id = input.youtubeId.trim();
  if (!YOUTUBE_ID_RE.test(id)) return null;
  const title = cutChars(input.title.trim(), SONG_TITLE_MAX).trim();
  if (!title) return null;
  const artist = cutChars((input.artist ?? '').trim(), SONG_ARTIST_MAX).trim() || null;
  const thumb =
    input.thumbnailUrl && THUMB_RE.test(input.thumbnailUrl) && input.thumbnailUrl.includes(`/vi/${id}/`)
      ? input.thumbnailUrl
      : youTubeThumbnail(id, 'mqdefault');
  const d = input.durationSeconds;
  const duration =
    d != null && Number.isFinite(d) && d > 0 && d <= 86400 ? Math.round(d * 1000) / 1000 : null;
  return { youtube_id: id, title, artist, thumbnail_url: thumb, duration_seconds: duration };
}

/**
 * The first `max` characters as Postgres counts them (code points, like `char_length`), so an emoji is never cut in
 * half: a lone surrogate would be refused by the database.
 */
export function cutChars(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join('');
}

/** What a bag item is: one of the library, a wish, a clip, a person, or a YouTube song kept only in the bag. */
export type ItemSource = 'video' | 'wish' | 'clip' | 'member' | 'youtube' | 'none';

export interface SongLike {
  video_id: string | null;
  clip_id: string | null;
  member_id: string | null;
  wish_id: string | null;
  youtube_id?: string | null;
  video?: { youtube_id: string | null } | null;
  wish?: { youtube_id: string; added_video_id: string | null } | null;
}

export function itemSource(item: SongLike): ItemSource {
  if (item.video_id) return 'video';
  if (item.wish_id) return 'wish';
  if (item.clip_id) return 'clip';
  if (item.member_id) return 'member';
  if (item.youtube_id) return 'youtube';
  return 'none';
}

/** The YouTube video a song item stands for, whatever its source (null for uploads, clips and people). */
export function songYoutubeId(item: SongLike): string | null {
  return item.youtube_id ?? item.video?.youtube_id ?? item.wish?.youtube_id ?? null;
}

export type YouTubeSongStatus =
  | { status: 'new' }
  | { status: 'in-bag' }
  /** Adding it stores the library video instead (no duplicate in the library, no second copy in the bag). */
  | { status: 'in-library'; videoId: string };

/** Where a YouTube video stands for this bag: already inside (by any source), in the library, or new. */
export function youtubeSongStatus(
  youtubeId: string,
  bagItems: readonly SongLike[],
  library: readonly { id: string; youtube_id: string | null }[],
): YouTubeSongStatus {
  if (bagItems.some((item) => songYoutubeId(item) === youtubeId)) return { status: 'in-bag' };
  const video = library.find((v) => v.youtube_id === youtubeId);
  return video ? { status: 'in-library', videoId: video.id } : { status: 'new' };
}

/**
 * «Sacar varios» → a Random Play Dance round. A round plays clips: a clip item is itself; a library song (or a
 * wish already added to the library) brings one of its clips at random, like «Canciones» in /rpd; a song with no
 * clips — every YouTube song kept only in the bag, and wishes not yet in the library — and people can't play, and
 * are counted in `skipped`. `notInLibrary`: how many of those are songs not in the library yet (only in the bag,
 * or a wish not added), which have no clips because they can't have any yet.
 */
export function roundClipIds(
  drawn: readonly (SongLike | undefined)[],
  clips: readonly { id: string; video_id: string }[],
  random: () => number = Math.random,
): { clipIds: string[]; skipped: number; notInLibrary: number } {
  const clipIds: string[] = [];
  let skipped = 0;
  let notInLibrary = 0;
  for (const item of drawn) {
    if (!item) {
      skipped++;
      continue;
    }
    if (item.clip_id) {
      clipIds.push(item.clip_id);
      continue;
    }
    const videoId = item.video_id ?? item.wish?.added_video_id ?? null;
    const options = videoId ? clips.filter((c) => c.video_id === videoId && !clipIds.includes(c.id)) : [];
    if (!options.length) {
      skipped++;
      if (!videoId && songYoutubeId(item)) notInLibrary++;
      continue;
    }
    clipIds.push(options[Math.min(options.length - 1, Math.floor(random() * options.length))]!.id);
  }
  return { clipIds, skipped, notInLibrary };
}

/**
 * What a «Sacar varios» round says about the songs it leaves out: a YouTube song only in the bag isn't in the library
 * yet (it can't have clips), which is not the same as a library song without clips. Null when none is left out.
 */
export function roundSkipText({
  playable,
  skipped,
  notInLibrary,
}: {
  playable: number;
  skipped: number;
  notInLibrary: number;
}): string | null {
  if (skipped <= 0) return null;
  const outside = Math.min(Math.max(0, notInLibrary), skipped);
  const noClips = skipped - outside;
  if (playable <= 0) {
    if (noClips === 0) return 'Aún no están en la biblioteca: añádelas y guarda clips para jugarlas.';
    if (outside === 0) return 'Ninguna tiene clips todavía: guarda alguno en el estudio para jugarla.';
    return 'Ninguna se puede jugar: unas aún no están en la biblioteca y otras no tienen clips.';
  }
  const parts: string[] = [];
  if (outside) parts.push(outside === 1 ? 'Una aún no está en la biblioteca' : `${outside} aún no están en la biblioteca`);
  if (noClips) {
    const text = noClips === 1 ? 'una no tiene clips' : `${noClips} no tienen clips`;
    parts.push(parts.length ? text : text.charAt(0).toUpperCase() + text.slice(1));
  }
  return `${parts.join(' y ')}: ${skipped === 1 ? 'se queda' : 'se quedan'} fuera de la ronda.`;
}
