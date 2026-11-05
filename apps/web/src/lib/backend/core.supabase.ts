import type { Clip, Member, Take, Video } from '@coverscape/shared';
import { TAKE_BUCKET, VIDEO_BUCKET, supabase, withStorage } from '../supabase';
import { must } from './shared';
import { SIGN_SECONDS, memoSigned } from './signedUrls';
import type {
  Backend,
  ClipWithVideo,
  UploadOptions,
  UploadResult,
  VideoPoster,
  VideoPosterRev,
  VideoWithClipCount,
} from './types';
import { isDuplicate, uploadFailure, uploadWithProgress } from './upload';
import { uploadWithRetry } from './uploadRetry';

/**
 * Only what the library cards and the add dialog read (file_name: «con archivo», F1); no audit columns.
 * REQ-14 · No inline poster (`list_thumbnail_url` is null for one; the poster query brings it, combined by id).
 * REQ-16 · Plus the file's small columns (~150 B a row), so the studio opens an uploaded video from this row.
 */
const LIBRARY_COLUMNS =
  'id, crew_id, title, artist, source, youtube_id, thumbnail_url:list_thumbnail_url, poster_inline, poster_rev, ' +
  'duration_seconds, created_at, file_name, aspect_ratio, storage_path, file_size, file_offset_seconds, ' +
  'file_duration_seconds, updated_at';

/**
 * REQ-16 · The full row, column by column (a new column never travels by surprise). REQ-14 · Without the inline
 * poster (`thumbnail_url` is `list_thumbnail_url`, as in the list): nothing that reads this row (`getVideo`: the
 * studio, the file checks) shows it; cards and joined rows combine it from the poster query. Writes still answer
 * with the whole row, so the poster map follows them (`rememberPoster`).
 */
const VIDEO_COLUMNS =
  'id, crew_id, title, artist, source, youtube_id, thumbnail_url:list_thumbnail_url, list_thumbnail_url, ' +
  'poster_inline, poster_rev, duration_seconds, created_at, created_by, updated_at, archived_at, file_name, ' +
  'file_size, storage_path, file_offset_seconds, file_duration_seconds, aspect_ratio';

/** REQ-17 · A note as listed: everything but the drawing (`has_sketch` says whether it has one). */
// One literal (not joined) so postgrest-js can type the row from it.
const NOTE_LIST_COLUMNS =
  'id, crew_id, video_id, at_seconds, body, author_member_id, take_id, take_seconds, category, for_member_id, status, has_sketch, created_at, created_by, updated_at, archived_at';

/** REQ-15 · One signature per file and window: the same URL keeps the browser's HTTP cache of the file usable. */
async function signed(bucket: string, path: string): Promise<string | null> {
  try {
    return await memoSigned(`${bucket}/${path}`, async () => {
      const { data, error } = await withStorage((storage) =>
        storage.from(bucket).createSignedUrl(path, SIGN_SECONDS),
      );
      if (error) throw error;
      return { url: data.signedUrl, expiresAt: Date.now() + SIGN_SECONDS * 1000 };
    });
  } catch {
    return null;
  }
}

/** New files are never overwritten (each name is unique), so they can be cached for a year (REQ-15). */
const CACHE_SECONDS = '31536000';

/** One try of a video file upload (uploadFile retries it). */
async function uploadVideoOnce(path: string, file: File, options?: UploadOptions): Promise<UploadResult> {
  if (options?.onProgress || options?.signal) return uploadWithProgress(VIDEO_BUCKET, path, file, options);
  // No upsert: overwriting needs an UPDATE grant the bucket doesn't give, and the name is already unique.
  const { error } = await withStorage((storage) =>
    storage
      .from(VIDEO_BUCKET)
      .upload(path, file, { contentType: file.type || 'video/mp4', cacheControl: CACHE_SECONDS }),
  );
  if (!error) return { ok: true, path };
  console.error('[uploadFile]', error);
  // 409: the file is already there (an earlier try got through; the row just didn't get its path).
  if (isDuplicate(error)) return { ok: false, reason: 'exists' };
  return { ok: false, reason: uploadFailure(error) };
}

/** One try of a shared take's upload (uploadTakeFile retries it). */
async function uploadTakeOnce(path: string, file: Blob): Promise<UploadResult> {
  const { error } = await withStorage((storage) =>
    storage
      .from(TAKE_BUCKET)
      .upload(path, file, { contentType: file.type || 'video/mp4', cacheControl: CACHE_SECONDS }),
  );
  if (!error) return { ok: true, path };
  console.error('[uploadTakeFile]', error);
  if (isDuplicate(error)) return { ok: false, reason: 'exists' };
  return { ok: false, reason: uploadFailure(error) };
}

/** Poor 4G · Size of the file already at the name (null: none, or it can't be read), for a retried upload's check. */
async function storedBytes(bucket: string, path: string): Promise<number | null> {
  const { data, error } = await withStorage((storage) => storage.from(bucket).info(path));
  const size = error ? null : data?.size;
  return typeof size === 'number' ? size : null;
}

export const supabaseBackend: Backend = {
  async joinGroup() {
    // Open access: the shared group is the oldest crew; readable without a session.
    return must(await supabase.from('crews').select('*').order('created_at').limit(1).single());
  },
  async getProfile(userId) {
    return must(await supabase.from('profiles').select('*').eq('id', userId).maybeSingle());
  },
  async listVideos(crewId) {
    const data = must(
      await supabase
        .from('videos')
        .select(`${LIBRARY_COLUMNS}, clips(count)`)
        .eq('crew_id', crewId)
        .order('created_at', { ascending: false }),
    );
    return data as VideoWithClipCount[];
  },
  async listPosterRevs(crewId) {
    const data = must(
      await supabase.from('videos').select('id, poster_rev').eq('crew_id', crewId).eq('poster_inline', true),
    );
    return data.filter((r): r is VideoPosterRev => r.poster_rev != null);
  },
  async listPosters(ids) {
    // In batches of 100 ids, so a first visit to a big library never builds an over-long URL.
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) batches.push(ids.slice(i, i + 100));
    const answers = await Promise.all(
      batches.map(async (batch) =>
        must(
          await supabase
            .from('videos')
            .select('id, poster_rev, thumbnail_url')
            .in('id', batch)
            .eq('poster_inline', true),
        ),
      ),
    );
    return answers.flat().filter((r): r is VideoPoster => r.poster_rev != null && r.thumbnail_url != null);
  },
  async listCrewPosters(crewId) {
    const data = must(
      await supabase
        .from('videos')
        .select('id, poster_rev, thumbnail_url')
        .eq('crew_id', crewId)
        .eq('poster_inline', true),
    );
    return data.filter((r): r is VideoPoster => r.poster_rev != null && r.thumbnail_url != null);
  },
  async getVideo(id) {
    const data = must(await supabase.from('videos').select(VIDEO_COLUMNS).eq('id', id).maybeSingle());
    return data as Video | null;
  },
  async insertVideo(row) {
    const data = must(await supabase.from('videos').insert(row).select().single());
    return data as Video;
  },
  async updateVideo(id, patch) {
    const data = must(await supabase.from('videos').update(patch).eq('id', id).select().single());
    return data as Video;
  },
  async deleteVideo(video) {
    must(await supabase.from('videos').delete().eq('id', video.id));
  },
  async listClips(videoId) {
    const data = must(
      await supabase.from('clips').select('*').eq('video_id', videoId).order('start_seconds'),
    );
    return data as Clip[];
  },
  async listQuickClips(crewId) {
    const data = must(
      await supabase
        .from('clips')
        .select('*, video:videos(id, title, artist, source, youtube_id)')
        .eq('crew_id', crewId)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(14),
    );
    return data as ClipWithVideo[];
  },
  async insertClip(row) {
    const data = must(await supabase.from('clips').insert(row).select().single());
    return data as Clip;
  },
  async updateClip(id, patch) {
    const data = must(await supabase.from('clips').update(patch).eq('id', id).select().single());
    return data as Clip;
  },
  async deleteClip(id) {
    must(await supabase.from('clips').delete().eq('id', id));
  },
  async listNotes(videoId) {
    return must(
      await supabase.from('notes').select(NOTE_LIST_COLUMNS).eq('video_id', videoId).order('at_seconds'),
    );
  },
  async listNoteSketches(videoId) {
    const data = must(
      await supabase.from('notes').select('id, sketch').eq('video_id', videoId).eq('has_sketch', true),
    );
    return data.filter((r): r is { id: string; sketch: string } => r.sketch != null);
  },
  async insertNote(row) {
    return must(await supabase.from('notes').insert(row).select().single());
  },
  async updateNote(id, patch) {
    return must(await supabase.from('notes').update(patch).eq('id', id).select().single());
  },
  async deleteNote(id) {
    must(await supabase.from('notes').delete().eq('id', id));
  },
  uploadFile: (path, file, options) =>
    // Poor 4G · Tried again silently after a failure that can fix itself (uploadRetry.ts).
    uploadWithRetry(() => uploadVideoOnce(path, file, options), {
      path,
      bytes: file.size,
      signal: options?.signal,
      onRetry: options?.onRetry,
      storedBytes: () => storedBytes(VIDEO_BUCKET, path),
    }),
  signedUrl: (path) => signed(VIDEO_BUCKET, path),
  async listMembers() {
    const data = must(await supabase.from('members').select('*').order('created_at'));
    return data as Member[];
  },
  async insertMember(row) {
    // crew_id is set by the database (the default group); the client's value is ignored.
    const data = must(
      await supabase
        .from('members')
        .insert({ ...row, name: row.name.trim() })
        .select()
        .single(),
    );
    return data as Member;
  },
  async updateMember(id, patch) {
    const clean = { ...patch, ...(patch.name != null ? { name: patch.name.trim() } : {}) };
    const data = must(await supabase.from('members').update(clean).eq('id', id).select().single());
    return data as Member;
  },
  async deleteMember(id) {
    must(await supabase.from('members').delete().eq('id', id));
  },
  async listTakes(videoId) {
    const data = must(
      await supabase
        .from('takes')
        .select('*')
        .eq('video_id', videoId)
        .order('recorded_at', { ascending: false }),
    );
    return data as Take[];
  },
  async insertTake(row) {
    const data = must(await supabase.from('takes').insert(row).select().single());
    return data as Take;
  },
  async getTake(id) {
    const data = must(await supabase.from('takes').select('*').eq('id', id).maybeSingle());
    return (data as Take | null) ?? null;
  },
  async updateTake(id, patch) {
    const data = must(await supabase.from('takes').update(patch).eq('id', id).select().single());
    return data as Take;
  },
  async deleteTake(id) {
    must(await supabase.from('takes').delete().eq('id', id));
  },
  uploadTakeFile: (path, file, options) =>
    uploadWithRetry(() => uploadTakeOnce(path, file), {
      path,
      bytes: file.size,
      signal: options?.signal,
      storedBytes: () => storedBytes(TAKE_BUCKET, path),
    }),
  signedTakeUrl: (path) => signed(TAKE_BUCKET, path),
  async storageUsage() {
    const data = must(await supabase.rpc('storage_usage'));
    const usage = (data ?? {}) as { takes?: number; total?: number };
    return { takes: Number(usage.takes) || 0, total: Number(usage.total) || 0 };
  },
};
