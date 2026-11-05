import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { DEMO_KEY } from '../demo';

export { guardConsole, type Guard } from '../guard';

/**
 * REQ-02 · Deterministic test data for the local demo (`VITE_DEMO=true`, browser storage only: nothing here can
 * reach Supabase).
 *
 * The fixture (`e2e/fixtures/demo-db.json`, written by `node e2e/fixtures/generate.mjs`) is the whole
 * `coverscape.demo.v1` store, with every date placed relative to FIXED_NOW: 2026-10-20 18:00 in Madrid (+02:00,
 * summer time), a Tuesday with a rehearsal at 19:00. Its three events sit 12 days ahead (countdown in days),
 * 3 days ahead (last week) and 10 days back (past). Pages that show dates or countdowns must run on this clock
 * (fixClock) or they will drift as the real date moves on.
 */
export const FIXED_NOW = new Date('2026-10-20T18:00:00+02:00');

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(here, '..', 'fixtures', 'demo-db.json');

export type DemoFixture = Record<string, Record<string, unknown>[]>;

let cached: string | null = null;
/** A fresh copy of the fixture (tests can edit it freely). */
export function loadFixture(): DemoFixture {
  cached ??= readFileSync(FIXTURE_PATH, 'utf8');
  return JSON.parse(cached) as DemoFixture;
}

/** Ids worth reaching for in tests (they never change: see generate.mjs). */
export const FIXTURE = {
  crewId: '00000000-0000-4000-8000-0000000000c1',
  deviceId: '00000000-0000-4000-8000-0000000000d1',
  /** Hana, the first member; the default «¿Quién eres?» answer. */
  memberId: '00000000-0000-4000-8001-000000000001',
  /** «Dynamite» (BTS), YouTube, first of the 20 YouTube songs. */
  youtubeVideoId: '00000000-0000-4000-8002-000000000001',
  /** «Ensayo coreo completa», first of the 10 uploads (poster in base64, no file: see seedUploadMedia). */
  uploadVideoId: '00000000-0000-4000-8002-000000000015',
} as const;

export interface SeedFixtureOptions {
  /** Tables replaced as given (a shallow merge over the fixture), or a function that edits a copy of it. */
  overrides?: Partial<DemoFixture> | ((db: DemoFixture) => DemoFixture | void);
  /**
   * Who this device says it is (`oneshoot.me.v1`). Defaults to Hana so the first-time «¿Quién eres?» suggestion
   * doesn't cover the screens; `null` leaves the identity unset (the suggestion shows).
   */
  me?: string | null;
}

/**
 * Writes the fixture before the app runs, once per test: an init script runs on every navigation, and the
 * sessionStorage flag keeps later navigations and reloads from wiping what the test did (same as demo.ts seedDemo).
 * Also pins this browser's device id, so the seeded takes count as recorded on this phone.
 */
export async function seedFixture(page: Page, options: SeedFixtureOptions = {}): Promise<DemoFixture> {
  let db = loadFixture();
  const { overrides, me = FIXTURE.memberId } = options;
  if (typeof overrides === 'function') db = overrides(db) ?? db;
  else if (overrides) db = { ...db, ...(overrides as DemoFixture) };

  const identity = me === null ? null : JSON.stringify({ memberId: me, dismissed: true });
  await page.addInitScript(
    ([key, value, deviceId, identity]) => {
      if (sessionStorage.getItem('e2e.seeded')) return;
      localStorage.clear();
      localStorage.setItem(key, value);
      localStorage.setItem('oneshoot.device.v1', deviceId);
      if (identity) localStorage.setItem('oneshoot.me.v1', identity);
      sessionStorage.setItem('e2e.seeded', '1');
    },
    [DEMO_KEY, JSON.stringify(db), FIXTURE.deviceId, identity] as const,
  );
  return db;
}

/**
 * Puts the browser's clock at FIXED_NOW. Call before the first `goto`.
 *
 * - `'fixed'` (default): `page.clock.setFixedTime`. Only `Date` is frozen; timers, requestAnimationFrame and
 *   performance.now run for real, so motion animations, the splash and the video players behave as usual. Right
 *   for screens that print dates or countdowns.
 * - `'install'`: `page.clock.install({ time })`. Fakes every timer, rAF and performance.now too, but the fake clock
 *   still follows real time until the test calls `page.clock.pauseAt(…)`; `runFor(ms)` then advances it on command.
 *   Frame-by-frame animation references (REQ-02 point 5) must pause first (see `freeze()` in flows/shell/support.ts).
 */
export async function fixClock(page: Page, mode: 'fixed' | 'install' = 'fixed'): Promise<void> {
  if (mode === 'install') await page.clock.install({ time: FIXED_NOW });
  else await page.clock.setFixedTime(FIXED_NOW);
}

/**
 * Fake camera and microphone, and silence (e2e/fake-media.js), loaded before the app. Options for the fake
 * camera go in `cam` (window.__fakeCam: width, height, fps, zoom, torch).
 */
export async function useFakeMedia(page: Page, cam?: Record<string, unknown>): Promise<void> {
  if (cam)
    await page.addInitScript((opts) => ((window as unknown as { __fakeCam: unknown }).__fakeCam = opts), cam);
  await page.addInitScript({ path: path.join(here, '..', 'fake-media.js') });
}

/**
 * The fixture's uploads have no file: the demo keeps an upload's video in IndexedDB (`coverscape` › `videos`,
 * keyed by video id, see src/lib/localVideos.ts) and JSON can't carry a Blob. This stores one for `videoId`, so the
 * studio and the round can play it. Call after the first `goto` (IndexedDB needs the app's origin), then reload.
 */
export async function seedUploadMedia(page: Page, videoId: string, bytes: Buffer, mimeType = 'video/webm') {
  await page.evaluate(
    async ({ videoId, base64, mimeType }) => {
      const blob = await (await fetch(`data:${mimeType};base64,${base64}`)).blob();
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('coverscape');
        // Same shape idb-keyval's createStore('coverscape', 'videos') makes.
        open.onupgradeneeded = () => open.result.createObjectStore('videos');
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('videos', 'readwrite');
        tx.objectStore('videos').put(blob, videoId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { videoId, base64: bytes.toString('base64'), mimeType },
  );
}
