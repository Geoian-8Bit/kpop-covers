import type { Browser, Page } from '@playwright/test';
import { FIXTURE, useFakeMedia } from '../../support/seed';
import { rememberMe, scenario, settleLoad } from '../harness';
import { openContext, runPasses, throttle, type PassOutcome } from '../profile';

/**
 * REQ-23 · M-13 «camera-ready» against the production build (the «carga» servers: this file is named s02-… so the
 * «carga» project picks it up). The studio is opened at full speed; then, under the profile of spec 3.1 (x4 CPU, 4G),
 * the tap on «Grabar» fetches the recorder's chunk from cold and opens the fake camera. Measured with the app's own
 * marks: from the tap (`perf:record-tap`) to `oneshoot:camera-ready`.
 *
 * S-19 (this file) and S-18 measure the same; S-18 on the demo dev server, where every source file is its own request: there the number follows
 * how many modules the recorder has, not what a phone downloads.
 */
const CAMERA = { width: 1280, height: 720, fps: 30 };
const TAP = 'perf:record-tap';
const READY = 'oneshoot:camera-ready';

async function timelineReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector('[role="slider"][aria-label="Línea de tiempo"]')
          ?.getAttribute('aria-valuemax'),
      ) > 0,
    undefined,
    { timeout: 60_000 },
  );
}

async function onePass(browser: Browser): Promise<PassOutcome> {
  const { context, page } = await openContext(browser, 'block');
  try {
    await rememberMe(page);
    await useFakeMedia(page, CAMERA);
    await page.goto(`/v/${FIXTURE.youtubeVideoId}`, { waitUntil: 'commit' });
    await timelineReady(page);
    await settleLoad(page, 800);
    await throttle(page);
    await page.evaluate((name) => performance.mark(name), TAP);
    await page.getByRole('button', { name: 'Grabar baile con la canción' }).click();
    await page.waitForFunction((name) => performance.getEntriesByName(name, 'mark').length > 0, READY, {
      timeout: 60_000,
    });
    const ms = await page.evaluate(
      ([from, to]) => performance.measure('perf:camera-ready', from, to).duration,
      [TAP, READY] as const,
    );
    return { metrics: { 'm13.cameraReadyMs': Math.round(ms) } };
  } finally {
    await context.close();
  }
}

scenario(
  'S-19',
  'Del toque en «Grabar» a la cámara lista (build de producción)',
  ['M-13'],
  async (browser) => {
    const result = await runPasses(() => onePass(browser), { headline: ['m13.cameraReadyMs'] });
    return { ...result };
  },
);
