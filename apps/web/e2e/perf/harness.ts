import { test, type Browser, type Page } from '@playwright/test';
import { FIXTURE } from '../support/seed';
import { recordResult, recordSkipped } from './results';
import { throttle, type Aggregated } from './profile';

/**
 * REQ-03 · One scenario = one test whose title starts with its id (`--grep S-03`). The body returns the measurements,
 * or `{ skipped: reason }` when this environment cannot take them; either way the run goes on and the JSON says what
 * happened. A scenario that throws is recorded as skipped with the error, so one broken selector never costs the other
 * sixteen their numbers (the test is annotated so the list reporter still shows it).
 */
export type Outcome = Record<string, unknown> | { skipped: string };

export function scenario(
  id: string,
  title: string,
  metrics: string[],
  body: (browser: Browser, page?: Page) => Promise<Outcome>,
): void {
  test(`${id} · ${title}`, async ({ browser }) => {
    const started = Date.now();
    try {
      const outcome = await body(browser);
      const seconds = Math.round((Date.now() - started) / 1000);
      if ('skipped' in outcome && typeof outcome.skipped === 'string') {
        recordSkipped(id, title, outcome.skipped, { metrics, durationSeconds: seconds });
        test.info().annotations.push({ type: 'skipped', description: outcome.skipped });
      } else recordResult(id, { title, metrics, durationSeconds: seconds, ...outcome });
    } catch (error) {
      const reason = `no se pudo medir: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`;
      recordSkipped(id, title, reason, {
        metrics,
        error: true,
        durationSeconds: Math.round((Date.now() - started) / 1000),
      });
      test.info().annotations.push({ type: 'skipped', description: reason });
      console.warn(`[${id}] ${reason}`);
    }
  });
}

/** Strips a pass's `m09.*`-style flat metrics out of an aggregate, for scenarios that merge two kinds of passes. */
export function pick(aggregated: Aggregated, keys: (k: string) => boolean): Aggregated['metrics'] {
  return Object.fromEntries(Object.entries(aggregated.metrics).filter(([k]) => keys(k)));
}

/**
 * The identity a phone that already used the app has (who am I, device id), so the first-time «¿Quién eres?» card does
 * not cover the screens. The demo's seedFixture writes the same two keys; the production build needs them too.
 */
export async function rememberMe(page: Page): Promise<void> {
  await page.addInitScript(
    ([me, device]) => {
      if (!localStorage.getItem('oneshoot.me.v1'))
        localStorage.setItem('oneshoot.me.v1', JSON.stringify({ memberId: me, dismissed: true }));
      if (!localStorage.getItem('oneshoot.device.v1')) localStorage.setItem('oneshoot.device.v1', device!);
    },
    [FIXTURE.memberId, FIXTURE.deviceId] as const,
  );
}

/** Waits for the page to be quiet: the load event, then no request for a while. Bounded: a hung asset must not hang the run. */
export async function settleLoad(page: Page, quietMs = 800, maxMs = 45_000): Promise<void> {
  await page.waitForLoadState('load', { timeout: maxMs }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: maxMs }).catch(() => undefined);
  await page.waitForTimeout(quietMs);
}

export { throttle };
