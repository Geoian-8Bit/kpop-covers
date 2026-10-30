/**
 * REQ-09 · The real wave of a file's audio under the editor's timeline: how many bars, and each bar's height.
 */

/** Files above this are not decoded at all (the decoded audio would not fit in a phone's memory). */
export const WAVE_MAX_BYTES = 400 * 1024 * 1024;
/** Above this the wave is drawn coarser (fewer bars). */
export const WAVE_BIG_BYTES = 80 * 1024 * 1024;

/** Bars for a song: about 8 per second, between 120 and 1200; a big file gets a quarter of them. */
export function waveBuckets(durationSeconds: number, bytes: number | null): number {
  const base = Math.round(Math.min(1200, Math.max(120, durationSeconds * 8)));
  return bytes != null && bytes > WAVE_BIG_BYTES ? Math.max(120, Math.round(base / 4)) : base;
}

/** Peak level per bar (0…1, normalised to the loudest), mixing the channels. */
export function wavePeaks(channels: readonly Float32Array[], buckets: number): number[] {
  const length = channels[0]?.length ?? 0;
  if (length === 0 || buckets <= 0) return [];
  const size = length / buckets;
  // Reading every sample of a long song is slow: a stride keeps it to ~2000 reads per bar at most.
  const stride = Math.max(1, Math.floor(size / 2000));
  const out = new Array<number>(buckets).fill(0);
  let loudest = 0;
  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * size);
    const end = Math.min(length, Math.floor((b + 1) * size));
    let peak = 0;
    for (const ch of channels) {
      for (let i = start; i < end; i += stride) {
        const v = Math.abs(ch[i]!);
        if (v > peak) peak = v;
      }
    }
    out[b] = peak;
    if (peak > loudest) loudest = peak;
  }
  return loudest > 0 ? out.map((v) => Math.round((v / loudest) * 1000) / 1000) : out;
}
