import type { Video } from '@coverscape/shared';
import { takeFileName } from '../recorder';
import { forgetTake, freeSpace, loadLeftover } from '../takeStore';
import type { Studio } from './useStudioSession';

/** R1 · A take left on the phone by an app that closed mid-take: recovered into the review, or discarded. */
export function useLeftover(S: Studio, video: Video) {
  const { fx, leftover, setLeftover, setLeftoverCount, session, setNotice } = S;

  async function recoverLeftover() {
    const found = leftover;
    if (!found) return;
    const id = session.current;
    const blob = await loadLeftover(found.meta);
    if (id !== session.current) return;
    setLeftover(null);
    setLeftoverCount((n) => Math.max(0, n - 1));
    if (!blob) {
      setNotice('Esa toma ya no está en el móvil.');
      return;
    }
    const type = blob.type || 'video/webm';
    const file = new File(
      [blob],
      takeFileName({ ...video, title: found.meta.title || video.title }, type, found.meta.startedAt),
      {
        type,
      },
    );
    S.setSeconds(-1);
    S.setLastStats(null);
    S.fromClap.current = false;
    fx.replaceTake({ url: URL.createObjectURL(file), file }, found.meta.id, found.meta.videoId);
    S.reviewTiming.current = found.meta.timing ?? null;
    if (S.reviewTake.current && found.meta.noSpace) S.reviewTake.current.noSpace = true;
    S.setPhase('review');
  }

  function dropLeftover() {
    const found = leftover;
    setLeftover(null);
    setLeftoverCount((n) => Math.max(0, n - 1));
    if (found) void forgetTake(found.meta.id).then(() => freeSpace().then(S.setFree));
  }

  fx.dropLeftover = dropLeftover;
  return { recoverLeftover };
}
