import type { Browser, CDPSession, Page } from '@playwright/test';
import { fixClock, seedFixture, seedUploadMedia, useFakeMedia, type DemoFixture } from '../support/seed';
import { shortClips } from '../support/shortClips';
import { openContext, runPasses, startWindow, throttle, type Aggregated, type PassMetrics } from './profile';

/**
 * REQ-03 · The «fluidez» scenarios (spec 3.3, S-03…S-14): the demo dev server with the fixture data, a clean context
 * per pass, setup at full speed, then CPU x4 and the measured window around the interaction.
 *
 * The network profile is NOT applied here (set PERF_FLUID_NETWORK=1 to): the demo has no backend, and a 150 ms
 * round trip on the dev server's lazy modules would measure Vite, not the app. M-09 / M-10 / M-08 are about the main
 * thread and the compositor, which the CPU profile covers.
 */
const FLUID_NETWORK = process.env.PERF_FLUID_NETWORK === '1';

export interface DemoSetup {
  /** Where to go, once the seed is in. */
  url: string;
  /** A WebM stored as the upload's file (the studio and the round can then play it). */
  media?: { id: string; bytes: Buffer };
  /** Edits the fixture before it is stored. */
  overrides?: (db: DemoFixture) => DemoFixture | void;
  /** Fake camera and microphone (e2e/fake-media.js). */
  fakeMedia?: Record<string, unknown> | true;
  /** Wait for this before the page counts as ready. */
  ready?: (page: Page) => Promise<void>;
}

/** Fixture + the dev probe switch + optional media, then the page. Dates are fixed (spec 3.4), timers are real. */
export async function openDemo(page: Page, setup: DemoSetup): Promise<void> {
  await fixClock(page, 'fixed');
  await seedFixture(page, { overrides: setup.overrides });
  // After the seed's own init script (which clears localStorage once): switches the commit probe on, every navigation.
  if (process.env.PERF_NO_PROBE !== '1')
    await page.addInitScript(() => localStorage.setItem('oneshoot.debug.perf', '1'));
  if (setup.fakeMedia) await useFakeMedia(page, setup.fakeMedia === true ? undefined : setup.fakeMedia);
  if (setup.media) {
    await page.goto('/');
    await seedUploadMedia(page, setup.media.id, setup.media.bytes);
  }
  await page.goto(setup.url);
  await (setup.ready ?? waitForMain)(page);
}

async function waitForMain(page: Page): Promise<void> {
  await page.waitForSelector('main, [role="main"]', { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
}

/** The studio's timeline knows the song's length: the player is ready. */
export async function studioReady(page: Page): Promise<void> {
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

export interface FluidOptions {
  setup: DemoSetup;
  /** Full speed, before the profile: put the screen in the state the interaction starts from. */
  prepare?: (page: Page) => Promise<void>;
  /** The measured interaction. */
  action: (page: Page, cdp: CDPSession) => Promise<void>;
  /** Extra numbers once the action is over (M-13 measures, copy sizes…). */
  after?: (page: Page) => Promise<PassMetrics>;
  /** Count Paint events with a trace (M-10): 3 extra passes, apart from the frame passes (the trace skews frames). */
  trace?: boolean;
  /** Longest the action may take before the pass is given up (a hung recorder must not eat the run). */
  actionTimeoutMs?: number;
  passes?: number;
  headline?: string[];
}

/** Runs the passes of one interaction and returns the aggregate (M-08, M-09 and, with `trace`, M-10). */
export async function fluid(browser: Browser, options: FluidOptions): Promise<Aggregated> {
  const onePass = async (trace: boolean) => {
    const { context, page } = await openContext(browser, 'block');
    try {
      await openDemo(page, options.setup);
      await options.prepare?.(page);
      const cdp = await throttle(page, { network: FLUID_NETWORK });
      const win = await startWindow(page, browser, { trace });
      // A renderer crash would leave the action waiting for minutes: fail at once instead.
      let onCrash: (() => void) | undefined;
      let lateTimer: NodeJS.Timeout | undefined;
      const crashed = new Promise<never>((_, reject) => {
        onCrash = () => reject(new Error('the page crashed during the measured action'));
        page.once('crash', onCrash);
      });
      const late = new Promise<never>((_, reject) => {
        lateTimer = setTimeout(
          () =>
            reject(
              new Error(`the measured action took over ${(options.actionTimeoutMs ?? 240_000) / 1000} s`),
            ),
          options.actionTimeoutMs ?? 240_000,
        );
      });
      try {
        await Promise.race([options.action(page, cdp), crashed, late]);
      } finally {
        // REQ-03 · Neither guard may outlive the action: a stray timer would reject long after the pass ended.
        clearTimeout(lateTimer);
        if (onCrash) page.off('crash', onCrash);
      }
      const result = await win.stop();
      const extra = await options.after?.(page);
      return { metrics: { ...result.metrics, ...extra }, details: result.details };
    } finally {
      // A crashed renderer can leave close() hanging: do not wait for it for ever.
      await Promise.race([context.close(), new Promise((r) => setTimeout(r, 15_000))]);
    }
  };
  const main = await runPasses(() => onePass(false), {
    passes: options.passes ?? 5,
    headline: options.headline ?? ['m09.frameP95Ms'],
  });
  if (!options.trace) return main;
  const traced = await runPasses(() => onePass(true), { passes: 3, maxPasses: 3 });
  const paints = traced.metrics['m10.paintsPerSecond'];
  return { ...main, metrics: { ...main.metrics, 'm10.paintsPerSecond': paints ?? null } };
}

export { shortClips };
