import { supabase } from '../supabase';
import type { UploadFailure, UploadOptions, UploadResult } from './types';

export const isDuplicate = (error: unknown) => {
  const e = (error ?? {}) as { status?: number; statusCode?: string; message?: string; error?: string };
  return (
    Number(e.status ?? e.statusCode) === 409 ||
    /already exists|duplicate/i.test(`${e.message ?? ''} ${e.error ?? ''}`)
  );
};

/**
 * One upload to Storage's REST endpoint with XMLHttpRequest, which (unlike fetch) reports the bytes sent. Same
 * request supabase-js makes (POST, no upsert), with the session's token or the public key.
 */
export async function uploadWithProgress(
  bucket: string,
  path: string,
  file: Blob,
  options: UploadOptions,
): Promise<UploadResult> {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!base || !key) return { ok: false, reason: 'unavailable' };
  const token = (await supabase.auth.getSession().catch(() => null))?.data.session?.access_token ?? key;
  const url = `${base}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`;
  if (options.signal?.aborted) throw new DOMException('Subida cancelada', 'AbortError');
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const done = () => options.signal?.removeEventListener('abort', onAbort);
    xhr.open('POST', url);
    xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', key);
    xhr.setRequestHeader('x-upsert', 'false');
    // REQ-15 · Names are never reused, so a file can be cached for a year.
    xhr.setRequestHeader('cache-control', 'max-age=31536000');
    xhr.setRequestHeader('content-type', file.type || 'video/mp4');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) options.onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.(1);
        resolve({ ok: true, path });
        return;
      }
      let body: { statusCode?: string; error?: string; message?: string } = {};
      try {
        body = JSON.parse(xhr.responseText) as typeof body;
      } catch {
        /* not JSON */
      }
      const error = {
        status: Number(body.statusCode) || xhr.status,
        message: body.message ?? body.error ?? '',
        error: body.error,
      };
      console.error('[uploadFile]', error);
      resolve(
        isDuplicate(error) ? { ok: false, reason: 'exists' } : { ok: false, reason: uploadFailure(error) },
      );
    };
    xhr.onerror = () => {
      done();
      resolve({ ok: false, reason: 'network' });
    };
    xhr.onabort = () => {
      done();
      reject(new DOMException('Subida cancelada', 'AbortError'));
    };
    xhr.send(file);
  });
}

export function uploadFailure(error: unknown): UploadFailure {
  const e = (error ?? {}) as {
    name?: string;
    status?: number;
    statusCode?: string;
    code?: string;
    message?: string;
  };
  const status = Number(e.status ?? e.statusCode) || 0;
  const message = e.message ?? '';
  if (
    status === 413 ||
    e.code === 'EntityTooLarge' ||
    /too large|maximum allowed size|exceeded the maximum/i.test(message)
  ) {
    return 'too-big';
  }
  if (status === 415 || e.code === 'InvalidMimeType' || /mime type/i.test(message)) return 'type';
  // A server or gateway error (e.g. a 504 on a slow 48 MB upload) is not a refusal: never «no room».
  if (status >= 500) return 'unavailable';
  if (e.name === 'StorageUnknownError' || !status || /failed to fetch|network|load failed/i.test(message))
    return 'network';
  return 'denied';
}
