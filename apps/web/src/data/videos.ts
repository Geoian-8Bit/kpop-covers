import { round3, youTubeThumbnail, type TablesUpdate, type Video } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { videosBucketHasRoom } from '@/features/studio/cloudSpace';
import {
  backend,
  cloudLimitBytes,
  type UploadFailure,
  type UploadOptions,
  type UploadResult,
  type VideoWithClipCount,
} from '@/lib/backend';
import { deleteLocalVideo, purgeLocalVideos, saveLocalVideo } from '@/lib/localVideos';
import { libraryRowsSnapshot, parseLibrary, readSnapshot, videoFromLibraryRow, writeSnapshot } from '@/lib/snapshot';
import { FriendlyError } from '@/lib/supabase';
import { invalidateAfterArchive } from './afterArchive';

export type { UploadFailure, VideoWithClipCount };
/** Why a file stayed off the group's cloud: the upload's own reason, or no room left for it (checked before). */
export type CloudFailure = UploadFailure | 'no-space';

export const videoKeys = {
  list: (crewId: string | undefined) => ['videos', crewId] as const,
  detail: (id: string | undefined) => ['video', id] as const,
};

const librarySnapshot = (crewId: string) => `videos.${crewId}`;

/**
 * `enabled: false` reads whatever is cached without fetching (e.g. a closed dialog).
 * `snapshot`: P2 · while the first request runs, show the list kept from the last visit (`isPlaceholderData`);
 * only the library page asks for it, and nothing writes from it (it never enters the cache).
 */
export function useVideos(
  crewId: string | undefined,
  { enabled = true, snapshot = false }: { enabled?: boolean; snapshot?: boolean } = {},
) {
  return useQuery({
    queryKey: videoKeys.list(crewId),
    enabled: Boolean(crewId) && enabled,
    placeholderData: snapshot && crewId ? () => readSnapshot(librarySnapshot(crewId), (v) => parseLibrary(v, crewId)) : undefined,
    queryFn: async () => {
      const list = await backend.listVideos(crewId!);
      // Videos deleted on another device leave their copy here: drop those (never blocks the list).
      void purgeLocalVideos(list.map((v) => v.id));
      writeSnapshot(librarySnapshot(crewId!), libraryRowsSnapshot(list));
      return list;
    },
  });
}

function videoQuery(id: string | undefined) {
  return { queryKey: videoKeys.detail(id), queryFn: () => backend.getVideo(id!) };
}

export function useVideo(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    ...videoQuery(id),
    enabled: Boolean(id),
    // P3 · The library already has this row: open the studio at once while the full row arrives
    // (`isPlaceholderData`; never in the cache, so no write starts from it).
    placeholderData: () => {
      if (!id) return undefined;
      for (const [, list] of queryClient.getQueriesData<VideoWithClipCount[]>({ queryKey: ['videos'] })) {
        const row = list?.find((v) => v.id === id);
        if (row) return videoFromLibraryRow(row);
      }
      return undefined;
    },
  });
}

/** P3 · Warm a video's full row (hover or focus on its card; clips and notes have their own), unless cached. */
export function prefetchVideo(queryClient: QueryClient, id: string): void {
  void queryClient.prefetchQuery(videoQuery(id));
}

/** Patches one video in the cached library list instead of downloading the whole list again. */
function patchListedVideo(queryClient: QueryClient, video: Video) {
  queryClient.setQueryData<VideoWithClipCount[]>(videoKeys.list(video.crew_id), (current) =>
    current?.map((v) =>
      v.id === video.id
        ? {
            ...v,
            title: video.title,
            artist: video.artist,
            thumbnail_url: video.thumbnail_url,
            duration_seconds: video.duration_seconds,
            file_name: video.file_name,
          }
        : v,
    ),
  );
}

function fileExtension(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  return ext || 'mp4';
}

/**
 * An uploaded video's file has one plain name (`<group>/<video>.<ext>`) and the server only takes that one file:
 * a 409 («already exists») means an earlier try got it there and only the row missed the path, so that name is the
 * video's file and the row can point at it (e.g. after the app was reloaded between the upload and the row).
 */
async function uploadToGroup(crewId: string, videoId: string, file: File, options?: UploadOptions): Promise<UploadResult> {
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
  if (result.reason === 'denied' && (await backend.signedUrl(path).catch(() => null))) return { ok: true, path };
  return result;
}

const UPLOAD_FAILURE_REASON: Record<CloudFailure, string> = {
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
  if (reason === 'too-big') return 'Guardado en este dispositivo. Pesa demasiado para la nube: se prepara una copia más ligera para el grupo.';
  if (reason === 'no-space') return 'No queda sitio en la nube del grupo: se queda en este dispositivo.';
  return `Guardado solo en este dispositivo: no se subió a la nube porque ${UPLOAD_FAILURE_REASON[reason]}.`;
}

const NO_SPACE = 'No hay espacio en este dispositivo para guardar el vídeo.';

/** Keeps the device copy; false when the browser can't store it (full, private mode…). */
async function keepLocalCopy(videoId: string, file: File): Promise<boolean> {
  try {
    await saveLocalVideo(videoId, file);
    return true;
  } catch (error) {
    console.error('[saveLocalVideo]', error);
    return false;
  }
}

export interface CreateVideoInput {
  crewId: string;
  title: string;
  artist?: string | null;
  youtubeId?: string;
  file?: File;
  duration?: number | null;
  poster?: string | null;
  /** YouTube only: width / height when known (REQ-02). */
  aspectRatio?: number | null;
}

export interface CreateVideoResult {
  video: Video;
  /** For uploads: whether the file reached cloud storage (false → device only). */
  synced: boolean;
  /** Why it didn't, when it didn't. */
  uploadFailure?: UploadFailure;
}

export function useCreateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateVideoInput): Promise<CreateVideoResult> => {
      const id = crypto.randomUUID();
      const base = {
        id,
        crew_id: input.crewId,
        title: input.title.trim(),
        artist: input.artist?.trim() || null,
        duration_seconds: input.duration ? round3(input.duration) : null,
      };

      if (input.file) {
        // The device copy is a cache: if it can't be stored, the cloud copy alone is enough.
        const local = await keepLocalCopy(id, input.file);
        if (!local && input.file.size > cloudLimitBytes()) throw new FriendlyError(NO_SPACE);
        // Row first: the group's storage only accepts a file for a video that already exists.
        let video: Video;
        try {
          video = await backend.insertVideo({
            ...base,
            source: 'upload',
            file_name: input.file.name,
            file_size: input.file.size,
            storage_path: null,
            thumbnail_url: input.poster ?? null,
          });
        } catch (error) {
          if (local) await deleteLocalVideo(id).catch(() => undefined);
          throw error;
        }
        const upload = await uploadToGroup(input.crewId, id, input.file);
        if (!upload.ok) {
          if (local) return { video, synced: false, uploadFailure: upload.reason };
          // Neither here nor in the cloud: don't leave an empty entry behind (a client delete archives it).
          await backend.deleteVideo({ id }).catch(() => undefined);
          throw new FriendlyError(`${NO_SPACE} Tampoco se pudo subir a la nube: ${UPLOAD_FAILURE_REASON[upload.reason]}.`);
        }
        try {
          video = await backend.updateVideo(id, { storage_path: upload.path });
          return { video, synced: true };
        } catch {
          // The file is up but the row didn't take the path: the device copy still plays; "Subir a la nube" can retry.
          return { video, synced: false, uploadFailure: 'network' };
        }
      }

      if (!input.youtubeId) throw new FriendlyError('Falta el enlace de YouTube.');
      const video = await backend.insertVideo({
        ...base,
        source: 'youtube',
        youtube_id: input.youtubeId,
        thumbnail_url: youTubeThumbnail(input.youtubeId),
        aspect_ratio: input.aspectRatio ?? null,
      });
      return { video, synced: true };
    },
    onSuccess: ({ video, synced, uploadFailure }, input) => {
      queryClient.setQueryData(videoKeys.detail(video.id), video);
      // Not awaited: the caller moves on at once, the list refreshes behind it.
      void queryClient.invalidateQueries({ queryKey: videoKeys.list(video.crew_id) });
      // 13 · Too big for the cloud: start the lighter copy for the group (loaded only when needed).
      const file = input.file;
      if (!synced && uploadFailure === 'too-big' && file) {
        void import('@/features/studio/cloudCopyJob').then((m) => m.startCloudCopy({ video, source: file, queryClient }));
      }
    },
  });
}

export function useUpdateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<'videos'> }) => backend.updateVideo(id, patch),
    onSuccess: (video) => {
      queryClient.setQueryData(videoKeys.detail(video.id), video);
      patchListedVideo(queryClient, video);
    },
  });
}

export function useDeleteVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (video: Pick<Video, 'id' | 'crew_id'>) => {
      // Server-side this archives the row; the group's cloud file is kept. Only this device's copy goes.
      await backend.deleteVideo(video);
      await deleteLocalVideo(video.id).catch(() => undefined);
      return video;
    },
    onSuccess: (video) => {
      queryClient.removeQueries({ queryKey: videoKeys.detail(video.id) });
      // The cache edit is exact: no need to download the whole library again.
      queryClient.setQueryData<{ id: string }[]>(videoKeys.list(video.crew_id), (current) =>
        current?.filter((v) => v.id !== video.id),
      );
      void queryClient.invalidateQueries({ queryKey: ['quick-clips', video.crew_id] });
      // Its clips leave Random Play Dance, bags, tracks and repertoires too.
      invalidateAfterArchive(queryClient);
    },
  });
}

/** Attaches a local copy of an uploaded video on this device (and syncs it if the group has none). */
export function useLinkLocalFile() {
  const update = useUpdateVideo();
  return useMutation({
    mutationFn: async ({ video, file }: { video: Video; file: File }) => {
      const local = await keepLocalCopy(video.id, file);
      if (video.source === 'youtube') {
        // F1: this phone's own copy of the group's linked file. It is never uploaded as the group's file (that
        // goes through the link panel, which describes and syncs it); it's marked as a copy of today's file.
        if (!local) throw new FriendlyError(NO_SPACE);
        markLocalCopy(video.id, fileIdentity(video));
        return;
      }
      if (!video.storage_path) {
        const upload = await uploadToGroup(video.crew_id, video.id, file);
        if (upload.ok) await update.mutateAsync({ id: video.id, patch: { storage_path: upload.path } });
        else if (!local) throw new FriendlyError(NO_SPACE);
      } else if (!local) {
        throw new FriendlyError(NO_SPACE);
      }
    },
  });
}

/**
 * Retries the cloud upload of a video that stayed on this device only (e.g. offline when it was added).
 * The caller passes the device's file (from `loadLocalVideo`, wrapped in a `File`).
 */
export function useUploadToCloud() {
  const update = useUpdateVideo();
  return useMutation({
    mutationFn: async ({ video, file }: { video: Video; file: File }): Promise<Video> => {
      const upload = await uploadToGroup(video.crew_id, video.id, file);
      if (!upload.ok) throw new FriendlyError(`No se pudo subir a la nube: ${UPLOAD_FAILURE_REASON[upload.reason]}.`);
      return update.mutateAsync({ id: video.id, patch: { storage_path: upload.path } });
    },
  });
}

/**
 * F1 · Attach the file of a YouTube entry: kept on this device, and in the group's cloud when it fits (≤ 50 MB).
 * The cloud name always carries a fresh suffix (`<group>/<video>--<suffix>.<ext>`): a removed or replaced file
 * stays in the bucket (only the admin deletes), so a new one can never reuse its name.
 */
export interface LinkFileResult {
  video: Video;
  synced: boolean;
  uploadFailure?: CloudFailure;
}

export function useLinkVideoFile() {
  const update = useUpdateVideo();
  return useMutation({
    mutationFn: async ({
      video,
      file,
      duration,
    }: {
      video: Video;
      file: File;
      duration: number | null;
    }): Promise<LinkFileResult> => {
      // The cached entry may be stale: another phone may have linked a file meanwhile. Never write over it.
      const fresh = await backend.getVideo(video.id);
      if (!fresh) throw new FriendlyError('Este vídeo ya no está en la biblioteca.');
      // In the cloud or only on someone's phone (> 50 MB): either way it's the group's file now.
      if (fresh.storage_path || fresh.file_name) {
        throw new FriendlyError('Otro móvil ya ha vinculado un archivo a este vídeo. Cierra y vuelve a abrirlo para verlo.');
      }
      // 13 · Too big for one file: the panel makes a smaller copy instead. It fits one file but not what's left of
      // the group's 1 GiB: a copy wouldn't fit either, so it stays on this device (no upload, no copy).
      let upload: UploadResult | { ok: false; reason: 'no-space' } = { ok: false, reason: 'too-big' };
      if (file.size <= cloudLimitBytes()) {
        if (await groupHasRoomForUpload()) {
          const suffix = Math.random().toString(36).slice(2, 8);
          upload = await backend.uploadFile(`${video.crew_id}/${video.id}--${suffix}.${fileExtension(file.name)}`, file);
        } else {
          upload = { ok: false, reason: 'no-space' };
        }
      }
      // The cloud said no (a file appeared meanwhile, or the video's file limit): nothing is written.
      if (!upload.ok && upload.reason === 'denied') {
        throw new FriendlyError(
          'La nube no ha aceptado el archivo: puede que otro móvil acabe de vincular uno, o que este vídeo ya haya tenido 5 archivos (el administrador puede limpiar los antiguos).',
        );
      }
      const local = await keepLocalCopy(video.id, file);
      if (!upload.ok && !local) {
        throw new FriendlyError(`${NO_SPACE} Tampoco se pudo subir a la nube: ${UPLOAD_FAILURE_REASON[upload.reason]}.`);
      }
      const updated = await update.mutateAsync({
        id: video.id,
        patch: {
          file_name: file.name.slice(0, 255),
          file_size: file.size,
          file_duration_seconds: duration ? round3(duration) : null,
          // A new file starts unsynced: the dancer marks the same moment in both right after.
          file_offset_seconds: 0,
          ...(upload.ok ? { storage_path: upload.path } : {}),
        },
      });
      if (local) markLocalCopy(video.id, fileIdentity(updated));
      return upload.ok ? { video: updated, synced: true } : { video: updated, synced: false, uploadFailure: upload.reason };
    },
  });
}

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
    throw new FriendlyError('El archivo de este vídeo ha cambiado mientras se preparaba la copia: no se ha subido nada.');
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
  throw new FriendlyError('La copia se subió, pero no se pudo apuntar en el vídeo. Vuelve a pulsar «Subir una copia para el grupo».');
}

/** Which group file a YouTube entry describes now (a device copy remembers the one it was made for). */
export function fileIdentity(video: Pick<Video, 'file_name' | 'file_size'>): string {
  return `${video.file_name ?? ''}|${video.file_size ?? ''}`;
}

const COPY_KEY = 'oneshoot.localcopy.v1';

function copies(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(COPY_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/** This device's copy of a YouTube entry's file was made for the group file `identity`. */
export function markLocalCopy(videoId: string, identity: string | null): void {
  try {
    const all = copies();
    if (identity) all[videoId] = identity;
    else delete all[videoId];
    localStorage.setItem(COPY_KEY, JSON.stringify(all));
  } catch {
    /* this visit only */
  }
}

/**
 * True when this device's copy belongs to a file the group no longer uses (replaced or removed on another phone).
 * Copies made before this was tracked have no mark and are trusted.
 */
export function isStaleCopy(video: Pick<Video, 'id' | 'source' | 'file_name' | 'file_size'>): boolean {
  if (video.source !== 'youtube') return false;
  const mark = copies()[video.id];
  return mark != null && mark !== fileIdentity(video);
}

/** F1 · «Quitar el archivo»: the entry is YouTube-only again. Clips, notes and takes stay (YouTube timeline). */
export function useUnlinkVideoFile() {
  const update = useUpdateVideo();
  return useMutation({
    /** `keepLocal`: part of «Cambiar archivo» — the device copy stays until the new file is in place. */
    mutationFn: async (video: Video | { video: Video; keepLocal: boolean }) => {
      const target = 'keepLocal' in video ? video.video : video;
      const keepLocal = 'keepLocal' in video && video.keepLocal;
      const updated = await update.mutateAsync({
        id: target.id,
        patch: {
          storage_path: null,
          file_name: null,
          file_size: null,
          file_offset_seconds: null,
          file_duration_seconds: null,
        },
      });
      if (!keepLocal) {
        await deleteLocalVideo(target.id).catch(() => undefined);
        markLocalCopy(target.id, null);
      }
      return updated;
    },
  });
}

/**
 * Puts a YouTube entry's previous file back (a «Cambiar archivo» whose new file couldn't be linked). The old cloud
 * file is still in the bucket and becomes its file again.
 */
export function useRestoreVideoFile() {
  const update = useUpdateVideo();
  return useMutation({
    mutationFn: (previous: Video) =>
      update.mutateAsync({
        id: previous.id,
        patch: {
          storage_path: previous.storage_path,
          file_name: previous.file_name,
          file_size: previous.file_size,
          file_offset_seconds: previous.file_offset_seconds,
          file_duration_seconds: previous.file_duration_seconds,
        },
      }),
  });
}

export function signedVideoUrl(path: string): Promise<string | null> {
  return backend.signedUrl(path);
}
