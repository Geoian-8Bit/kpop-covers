import type { Video } from '@coverscape/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { downloadTake, releaseTakeUrl, takeKeys, takeUrl, useSetBestTake, type TakeItem } from '@/data/takes';
import { friendlyError } from '@/lib/supabase';
import { useToast } from '@/providers/ToastProvider';

type Busy = { id: string; action: 'play' | 'download' } | null;

/** The row actions, called with the take they act on. */
export interface TakeRowActions {
  play: (take: TakeItem) => void;
  download: (take: TakeItem) => void;
  toggleBest: (take: TakeItem) => void;
  share: (take: TakeItem) => void;
  remove: (take: TakeItem) => void;
  refused: (reason: string) => void;
}

/**
 * REQ-27 · Play, download and star a take, with the one-at-a-time `busy` guard, moved out of `TakesPanel`.
 * `rowActions` is stable for the panel's life and always calls the latest handlers, so `TakeRow` (memo) keeps
 * its render when only another row changed.
 */
export function useTakeActions(
  video: Video,
  onPlay: (take: TakeItem, url: string) => void,
  more: Pick<TakeRowActions, 'share' | 'remove'>,
) {
  const setBest = useSetBestTake();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<Busy>(null);
  /** The last object URL handed to `onPlay`: released when another take plays. */
  const lastUrl = useRef<string | null>(null);

  async function play(take: TakeItem) {
    if (busy) return;
    setBusy({ id: take.id, action: 'play' });
    try {
      const url = await takeUrl(take);
      if (lastUrl.current !== url) releaseTakeUrl(lastUrl.current);
      lastUrl.current = url;
      onPlay(take, url);
    } catch (err) {
      toast(friendlyError(err), 'error');
      // Its copy may have gone (storage cleared): show where it really is.
      void queryClient.invalidateQueries({ queryKey: takeKeys.forVideo(video.id) });
    } finally {
      setBusy(null);
    }
  }

  async function download(take: TakeItem) {
    if (busy) return;
    setBusy({ id: take.id, action: 'download' });
    try {
      const result = await downloadTake(take, video);
      if (result === 'saved')
        toast(take.where === 'here' ? 'Descargando la toma' : 'Descargando la copia de la nube', 'success');
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusy(null);
    }
  }

  function toggleBest(take: TakeItem) {
    setBest.mutateAsync({ take, isBest: !take.is_best }).catch((err) => toast(friendlyError(err), 'error'));
  }

  const latest = useRef<TakeRowActions | null>(null);
  useLayoutEffect(() => {
    latest.current = {
      play: (take) => void play(take),
      download: (take) => void download(take),
      toggleBest,
      share: more.share,
      remove: more.remove,
      refused: (reason) => toast(reason, 'info'),
    };
  });
  const rowActions = useMemo<TakeRowActions>(
    () => ({
      play: (take) => latest.current?.play(take),
      download: (take) => latest.current?.download(take),
      toggleBest: (take) => latest.current?.toggleBest(take),
      share: (take) => latest.current?.share(take),
      remove: (take) => latest.current?.remove(take),
      refused: (reason) => latest.current?.refused(reason),
    }),
    [],
  );

  return { busy, rowActions };
}
