import type { Clip, Member, Take, Video } from '@coverscape/shared';
import { TAKE_BUCKET, VIDEO_BUCKET, supabase } from '../supabase';
import { must } from './shared';
import type { Backend, ClipWithVideo, VideoWithClipCount } from './types';
import { isDuplicate, uploadFailure, uploadWithProgress } from './upload';

/** Only what the library cards and the add dialog read (file_name: «con archivo», F1); no audit columns. */
const LIBRARY_COLUMNS =
  'id, crew_id, title, artist, source, youtube_id, thumbnail_url, duration_seconds, created_at, file_name, aspect_ratio';

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
  async getVideo(id) {
    const data = must(await supabase.from('videos').select('*').eq('id', id).maybeSingle());
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
    return must(await supabase.from('notes').select('*').eq('video_id', videoId).order('at_seconds'));
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
  async uploadFile(path, file, options) {
    if (options?.onProgress || options?.signal) return uploadWithProgress(VIDEO_BUCKET, path, file, options);
    // No upsert: overwriting needs an UPDATE grant the bucket doesn't give, and the name is already unique.
    const { error } = await supabase.storage
      .from(VIDEO_BUCKET)
      .upload(path, file, { contentType: file.type || 'video/mp4' });
    if (!error) return { ok: true, path };
    console.error('[uploadFile]', error);
    // 409: the file is already there (an earlier try got through; the row just didn't get its path).
    if (isDuplicate(error)) return { ok: false, reason: 'exists' };
    return { ok: false, reason: uploadFailure(error) };
  },
  async signedUrl(path) {
    const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(path, 6 * 60 * 60);
    return error ? null : data.signedUrl;
  },
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
  async uploadTakeFile(path, file) {
    const { error } = await supabase.storage
      .from(TAKE_BUCKET)
      .upload(path, file, { contentType: file.type || 'video/mp4' });
    if (!error) return { ok: true, path };
    console.error('[uploadTakeFile]', error);
    const e = error as { status?: number; statusCode?: string; message?: string };
    if (Number(e.status ?? e.statusCode) === 409 || /already exists|duplicate/i.test(e.message ?? '')) {
      return { ok: false, reason: 'exists' };
    }
    return { ok: false, reason: uploadFailure(error) };
  },
  async signedTakeUrl(path) {
    const { data, error } = await supabase.storage.from(TAKE_BUCKET).createSignedUrl(path, 6 * 60 * 60);
    return error ? null : data.signedUrl;
  },
  async storageUsage() {
    const data = must(await supabase.rpc('storage_usage'));
    const usage = (data ?? {}) as { takes?: number; total?: number };
    return { takes: Number(usage.takes) || 0, total: Number(usage.total) || 0 };
  },
};
