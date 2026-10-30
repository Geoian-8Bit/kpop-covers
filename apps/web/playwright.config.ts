import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * REQ-00 · e2e against the local demo (`VITE_DEMO=true`: browser storage only, never real data, and silent — see
 * src/lib/devSilence.ts; Chromium also runs with --mute-audio). Everything Playwright writes goes to the system temp
 * folder, never into the repo.
 */
const evidence = path.join(process.env.TMPDIR || os.tmpdir(), 'calendario-avisos-formaciones-evidencias', 'playwright');
const PORT = 5174;
const baseURL = `http://localhost:${PORT}`;

/** The flows (calendar, formations, A/B) run at the phone sizes the group uses; the smoke spec runs everywhere. */
const viewport = (name: string, width: number, height: number, mobile: boolean, flows = false) => ({
  name,
  ...(flows ? {} : { testMatch: 'smoke.spec.ts' }),
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width, height },
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  },
});

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: path.join(evidence, 'test-results'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(evidence, 'report') }]],
  use: {
    baseURL,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    // No service worker: a cached shell must never answer instead of the dev server.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--mute-audio', '--autoplay-policy=user-gesture-required'] },
  },
  projects: [
    viewport('mobile-375x812', 375, 812, true),
    viewport('tablet-768x1024', 768, 1024, true),
    viewport('desktop-1440x900', 1440, 900, false),
    viewport('phone-390x844', 390, 844, true, true),
    viewport('landscape-844x390', 844, 390, true, true),
  ],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { VITE_DEMO: 'true' },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
