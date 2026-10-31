import type { Page } from '@playwright/test';
import { mockUrl } from '../env';
import { scenario, rememberMe, settleLoad } from '../harness';
import {
  RequestLog,
  markTime,
  openContext,
  readLcp,
  runPasses,
  summarizeRequests,
  throttle,
  type PassOutcome,
} from '../profile';

/**
 * S-01 · Arranque de `/` (frío y repetido) · M-03, M-04, M-07 (M-01, M-02 and M-11 come from `pnpm perf:bundle`).
 * «Frío» has no service worker (blocked); «repetida» installs it first and measures the next load, with the profile on.
 */

/** The library has data on screen: the heading of the quick access or the list of videos, then a quiet network. */
async function libraryOnScreen(page: Page): Promise<void> {
  await page.waitForSelector('main', { timeout: 45_000 });
  await page
    .getByRole('button', { name: /^Eliminar / })
    .first()
    .waitFor({ timeout: 45_000 });
  await settleLoad(page, 1200);
}

async function measure(page: Page, log: RequestLog): Promise<PassOutcome> {
  const lcp = await readLcp(page);
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;
    return {
      fcp,
      dcl: n?.domContentLoadedEventEnd ?? null,
      load: n?.loadEventEnd ?? null,
      controlled: Boolean(navigator.serviceWorker?.controller),
    };
  });
  const requests = summarizeRequests(await log.settled(), mockUrl());
  const appStart = await markTime(page, 'oneshoot:app-start');
  const painted = await markTime(page, 'oneshoot:library-painted');
  return {
    metrics: {
      lcpMs: lcp ? Math.round(lcp.time) : null,
      fcpMs: nav.fcp === null ? null : Math.round(nav.fcp),
      domContentLoadedMs: nav.dcl === null ? null : Math.round(nav.dcl),
      loadMs: nav.load === null ? null : Math.round(nav.load),
      appStartMs: appStart === null ? null : Math.round(appStart),
      libraryPaintedMs: painted === null ? null : Math.round(painted),
      'm07.requests': requests.requests,
      'm07.apiRequests': requests.api,
      'm07.apiSerialDepth': requests.apiSerialDepth,
      'm07.transferKB': Math.round(requests.transferBytes / 102.4) / 10,
      'm07.apiTransferKB': Math.round(requests.apiTransferBytes / 102.4) / 10,
      'm06.videosListBytes': requests.videosListBytes,
    },
    details: { lcp, serviceWorkerControlled: nav.controlled, requests },
  };
}

scenario('S-01', 'Arranque de / (frío y repetido)', ['M-03', 'M-04', 'M-07'], async (browser) => {
  const cold = await runPasses(
    async () => {
      const { context, page } = await openContext(browser, 'block');
      try {
        await rememberMe(page);
        const log = new RequestLog(page);
        await throttle(page);
        await page.goto('/', { waitUntil: 'commit' });
        await libraryOnScreen(page);
        return await measure(page, log);
      } finally {
        await context.close();
      }
    },
    { headline: ['lcpMs'] },
  );

  const repeated = await runPasses(
    async () => {
      const { context, page } = await openContext(browser, 'allow');
      try {
        await rememberMe(page);
        // Warm-up at full speed: the visit that installs the worker is not the one being measured.
        await page.goto('/');
        await libraryOnScreen(page);
        await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
        await page.waitForFunction(
          async () => (await caches.keys()).some((k) => k.includes('precache') && k.length > 0),
          undefined,
          { timeout: 60_000 },
        );
        await page.waitForTimeout(2500); // the precache fills after the worker activates
        const log = new RequestLog(page);
        await throttle(page);
        log.reset();
        await page.reload({ waitUntil: 'commit' });
        await libraryOnScreen(page);
        return await measure(page, log);
      } finally {
        await context.close();
      }
    },
    { headline: ['lcpMs'] },
  );

  return {
    note: 'cold = M-03 (service worker blocked); repeated = M-04 (worker installed, second load). M-07 is in both.',
    cold,
    repeated,
  };
});
