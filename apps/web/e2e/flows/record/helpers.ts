import { expect, type Browser, type Page } from '@playwright/test';
import { DEMO_KEY } from '../../demo';
import {
  FIXTURE,
  fixClock,
  guardConsole,
  seedFixture,
  seedUploadMedia,
  useFakeMedia,
  type SeedFixtureOptions,
} from '../../support/seed';
import { testVideo } from '../../support/testVideo';

/**
 * REQ-02 · Shared steps of the recorder / takes / review flows and of their visual references. The recorder runs
 * on the fake camera (e2e/fake-media.js); the song is the fixture's upload «Ensayo coreo completa» with a 3 s
 * WebM, so the recorder offers the song's own sound and the review has an original to compare against.
 */
/**
 * The shutter's «rect» animation overshoots below zero for a frame (motion's spring on `rx`), and Chromium logs it. It is
 * how the app is today, so the flows tolerate that one line and fail on anything else.
 */
export const guard = (page: Page) => guardConsole(page, { allow: [/<rect> attribute rx: A negative value/] });

export const REC = 'Grabar baile';

let cached: Buffer | null = null;
/** The 3 s WebM of the song, built once per worker. */
async function songBytes(browser: Browser): Promise<Buffer> {
  cached ??= (await testVideo(browser)).buffer;
  return cached;
}

export interface OpenOptions {
  seed?: SeedFixtureOptions;
  /** Clock: 'fixed' (default) freezes only Date; 'install' fakes every timer (frames). */
  clock?: 'fixed' | 'install';
  cam?: Record<string, unknown>;
}

/** Fixture + fake camera + the song's file, then the studio page of the upload (recorder still closed). */
export async function openStudio(page: Page, browser: Browser, options: OpenOptions = {}): Promise<void> {
  const bytes = await songBytes(browser);
  await fixClock(page, options.clock ?? 'fixed');
  await seedFixture(page, options.seed);
  await useFakeMedia(page, options.cam);
  await page.goto('/');
  await seedUploadMedia(page, FIXTURE.uploadVideoId, bytes);
  await page.goto(`/v/${FIXTURE.uploadVideoId}`);
  await expect(page.getByRole('button', { name: 'Grabar baile con la canción' })).toBeEnabled();
}

export const recorder = (page: Page) => page.getByRole('dialog', { name: REC });
export const shutter = (page: Page) => recorder(page).locator('[data-record-shutter]');

/** Opens the recorder and waits for the camera to be live (the shutter enabled and the lens chips shown). */
export async function openRecorder(page: Page, browser: Browser, options: OpenOptions = {}): Promise<void> {
  await openStudio(page, browser, options);
  await page.getByRole('button', { name: 'Grabar baile con la canción' }).click();
  await expect(recorder(page)).toBeVisible();
  await expect(shutter(page)).toBeEnabled({ timeout: 15_000 });
  await expect(recorder(page).getByRole('group', { name: 'Lentes y zoom' })).toBeVisible();
}

/** Cycles the count-down button until it reads «sin cuenta» (3 → 5 → 10 → none). */
export async function timerOff(page: Page): Promise<void> {
  const button = recorder(page).getByRole('button', { name: /^Cuenta atrás/ });
  for (let i = 0; i < 4; i++) {
    if (/sin cuenta/.test((await button.getAttribute('aria-label')) ?? '')) return;
    await button.click();
  }
  throw new Error('the count-down never reached «sin cuenta»');
}

/** Starts a take (count-down off) and lets it roll `ms` ms. */
export async function startTake(page: Page, ms = 2200): Promise<void> {
  await timerOff(page);
  await shutter(page).click();
  await expect(recorder(page).getByRole('button', { name: 'Terminar la toma' })).toBeVisible({
    timeout: 15_000,
  });
  await page.waitForTimeout(ms);
}

/** Records a short take and ends it: the recorder shows the review of the take. */
export async function recordTake(page: Page, ms = 2200): Promise<void> {
  await startTake(page, ms);
  await recorder(page).getByRole('button', { name: 'Terminar la toma' }).click();
  await expect(recorder(page).getByRole('button', { name: 'Guardar en «Tomas»' })).toBeVisible({
    timeout: 25_000,
  });
}

/** Keeps the take in «Tomas», closes the recorder and opens the «Tomas» tab of the studio. */
export async function keepAndOpenTakes(page: Page): Promise<void> {
  await recorder(page).getByRole('button', { name: 'Guardar en «Tomas»' }).click();
  await expect(recorder(page).getByRole('button', { name: 'En «Tomas»' })).toBeVisible();
  // Closing right after the save can land while the take's buttons are still settling: ask again until it leaves.
  await expect(async () => {
    if (await recorder(page).isVisible())
      await recorder(page).getByRole('button', { name: 'Cerrar' }).click({ timeout: 2000 });
    await expect(recorder(page)).toBeHidden({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await openTakesTab(page);
}

export async function openTakesTab(page: Page): Promise<void> {
  await page.getByRole('radio', { name: 'Tomas' }).click();
  await expect(page.getByRole('heading', { name: 'Tomas' })).toBeVisible();
}

/** The first take of the list is reviewed with the original (the song's file on the upload). */
export async function openReview(page: Page): Promise<void> {
  await page
    .getByRole('button', { name: /^Repasar con el original/ })
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'Cerrar el repaso' }).first()).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Tiempo de la toma' })).toBeVisible({ timeout: 15_000 });
}

/** Whole record → keep → review path, ending on the review screen. */
export async function reviewRecordedTake(
  page: Page,
  browser: Browser,
  options: OpenOptions = {},
): Promise<void> {
  await openRecorder(page, browser, options);
  await recordTake(page);
  await keepAndOpenTakes(page);
  await openReview(page);
}

/** The demo store as the app keeps it. */
export const storedDb = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null') as Record<string, Record<string, unknown>[]>,
    DEMO_KEY,
  );

/** The recorder's remembered settings (`oneshoot.record.v1`). */
export const storedSettings = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem('oneshoot.record.v1') ?? 'null') as Record<string, unknown> | null,
  );

/** Constraints the fake camera was asked for, in order (window.__constraints, see fake-media.js). */
export const constraintsLog = (page: Page) =>
  page.evaluate(() =>
    JSON.stringify((window as unknown as { __constraints?: unknown[] }).__constraints ?? []),
  );

/** The fake camera moves: hides the live preview so visual references don't depend on its frame number. */
export async function hideCamera(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `[aria-label="${REC}"] video:not([controls]), [aria-label="${REC}"] canvas { opacity: 0 !important; }`,
  });
}
