import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { readDemo } from '../../demo';
import { fixClock, seedFixture, type SeedFixtureOptions } from '../../support/seed';
import { EVIDENCE } from '../../support/visual';

/**
 * REQ-02 · Helpers shared by the shell flows and its visual references (area `shell`).
 * Nothing here touches apps/web/src or the fixtures.
 */

/** A flat 480x360 picture, so YouTube thumbnails never depend on the network (or on YouTube changing them). */
const THUMB = (() => {
  const png = new PNG({ width: 480, height: 360 });
  for (let i = 0; i < png.data.length; i += 4) {
    const y = Math.floor(i / 4 / 480);
    png.data[i] = 70 + Math.round((y / 360) * 40);
    png.data[i + 1] = 60;
    png.data[i + 2] = 110;
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
})();

/** Every YouTube thumbnail answers with the same flat picture. */
export async function stubThumbnails(page: Page): Promise<void> {
  await page.route(/\/\/(i|img)\.ytimg\.com\//, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' }, // REQ-13 · the real host answers CORS
      body: THUMB,
    }),
  );
}

export interface OpenOptions extends SeedFixtureOptions {
  /** `fixed` (default) freezes Date only; `install` fakes every timer (frame-by-frame references). */
  clock?: 'fixed' | 'install';
}

/** Seeds the fixture, fixes the clock, stubs thumbnails and opens `url`. */
export async function openApp(page: Page, url = '/', { clock = 'fixed', ...seed }: OpenOptions = {}) {
  await stubThumbnails(page);
  await fixClock(page, clock);
  const db = await seedFixture(page, seed);
  await page.goto(url);
  return db;
}

/** Fonts and images are in: nothing about to shift the layout while a capture is taken. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images]
        .filter(
          (img) =>
            !img.complete && (img.loading !== 'lazy' || img.getBoundingClientRect().top < innerHeight + 100),
        )
        .map(
          (img) =>
            new Promise((done) => {
              img.addEventListener('load', done, { once: true });
              img.addEventListener('error', done, { once: true });
            }),
        ),
    );
  });
}

interface Row {
  id: string;
  archived_at: string | null;
  [key: string]: unknown;
}

/** Live rows (not archived) of one demo table, read straight from localStorage. */
export async function liveRows<T extends Row = Row>(page: Page, table: string): Promise<T[]> {
  const db = await readDemo<Record<string, T[]>>(page);
  return (db[table] ?? []).filter((row) => !row.archived_at);
}

/** All rows of one demo table, archived included. */
export async function allRows<T extends Row = Row>(page: Page, table: string): Promise<T[]> {
  const db = await readDemo<Record<string, T[]>>(page);
  return db[table] ?? [];
}

/** Waits for the app to be on screen (the library's search or the page's heading), then for fonts and images. */
export async function ready(page: Page): Promise<void> {
  await expect(page.locator('main, [role="main"]').first()).toBeVisible();
  await settle(page);
}

/**
 * Visual references run on a faked clock (`fixClock(page, 'install')`) that `freeze()` pauses, so after that nothing
 * moves unless the test advances it and a capture never depends on how fast the machine is. These helpers drive it.
 */
export async function tick(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
}

/** Advances the fake clock in small steps until `target` is visible (the app may need timers to load its data). */
export async function tickUntilVisible(page: Page, target: Locator, maxSteps = 80): Promise<void> {
  for (let step = 0; step < maxSteps; step++) {
    if (await target.first().isVisible()) return;
    await page.clock.runFor(100);
    await page.waitForTimeout(30);
  }
  await expect(target.first()).toBeVisible();
}

/** Lets every entrance animation and the quick menu's name tag (2.8 s) finish, then fonts and images. */
export async function rest(page: Page, ms = 3500): Promise<void> {
  await page.clock.runFor(ms);
  await settle(page);
}

/** Opens `url` on the faked clock, waits for `target`, and lets the page come to rest. */
export async function openStill(
  page: Page,
  url: string,
  target: Locator,
  options: Omit<OpenOptions, 'clock'> = {},
) {
  await openApp(page, url, { ...options, clock: 'install' });
  await tickUntilVisible(page, target);
  await rest(page);
}

/**
 * `clock.install` keeps time flowing in real time; the frame references need it standing still so the test, and not
 * the machine, decides how far an animation has gone. Call right before the action that starts the animation.
 */
export async function freeze(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now());
  // Landing on a multiple of 16 ms keeps the fake animation frames in the same phase on every run.
  await page.clock.pauseAt(new Date(Math.ceil((now + 250) / 16) * 16));
}

/**
 * Frames of an animation `motion` drives partly with JS (the faked clock moves those) and partly with the Web
 * Animations API (springs on opacity and transforms run off the compositor, in real time, whatever the faked clock
 * says). After every step the page's animations are paused at exactly `t` ms, so both halves agree on the instant.
 * Same capture and same ratio log as `motionFrames` in support/visual.ts (tolerance 0.01 for frames).
 */
export async function syncedFrames(
  page: Page,
  name: string,
  start: () => Promise<void>,
  times: readonly number[],
): Promise<void> {
  await start();
  let at = 0;
  for (const t of times) {
    if (t > at) await page.clock.runFor(t - at);
    at = t;
    await page.evaluate((ms) => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = ms;
      }
    }, t);
    const file = `${name}-${t}ms.png`;
    const actual = await page.screenshot({ animations: 'allow', caret: 'hide' });
    logFrameRatio(`${name}-${t}ms`, measureAgainst(actual, test.info().snapshotPath(file)));
    await expect(page).toHaveScreenshot(file, {
      maxDiffPixelRatio: 0.01,
      animations: 'allow',
      caret: 'hide',
    });
  }
}

function measureAgainst(actual: Buffer, referencePath: string): number | null {
  if (!fs.existsSync(referencePath)) return null;
  const a = PNG.sync.read(actual);
  const b = PNG.sync.read(fs.readFileSync(referencePath));
  if (a.width !== b.width || a.height !== b.height) return 1;
  return pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 }) / (a.width * a.height);
}

function logFrameRatio(name: string, ratio: number | null): void {
  const dir = path.join(EVIDENCE, process.env.ONESHOOT_PHASE || 'fase-0');
  fs.mkdirSync(dir, { recursive: true });
  const info = test.info();
  const entry = { project: info.project.name, test: info.titlePath.join(' › '), name, ratio, note: 'frame' };
  fs.appendFileSync(path.join(dir, 'visual-ratios.jsonl'), `${JSON.stringify(entry)}\n`);
}
