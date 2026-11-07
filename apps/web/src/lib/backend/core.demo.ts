import { videosBucketHasRoom } from '@/features/studio/cloudSpace';
import type { Clip, Member, Note, Take, Video } from '@coverscape/shared';
import { demoCloudBytes, demoCloudUrl, saveDemoCloudFile } from '../localVideos';
import { mutate, now, query, readDb } from './demoDb';
import type { DemoDb } from './demoDb';
import { DEMO_USER_ID, cloudLimitBytes } from './mode';
import type { Backend, ListedNote } from './types';

/**
 * REQ-14 · Demo twin of the generated poster columns (the database's `md5` is a revision only: any stable hash of
 * the data URL serves, so a 53-bit string hash stands in for it).
 */
function posterRev(url: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** The row as the database answers it, with its generated columns (kept rows predate them). */
export function withGenerated(v: Video): Video {
  const inline = v.thumbnail_url?.startsWith('data:') ?? false;
  return {
    ...v,
    poster_inline: inline,
    list_thumbnail_url: inline ? null : v.thumbnail_url,
    poster_rev: inline ? posterRev(v.thumbnail_url!) : null,
  };
}

/** REQ-17 · Demo twin of `notes.has_sketch`. */
const noteRow = (n: Note): Note => ({ ...n, has_sketch: n.sketch != null });

/** REQ-17 · A note as listed: no drawing. */
function listedNote(n: Note): ListedNote {
  const { sketch: _sketch, ...rest } = noteRow(n);
  return rest;
}

export const demoBackend: Backend = {
  joinGroup: () => query((db) => db.crews[0]!),
  getProfile: (userId) => query((db) => db.profiles.find((p) => p.id === userId) ?? null),
  listVideos: (crewId) =>
    query((db) =>
      db.videos
        .filter((v) => v.crew_id === crewId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((v) => {
          // REQ-14 · Same columns as the real list: the inline poster stays out (`thumbnail_url:list_thumbnail_url`).
          const row = withGenerated(v);
          return {
            id: row.id,
            crew_id: row.crew_id,
            title: row.title,
            artist: row.artist,
            source: row.source,
            youtube_id: row.youtube_id,
            thumbnail_url: row.list_thumbnail_url,
            poster_inline: row.poster_inline,
            poster_rev: row.poster_rev,
            duration_seconds: row.duration_seconds,
            created_at: row.created_at,
            file_name: row.file_name,
            aspect_ratio: row.aspect_ratio ?? null,
            storage_path: row.storage_path,
            file_size: row.file_size,
            file_offset_seconds: row.file_offset_seconds ?? null,
            file_duration_seconds: row.file_duration_seconds ?? null,
            updated_at: row.updated_at,
            clips: [{ count: db.clips.filter((c) => c.video_id === v.id).length }],
          };
        }),
    ),
  listPosterRevs: (crewId) =>
    query((db) =>
      db.videos
        .filter((v) => v.crew_id === crewId)
        .map(withGenerated)
        .filter((v) => v.poster_inline && v.poster_rev)
        .map((v) => ({ id: v.id, poster_rev: v.poster_rev! })),
    ),
  listPosters: (ids) =>
    query((db) =>
      db.videos
        .filter((v) => ids.includes(v.id))
        .map(withGenerated)
        .filter((v) => v.poster_inline && v.poster_rev && v.thumbnail_url)
        .map((v) => ({ id: v.id, poster_rev: v.poster_rev!, thumbnail_url: v.thumbnail_url! })),
    ),
  listCrewPosters: (crewId) =>
    query((db) =>
      db.videos
        .filter((v) => v.crew_id === crewId)
        .map(withGenerated)
        .filter((v) => v.poster_inline && v.poster_rev && v.thumbnail_url)
        .map((v) => ({ id: v.id, poster_rev: v.poster_rev!, thumbnail_url: v.thumbnail_url! })),
    ),
  getVideo: (id) =>
    query((db) => {
      const video = db.videos.find((v) => v.id === id);
      if (!video) return null;
      // REQ-14 · As the real `getVideo`: the row without its inline poster (`thumbnail_url:list_thumbnail_url`).
      const row = withGenerated(video);
      return { ...row, thumbnail_url: row.list_thumbnail_url };
    }),
  insertVideo: (row) =>
    mutate((db) => {
      const video = {
        artist: null,
        storage_path: null,
        file_name: null,
        file_size: null,
        duration_seconds: null,
        thumbnail_url: null,
        youtube_id: null,
        aspect_ratio: null,
        created_by: DEMO_USER_ID,
        archived_at: null,
        created_at: now(),
        updated_at: now(),
        ...row,
      } as Video;
      db.videos.push(video);
      return withGenerated(video);
    }),
  updateVideo: (id, patch) =>
    mutate((db) => {
      const video = db.videos.find((v) => v.id === id);
      if (!video) throw new Error('not found');
      Object.assign(video, patch, { updated_at: now() });
      return withGenerated(video);
    }),
  deleteVideo: (video) =>
    mutate((db) => {
      db.videos = db.videos.filter((v) => v.id !== video.id);
      db.clips = db.clips.filter((c) => c.video_id !== video.id);
      db.notes = (db.notes ?? []).filter((n) => n.video_id !== video.id);
    }),
  listClips: (videoId) =>
    query((db) =>
      db.clips.filter((c) => c.video_id === videoId).sort((a, b) => a.start_seconds - b.start_seconds),
    ),
  listQuickClips: (crewId) =>
    query((db) =>
      db.clips
        .filter((c) => c.crew_id === crewId)
        .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || b.created_at.localeCompare(a.created_at))
        .slice(0, 14)
        .map((c) => {
          const v = db.videos.find((x) => x.id === c.video_id);
          return {
            ...c,
            video: v
              ? { id: v.id, title: v.title, artist: v.artist, source: v.source, youtube_id: v.youtube_id }
              : null,
          };
        }),
    ),
  insertClip: (row) =>
    mutate((db) => {
      const video = db.videos.find((v) => v.id === row.video_id);
      const clip = {
        id: crypto.randomUUID(),
        speed: 1,
        mirrored: true,
        color: 'wine',
        is_pinned: false,
        created_by: DEMO_USER_ID,
        archived_at: null,
        created_at: now(),
        // F9 · Same defaults as the database: no zoom.
        zoom_scale: 1,
        zoom_x: 0.5,
        zoom_y: 0.5,
        ...row,
        crew_id: video?.crew_id ?? row.crew_id,
      } as Clip;
      db.clips.push(clip);
      return clip;
    }),
  updateClip: (id, patch) =>
    mutate((db) => {
      const clip = db.clips.find((c) => c.id === id);
      if (!clip) throw new Error('not found');
      Object.assign(clip, patch);
      return clip;
    }),
  deleteClip: (id) =>
    mutate((db) => {
      db.clips = db.clips.filter((c) => c.id !== id);
    }),
  listNotes: (videoId) =>
    query((db) =>
      (db.notes ?? [])
        .filter((n) => n.video_id === videoId)
        .sort((a, b) => a.at_seconds - b.at_seconds)
        .map(listedNote),
    ),
  listNoteSketches: (videoId) =>
    query((db) =>
      (db.notes ?? [])
        .filter((n) => n.video_id === videoId && n.sketch != null)
        .map((n) => ({ id: n.id, sketch: n.sketch! })),
    ),
  insertNote: (row) =>
    mutate((db) => {
      const video = db.videos.find((v) => v.id === row.video_id);
      const note: Note = {
        id: crypto.randomUUID(),
        created_by: DEMO_USER_ID,
        archived_at: null,
        created_at: now(),
        updated_at: now(),
        take_id: null,
        take_seconds: null,
        category: null,
        for_member_id: null,
        status: 'open',
        sketch: null,
        has_sketch: false,
        ...row,
        author_member_id: row.author_member_id ?? null,
        crew_id: video?.crew_id ?? row.crew_id,
      };
      (db.notes ??= []).push(note);
      return noteRow(note);
    }),
  updateNote: (id, patch) =>
    mutate((db) => {
      const note = db.notes?.find((n) => n.id === id);
      if (!note) throw new Error('not found');
      Object.assign(note, patch, { updated_at: now() });
      return noteRow(note);
    }),
  deleteNote: (id) =>
    mutate((db) => {
      db.notes = (db.notes ?? []).filter((n) => n.id !== id);
    }),
  // 13 · A pretend cloud on this browser (IndexedDB), with the bucket's size limit, «never overwrite» and the
  // database's room rule (H1: the upload counts as the per-file limit and 50 MB stay free for one take).
  uploadFile: async (path, file, options) => {
    if (options?.signal?.aborted) throw new DOMException('Subida cancelada', 'AbortError');
    if (file.size > cloudLimitBytes()) return { ok: false, reason: 'too-big' };
    const db = readDb();
    const videoId = /\/([0-9a-f-]{36})(--[0-9a-z]+)?\.[A-Za-z0-9]+$/.exec(path)?.[1];
    const video = db.videos.find((v) => v.id === videoId);
    if (!video || (video.storage_path && video.storage_path !== path)) return { ok: false, reason: 'denied' };
    if ((await demoCloudUrl(path)) != null) return { ok: false, reason: 'exists' };
    if (video.storage_path) return { ok: false, reason: 'denied' };
    const takes = (db.takes ?? []).reduce((s, t) => s + (t.shared_size ?? 0), 0);
    if (!videosBucketHasRoom(takes + (await demoCloudBytes()), cloudLimitBytes()))
      return { ok: false, reason: 'denied' };
    const saved = await saveDemoCloudFile(path, file);
    if (saved) options?.onProgress?.(1);
    return saved ? { ok: true, path } : { ok: false, reason: 'denied' };
  },
  signedUrl: (path) => demoCloudUrl(path),
  listMembers: () =>
    query((db) => [...(db.members ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))),
  insertMember: (row) =>
    mutate((db) => {
      const name = row.name.trim();
      const members = (db.members ??= []);
      if (members.some((m) => m.name.trim().toLowerCase() === name.toLowerCase())) {
        throw Object.assign(
          new Error('duplicate key value violates unique constraint "members_crew_name_key"'),
          {
            code: '23505',
          },
        );
      }
      const member: Member = {
        id: row.id ?? crypto.randomUUID(),
        crew_id: db.crews[0]!.id,
        name,
        color: row.color,
        created_at: now(),
        archived_at: null,
      };
      members.push(member);
      return member;
    }),
  updateMember: (id, patch) =>
    mutate((db) => {
      const member = db.members?.find((m) => m.id === id);
      if (!member) throw new Error('not found');
      const name = patch.name?.trim();
      if (name != null && db.members!.some((m) => m.id !== id && m.name.trim().toLowerCase() === name.toLowerCase())) {
        throw Object.assign(new Error('duplicate key value violates unique constraint "members_crew_name_key"'), {
          code: '23505',
        });
      }
      Object.assign(member, patch, name != null ? { name } : {});
      return member;
    }),
  deleteMember: (id) =>
    mutate((db) => {
      db.members = (db.members ?? []).filter((m) => m.id !== id);
    }),
  listTakes: (videoId) =>
    query((db) =>
      (db.takes ?? [])
        .filter((t) => t.video_id === videoId)
        .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)),
    ),
  insertTake: (row) =>
    mutate((db) => {
      const video = db.videos.find((v) => v.id === row.video_id);
      if (!video) throw new Error('video not found');
      const take: Take = {
        clip_id: null,
        device_id: null,
        duration_seconds: 0,
        file_name: null,
        height: null,
        is_best: false,
        label: null,
        song_lead_seconds: 0,
        member_id: null,
        mime_type: null,
        mirrored: false,
        recorded_at: now(),
        song_end_seconds: null,
        speed: 1,
        width: null,
        sync_adjust_seconds: 0,
        fit_scale: 1,
        fit_x: 0,
        fit_y: 0,
        ...row,
        crew_id: video.crew_id,
        shared_path: null,
        shared_size: null,
        created_at: now(),
        archived_at: null,
      };
      (db.takes ??= []).push(take);
      if (take.is_best) clearOtherBest(db, take);
      return take;
    }),
  updateTake: (id, patch) =>
    mutate((db) => {
      const take = db.takes?.find((t) => t.id === id);
      if (!take) throw new Error('not found');
      Object.assign(take, patch);
      if (patch.is_best) clearOtherBest(db, take);
      return take;
    }),
  deleteTake: (id) =>
    mutate((db) => {
      db.takes = (db.takes ?? []).filter((t) => t.id !== id);
    }),
  uploadTakeFile: () => Promise.resolve({ ok: false, reason: 'unavailable' }),
  signedTakeUrl: () => Promise.resolve(null),
  getTake: (id) => query((db) => (db.takes ?? []).find((t) => t.id === id) ?? null),
  storageUsage: async () => {
    const takes = (readDb().takes ?? []).reduce((s, t) => s + (t.shared_size ?? 0), 0);
    // The pretend cloud's videos count too (13), as in the real one.
    return { takes, total: takes + (await demoCloudBytes()) };
  },
};

/** Demo twin of the database's one-best-take trigger (F4). */
function clearOtherBest(db: DemoDb, take: Take) {
  for (const t of db.takes ?? []) {
    if (
      t.id !== take.id &&
      t.video_id === take.video_id &&
      t.member_id === take.member_id &&
      t.clip_id === take.clip_id
    ) {
      t.is_best = false;
    }
  }
}
