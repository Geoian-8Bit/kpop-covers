import {
  signedVideoUrl,
  uploadFailureMessage,
  useLinkVideoFile,
  useRestoreVideoFile,
  useUnlinkVideoFile,
  useUpdateVideo,
} from '@/data/videos';
import { loadLocalVideo, probeMediaFile } from '@/lib/localVideos';
import { forgetStage } from '@/lib/stagePref';
import { friendlyError } from '@/lib/supabase';
import { usePlayer } from '@/player/store';
import { useToast } from '@/providers/ToastProvider';
import { hasLinkedFile, type Video } from '@coverscape/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { cancelCloudCopy, clearCloudCopy, startCloudCopy } from './cloudCopyJob';

export type Step =
  | { kind: 'start' }
  | { kind: 'check'; file: File; duration: number | null }
  | { kind: 'linking' }
  | { kind: 'sync'; url: string; revoke: boolean };

export const fmtSigned = (s: number) => `${s >= 0 ? '+' : '−'}${Math.abs(s).toFixed(2).replace('.', ',')} s`;

/**
 * REQ-27 · The link panel's flow (pick → check → link → sync, remove, replace), out of LinkFilePanel so the panel only
 * draws the steps. Same state, same order of effects as when it lived inside the component.
 */
export function useLinkFlow({
  open,
  onClose,
  video,
  initialFile,
}: {
  open: boolean;
  onClose: () => void;
  video: Video;
  initialFile?: File | null;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const link = useLinkVideoFile();
  const unlink = useUnlinkVideoFile();
  const restore = useRestoreVideoFile();
  const update = useUpdateVideo();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>({ kind: 'start' });
  const [confirm, setConfirm] = useState<'remove' | 'replace' | null>(null);
  const linked = hasLinkedFile(video);
  const ytDuration = usePlayer((s) => s.duration) || Number(video.duration_seconds) || 0;

  // Fresh each time it opens; an object URL of the picked file is released when the panel goes.
  useEffect(() => {
    if (!open) return;
    setStep({ kind: 'start' });
    setConfirm(null);
    replacing.current = false;
    if (initialFile) void onPick(initialFile);
  }, [open, initialFile]);
  useEffect(() => {
    if (step.kind !== 'sync' || !step.revoke) return;
    return () => URL.revokeObjectURL(step.url);
  }, [step]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    const { duration } = await probeMediaFile(file);
    setStep({ kind: 'check', file, duration });
  }

  async function doLink(file: File, duration: number | null) {
    setStep({ kind: 'linking' });
    try {
      let target = video;
      const previous = replacing.current && hasLinkedFile(video) ? video : null;
      if (previous) {
        // A copy of the old file being made here is of no use any more.
        cancelCloudCopy(video.id);
        clearCloudCopy(video.id);
        target = await unlink.mutateAsync({ video: previous, keepLocal: true });
        usePlayer.getState().setStage('youtube');
        forgetStage(video.id); // 12 · the new file opens by default again
      }
      replacing.current = false;
      let result;
      try {
        result = await link.mutateAsync({ video: target, file, duration });
      } catch (err) {
        // The new file couldn't be linked: the group keeps the one it had (still in the cloud / on this phone).
        if (previous) await restore.mutateAsync(previous).catch(() => undefined);
        throw err;
      }
      if (!result.synced && result.uploadFailure === 'too-big') {
        // 13 · Too big for one cloud file: this device makes a lighter copy for the group while the dancer syncs;
        // it keeps and plays the original. No room left in the group (`no-space`) is not this: a copy wouldn't
        // fit either, so the file just stays here (the toast below says so) and no copy is started.
        startCloudCopy({ video: result.video, source: file, queryClient });
        toast(
          'Pesa demasiado para la nube: se está preparando una copia más ligera para el grupo. Puedes sincronizar mientras.',
          'info',
        );
      } else if (!result.synced && result.uploadFailure) {
        toast(uploadFailureMessage(result.uploadFailure), 'info');
      }
      startSync(URL.createObjectURL(file), true);
    } catch (err) {
      toast(friendlyError(err), 'error');
      setStep({ kind: 'start' });
    }
  }

  /** Syncing marks a moment on YouTube: the studio's player must be the YouTube one, never the file. */
  function startSync(url: string, revoke: boolean) {
    usePlayer.getState().setStage('youtube');
    setStep({ kind: 'sync', url, revoke });
  }

  async function resync() {
    const blob = await loadLocalVideo(video.id);
    if (blob && (!video.file_size || blob.size === video.file_size))
      return startSync(URL.createObjectURL(blob), true);
    const url = video.storage_path ? await signedVideoUrl(video.storage_path) : null;
    if (url) startSync(url, false);
    else toast('El archivo no está en este dispositivo ni en la nube. Vincula tu copia primero.', 'info');
  }

  async function removeFile() {
    setConfirm(null);
    cancelCloudCopy(video.id);
    clearCloudCopy(video.id);
    try {
      await unlink.mutateAsync(video);
      usePlayer.getState().setStage('youtube');
      forgetStage(video.id);
      toast('Archivo quitado: el vídeo vuelve a ser solo de YouTube', 'success');
      onClose();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  }

  /**
   * «Cambiar archivo»: the new file is chosen first (the picker must open right from the tap on iPhone) and the old
   * one is only removed when the new one is linked, so cancelling leaves everything as it was.
   */
  const replacing = useRef(false);
  function replaceFile() {
    setConfirm(null);
    replacing.current = true;
    input.current?.click();
  }

  return {
    toast,
    unlink,
    update,
    input,
    step,
    confirm,
    setConfirm,
    linked,
    ytDuration,
    onPick,
    doLink,
    resync,
    removeFile,
    replaceFile,
  };
}
