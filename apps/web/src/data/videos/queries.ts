import type { Video } from '@coverscape/shared';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { backend, type VideoWithClipCount } from '@/lib/backend/core';
import { forgetSigned } from '@/lib/backend/signedUrls';
import { posterKey } from '@/lib/posterKey';
import {
  libraryRowsSnapshot,
  parseLibrary,
  readSnapshot,
  videoFromLibraryRow,
  writeSnapshot,
} from '@/lib/snapshot';
import { VIDEO_BUCKET } from '@/lib/supabase';
import { loadPosters, posterLacking, posterOf, withPosters, type PosterMap } from './posters';

export const videoKeys = {
  all: ['videos'] as const,
  list: (crewId: string | undefined) => [...videoKeys.all, crewId] as const,
  detail: (id: string | undefined) => ['video', id] as const,
  posters: (crewId: string | undefined) => ['video-posters', crewId] as const,
};

const librarySnapshot = (crewId: string) => `videos.${crewId}`;

// REQ-08 · The IndexedDB module (idb-keyval) loads on demand so the entry chunk stays small. On a repeat visit the
// poster query starts the device read before its request goes out, so it is ready by the time the revisions arrive;
// on a first visit nothing waits for it beyond the read itself (an empty store answers at once).
const localVideos = () => import('@/lib/localVideos');
const posterStore = {
  read: () => localVideos().then((m) => m.readKeptPosters()),
  keep: (list: readonly [key: string, url: string][]) => localVideos().then((m) => m.keepPosters(list)),
  drop: (keys: readonly string[]) => localVideos().then((m) => m.dropPosters(keys)),
};

// REQ-14 · Which groups already keep their posters on this device (set once they are stored there). It is only a hint
// that picks the request: without it `loadPosters` reads IndexedDB first (devices that kept posters before the hint
// existed), and when it is wrong the revisions path asks the network for what is missing.
const POSTERS_KEPT = 'oneshoot.postersKept.v1:';
function postersKept(crewId: string): boolean {
  try {
    return localStorage.getItem(POSTERS_KEPT + crewId) === '1';
  } catch {
    return false; // blocked storage: IndexedDB is very likely blocked too, so everything comes from the network
  }
}
function markPostersKept(crewId: string): void {
  try {
    localStorage.setItem(POSTERS_KEPT + crewId, '1');
  } catch {
    // Blocked storage: the next visit asks for all posters again.
  }
}

/**
 * REQ-14 · The group's inline posters (`select id, poster_rev` of `poster_inline` rows, then `thumbnail_url` only for
 * the ones this device lacks). `staleTime: Infinity`: it never refetches by itself; each library fetch refreshes it
 * (`refreshPosters`), and writes keep it in step (`rememberPoster`).
 */
function postersQuery(queryClient: QueryClient, crewId: string | undefined) {
  return {
    queryKey: videoKeys.posters(crewId),
    queryFn: async (): Promise<PosterMap> => {
      const known = queryClient.getQueryData<PosterMap>(videoKeys.posters(crewId));
      return loadPosters({
        known,
        hinted: postersKept(crewId!),
        store: posterStore,
        listAll: () => backend.listCrewPosters(crewId!),
        listRevs: () => backend.listPosterRevs(crewId!),
        fetchMissing: (ids) => backend.listPosters(ids),
        markKept: () => markPostersKept(crewId!),
      });
    },
    staleTime: Infinity,
  };
}

/** Refresh the posters alongside a library fetch; a failure leaves the cards without them (as a missing poster). */
function refreshPosters(queryClient: QueryClient, crewId: string): Promise<unknown> {
  return queryClient
    .fetchQuery({ ...postersQuery(queryClient, crewId), staleTime: 0 })
    .catch(() => undefined);
}

/** REQ-14 · The posters for rows that don't come from the library list (bag and event rows combine by id). */
export function useVideoPosters(crewId: string | undefined, enabled = true): PosterMap | undefined {
  const queryClient = useQueryClient();
  return useQuery({ ...postersQuery(queryClient, crewId), enabled: Boolean(crewId) && enabled }).data;
}

export { posterOf };

/** Posters already asked for by id and revision this visit: each is asked once (no loops if the server lacks it). */
const askedPosters = new Set<string>();
/** Posters lacking in the map, gathered for one request per group (every card asks in the same commit). */
const posterBatches = new Map<string, Set<string>>();

/**
 * REQ-14 · A joined row carries an inline poster the map lacks (uploaded or re-postered on another phone after the
 * map was read; the map never refetches by itself). Only those are asked for, at once, with the same request as the
 * poster query's missing ones (`listPosters`, `.in('id', …)`), and the map and the device keep them.
 */
function requestPoster(queryClient: QueryClient, crewId: string, id: string, rev: string): void {
  const tag = posterKey(id, rev);
  if (askedPosters.has(tag)) return;
  askedPosters.add(tag);
  const batch = posterBatches.get(crewId);
  if (batch) {
    batch.add(id);
    return;
  }
  posterBatches.set(crewId, new Set([id]));
  queueMicrotask(() => {
    const ids = [...(posterBatches.get(crewId) ?? [])];
    posterBatches.delete(crewId);
    void backend
      .listPosters(ids)
      .then((found) => {
        if (!found.length) return;
        queryClient.setQueryData<PosterMap>(videoKeys.posters(crewId), (current) => {
          if (!current) return current;
          const next = { ...current };
          for (const p of found) next[p.id] = { rev: p.poster_rev, url: p.thumbnail_url };
          return next;
        });
        void posterStore.keep(
          found.map((p) => [posterKey(p.id, p.poster_rev), p.thumbnail_url] as [string, string]),
        );
      })
      // A failure leaves the card without its poster (as a missing one); the next library visit brings it.
      .catch(() => undefined);
  });
}

/**
 * REQ-14 · The poster of a video joined into another row (bag item, event song): combined by id. Only an uploaded
 * video can have an inline poster, so only then is the poster query used; one the map lacks is asked for at once.
 */
export function useJoinedPoster(
  video:
    | {
        id: string;
        thumbnail_url: string | null;
        source: string;
        poster_inline?: boolean | null;
        poster_rev?: string | null;
      }
    | null
    | undefined,
  crewId: string | undefined,
): string | null {
  const queryClient = useQueryClient();
  const posters = useVideoPosters(crewId, video?.source === 'upload');
  const lacking = video && crewId && posterLacking(video, posters) ? video.poster_rev : null;
  const id = video?.id;
  useEffect(() => {
    if (lacking && id && crewId) requestPoster(queryClient, crewId, id, lacking);
  }, [queryClient, crewId, id, lacking]);
  return video ? posterOf(video, posters) : null;
}

/** REQ-14 · A video row just written (it carries its inline poster): the poster map follows, so it isn't fetched. */
export function rememberPoster(queryClient: QueryClient, video: Video): void {
  if (!video.poster_inline || !video.poster_rev || !video.thumbnail_url) return;
  const entry = { rev: video.poster_rev, url: video.thumbnail_url };
  queryClient.setQueryData<PosterMap>(videoKeys.posters(video.crew_id), (current) =>
    current ? { ...current, [video.id]: entry } : current,
  );
  void posterStore.keep([[posterKey(video.id, entry.rev), entry.url]]);
}

/** The library list with its posters refreshed alongside (one function for `useVideos` and the startup prefetch). */
async function fetchLibrary(queryClient: QueryClient, crewId: string): Promise<VideoWithClipCount[]> {
  const [list] = await Promise.all([backend.listVideos(crewId), refreshPosters(queryClient, crewId)]);
  // Videos deleted on another device leave their copy here: drop those (never blocks the list).
  const ids = list.map((v) => v.id);
  void localVideos()
    .then((m) => m.purgeLocalVideos(ids))
    .catch(() => undefined);
  writeSnapshot(librarySnapshot(crewId), libraryRowsSnapshot(list));
  return list;
}

/**
 * REQ-06 · REQ-10 · Startup on the library (`/`) with the group kept on this device (a repeat visit): the list and its
 * posters are asked for before React mounts, not after the first commit. Same key and function as `useVideos`, so the
 * hook joins this request (and shows the snapshot meanwhile, as before). Without a kept group nothing starts here.
 */
export function prefetchLibrary(queryClient: QueryClient, crewId: string | undefined): void {
  if (!crewId) return;
  void queryClient
    .prefetchQuery({ queryKey: videoKeys.list(crewId), queryFn: () => fetchLibrary(queryClient, crewId) })
    .catch(() => undefined);
}

/**
 * `enabled: false` reads whatever is cached without fetching (e.g. a closed dialog).
 * `snapshot`: P2 · while the first request runs, show the list kept from the last visit (`isPlaceholderData`);
 * only the library page asks for it, and nothing writes from it (it never enters the cache).
 * REQ-14 · The rows come without inline posters; they're combined by id from the poster query, which runs in
 * parallel and settles before the list does, so the cards paint with their posters as before.
 */
export function useVideos(
  crewId: string | undefined,
  { enabled = true, snapshot = false }: { enabled?: boolean; snapshot?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const posters = useVideoPosters(crewId, enabled);
  const select = useCallback((list: VideoWithClipCount[]) => withPosters(list, posters), [posters]);
  return useQuery({
    queryKey: videoKeys.list(crewId),
    enabled: Boolean(crewId) && enabled,
    placeholderData:
      snapshot && crewId
        ? () => readSnapshot(librarySnapshot(crewId), (v) => parseLibrary(v, crewId))
        : undefined,
    queryFn: () => fetchLibrary(queryClient, crewId!),
    select,
  });
}

function videoQuery(id: string | undefined) {
  return { queryKey: videoKeys.detail(id), queryFn: () => backend.getVideo(id!) };
}

export function useVideo(id: string | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    ...videoQuery(id),
    enabled: Boolean(id),
    // P3 · The library already has this row: open the studio at once while the full row arrives
    // (`isPlaceholderData`; never in the cache, so no write starts from it). REQ-16 · Uploaded and linked videos
    // too (the row carries the file columns), with the poster combined as in the list.
    placeholderData: () => {
      if (!id) return undefined;
      for (const [key, list] of queryClient.getQueriesData<VideoWithClipCount[]>({
        queryKey: videoKeys.all,
      })) {
        const row = list?.find((v) => v.id === id);
        if (!row) continue;
        const posters = queryClient.getQueryData<PosterMap>(videoKeys.posters(key[1] as string | undefined));
        return videoFromLibraryRow(
          row.poster_inline ? { ...row, thumbnail_url: posterOf(row, posters) } : row,
        );
      }
      return undefined;
    },
  });
}

/** P3 · Warm a video's full row (hover or focus on its card; clips and notes have their own), unless cached. */
export function prefetchVideo(queryClient: QueryClient, id: string): void {
  void queryClient.prefetchQuery(videoQuery(id));
}

/**
 * REQ-06 · REQ-16 · Cold start straight on the studio: the row (same query as `useVideo`) starts with the route chunk
 * instead of after it, and once it says there is a cloud file its signature starts too (remembered, REQ-15), as a tap
 * on the card does.
 */
export function prefetchVideoAndFile(queryClient: QueryClient, id: string): void {
  void queryClient
    .prefetchQuery(videoQuery(id))
    .then(() => prefetchVideoUrl(queryClient.getQueryData<Video | null>(videoKeys.detail(id))?.storage_path));
}

/** REQ-15 · A signed URL for the group's file, reused while it has time left (one signature per file). */
export function signedVideoUrl(path: string): Promise<string | null> {
  return backend.signedUrl(path);
}

/** REQ-16 · About to open: sign the cloud file now (remembered), so the studio doesn't wait for it. */
export function prefetchVideoUrl(path: string | null | undefined): void {
  if (path) void backend.signedUrl(path).catch(() => null);
}

/** REQ-15 · The file didn't load with the remembered URL: the next request signs again. */
export function forgetVideoUrl(path: string): void {
  forgetSigned(`${VIDEO_BUCKET}/${path}`);
}
