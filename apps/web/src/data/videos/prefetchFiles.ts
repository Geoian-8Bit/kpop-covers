import type { QueryClient } from '@tanstack/react-query';
import { nearestEventVideoIds } from '@/data/events';
import type { VideoWithClipCount } from '@/lib/backend/core';
import {
  cachedCloudFiles,
  cloudCacheLimits,
  cloudDownloadsRunning,
  downloadCloudFile,
  openCloudFiles,
  saveDataOn,
} from '@/lib/cloudCache';
import {
  PREFETCH_RETRY_AFTER_MS,
  connectionKind,
  nextPrefetch,
  prefetchMayRun,
  type PrefetchCandidate,
} from '@/lib/cloudPrefetchRules';
import { whenIdle } from '@/lib/idle';
import { mediaBusy, uploadsRunning } from '@/lib/mediaActivity';
import { stageBuffer } from '@/player/stageBuffer';
import { signedVideoUrl, videoKeys } from './queries';

/** First look after start (the first screen and its requests settle first), then a look every so often. */
const FIRST_LOOK_MS = 30_000;
const LOOK_EVERY_MS = 2 * 60_000;
/** A file whose copy failed this many times is left alone until the next visit (e.g. bigger than the ceiling). */
const MAX_FAILURES = 2;

/** The connection type where the browser has it (Chromium on Android / ChromeOS); else unknown. */
function connection() {
  const c = (navigator as Navigator & { connection?: { type?: string } }).connection;
  return connectionKind(c?.type);
}

/**
 * Quiet background copy of the songs the next rehearsal most likely plays (the nearest event's repertoire), one
 * file at a time, so they play from the device when the 4G dies. Nothing shows: no text, no progress. Runs only
 * idle, on screen, off mobile data, with no other download or upload and no player streaming
 * (cloudPrefetchRules.prefetchMayRun, asked before every chunk: the download holds still meanwhile and resumes by
 * range), never with «Ahorro de datos», never pushing out the open or last played video, and only while the
 * device has room (cloudPrefetchRules.nextPrefetch). Any browser: what it doesn't report is treated cautiously.
 * Returns a stop.
 */
export function startCloudPrefetch(queryClient: QueryClient): () => void {
  if (typeof caches === 'undefined') return () => undefined;
  let running = false;
  let stopped = false;
  let cancelIdle: (() => void) | null = null;
  const failed = new Map<string, { at: number; times: number }>();

  const visible = () => document.visibilityState === 'visible';
  const mayRun = () =>
    prefetchMayRun({
      stage: stageBuffer(),
      visible: visible(),
      saveData: saveDataOn(),
      connection: connection(),
      // The prefetch's own download counts itself.
      otherDownloads: Math.max(0, cloudDownloadsRunning() - (running ? 1 : 0)),
      uploads: uploadsRunning(),
      mediaBusy: mediaBusy(),
    });

  const candidates = async (): Promise<PrefetchCandidate[]> => {
    const ids = await nearestEventVideoIds(queryClient, new Date());
    if (!ids.length) return [];
    const rows = new Map<string, VideoWithClipCount>();
    for (const [, list] of queryClient.getQueriesData<VideoWithClipCount[]>({ queryKey: videoKeys.all })) {
      for (const v of Array.isArray(list) ? list : []) rows.set(v.id, v);
    }
    return ids.flatMap((id) => {
      const v = rows.get(id);
      return v?.storage_path ? [{ videoId: id, path: v.storage_path, bytes: v.file_size ?? null }] : [];
    });
  };

  const freeBytes = async (): Promise<number | null> => {
    try {
      const est = await navigator.storage?.estimate?.();
      return est?.quota != null && est.usage != null ? Math.max(0, est.quota - est.usage) : null;
    } catch {
      return null;
    }
  };

  const look = async () => {
    if (running || stopped || !navigator.onLine || !mayRun()) return;
    running = true;
    try {
      const list = await candidates();
      const now = Date.now();
      const skip = new Set<string>();
      for (const [path, f] of failed) {
        if (f.times >= MAX_FAILURES || now - f.at < PREFETCH_RETRY_AFTER_MS) skip.add(path);
      }
      // This device's own file (uploaded or linked here) already plays from the phone.
      const { loadLocalVideo } = await import('@/lib/localVideos');
      for (const c of list) if (await loadLocalVideo(c.videoId).catch(() => undefined)) skip.add(c.videoId);
      const pick = nextPrefetch({
        candidates: list,
        cached: cachedCloudFiles(),
        open: openCloudFiles(),
        skip,
        limits: cloudCacheLimits(),
        connection: connection(),
        freeBytes: await freeBytes(),
      });
      if (!pick || stopped) return;
      const url = await signedVideoUrl(pick.path).catch(() => null);
      const copy = url
        ? await downloadCloudFile(pick.path, url, { mayRun, prefetched: true, maxBytes: pick.maxBytes })
        : null;
      if (!copy) failed.set(pick.path, { at: Date.now(), times: (failed.get(pick.path)?.times ?? 0) + 1 });
      // Done with one: look for the next soon (one at a time).
      else schedule(5_000);
    } catch {
      /* the next look tries again */
    } finally {
      running = false;
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  function schedule(ms: number) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      cancelIdle?.();
      cancelIdle = whenIdle(() => void look(), { timeout: 10_000, fallbackMs: 2000 });
    }, ms);
  }
  const every = setInterval(() => schedule(0), LOOK_EVERY_MS);
  const onVisible = () => {
    if (visible()) schedule(5_000);
  };
  const onOnline = () => schedule(5_000);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  schedule(FIRST_LOOK_MS);

  return () => {
    stopped = true;
    clearTimeout(timer);
    clearInterval(every);
    cancelIdle?.();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
  };
}
