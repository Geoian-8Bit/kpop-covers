import { type Video } from '@coverscape/shared';
import { videosBucketHasRoom } from '@/features/studio/cloudSpace';
import { backend, type UploadFailure, type UploadOptions, type UploadResult } from '@/lib/backend/core';
import { cloudLimitBytes } from '@/lib/backend/mode';
import { FriendlyError } from '@/lib/supabase';
import { fileIdentity } from './localCopy';

/** Why a file stayed off the group's cloud: the upload's own reason, or no room left for it (checked before). */
export type CloudFailure = UploadFailure | 'no-space';

export function fileExtension(name: string): string {
  const ext = name
    .split('.')
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 5);
  return ext || 'mp4';
}

/**
 * An uploaded video's file has one plain name (`<group>/<video>.<ext>`) and the server only takes that one file:
 * a 409 («already exists») means an earlier try got it there and only the row missed the path, so that name is the
 * video's file and the row can point at it (e.g. after the app was reloaded between the upload and the row).
 */
export async function uploadToGroup(
  crewId: string,
  videoId: string,
  file: File,
  options?: UploadOptions,
): Promise<UploadResult> {
  if (file.size > cloudLimitBytes()) return { ok: false, reason: 'too-big' };
  const path = `${crewId}/${videoId}.${fileExtension(file.name)}`;
  return settlePlainUpload(path, await backend.uploadFile(path, file, options));
}

/**
 * An uploaded video's plain name already holding its file counts as uploaded: `exists` (409) says so, and so may a
 * `denied` (a server rule checked before the unique name, like the group's room, where that file already counts):
 * then the name is read back (allowed while the row has no path) and, if the file answers, the row can point at it.
 */
async function settlePlainUpload(path: string, result: UploadResult): Promise<UploadResult> {
  if (result.ok) return result;
  if (result.reason === 'exists') return { ok: true, path };
  if (result.reason === 'denied' && (await backend.signedUrl(path).catch(() => null)))
    return { ok: true, path };
  return result;
}

export const UPLOAD_FAILURE_REASON: Record<CloudFailure, string> = {
  'too-big': 'pesa más de 50 MB',
  'no-space': 'no queda sitio en la nube del grupo',
  type: 'la nube no admite este formato',
  network: 'no hay conexión',
  denied: 'la nube lo rechazó (puede que no quede sitio en la nube del grupo)',
  exists: 'ya había un archivo con ese nombre',
  unavailable: 'la nube no responde ahora (inténtalo más tarde)',
};

/** Toast copy for a file that stayed on this device only. */
export function uploadFailureMessage(reason: CloudFailure): string {
  // 13 · Too big: this device makes a lighter copy for the group (see «Nube del grupo» in the song).
  if (reason === 'too-big')
    return 'Guardado en este dispositivo. Pesa demasiado para la nube: se prepara una copia más ligera para el grupo.';
  if (reason === 'no-space') return 'No queda sitio en la nube del grupo: se queda en este dispositivo.';
  return `Guardado solo en este dispositivo: no se subió a la nube porque ${UPLOAD_FAILURE_REASON[reason]}.`;
}

export const NO_SPACE = 'No hay espacio en este dispositivo para guardar el vídeo.';

/**
 * Whether the group's cloud takes one more file in the videos bucket, as the database decides it (H1): it counts
 * the upload as the per-file limit (it can't see the size yet) and keeps 50 MB free for one shared take. True when
 * the usage can't be read (the upload decides).
 */
export async function groupHasRoomForUpload(): Promise<boolean> {
  try {
    const usage = await backend.storageUsage();
    return videosBucketHasRoom(usage.total, cloudLimitBytes());
  } catch {
    return true;
  }
}

/**
 * 13 · Sends the group's file of a video that so far lived only on this device: the reduced copy made here (or the
 * original, when it fits). The row only gets `storage_path` (the file's description stays the original's: this
 * device keeps and plays the original; the others play this copy, with the same timeline and offset).
 *
 * Re-reads the row first: another device may have sent one meanwhile (then nothing is uploaded), or the file may
 * have been replaced or removed (then nothing is uploaded either). `uploadedPath`: an earlier try already put the
 * file in the cloud and only the row is missing it.
 */
export async function uploadGroupFile(input: {
  video: Pick<Video, 'id' | 'crew_id'>;
  blob: Blob;
  extension: string;
  /** `fileIdentity` of the entry when the copy was started (YouTube entries). */
  identity: string;
  uploadedPath?: string | null;
  onUploaded?: (path: string) => void;
  /** Progress of the upload (0–1) and cancelling it (rejects with an AbortError). */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<Video> {
  const fresh = await backend.getVideo(input.video.id);
  if (!fresh) throw new FriendlyError('Este vídeo ya no está en la biblioteca.');
  if (fresh.storage_path) return fresh;
  if (fresh.source === 'youtube' && (!fresh.file_name || fileIdentity(fresh) !== input.identity)) {
    throw new FriendlyError(
      'El archivo de este vídeo ha cambiado mientras se preparaba la copia: no se ha subido nada.',
    );
  }
  let path = input.uploadedPath ?? null;
  if (!path) {
    const ext = input.extension.replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'mp4';
    // A YouTube entry's file always gets a fresh name (an old one may still be in the bucket); an uploaded video
    // has a single plain name.
    const name =
      fresh.source === 'youtube'
        ? `${fresh.crew_id}/${fresh.id}--${Math.random().toString(36).slice(2, 8)}.${ext}`
        : `${fresh.crew_id}/${fresh.id}.${ext}`;
    const file = new File([input.blob], `${fresh.id}.${ext}`, { type: input.blob.type || 'video/mp4' });
    let upload = await backend.uploadFile(name, file, { onProgress: input.onProgress, signal: input.signal });
    // An uploaded video's only name already holds a file: an earlier try got it there (see `settlePlainUpload`).
    if (fresh.source === 'upload') upload = await settlePlainUpload(name, upload);
    if (!upload.ok) {
      if (upload.reason === 'denied' && fresh.source === 'youtube') {
        throw new FriendlyError(
          'La nube no ha aceptado la copia: puede que otro móvil acabe de subir una, o que este vídeo ya haya tenido 5 archivos (el administrador puede limpiar los antiguos).',
        );
      }
      throw new FriendlyError(`No se pudo subir a la nube: ${UPLOAD_FAILURE_REASON[upload.reason]}.`);
    }
    path = upload.path;
    input.onUploaded?.(path);
  }
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await backend.updateVideo(fresh.id, { storage_path: path });
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  console.error('[uploadGroupFile]', lastError);
  throw new FriendlyError(
    'La copia se subió, pero no se pudo apuntar en el vídeo. Vuelve a pulsar «Subir una copia para el grupo».',
  );
}
