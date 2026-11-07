import type { Take, Video } from '@coverscape/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { currentMemberId, useMembers } from '@/data/members';
import { deviceId, takeKeys } from '@/data/takes';
import { probeVideo } from '@/features/record/studio/probeVideo';
import { backend } from '@/lib/backend/core';
import { friendlyError, FriendlyError } from '@/lib/supabase';
import { SHARE, sharedPath, takeRow, type TakeItem } from './takeRules';

/** The phase shown on the «Subir vídeo» button while a file becomes a take. */
export type UploadTakePhase = 'idle' | 'reading' | 'reducing' | 'uploading';

const extensionOf = (file: File): string => {
  const fromName = /\.([A-Za-z0-9]{1,10})$/.exec(file.name)?.[1]?.toLowerCase();
  if (fromName) return fromName;
  return file.type.includes('webm') ? 'webm' : file.type.includes('quicktime') ? 'mov' : 'mp4';
};

/**
 * «Subir vídeo» in «Tomas»: a video file (recorded with the phone's camera, sent by someone, a group run-through)
 * becomes a take of this song, shared with the group at once. Up to 50 MB it goes up as it is; bigger, a 720p
 * copy is made first (the same as «Compartir»). If the upload fails, the row it needed is archived again, so no
 * take is left pointing at nothing.
 */
export function useUploadTake(video: Pick<Video, 'id'>) {
  const queryClient = useQueryClient();
  const members = useMembers();
  const [phase, setPhase] = useState<UploadTakePhase>('idle');
  const [progress, setProgress] = useState(0);
  const running = useRef(false);

  const upload = useCallback(
    async (
      file: File,
      /** From the name dialog: its name and who dances it (null = the group). Without it, this phone's person. */
      choice?: { label: string | null; memberId: string | null },
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (running.current) return { ok: false, error: 'Ya se está subiendo un vídeo.' };
      if (!file.type.startsWith('video/')) return { ok: false, error: 'Elige un archivo de vídeo.' };
      running.current = true;
      setPhase('reading');
      setProgress(0);
      let row: Take | null = null;
      const url = URL.createObjectURL(file);
      try {
        const probe = await probeVideo(url);
        row = await backend.insertTake(
          takeRow(
            {
              id: crypto.randomUUID(),
              videoId: video.id,
              memberId: choice ? choice.memberId : currentMemberId(members.data),
              label: choice?.label ?? null,
              songStart: 0,
              speed: 1,
              mirrored: false,
              durationSeconds: probe.duration,
              width: probe.width,
              height: probe.height,
              mimeType: file.type || null,
              fileName: file.name,
              recordedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null,
            },
            deviceId(),
          ),
        );
        let shared: Take;
        if (file.size <= SHARE.maxBytes) {
          setPhase('uploading');
          const path = sharedPath(row, extensionOf(file));
          const sent = await backend.uploadTakeFile(path, file);
          if (!sent.ok) {
            throw new FriendlyError(
              sent.reason === 'network'
                ? 'Sin conexión: no se pudo subir el vídeo. Inténtalo con mejor red.'
                : sent.reason === 'denied'
                  ? 'La nube del grupo está llena: no cabe este vídeo.'
                  : 'No se pudo subir el vídeo. Inténtalo más tarde.',
            );
          }
          shared = await backend.updateTake(row.id, { shared_path: path, shared_size: file.size });
        } else {
          // Too big to go up as it is: the 720p copy «Compartir» makes (plays once in the background, silent).
          const { shareTake } = await import('./shareTake');
          shared = await shareTake({
            take: row,
            source: file,
            onProgress: (p, value) => {
              setPhase(p === 'reducing' ? 'reducing' : 'uploading');
              setProgress(value);
            },
          });
        }
        const item: TakeItem = { ...shared, where: 'cloud' };
        queryClient.setQueryData<TakeItem[]>(takeKeys.forVideo(video.id), (current) =>
          current ? [item, ...current.filter((t) => t.id !== item.id)] : current,
        );
        void queryClient.invalidateQueries({ queryKey: takeKeys.forVideo(video.id) });
        void queryClient.invalidateQueries({ queryKey: takeKeys.sharedBytes });
        return { ok: true };
      } catch (err) {
        if (row) await backend.deleteTake(row.id).catch(() => undefined);
        return { ok: false, error: friendlyError(err) };
      } finally {
        URL.revokeObjectURL(url);
        running.current = false;
        setPhase('idle');
        setProgress(0);
      }
    },
    [members.data, queryClient, video.id],
  );

  return { upload, phase, progress, busy: phase !== 'idle' };
}
