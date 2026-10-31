import { createStore, del, get, set } from 'idb-keyval';
import { cacheEvictions, CLOUD_CACHE, type CacheEntry } from './cloudCacheRules';

/**
 * The device's copies of group files that came from the cloud (not this device's own files: those live in
 * localVideos.ts and count as «on this device»). A cloud file streams by ranges: on a slow 4G every loop jump back
 * outside what the browser kept asks the network again and the video stops loading. Once the whole file is here the
 * loop plays from the phone. Keyed by storage path (a replaced file gets a new path), a few of them, least recently
 * used dropped first.
 */

// Its own database: idb-keyval opens one object store per database.
let store: ReturnType<typeof createStore> | null = null;
const files = () => (store ??= createStore('coverscape-cache', 'files'));
const INDEX_KEY = 'oneshoot.cloudcache.v1';

type Index = Record<string, { bytes: number; usedAt: number }>;

function readIndex(): Index {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '{}') as Index;
  } catch {
    return {};
  }
}

function writeIndex(index: Index): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* this visit only */
  }
}

/** The device copy of the cloud file at `path`, if one was downloaded before. */
export async function loadCachedCloudFile(path: string): Promise<Blob | undefined> {
  try {
    const blob = await get<Blob>(path, files());
    const index = readIndex();
    if (blob) {
      index[path] = { bytes: blob.size, usedAt: Date.now() };
      writeIndex(index);
    } else if (index[path]) {
      delete index[path];
      writeIndex(index);
    }
    return blob ?? undefined;
  } catch {
    return undefined;
  }
}

async function remember(path: string, blob: Blob): Promise<void> {
  try {
    await set(path, blob, files());
  } catch {
    return; // full or unavailable: the copy still serves this visit
  }
  const index = readIndex();
  index[path] = { bytes: blob.size, usedAt: Date.now() };
  const entries: CacheEntry[] = Object.entries(index).map(([key, v]) => ({ key, bytes: v.bytes, usedAt: v.usedAt }));
  for (const key of cacheEvictions(entries, path, CLOUD_CACHE)) {
    delete index[key];
    await del(key, files()).catch(() => undefined);
  }
  writeIndex(index);
}

/** One download per file at a time (a stage that remounts joins the one running). */
const inFlight = new Map<string, Promise<Blob | null>>();

/**
 * Downloads the whole cloud file in the background and keeps it. Not cancelled when the screen closes: the next
 * visit plays it from here. Null when the network or the server refused.
 */
export function downloadCloudFile(path: string, url: string): Promise<Blob | null> {
  const running = inFlight.get(path);
  if (running) return running;
  const job = (async () => {
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.size) return null;
      await remember(path, blob);
      return blob;
    } catch {
      return null;
    } finally {
      inFlight.delete(path);
    }
  })();
  inFlight.set(path, job);
  return job;
}

/** The browser asks for less data (Chrome's «Ahorro de datos»). */
export function saveDataOn(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}
