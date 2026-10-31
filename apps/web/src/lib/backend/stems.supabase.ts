import { VIDEO_BUCKET, supabase } from '../supabase';
import { must } from './shared';
import type { StemsBackend } from './types';
import { uploadFailure } from './upload';

const STEM_COLUMNS =
  'id, crew_id, video_id, member_id, source_file_name, source_file_size, model, duration_seconds, delay_seconds, mime_type, vocals_path, instrumental_path, vocals_size, instrumental_size, created_at, archived_at';

export const supabaseStems: StemsBackend = {
  async listStems(videoId) {
    const data = must(
      await supabase
        .from('video_stems')
        .select(STEM_COLUMNS)
        .eq('video_id', videoId)
        .order('created_at', { ascending: false }),
    );
    return data;
  },
  async insertStems(row) {
    const data = must(await supabase.from('video_stems').insert(row).select(STEM_COLUMNS).single());
    return data;
  },
  async uploadStemFile(path, file) {
    const { error } = await supabase.storage
      .from(VIDEO_BUCKET)
      .upload(path, file, { contentType: file.type || 'audio/mp4' });
    if (!error) return { ok: true, path };
    console.error('[uploadStemFile]', error);
    const e = error as { status?: number; statusCode?: string; message?: string };
    if (Number(e.status ?? e.statusCode) === 409 || /already exists|duplicate/i.test(e.message ?? '')) {
      return { ok: false, reason: 'exists' };
    }
    return { ok: false, reason: uploadFailure(error) };
  },
  async completeStems(id, paths) {
    const data = must(
      await supabase.from('video_stems').update(paths).eq('id', id).select(STEM_COLUMNS).single(),
    );
    return data;
  },
  async deleteStems(id) {
    must(await supabase.from('video_stems').delete().eq('id', id));
  },
  async signedStemUrl(path) {
    const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(path, 6 * 60 * 60);
    return error ? null : data.signedUrl;
  },
};
