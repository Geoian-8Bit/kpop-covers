/**
 * When this device last opened each video, so the library can lead with what *you* were working on
 * (the group shares one library, but "last opened" is personal). Stored in localStorage only.
 */
const KEY = 'coverscape.recent';
const MAX = 200;

export function readRecent(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, number>;
  } catch {
    /* blocked or corrupt storage: no history */
  }
  return {};
}

export function markOpened(videoId: string) {
  try {
    const recent = readRecent();
    recent[videoId] = Date.now();
    const kept = Object.entries(recent)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    /* not persisted; ordering just falls back to newest first */
  }
}

/** Most recently opened first; never-opened videos keep their original (newest added) order after them. */
export function byRecentlyOpened<T extends { id: string }>(list: readonly T[], recent: Record<string, number>): T[] {
  return list
    .map((item, index) => ({ item, index, at: recent[item.id] ?? 0 }))
    .sort((a, b) => b.at - a.at || a.index - b.index)
    .map((x) => x.item);
}
