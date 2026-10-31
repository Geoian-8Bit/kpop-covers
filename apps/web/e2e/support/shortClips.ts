import { FIXTURE } from './seed';

/**
 * REQ-03 · Clips of the upload squeezed inside the test video's real 3 s (the fixture's sit past a 3-minute song).
 * Shared by the studio flows and the perf harness so both measure the same clips.
 */
export function shortClips(db: Record<string, Record<string, unknown>[]>): void {
  const mine = db.clips!.filter((c) => c.video_id === FIXTURE.uploadVideoId);
  mine.forEach((c, i) =>
    Object.assign(c, { start_seconds: 0.4 + i * 0.2, end_seconds: 1.4 + i * 0.2, speed: 1, mirrored: false }),
  );
}
