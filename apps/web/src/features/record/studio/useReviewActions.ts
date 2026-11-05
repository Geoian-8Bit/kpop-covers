import { SAVED_GRACE_MS, type Video } from '@coverscape/shared';
import { currentMemberId, useMembers } from '@/data/members';
import type { useSaveTake } from '@/data/takes';
import { perfMark } from '@/lib/perfProbe';
import { friendlyError } from '@/lib/supabase';
import { usePlayer } from '@/player/store';
import { IS_IOS, canShareFile, downloadFile, shareFile } from '../recorder';
import { forgetTake, freeSpace, holdTake, markTakeSaved, releaseTake } from '../takeStore';
import { probeVideo } from './probeVideo';
import type { Studio } from './useStudioSession';
import type { Take } from './types';

/** The review: «Guardar en «Tomas»», download or share, «Repetir», «Descartar». */
export function useReviewActions(S: Studio, video: Video, onClose: () => void) {
  const { fx, take, reviewTake, setTake, setSaved, setKept, setKeepMsg, setNotice, setConfirm, confirm } = S;
  const members = useMembers();

  const replaceTake = (
    next: Take | null,
    diskId: string | null = null,
    reviewVideoId: string | null = null,
  ) => {
    if (S.takeUrl.current) URL.revokeObjectURL(S.takeUrl.current);
    S.takeUrl.current = next?.url ?? null;
    // The take we leave: a saved one keeps its copy a while (a download may still be reading it), then goes;
    // an unsaved one the dancer moved on from (they confirmed) is deleted now.
    const old = reviewTake.current;
    if (old && old.id !== diskId) {
      // Not saved: the dancer confirmed discarding it. Saved on a full phone: stays on offer (the download may
      // have failed). Saved: kept a while for the download, then deleted.
      if (old.kept)
        releaseTake(old.id); // it lives in «Tomas» now
      else if (!old.saved) void forgetTake(old.id);
      else if (old.noSpace) releaseTake(old.id);
      else {
        releaseTake(old.id);
        const id = old.id;
        setTimeout(() => void forgetTake(id), SAVED_GRACE_MS);
      }
    }
    if (diskId) holdTake(diskId);
    reviewTake.current = diskId
      ? { id: diskId, saved: false, noSpace: false, kept: false, videoId: reviewVideoId ?? video.id }
      : null;
    setKept(false);
    setKeepMsg(null);
    setTake(next);
    setSaved(false);
  };

  function again() {
    replaceTake(null);
    S.setSeconds(0);
    S.setSpan(null);
    S.setPhase('idle');
  }

  /**
   * F3 «Guardar»: the take joins this song's «Tomas» (on this phone; the group sees its row, and can see the video
   * once shared). Only for takes written to the phone's storage and of this song.
   */
  const canKeep = reviewTake.current != null && reviewTake.current.videoId === video.id;
  async function keepInApp(saveTake: SaveTake) {
    const disk = reviewTake.current;
    if (!take || !disk || disk.kept || S.keepingRef.current) return;
    S.keepingRef.current = true;
    S.setKeeping(true);
    const timing = S.reviewTiming.current;
    setKeepMsg(null);
    // No «¿Quién eres?» here (it would open under the recorder): unnamed takes can be claimed later in «Tomas».
    // REQ-24 · The recorder counted this take's exact length: only its size is read from the file (a recovered take,
    // with no counter, still has its length read).
    const counted = S.secondsExact.current > 0;
    const probe = await probeVideo(take.url, { needDuration: !counted });
    void saveTake
      .mutateAsync({
        id: disk.id,
        video: { id: video.id },
        file: take.file,
        memberId: currentMemberId(members.data),
        songStart: timing?.songStart ?? 0,
        songEnd: timing?.songEnd ?? null,
        clipId: timing?.clipId ?? null,
        speed: timing?.speed ?? 1,
        mirrored: timing?.mirrored ?? false,
        durationSeconds: counted ? S.secondsExact.current : probe.duration,
        width: probe.width ?? S.view.mode?.width ?? null,
        height: probe.height ?? S.view.mode?.height ?? null,
        mimeType: take.file.type || null,
        fileName: take.file.name,
      })
      .then(() => {
        if (reviewTake.current !== disk) return;
        perfMark('take-saved');
        disk.kept = true;
        setKept(true);
        setKeepMsg({ text: 'Guardada en «Tomas» de esta canción.', error: false });
      })
      .catch((err: unknown) => {
        if (reviewTake.current === disk) setKeepMsg({ text: friendlyError(err), error: true });
      })
      .finally(() => S.setKeeping(false));
  }

  /**
   * The take was handed to the phone (download or share). Its working copy stops being offered back, unless the
   * take ended because the phone was full: then the download may well have failed too, so it stays on offer.
   */
  function takeKept() {
    setSaved(true);
    const disk = reviewTake.current;
    if (!disk || disk.saved) return;
    disk.saved = true;
    const size = take?.file.size ?? 0;
    // The download is a second copy: on a phone without room for it, it may well fail. Then the app's copy
    // stays (offered again next time) instead of being cleaned up.
    void freeSpace().then((bytes) => {
      if (disk.noSpace || (bytes != null && bytes < size * 1.1)) {
        disk.noSpace = true;
        setNotice(
          'El móvil va justo de espacio: comprueba que la toma está en Descargas. La app guarda su copia hasta que la descartes.',
        );
      } else void markTakeSaved(disk.id);
    });
  }

  function discardTake() {
    S.recorder.current?.cancel();
    S.recorder.current = null;
    S.sink.current = null;
    S.sinkReady.current = null;
    fx.releasePicture();
    usePlayer.getState().pause();
    again();
  }

  /**
   * P20 · «Descartar» drops the take and leaves the camera ready for the next one, also when it was asked from
   * «Cerrar» (or the phone's «Atrás»): leaving the recorder is its own button, «Descartar y salir».
   */
  function confirmDiscard(exit = false) {
    const action = confirm;
    setConfirm(null);
    if (action === 'leftover') {
      fx.dropLeftover();
      return;
    }
    discardTake();
    if (exit) onClose();
    if (action === 'rearm') {
      S.phaseRef.current = 'idle';
      fx.armClap();
    }
  }

  async function save() {
    if (!take || S.sharing.current) return;
    S.sharing.current = true;
    try {
      if (IS_IOS && canShareFile(take.file)) {
        // iPhone: the share sheet's "Guardar vídeo" is the way into Photos.
        const result = await shareFile(take.file, video.title);
        if (result === 'shared') takeKept();
        else if (result === 'failed') {
          downloadFile(take.file);
          takeKept();
        }
      } else {
        downloadFile(take.file);
        takeKept();
      }
    } finally {
      S.sharing.current = false;
    }
  }

  async function share() {
    if (!take || S.sharing.current) return;
    S.sharing.current = true;
    try {
      if ((await shareFile(take.file, video.title)) === 'shared') takeKept();
    } finally {
      S.sharing.current = false;
    }
  }

  fx.replaceTake = replaceTake;
  fx.again = again;
  return { canKeep, keepInApp, again, confirmDiscard, save, share };
}
/**
 * REQ-23 · The «Guardar» mutation, made by the review strip (TakeReviewPane) so that the takes data
 * layer is not part of what the camera waits for.
 */
export type SaveTake = ReturnType<typeof useSaveTake>;
