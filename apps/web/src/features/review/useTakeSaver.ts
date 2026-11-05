import { type TakeItem, type TakeReviewPatch, useUpdateTakeReview } from '@/data/takes';
import { friendlyError } from '@/lib/supabase';
import { useCallback, useEffect, useRef } from 'react';
import type { SaveStatus } from './reviewStageStore';

/**
 * Debounced, optimistic save of one of the review's values on the take. REQ-25 · The status goes to `onStatus`
 * (the review's stage store, read by the settings) instead of the screen's state.
 */
export function useTakeSaver(
  take: TakeItem,
  onError: (message: string) => void,
  onStatus: (status: SaveStatus) => void,
) {
  const mutation = useUpdateTakeReview();
  const pending = useRef<TakeReviewPatch | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const mutate = mutation.mutate;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const patch = pending.current;
    pending.current = null;
    if (!patch) return;
    if (mounted.current) onStatusRef.current('saving');
    mutate(
      { take, patch },
      {
        onSuccess: () => {
          if (mounted.current) onStatusRef.current('saved');
        },
        onError: (err) => {
          if (mounted.current) onStatusRef.current('error');
          onErrorRef.current(friendlyError(err));
        },
      },
    );
  }, [mutate, take]);

  const save = useCallback(
    (patch: TakeReviewPatch, wait = 600) => {
      pending.current = { ...pending.current, ...patch };
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, wait);
    },
    [flush],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      flush(); // closing within the wait still saves
    };
  }, [flush]);

  return { save };
}
