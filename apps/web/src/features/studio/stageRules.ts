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

/**
 * [4] · Whether the file on the stage is the group's lighter copy and not the original: it came from the cloud (this
 * device has no copy of its own) and the original, as the row describes it, is bigger than one cloud file may be, so
 * what the cloud holds can only be the reduced copy (13). An original that fits was uploaded as it is.
 */
export function playsGroupCopy({
  fromCloud,
  originalBytes,
  limitBytes,
}: {
  fromCloud: boolean;
  originalBytes: number | null | undefined;
  limitBytes: number;
}): boolean {
  return fromCloud && originalBytes != null && originalBytes > limitBytes;
}

/**
 * «Copia del grupo · 720p»: what the «Vídeo» row says for the group's copy, with the picture's real size (its short
 * side, so a vertical video reads the same) once the player knows it.
 */
export function groupCopyLabel(media: { width: number; height: number } | null): string {
  const side = media ? Math.min(media.width, media.height) : 0;
  return side > 0 ? `Copia del grupo · ${Math.round(side)}p` : 'Copia del grupo';
}
