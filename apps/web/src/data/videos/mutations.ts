import { round3, youTubeThumbnail, type TablesUpdate, type Video } from '@coverscape/shared';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { backend, type UploadFailure, type UploadResult, type VideoWithClipCount } from '@/lib/backend/core';
import { cloudLimitBytes } from '@/lib/backend/mode';
import { FriendlyError } from '@/lib/supabase';
import { takeKeys, videoPlayKey } from '../trackKeys';
import { fileIdentity, keepLocalCopy, markLocalCopy } from './localCopy';
import { rememberPoster, videoKeys } from './queries';

// REQ-08 · The IndexedDB module loads on demand (a delete is rare); callers keep their `.catch`.
const deleteLocalVideo = (id: string) => import('@/lib/localVideos').then((m) => m.deleteLocalVideo(id));
import {
  NO_SPACE,
  UPLOAD_FAILURE_REASON,
  fileExtension,
  groupHasRoomForUpload,
  uploadToGroup,
  type CloudFailure,
} from './upload';

/**
 * Patches one video in the cached library list instead of downloading the whole list again. REQ-14 · The list keeps
 * `list_thumbnail_url` (an inline poster goes to the poster map). REQ-16 · And the file columns the studio opens from.
 */
function patchListedVideo(queryClient: QueryClient, video: Video) {
  rememberPoster(queryClient, video);
  // REQ-19 · A round reads its songs from `['video-play', id]`: a file linked, uploaded or removed reaches it as it
  // did through the full row before.
  void queryClient.invalidateQueries({ queryKey: videoPlayKey(video.id) });
  queryClient.setQueryData<VideoWithClipCount[]>(videoKeys.list(video.crew_id), (current) =>
    current?.map((v) =>
      v.id === video.id
        ? {
            ...v,
            title: video.title,
            artist: video.artist,
            thumbnail_url: video.list_thumbnail_url,
            poster_inline: video.poster_inline,
            poster_rev: video.poster_rev,
            duration_seconds: video.duration_seconds,
            file_name: video.file_name,
            storage_path: video.storage_path,
            file_size: video.file_size,
            file_offset_seconds: video.file_offset_seconds,
            file_duration_seconds: video.file_duration_seconds,
            updated_at: video.updated_at,
          }
        : v,
    ),
  );
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
          throw new FriendlyError(
            `${NO_SPACE} Tampoco se pudo subir a la nube: ${UPLOAD_FAILURE_REASON[upload.reason]}.`,
          );
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
      // REQ-14 · Its poster is known already: the list's refresh won't download it.
      rememberPoster(queryClient, video);
      // Not awaited: the caller moves on at once, the list refreshes behind it.
      void queryClient.invalidateQueries({ queryKey: videoKeys.list(video.crew_id) });
      if (synced && input.file) void queryClient.invalidateQueries({ queryKey: takeKeys.sharedBytes });
      // 13 · Too big for the cloud: start the lighter copy for the group (loaded only when needed).
      const file = input.file;
      if (!synced && uploadFailure === 'too-big' && file) {
        void import('@/features/studio/cloudCopyJob').then((m) =>
          m.startCloudCopy({ video, source: file, queryClient }),
        );
      }
    },
  });
}

export function useUpdateVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TablesUpdate<'videos'> }) =>
      backend.updateVideo(id, patch),
    onSuccess: (video, { patch }) => {
      queryClient.setQueryData(videoKeys.detail(video.id), video);
      patchListedVideo(queryClient, video);
      // A new cloud file (upload retry, linked file): the cloud space used has grown.
      if (patch.storage_path) void queryClient.invalidateQueries({ queryKey: takeKeys.sharedBytes });
    },
  });
}

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
      if (!upload.ok)
        throw new FriendlyError(`No se pudo subir a la nube: ${UPLOAD_FAILURE_REASON[upload.reason]}.`);
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
        throw new FriendlyError(
          'Otro móvil ya ha vinculado un archivo a este vídeo. Cierra y vuelve a abrirlo para verlo.',
        );
      }
      // 13 · Too big for one file: the panel makes a smaller copy instead. It fits one file but not what's left of
      // the group's 1 GiB: a copy wouldn't fit either, so it stays on this device (no upload, no copy).
      let upload: UploadResult | { ok: false; reason: 'no-space' } = { ok: false, reason: 'too-big' };
      if (file.size <= cloudLimitBytes()) {
        if (await groupHasRoomForUpload()) {
          const suffix = Math.random().toString(36).slice(2, 8);
          upload = await backend.uploadFile(
            `${video.crew_id}/${video.id}--${suffix}.${fileExtension(file.name)}`,
            file,
          );
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
        throw new FriendlyError(
          `${NO_SPACE} Tampoco se pudo subir a la nube: ${UPLOAD_FAILURE_REASON[upload.reason]}.`,
        );
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
      return upload.ok
        ? { video: updated, synced: true }
        : { video: updated, synced: false, uploadFailure: upload.reason };
    },
  });
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
