import type { VideoPoster, VideoPosterRev } from '@/lib/backend/core';
import { posterKey } from '@/lib/posterKey';

// REQ-14 · Uploaded videos keep a small JPEG poster inline (`data:`, 20–47 kB). The lists leave it out
// (`thumbnail_url:list_thumbnail_url`) and a separate query brings it, kept on the device by revision, so a repeat
// visit downloads none. Pure helpers here (testable without a backend); the query lives in `queries.ts`.

/** The group's inline posters by video id, with the revision each one is. */
export type PosterMap = Readonly<Record<string, { rev: string; url: string }>>;

export interface PosterStore {
  /** Every kept poster by key; throws when storage is unavailable. */
  read(): Promise<Map<string, string>>;
  keep(list: readonly [key: string, url: string][]): Promise<void>;
  drop(keys: readonly string[]): Promise<void>;
}

/**
 * The posters for `revs` (what the group has now): from memory (`known`, this visit), then the device, and only the
 * missing ones from the network (`fetchMissing`). Old revisions and archived videos leave the device in the same
 * pass. Blocked or full storage: everything comes from the network, with no visible error.
 */
export async function syncPosters(
  revs: readonly VideoPosterRev[],
  store: PosterStore,
  fetchMissing: (ids: string[]) => Promise<VideoPoster[]>,
  known?: PosterMap,
): Promise<PosterMap> {
  const out: Record<string, { rev: string; url: string }> = {};
  const fromMemory = revs.every(({ id, poster_rev }) => known?.[id]?.rev === poster_rev);
  let kept: Map<string, string> | null = null;
  if (!fromMemory) {
    try {
      kept = await store.read();
    } catch {
      kept = null;
    }
  }
  const wanted = new Set<string>();
  const missing: string[] = [];
  const toKeep: [string, string][] = [];
  for (const { id, poster_rev } of revs) {
    const key = posterKey(id, poster_rev);
    wanted.add(key);
    const url = known?.[id]?.rev === poster_rev ? known[id]!.url : kept?.get(key);
    if (url) {
      out[id] = { rev: poster_rev, url };
      if (kept && !kept.has(key)) toKeep.push([key, url]);
    } else {
      missing.push(id);
    }
  }
  if (kept) {
    const stale = [...kept.keys()].filter((key) => !wanted.has(key));
    if (stale.length) void store.drop(stale);
  }
  if (missing.length) {
    for (const p of await fetchMissing(missing)) {
      out[p.id] = { rev: p.poster_rev, url: p.thumbnail_url };
      toKeep.push([posterKey(p.id, p.poster_rev), p.thumbnail_url]);
    }
  }
  if (toKeep.length) void store.keep(toKeep);
  return out;
}

/**
 * REQ-14 · A device that keeps no posters yet (first visit) asks for all of them in one request, in parallel to the
 * list, instead of revisions first and then the missing ones in series. They are kept on the device afterwards and
 * anything left there from before (another group, an old revision) goes in the same pass, off the critical path.
 */
export function posterMapFrom(
  all: readonly VideoPoster[],
  store: PosterStore,
  onKept?: () => void,
): PosterMap {
  const out: Record<string, { rev: string; url: string }> = {};
  const list: [string, string][] = [];
  for (const p of all) {
    out[p.id] = { rev: p.poster_rev, url: p.thumbnail_url };
    list.push([posterKey(p.id, p.poster_rev), p.thumbnail_url]);
  }
  void (async () => {
    try {
      // Only a device that really kept something counts as «posters kept»; a group without posters stays a first visit.
      if (list.length) {
        await store.keep(list);
        onKept?.();
      }
      const wanted = new Set(list.map(([key]) => key));
      const stale = [...(await store.read()).keys()].filter((key) => !wanted.has(key));
      if (stale.length) await store.drop(stale);
    } catch {
      // Blocked or full storage: the next visit asks the network again, with no visible error.
    }
  })();
  return out;
}

type PosterRow = {
  id: string;
  thumbnail_url: string | null;
  poster_inline?: boolean | null;
  poster_rev?: string | null;
};

/**
 * A row's poster, combined by id: an inline poster comes from the map; anything else (YouTube's URL) is the row's.
 * Rows without `poster_inline` (a join that doesn't ask for it) take the map's poster when there is one. A row that
 * says which revision it is (`poster_rev`) only takes that revision: an older one in the map is not shown.
 */
export function posterOf(row: PosterRow, posters: PosterMap | undefined): string | null {
  if (row.poster_inline === false) return row.thumbnail_url;
  const kept = posters?.[row.id];
  if (kept && (row.poster_rev == null || kept.rev === row.poster_rev)) return kept.url;
  return row.thumbnail_url ?? null;
}

/**
 * True when a row has an inline poster the loaded map lacks (a video uploaded or re-postered on another phone after
 * the map was read): that poster has to be asked for. While the map is still loading nothing is lacking yet.
 */
export function posterLacking(row: PosterRow, posters: PosterMap | undefined): boolean {
  return Boolean(row.poster_inline && row.poster_rev && posters && posters[row.id]?.rev !== row.poster_rev);
}

/** The list with each inline poster put back in `thumbnail_url` (other rows keep their identity). */
export function withPosters<T extends PosterRow>(list: readonly T[], posters: PosterMap | undefined): T[] {
  if (!posters || !list.some((v) => v.poster_inline)) return list as T[];
  return list.map((v) => (v.poster_inline ? { ...v, thumbnail_url: posterOf(v, posters) } : v));
}

export interface PosterSources {
  /** This visit's map, when there is one (a refresh): the revisions path alone is enough. */
  known?: PosterMap;
  /** The «this group's posters are already on the device» hint (localStorage); it only picks the request. */
  hinted: boolean;
  store: PosterStore;
  listAll(): Promise<VideoPoster[]>;
  listRevs(): Promise<VideoPosterRev[]>;
  fetchMissing(ids: string[]): Promise<VideoPoster[]>;
  /** Called once the device is known to hold posters for this group, so the next visit skips the check. */
  markKept(): void;
}

/**
 * REQ-14 · Which request brings the posters. A device that holds posters (hinted, or found by reading IndexedDB when
 * the hint is missing: devices that kept them before the hint existed) takes the repeat path, so only the missing ones
 * are downloaded; the device read runs alongside the revisions request. Only an empty or unreachable IndexedDB asks for
 * all of them at once. A wrong hint is harmless: the repeat path asks the network for whatever is missing.
 */
export async function loadPosters(src: PosterSources): Promise<PosterMap> {
  const { known, hinted, store } = src;
  let kept: Promise<Map<string, string>> | null = null;
  if (!known) {
    if (hinted) {
      kept = store.read();
    } else {
      let found: Map<string, string> | null;
      try {
        found = await store.read();
      } catch {
        found = null; // blocked storage: everything comes from the network
      }
      if (!found || found.size === 0) {
        return posterMapFrom(await src.listAll(), store, src.markKept);
      }
      src.markKept();
      kept = Promise.resolve(found);
    }
    kept.catch(() => undefined);
  }
  return syncPosters(
    await src.listRevs(),
    kept ? { ...store, read: () => kept! } : store,
    src.fetchMissing,
    known,
  );
}
