/**
 * 13 · The group's cloud as the database enforces it (migration 20261017140000): 1 GiB for videos and takes together,
 * and a file in the videos bucket is only accepted if, once stored, 50 MB are still free for one shared take. The
 * database can't see a file's size before it arrives, so it counts every upload as the per-file limit (50 MB).
 *
 * Kept apart from `cloudCopyRules` on purpose: the data layer (in the app's entry) needs only this, not the rules of
 * the reduced copy.
 */
export const CLOUD_SPACE = {
  quotaBytes: 1024 ** 3,
  /** Kept free for one shared take (what the takes bucket asks for, counted once). */
  takesReserveBytes: 52_428_800,
} as const;

/** Mirror of `private.videos_bucket_has_room`: one more file (counted as `limitBytes`) fits in the group. */
export function videosBucketHasRoom(usedBytes: number, limitBytes: number, quotaBytes: number = CLOUD_SPACE.quotaBytes): boolean {
  return Math.max(0, usedBytes) + Math.max(0, limitBytes) < quotaBytes - CLOUD_SPACE.takesReserveBytes;
}

/** What has to be free in the group for an upload to the videos bucket: the file (as the limit) and the reserve. */
export function videosUploadNeeds(limitBytes: number): number {
  return Math.max(0, limitBytes) + CLOUD_SPACE.takesReserveBytes;
}
