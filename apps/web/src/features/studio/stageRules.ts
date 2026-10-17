import type { StageChoice } from '@/lib/stagePref';

/**
 * 12 · What a YouTube entry opens on. The file wins whenever this device can play it (the group's cloud copy or a
 * copy kept here); YouTube only without a reachable file, or when the person chose it for this video.
 * A remembered «Archivo» that can't be reached any more falls back to YouTube (the switch can still pick the file,
 * which then offers to link a copy).
 */
export function initialStage({
  linked,
  choice,
  reachable,
}: {
  /** The entry has a linked file at all. */
  linked: boolean;
  /** The person's own choice on this device (null: none). */
  choice: StageChoice | null;
  /** The file can play here: in the cloud, or a current copy on this device. */
  reachable: boolean;
}): StageChoice {
  if (!linked) return 'youtube';
  if (choice === 'youtube') return 'youtube';
  return reachable ? 'file' : 'youtube';
}

/**
 * Whether the stage can be decided without looking for a device copy (an IndexedDB read): no file, a cloud copy,
 * or a choice of YouTube already settle it.
 */
export function needsLocalCheck({
  linked,
  choice,
  inCloud,
}: {
  linked: boolean;
  choice: StageChoice | null;
  inCloud: boolean;
}): boolean {
  return linked && choice !== 'youtube' && !inCloud;
}
