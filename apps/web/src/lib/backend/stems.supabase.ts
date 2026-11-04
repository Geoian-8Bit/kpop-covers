import { VIDEO_BUCKET, supabase, withStorage } from '../supabase';
import { must } from './shared';
import { SIGN_BATCH, SIGN_SECONDS, memoSigned } from './signedUrls';
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
    const { error } = await withStorage((storage) =>
      storage
        .from(VIDEO_BUCKET)
        .upload(path, file, { contentType: file.type || 'audio/mp4', cacheControl: '31536000' }),
    );
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
  async signedStemUrls(paths) {
    // REQ-15 · One `createSignedUrls` (per 100 paths) for the tracks the memory doesn't hold; the rest come from the
    // memory.
    const missing: string[] = [];
    let batch: Promise<Map<string, string>> | null = null;
    const signMissing = () =>
      (batch ??= (async () => {
        // Every memoSigned call below has registered its path by the time this microtask runs.
        await Promise.resolve();
        const signed = new Map<string, string>();
        for (let i = 0; i < missing.length; i += SIGN_BATCH) {
          const { data, error } = await withStorage((storage) =>
            storage.from(VIDEO_BUCKET).createSignedUrls(missing.slice(i, i + SIGN_BATCH), SIGN_SECONDS),
          );
          if (error) throw error;
          for (const entry of data) {
            if (entry.path && entry.signedUrl && !entry.error) signed.set(entry.path, entry.signedUrl);
          }
        }
        return signed;
      })());
    return Promise.all(
      paths.map((path) =>
        memoSigned(`${VIDEO_BUCKET}/${path}`, async () => {
          missing.push(path);
          const url = (await signMissing()).get(path);
          if (!url) throw new Error('stem_sign_failed');
          return { url, expiresAt: Date.now() + SIGN_SECONDS * 1000 };
        }).catch(() => null),
      ),
    );
  },
};
