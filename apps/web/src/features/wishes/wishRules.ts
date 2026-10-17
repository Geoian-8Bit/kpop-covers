import { parseYouTubeId, type Wish, type WishDifficulty } from '@coverscape/shared';

/** F12 · pure rules of the wish list (`wishRules.test.ts`): the pasted link, the order by interest, the copy. */

export const DIFFICULTY_COPY: Record<WishDifficulty, { label: string }> = {
  facil: { label: 'Fácil' },
  media: { label: 'Media' },
  dificil: { label: 'Difícil' },
};

export type LinkCheck =
  | { ok: true; youtubeId: string }
  | { ok: false; reason: 'empty' | 'not-youtube' | 'duplicate' | 'in-library' };

/** Where a YouTube video already is for the group: nowhere yet, in the live wish list, or in the library. */
export type SongStatus = 'new' | 'duplicate' | 'in-library';

export function songStatus(
  youtubeId: string,
  liveWishes: Pick<Wish, 'youtube_id'>[],
  libraryYoutubeIds: Iterable<string | null> = [],
): SongStatus {
  if (liveWishes.some((w) => w.youtube_id === youtubeId)) return 'duplicate';
  for (const id of libraryYoutubeIds) if (id === youtubeId) return 'in-library';
  return 'new';
}

/** The note on a search result (35): proposing it again or wishing for a library video is refused. */
export const SONG_BADGE: Record<Exclude<SongStatus, 'new'>, string> = {
  duplicate: 'Ya propuesta',
  'in-library': 'Ya en la biblioteca',
};

/**
 * A wish is proposed by pasting a YouTube link (or a bare id) or by picking a search hit. Refused: empty, not
 * YouTube, already in the live list (the database refuses it too), already in the library (no need to wish for it).
 */
export function checkWishLink(
  input: string,
  liveWishes: Pick<Wish, 'youtube_id'>[],
  libraryYoutubeIds: Iterable<string | null> = [],
): LinkCheck {
  if (!input.trim()) return { ok: false, reason: 'empty' };
  const youtubeId = parseYouTubeId(input);
  if (!youtubeId) return { ok: false, reason: 'not-youtube' };
  const status = songStatus(youtubeId, liveWishes, libraryYoutubeIds);
  return status === 'new' ? { ok: true, youtubeId } : { ok: false, reason: status };
}

export const LINK_PROBLEM: Record<Exclude<LinkCheck, { ok: true }>['reason'], string> = {
  empty: 'Pega el enlace del vídeo de YouTube.',
  'not-youtube': 'No reconocemos ese enlace de YouTube.',
  duplicate: 'Esa canción ya está en la lista de deseos.',
  'in-library': 'Ese vídeo ya está en la biblioteca.',
};

/** The live list: not archived (RLS hides those) and not yet passed to the library. */
export function liveWishes<T extends Pick<Wish, 'added_video_id'>>(wishes: T[]): T[] {
  return wishes.filter((w) => w.added_video_id == null);
}

/** Most «Me apunto» first; equal interest: the newest proposal first. */
export function sortByInterest<T extends Pick<Wish, 'id' | 'created_at'>>(
  wishes: T[],
  interestOf: (wishId: string) => number,
): T[] {
  return wishes
    .slice()
    .sort((a, b) => interestOf(b.id) - interestOf(a.id) || b.created_at.localeCompare(a.created_at));
}

/** Who said «Me apunto» to each wish (member ids, in the order they did). */
export function interestByWish(rows: { wish_id: string; member_id: string; created_at: string }[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows.slice().sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const list = map.get(row.wish_id) ?? [];
    if (!list.includes(row.member_id)) list.push(row.member_id);
    map.set(row.wish_id, list);
  }
  return map;
}

/** «5 miembros» for the original group's line-up. */
export function membersLabel(count: number | null): string | null {
  if (count == null) return null;
  return `${count} ${count === 1 ? 'miembro' : 'miembros'}`;
}

/** Optional numbers typed in the form: empty = null; outside 1–30 = invalid (the database's check). */
export function parseMembersCount(raw: string): number | null | 'invalid' {
  const clean = raw.trim();
  if (!clean) return null;
  const n = Number(clean);
  if (!Number.isInteger(n) || n < 1 || n > 30) return 'invalid';
  return n;
}

/** 37 · The action bar of «Elegir para votar»: a vote needs two candidates or more. */
export function selectionHint(count: number): string {
  if (count <= 0) return 'Marca dos o más canciones';
  if (count === 1) return '1 elegida · falta otra';
  return `${count} elegidas`;
}
