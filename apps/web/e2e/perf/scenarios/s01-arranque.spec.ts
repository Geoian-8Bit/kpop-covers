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

/**
 * REQ-10 · When the featured thumbnail (the LCP image, `fetchpriority=high`) starts downloading, against when the entry
 * module starts running (the `oneshoot:app-start` mark, set at the top of main.tsx). Both are relative to navigation
 * start; with the preload the thumbnail must start earlier. The entry chunk's own `responseEnd` is not the signal: with
 * the service worker it is served in milliseconds, but parse and execution still follow.
 */
async function readThumbTiming(page: Page) {
  return page.evaluate(() => {
    const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const featured =
      document.querySelector<HTMLImageElement>('img[fetchpriority="high"]')?.currentSrc ?? null;
    const thumb = res.find((r) => r.name === featured);
    const entry = res.find((r) => /\/assets\/index-[^/]+\.js/.test(r.name));
    const appStart = performance.getEntriesByName('oneshoot:app-start')[0]?.startTime;
    const r1 = (n: number | undefined) => (n === undefined ? null : Math.round(n));
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('oneshoot.lcpThumb.v1');
    } catch {
      // storage blocked
    }
    return {
      featuredUrl: featured,
      storedUrl: stored,
      thumbInitiator: thumb?.initiatorType ?? null,
      thumbStartMs: r1(thumb?.startTime),
      thumbEndMs: r1(thumb?.responseEnd),
      appStartMs: r1(appStart),
      entryJsEndMs: r1(entry?.responseEnd),
      startsBeforeAppStart: thumb && appStart !== undefined ? thumb.startTime < appStart : null,
      preloadLink: Boolean(document.querySelector('link[rel=preload][as=image]')),
    };
  });
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
  const thumbTiming = await readThumbTiming(page);
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
      'm06.postersBytes': requests.postersBytes,
      'm06.posterRevsBytes': requests.posterRevsBytes,
    },
    details: { lcp, serviceWorkerControlled: nav.controlled, requests, thumbTiming },
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
        // REQ-10 · PERF_FEATURED_VIDEO=<video id> makes that video lead the library (the fixture's own first one
        // is an upload with an inline poster, which is never preloaded), to check the thumbnail preload.
        const lead = process.env.PERF_FEATURED_VIDEO;
        if (lead)
          await page.addInitScript(
            (id) => localStorage.setItem('coverscape.recent', JSON.stringify({ [id]: Date.now() })),
            lead,
          );
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
        // Diagnosis only: PERF_TRACE=<file> keeps a Chromium trace of the measured repeat load (last pass wins).
        const trace = process.env.PERF_TRACE;
        if (trace)
          await browser.startTracing(page, {
            path: trace,
            screenshots: false,
            categories: [
              'devtools.timeline',
              'v8.execute',
              'blink.user_timing',
              'loading',
              'disabled-by-default-v8.cpu_profiler',
              'disabled-by-default-devtools.timeline',
            ],
          });
        await page.reload({ waitUntil: 'commit' });
        await libraryOnScreen(page);
        if (trace) await browser.stopTracing();
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
