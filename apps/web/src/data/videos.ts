import { MAX_CLOUD_UPLOAD_BYTES, round3, youTubeThumbnail, type TablesUpdate, type Video } from '@coverscape/shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { backend, type UploadFailure, type UploadResult, type VideoWithClipCount } from '@/lib/backend';
import { deleteLocalVideo, purgeLocalVideos, saveLocalVideo } from '@/lib/localVideos';
import { FriendlyError } from '@/lib/supabase';

export type { UploadFailure, VideoWithClipCount };

export const videoKeys = {
  list: (crewId: string | undefined) => ['videos', crewId] as const,
  detail: (id: string | undefined) => ['video', id] as const,
};

/** `enabled: false` reads whatever is cached without fetching (e.g. a closed dialog). */
export function useVideos(crewId: string | undefined, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: videoKeys.list(crewId),
    enabled: Boolean(crewId) && enabled,
    queryFn: async () => {
      const list = await backend.listVideos(crewId!);
      // Videos deleted on another device leave their copy here: drop those (never blocks the list).
      void purgeLocalVideos(list.map((v) => v.id));
      return list;
    },
  });
}

export function useVideo(id: string | undefined) {
  return useQuery({
    queryKey: videoKeys.detail(id),
    enabled: Boolean(id),
    queryFn: () => backend.getVideo(id!),
  });
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

function uploadToGroup(crewId: string, videoId: string, file: File): Promise<UploadResult> {
  if (file.size > MAX_CLOUD_UPLOAD_BYTES) return Promise.resolve({ ok: false, reason: 'too-big' });
  return backend.uploadFile(`${crewId}/${videoId}.${fileExtension(file.name)}`, file);
}

const UPLOAD_FAILURE_REASON: Record<UploadFailure, string> = {
  'too-big': 'pesa más de 50 MB',
  type: 'la nube no admite este formato',
  network: 'no hay conexión',
  denied: 'la nube lo rechazó',
  exists: 'ya había un archivo con ese nombre',
  unavailable: 'la nube no está disponible',
};

/** Toast copy for a file that stayed on this device only. */
export function uploadFailureMessage(reason: UploadFailure): string {
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
        if (!local && input.file.size > MAX_CLOUD_UPLOAD_BYTES) throw new FriendlyError(NO_SPACE);
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
      });
      return { video, synced: true };
    },
    onSuccess: ({ video }) => {
      queryClient.setQueryData(videoKeys.detail(video.id), video);
      // Not awaited: the caller moves on at once, the list refreshes behind it.
      void queryClient.invalidateQueries({ queryKey: videoKeys.list(video.crew_id) });
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
  uploadFailure?: UploadFailure;
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
      let upload: UploadResult = { ok: false, reason: 'too-big' };
      if (file.size <= MAX_CLOUD_UPLOAD_BYTES) {
        const suffix = Math.random().toString(36).slice(2, 8);
        upload = await backend.uploadFile(`${video.crew_id}/${video.id}--${suffix}.${fileExtension(file.name)}`, file);
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
