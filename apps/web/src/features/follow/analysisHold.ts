import { heavyWorkBusy, heavyWorkRunning, onHeavyWorkChange } from '@/lib/heavyWork';
import { usePlayer } from '@/player/store';
import type { AnalysisHost, HoldReason } from './analyze';

/**
 * 15 · What the follow analysis needs to know about the studio around it: when to wait (the recorder covers the
 * studio and is recording a take; the AI voice separation is running; the copy for the group is being made — not
 * while it only uploads) and whether the studio is playing (the background part leaves it more room then).
 */
export function holdReason(): HoldReason | null {
  if (usePlayer.getState().covered) return 'recording';
  if (heavyWorkRunning('voice')) return 'voice';
  if (heavyWorkBusy('copy')) return 'copy';
  return null;
}

export const studioHost: AnalysisHost = {
  held: holdReason,
  playing: () => usePlayer.getState().playing,
  untilFree(signal: AbortSignal, onReason?: (reason: HoldReason) => void): Promise<void> {
    if (!holdReason() || signal.aborted) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let shown = holdReason();
      const check = () => {
        const reason = holdReason();
        if (reason && !signal.aborted) {
          // Still waiting, maybe for something else now (the take ended while the voice is being separated).
          if (reason !== shown) onReason?.(reason);
          shown = reason;
          return;
        }
        offPlayer();
        offWork();
        signal.removeEventListener('abort', check);
        resolve();
      };
      const offPlayer = usePlayer.subscribe((s, prev) => {
        if (s.covered !== prev.covered) check();
      });
      const offWork = onHeavyWorkChange(check);
      signal.addEventListener('abort', check);
    });
  },
};
