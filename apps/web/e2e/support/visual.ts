import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { EVIDENCE } from './evidence';

/**
 * REQ-02 · The golden-rule proof (spec 3.4). `snap` asserts a screenshot against the phase-0 reference with
 * `toHaveScreenshot` and, because Playwright stays silent below the threshold, also logs the real pixelmatch ratio
 * of every capture to `<evidence>/<phase>/visual-ratios.jsonl` so any non-zero difference can be explained in writing.
 * Everything goes to the evidence folder outside the repo; nothing here writes into the tree.
 */
export { EVIDENCE };
/** Folder for this run's ratios and captures: `ONESHOOT_PHASE=fase-4 pnpm e2e …` (phase 0 by default). */
const PHASE = process.env.ONESHOOT_PHASE || 'fase-0';

/** The three widths every screen is captured at (spec 3.4). */
export const WIDTHS = [375, 768, 1440] as const;

export interface SnapOptions {
  /** Areas that depend on the network (the YouTube iframe), masked as the spec allows. */
  mask?: Locator[];
  fullPage?: boolean;
  /** 0.002 for static screens (default), 0.01 for animation frames. */
  maxDiffPixelRatio?: number;
}

function logRatio(name: string, ratio: number | null, note = ''): void {
  const dir = path.join(EVIDENCE, PHASE);
  fs.mkdirSync(dir, { recursive: true });
  const entry = {
    project: test.info().project.name,
    test: test.info().titlePath.join(' › '),
    name,
    ratio,
    note,
  };
  fs.appendFileSync(path.join(dir, 'visual-ratios.jsonl'), `${JSON.stringify(entry)}\n`);
}

/** pixelmatch ratio between a fresh capture and the stored reference (null when there is no reference yet). */
function measure(actual: Buffer, referencePath: string): number | null {
  if (!fs.existsSync(referencePath)) return null;
  const a = PNG.sync.read(actual);
  const b = PNG.sync.read(fs.readFileSync(referencePath));
  if (a.width !== b.width || a.height !== b.height) return 1;
  // Same pixel threshold as toHaveScreenshot's default, so the ratio is the one Playwright judged.
  const diff = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.2 });
  return diff / (a.width * a.height);
}

/**
 * The capture that is measured is taken right after toHaveScreenshot passes (the page is then settled, as Playwright
 * retries until two shots match) and at CSS scale, which is how toHaveScreenshot stores references.
 */
async function measured(
  page: Page,
  file: string,
  options: Parameters<Page['screenshot']>[0],
): Promise<number | null> {
  const actual = await page.screenshot({ ...options, scale: 'css', caret: 'hide' });
  return measure(actual, test.info().snapshotPath(file));
}

/** Screenshot assertion + logged ratio. `name` follows `<pantalla>-<estado>-<ancho>`. */
export async function snap(page: Page, name: string, options: SnapOptions = {}): Promise<void> {
  const file = `${name}.png`;
  const { mask, fullPage = false, maxDiffPixelRatio = 0.002 } = options;
  await expect(page).toHaveScreenshot(file, {
    mask,
    fullPage,
    maxDiffPixelRatio,
    animations: 'disabled',
    caret: 'hide',
  });
  logRatio(name, await measured(page, file, { mask, fullPage, animations: 'disabled' }));
}

/** Runs `body` once per width (375, 768, 1440), resizing the viewport and keeping the project's height. */
export async function atWidths(page: Page, body: (width: number) => Promise<void>): Promise<void> {
  const height = page.viewportSize()?.height ?? 844;
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height });
    await body(width);
  }
}

/** Default instants for animation frames (spec 3.4): 0, 100, 200, 400, 600, 1000 ms; the end is captured by the caller. */
export const FRAME_TIMES = [0, 100, 200, 400, 600, 1000] as const;

/**
 * Frames of a `motion` (JS) animation: needs `fixClock(page, 'install')` before the page loads. `start` triggers the
 * animation; then the clock is advanced to each instant and a frame captured (tolerance 0.01).
 */
export async function motionFrames(
  page: Page,
  name: string,
  start: () => Promise<void>,
  times: readonly number[] = FRAME_TIMES,
  options: Omit<SnapOptions, 'maxDiffPixelRatio'> = {},
): Promise<void> {
  await start();
  let at = 0;
  for (const t of times) {
    if (t > at) await page.clock.runFor(t - at);
    at = t;
    await snapFrame(page, `${name}-${t}ms`, options);
  }
}

/**
 * Frames of a CSS / Web Animations animation: every running animation is paused and set to `t` ms before capture,
 * so the frame is exact whatever the CPU does.
 */
export async function cssFrames(
  page: Page,
  name: string,
  start: () => Promise<void>,
  times: readonly number[] = FRAME_TIMES,
  options: Omit<SnapOptions, 'maxDiffPixelRatio'> = {},
): Promise<void> {
  await start();
  for (const t of times) {
    await page.evaluate((ms) => {
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = ms;
      }
    }, t);
    await snapFrame(page, `${name}-${t}ms`, options);
  }
}

/** A single frame: like `snap` but without disabling animations (that would jump them to the end). */
async function snapFrame(
  page: Page,
  name: string,
  { mask, fullPage = false }: Omit<SnapOptions, 'maxDiffPixelRatio'>,
) {
  const file = `${name}.png`;
  await expect(page).toHaveScreenshot(file, {
    mask,
    fullPage,
    maxDiffPixelRatio: 0.01,
    animations: 'allow',
    caret: 'hide',
  });
  logRatio(name, await measured(page, file, { mask, fullPage, animations: 'allow' }), 'frame');
}
