// REQ-08 · Kept apart from `localVideos` (IndexedDB) so this pure helper doesn't pull idb-keyval into the entry chunk.
const POSTER_PREFIX = 'oneshoot.poster.v1:';

/** `oneshoot.poster.v1:<id>:<poster_rev>`: a new revision is a new key, so a stale poster is never read. */
export const posterKey = (id: string, rev: string) => `${POSTER_PREFIX}${id}:${rev}`;
