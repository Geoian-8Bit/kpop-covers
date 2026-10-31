import type { Page } from '@playwright/test';
import { DEMO_KEY } from '../../demo';

// REQ-02 · Shared helpers for the group-area flows (bags, RPD, wishes/polls, events).

export type Row = Record<string, unknown>;

/** One table of the demo store (`coverscape.demo.v1` in localStorage), straight from the browser. */
export async function table(page: Page, name: string): Promise<Row[]> {
  return page.evaluate(
    ([key, table]) => {
      const db = JSON.parse(localStorage.getItem(key as string) ?? '{}') as Record<string, Row[]>;
      return db[table as string] ?? [];
    },
    [DEMO_KEY, name] as const,
  );
}

/** Rows that are still live (not archived): what the UI shows. */
export async function live(page: Page, name: string): Promise<Row[]> {
  return (await table(page, name)).filter((r) => !r.archived_at);
}

/**
 * Makes every Math.random reproducible (mulberry32). Draws, shuffles and the tie-breaking wheel are random, and the
 * visual references need the same outcome on every run. Call before the first `goto`.
 */
export async function seedRandom(page: Page, seed = 20261020): Promise<void> {
  await page.addInitScript((s) => {
    let a = s >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

/** Fixture ids of the group area (see e2e/fixtures/generate.mjs). */
export const BAG = {
  songs: '00000000-0000-4000-8007-000000000001',
  clips: '00000000-0000-4000-8007-000000000002',
  people: '00000000-0000-4000-8007-000000000003',
} as const;
export const TRACK = {
  warmup: '00000000-0000-4000-800a-000000000001',
  contest: '00000000-0000-4000-800a-000000000002',
} as const;
export const POLL = (n: number) => `00000000-0000-4000-800e-${String(n).padStart(12, '0')}`;
export const EVENT = (n: number) => `00000000-0000-4000-8011-${String(n).padStart(12, '0')}`;

/** The playwright WebKit build on Windows has no WebAudio (`AudioNode`), so the app throws on boot and stays blank. */
export const WEBKIT_SKIP = 'Windows WebKit has no AudioNode: the app does not render (engine limitation)';
