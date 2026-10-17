import type { Crew, Video } from '@coverscape/shared';
import type { ClipWithVideo, EventWithCount, VideoWithClipCount } from './backend';

/**
 * P2 · Last good answer of a few startup lists (the group, the library, quick access, events), kept on this device
 * so a repeat visit paints at once while the real request runs behind it. Only for showing: a snapshot is never
 * the cache (queries take it as `placeholderData`, or as `initialData` that is refetched at once), so no write
 * ever starts from it. Everything read back is checked field by field; anything odd is dropped.
 */

/** Above this a snapshot isn't kept (and the old one goes): localStorage is small and synchronous. */
export const SNAPSHOT_MAX_CHARS = 120_000;
const PREFIX = 'oneshoot.snap.v1.';

type SnapshotStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStore(): SnapshotStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // blocked storage (private mode, sandboxed frames)
  }
}

export function readSnapshot<T>(
  name: string,
  parse: (value: unknown) => T | null,
  store: SnapshotStore | null = defaultStore(),
): T | undefined {
  if (!store) return undefined;
  try {
    const raw = store.getItem(PREFIX + name);
    if (raw == null) return undefined;
    return parse(JSON.parse(raw)) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Keeps `value` under `name`; a value too big (or not storable) removes the old snapshot instead. */
export function writeSnapshot(
  name: string,
  value: unknown,
  store: SnapshotStore | null = defaultStore(),
  maxChars: number = SNAPSHOT_MAX_CHARS,
): boolean {
  if (!store) return false;
  try {
    const raw = JSON.stringify(value);
    if (raw.length > maxChars) {
      store.removeItem(PREFIX + name);
      return false;
    }
    store.setItem(PREFIX + name, raw);
    return true;
  } catch {
    try {
      store.removeItem(PREFIX + name);
    } catch {
      /* nothing to do */
    }
    return false;
  }
}

// ───────────── Field checks ─────────────

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === 'string';
const strOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown): v is number | null => v === null || num(v);

/** Each row checked by `row`; one bad row drops the whole list (a half list would look like deletions). */
function listOf<T>(value: unknown, row: (v: unknown) => T | null, max: number): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const out: T[] = [];
  for (const v of value) {
    const r = row(v);
    if (!r) return null;
    out.push(r);
  }
  return out;
}

// ───────────── The group ─────────────

/** What is kept of the group: no invite code (nothing reads it, and it needn't sit in storage). */
export function crewSnapshot(crew: Crew): Crew {
  return { id: crew.id, name: crew.name, created_at: crew.created_at, created_by: crew.created_by, invite_code: '' };
}

export function parseCrew(value: unknown): Crew | null {
  if (!isRow(value) || !str(value.id) || !value.id || !str(value.name) || !str(value.created_at)) return null;
  if (!strOrNull(value.created_by ?? null)) return null;
  return {
    id: value.id,
    name: value.name,
    created_at: value.created_at,
    created_by: (value.created_by as string | null | undefined) ?? null,
    invite_code: '',
  };
}

// ───────────── The library ─────────────

/** An uploaded video's poster is an inline data URL (tens of kB each): the snapshot leaves it out. */
export function stripInlineThumbnail(url: string | null | undefined): string | null {
  return url && !url.startsWith('data:') ? url : null;
}

/** The library list as kept: only the card's columns, no inline posters. */
export function libraryRowsSnapshot(list: readonly VideoWithClipCount[]): VideoWithClipCount[] {
  return list.map((v) => ({
    id: v.id,
    crew_id: v.crew_id,
    title: v.title,
    artist: v.artist,
    source: v.source,
    youtube_id: v.youtube_id,
    thumbnail_url: stripInlineThumbnail(v.thumbnail_url),
    duration_seconds: v.duration_seconds,
    created_at: v.created_at,
    file_name: v.file_name,
    clips: [{ count: num(v.clips?.[0]?.count) ? v.clips[0]!.count : 0 }],
  }));
}

function libraryRow(v: unknown): VideoWithClipCount | null {
  if (!isRow(v)) return null;
  const { id, crew_id, title, artist, source, youtube_id, thumbnail_url, duration_seconds, created_at, file_name, clips } = v;
  if (!str(id) || !str(crew_id) || !str(title) || !str(created_at)) return null;
  if (source !== 'youtube' && source !== 'upload') return null;
  if (!strOrNull(artist) || !strOrNull(youtube_id) || !strOrNull(thumbnail_url) || !strOrNull(file_name)) return null;
  if (!numOrNull(duration_seconds)) return null;
  const count = Array.isArray(clips) && isRow(clips[0]) && num(clips[0].count) ? clips[0].count : 0;
  return {
    id,
    crew_id,
    title,
    artist,
    source,
    youtube_id,
    thumbnail_url: stripInlineThumbnail(thumbnail_url),
    duration_seconds,
    created_at,
    file_name,
    clips: [{ count }],
  };
}

/** The kept library of `crewId` (rows of another group are refused). */
export function parseLibrary(value: unknown, crewId: string): VideoWithClipCount[] | null {
  const list = listOf(value, libraryRow, 2000);
  return list && list.every((v) => v.crew_id === crewId) ? list : null;
}

/**
 * P3 · What the studio needs before its first paint, from the library's row: only for a YouTube entry with no
 * linked file (the list has no file columns; with no file they are all empty). Anything else waits for the row.
 */
export function videoFromLibraryRow(row: VideoWithClipCount | undefined): Video | undefined {
  if (!row || row.source !== 'youtube' || !row.youtube_id || row.file_name) return undefined;
  return {
    id: row.id,
    crew_id: row.crew_id,
    title: row.title,
    artist: row.artist,
    source: row.source,
    youtube_id: row.youtube_id,
    thumbnail_url: row.thumbnail_url,
    duration_seconds: row.duration_seconds,
    created_at: row.created_at,
    file_name: null,
    file_size: null,
    file_duration_seconds: null,
    file_offset_seconds: null,
    storage_path: null,
    archived_at: null,
    created_by: null,
    updated_at: row.created_at,
  };
}

// ───────────── Quick access ─────────────

function quickClip(v: unknown): ClipWithVideo | null {
  if (!isRow(v)) return null;
  if (!str(v.id) || !str(v.crew_id) || !str(v.video_id) || !str(v.name) || !str(v.color) || !str(v.created_at)) return null;
  if (!num(v.start_seconds) || !num(v.end_seconds) || !num(v.speed)) return null;
  if (typeof v.mirrored !== 'boolean' || typeof v.is_pinned !== 'boolean') return null;
  const video = v.video;
  if (video !== null && !(isRow(video) && str(video.id) && str(video.title) && str(video.source))) return null;
  return v as unknown as ClipWithVideo;
}

export function parseQuickClips(value: unknown, crewId: string): ClipWithVideo[] | null {
  const list = listOf(value, quickClip, 50);
  return list && list.every((c) => c.crew_id === crewId) ? list : null;
}

// ───────────── Events ─────────────

function eventRow(v: unknown): EventWithCount | null {
  if (!isRow(v)) return null;
  if (!str(v.id) || !str(v.crew_id) || !str(v.name) || !str(v.starts_at) || !str(v.created_at)) return null;
  if (!strOrNull(v.place) || !strOrNull(v.archived_at ?? null) || !num(v.songs)) return null;
  return {
    id: v.id,
    crew_id: v.crew_id,
    name: v.name,
    place: v.place,
    starts_at: v.starts_at,
    created_at: v.created_at,
    archived_at: (v.archived_at as string | null | undefined) ?? null,
    songs: v.songs,
  };
}

export function parseEvents(value: unknown): EventWithCount[] | null {
  return listOf(value, eventRow, 500);
}
