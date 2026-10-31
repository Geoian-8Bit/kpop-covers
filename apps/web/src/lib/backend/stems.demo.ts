import { videosBucketHasRoom } from '@/features/studio/cloudSpace';
import { demoCloudBytes, demoCloudUrl, saveDemoCloudFile } from '../localVideos';
import { demoError, isLive, mutate, now, query, readDb } from './demoDb';
import type { DemoDb } from './demoDb';
import type { StemsBackend, VideoStems } from './types';

// Demo twin: the same rules (group from the video, never born with files, both paths at once and only once, files
// under the row's folder and ≤ 16 MiB, deleting archives); the files go to the demo's pretend cloud.

type StemsDemoDb = DemoDb & { video_stems?: VideoStems[] };
const STEM_FILE_CAP = 16 * 1024 * 1024;

export const demoStems: StemsBackend = {
  listStems: (videoId) =>
    query((raw) => {
      const db = raw as StemsDemoDb;
      if (!db.videos.some((v) => v.id === videoId)) return [];
      return (db.video_stems ?? [])
        .filter((s) => s.video_id === videoId && isLive(s))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
    }),
  insertStems: async (row) =>
    mutate((raw) => {
      const db = raw as StemsDemoDb;
      const video = db.videos.find((v) => v.id === row.video_id);
      if (!video) throw demoError(`video ${row.video_id} not found`);
      const rows = (db.video_stems ??= []);
      if (rows.filter(isLive).length >= 300) throw demoError('video_stems_cap_reached');
      const stems: VideoStems = {
        ...row,
        crew_id: video.crew_id,
        member_id:
          row.member_id && (db.members ?? []).some((m) => m.id === row.member_id && m.archived_at == null)
            ? row.member_id
            : null,
        vocals_path: null,
        instrumental_path: null,
        vocals_size: null,
        instrumental_size: null,
        created_at: now(),
        archived_at: null,
      };
      rows.push(stems);
      return stems;
    }),
  // Same order as `stem_object_allowed` and then the unique name: a live row with no tracks yet, no second copy of
  // this kind under another extension, then «already there» (409) before the room check, then the room.
  uploadStemFile: async (path, file) => {
    const parts = /^([0-9a-f-]{36})\/stems\/([0-9a-f-]{36})\/(vocals|instrumental)\.(m4a|mp4|webm|ogg)$/.exec(
      path,
    );
    if (!parts) return { ok: false, reason: 'denied' };
    const [, crewId, rowId, kind, ext] = parts;
    const db = readDb() as StemsDemoDb;
    const row = db.video_stems?.find((s) => s.id === rowId && isLive(s) && s.crew_id === crewId);
    // (The demo removes a deleted video outright.)
    if (!row || !db.videos.some((v) => v.id === row.video_id) || row.vocals_path || row.instrumental_path) {
      return { ok: false, reason: 'denied' };
    }
    const dir = `${crewId}/stems/${rowId}`;
    const stored = async (k: string) => {
      for (const e of ['m4a', 'mp4', 'webm', 'ogg'])
        if ((await demoCloudUrl(`${dir}/${k}.${e}`)) != null) return e;
      return null;
    };
    const sameKind = await stored(kind);
    if (sameKind != null && sameKind !== ext) return { ok: false, reason: 'denied' };
    if (sameKind === ext) return { ok: false, reason: 'exists' };
    // The database's room rule: the tracks still missing (16 MiB each) and 50 MB left for one take.
    const missing = (await stored(kind === 'vocals' ? 'instrumental' : 'vocals')) != null ? 1 : 2;
    const takes = (readDb().takes ?? []).reduce((s, t) => s + (t.shared_size ?? 0), 0);
    if (!videosBucketHasRoom(takes + (await demoCloudBytes()), missing * STEM_FILE_CAP))
      return { ok: false, reason: 'denied' };
    return (await saveDemoCloudFile(path, file)) ? { ok: true, path } : { ok: false, reason: 'denied' };
  },
  completeStems: async (id, paths) => {
    const sizes = await Promise.all(
      [paths.vocals_path, paths.instrumental_path].map(async (p) => {
        const url = await demoCloudUrl(p);
        return url ? (await fetch(url).then((r) => r.blob())).size : null;
      }),
    );
    return mutate((raw) => {
      const db = raw as StemsDemoDb;
      const stems = db.video_stems?.find((s) => s.id === id && isLive(s));
      if (!stems) throw demoError('PGRST116 0 rows');
      if (stems.vocals_path || stems.instrumental_path) throw demoError('stems_locked');
      const own = (p: string, kind: string) =>
        new RegExp(`^${stems.crew_id}/stems/${stems.id}/${kind}\\.(m4a|mp4|webm|ogg)$`).test(p);
      if (!own(paths.vocals_path, 'vocals') || !own(paths.instrumental_path, 'instrumental')) {
        throw demoError(
          'new row for relation "video_stems" violates check constraint "video_stems_vocals_path_own"',
          '23514',
        );
      }
      const [vocals, instrumental] = sizes;
      if (vocals == null || instrumental == null) throw demoError('stems_file_missing');
      if (vocals > STEM_FILE_CAP || instrumental > STEM_FILE_CAP) throw demoError('stems_too_big');
      Object.assign(stems, paths, {
        vocals_size: Math.max(1, vocals),
        instrumental_size: Math.max(1, instrumental),
      });
      return stems;
    });
  },
  deleteStems: async (id) =>
    mutate((raw) => {
      const stems = (raw as StemsDemoDb).video_stems?.find((s) => s.id === id && isLive(s));
      if (stems) stems.archived_at = now();
    }),
  signedStemUrl: (path) => demoCloudUrl(path),
};
