/**
 * F1 · A YouTube entry and its own file: one timeline (the YouTube one) for clips, notes and takes, and a fixed
 * offset to play the file in sync. Pure rules, shared by the studio and the tests.
 */

/** Seconds the file is ahead of YouTube: file time = YouTube time + offset. */
export function fileTime(videoTime: number, offset: number | null | undefined): number {
  return videoTime + (offset ?? 0);
}

export function videoTime(fileSeconds: number, offset: number | null | undefined): number {
  return fileSeconds - (offset ?? 0);
}

/**
 * The offset from one moment marked in each player (e.g. the first beat): where it is in the file minus where
 * it is on YouTube. Rounded to milliseconds.
 */
export function offsetFromMarks(fileMark: number, videoMark: number): number {
  return Math.round((fileMark - videoMark) * 1000) / 1000;
}

/** Fine adjustment of the offset by ± steps, kept within ±1 h like the database. */
export function nudgeOffset(offset: number, delta: number): number {
  return Math.round(Math.min(3600, Math.max(-3600, offset + delta)) * 1000) / 1000;
}

/**
 * A file more than 1 s longer or shorter than the YouTube video is probably another version (a fancam, a cut,
 * the mirrored practice): the app warns before linking it. Unknown lengths can't be compared.
 */
export function durationMismatch(videoSeconds: number | null | undefined, fileSeconds: number | null | undefined): boolean {
  if (!videoSeconds || !fileSeconds || videoSeconds <= 0 || fileSeconds <= 0) return false;
  return Math.abs(videoSeconds - fileSeconds) > 1;
}

const STOP = new Set([
  'mv', 'm/v', 'official', 'video', 'dance', 'practice', 'mirrored', 'mirror', 'ver', 'version', 'the', 'a', 'de',
  'la', 'el', 'y', 'and', 'feat', 'ft', 'mp4', 'webm', 'mov', 'mkv', 'cover', 'choreography', 'performance', '4k',
  'hd', '1080p', '720p', 'full', 'fix', 'moving', 'kpop',
]);

/** Words of a title, lowercased, without accents, punctuation, brackets' noise or file extensions. */
export function titleWords(title: string): string[] {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // Back to composed form: Hangul syllables were split into jamo by NFKD.
    .normalize('NFC')
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** 0–1 likeness between two titles (shared words over the shorter title's words). */
export function titleLikeness(a: string, b: string): number {
  const wa = new Set(titleWords(a));
  const wb = new Set(titleWords(b));
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size);
}

/** Library entries that may be the same song as a file being added, best first (F1 «evitar duplicados»). */
export function similarTitles<T extends { title: string; artist?: string | null }>(
  name: string,
  entries: readonly T[],
  { min = 0.5, max = 4 }: { min?: number; max?: number } = {},
): T[] {
  return entries
    .map((e) => ({ e, score: Math.max(titleLikeness(name, e.title), titleLikeness(name, `${e.artist ?? ''} ${e.title}`)) }))
    .filter((x) => x.score >= min)
    .sort((x, y) => y.score - x.score)
    .slice(0, max)
    .map((x) => x.e);
}
