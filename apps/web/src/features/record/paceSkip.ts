import { PACE_TAKE_SKIP_SECONDS } from '@coverscape/shared';

/** What a take has counted so far: frames drawn (or presented, direct), frames the camera delivered, seconds. */
export interface PaceCounts {
  drawn: number;
  delivered: number;
  seconds: number;
}

const ZERO: PaceCounts = { drawn: 0, delivered: 0, seconds: 0 };

/**
 * P19 review · The stretches a take's pace is not counted on: its first `PACE_TAKE_SKIP_SECONDS`, and as many after
 * each resume (the song starts again, with the same stutter, and it would add up against the margin of lost frames).
 * `start` opens a stretch when a part starts rolling; `tick` closes it once it lasted long enough. Pauses freeze the
 * counts, so a stretch still open at a pause is closed by the next `start` with the same numbers.
 */
export function createSkipWindows(skipSeconds = PACE_TAKE_SKIP_SECONDS) {
  let open: PaceCounts | null = null;
  let skipped: PaceCounts = { ...ZERO };
  const add = (now: PaceCounts, from: PaceCounts): PaceCounts => ({
    drawn: skipped.drawn + Math.max(0, now.drawn - from.drawn),
    delivered: skipped.delivered + Math.max(0, now.delivered - from.delivered),
    seconds: skipped.seconds + Math.max(0, now.seconds - from.seconds),
  });
  const close = (now: PaceCounts) => {
    if (!open) return;
    skipped = add(now, open);
    open = null;
  };
  return {
    /** A part starts rolling (the take's start, or a resume). */
    start(now: PaceCounts) {
      close(now);
      open = { ...now };
    },
    /** Closes the open stretch once it lasted `skipSeconds`; true right then (counting starts again). */
    tick(now: PaceCounts): boolean {
      if (!open || now.seconds - open.seconds < skipSeconds) return false;
      close(now);
      return true;
    },
    /** True while a stretch is open (nothing is sampled meanwhile). */
    skipping: () => open != null,
    /** Everything skipped up to `now` (a stretch still open counts up to now). */
    skipped: (now: PaceCounts): PaceCounts => (open ? add(now, open) : { ...skipped }),
  };
}
export type SkipWindows = ReturnType<typeof createSkipWindows>;

/** The counts a take's pace is judged on: the totals minus what was skipped. */
export function countedPace(total: PaceCounts, skipped: PaceCounts): PaceCounts {
  return {
    drawn: Math.max(0, total.drawn - skipped.drawn),
    delivered: Math.max(0, total.delivered - skipped.delivered),
    seconds: Math.max(0, total.seconds - skipped.seconds),
  };
}
