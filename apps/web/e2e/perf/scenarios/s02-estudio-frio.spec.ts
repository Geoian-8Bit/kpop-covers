import type { Page } from '@playwright/test';
import { FIXTURE } from '../../support/seed';
import { mockUrl } from '../env';
import { scenario, rememberMe, settleLoad } from '../harness';
import {
  RequestLog,
  markTime,
  openContext,
  runPasses,
  summarizeRequests,
  throttle,
  type PassOutcome,
} from '../profile';

/**
 * S-02 · Abrir `/v/:id` en frío (vídeo de YouTube y vídeo subido) · M-05, M-07.
 * Straight to the studio URL with no service worker, against the production build and the simulated Supabase.
 * The uploaded song's file is a real 3 s WebM served by the mock's Storage; YouTube's IFrame API is a stand-in that is
 * ready at once (stubs.ts), so the YouTube number is the app's own time to a ready player, not YouTube's.
 */

/** The studio is usable: the timeline knows the song's length. */
async function timelineReady(page: Page): Promise<number> {
  const slider = page.getByRole('slider', { name: 'Línea de tiempo' });
  await slider.waitFor({ timeout: 60_000 });
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
  return page.evaluate(() => performance.now());
}

async function open(
  browser: Parameters<Parameters<typeof scenario>[3]>[0],
  id: string,
): Promise<PassOutcome> {
  const { context, page } = await openContext(browser, 'block');
  try {
    await rememberMe(page);
    const log = new RequestLog(page);
    await throttle(page);
    await page.goto(`/v/${id}`, { waitUntil: 'commit' });
    const readyAt = await timelineReady(page);
    await settleLoad(page, 800);
    const mark = await markTime(page, 'oneshoot:player-ready');
    const requests = summarizeRequests(await log.settled(), mockUrl());
    return {
      metrics: {
        // The app's own mark when it exists; the harness's observation of the timeline otherwise (same moment, ±1 frame).
        'm05.playerReadyMs': Math.round(mark ?? readyAt),
        'm05.timelineReadyMs': Math.round(readyAt),
        'm07.requests': requests.requests,
        'm07.apiRequests': requests.api,
        'm07.apiSerialDepth': requests.apiSerialDepth,
        'm07.transferKB': Math.round(requests.transferBytes / 102.4) / 10,
      },
      details: { markPresent: mark !== null, requests },
    };
  } finally {
    await context.close();
  }
}

scenario('S-02', 'Abrir /v/:id en frío (YouTube y subido)', ['M-05', 'M-07'], async (browser) => {
  const youtube = await runPasses(() => open(browser, FIXTURE.youtubeVideoId), {
    headline: ['m05.playerReadyMs'],
  });
  const upload = await runPasses(() => open(browser, FIXTURE.uploadVideoId), {
    headline: ['m05.playerReadyMs'],
  });
  return {
    note: 'YouTube: IFrame API stubbed (ready at once). Upload: real 3 s WebM from the mock Storage.',
    youtube,
    upload,
    mock: mockUrl(),
  };
});
