import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * REQ-00 · e2e against the local demo (`VITE_DEMO=true`: browser storage only, never real data, and silent — see
 * src/lib/devSilence.ts; Chromium also runs with --mute-audio). Everything Playwright writes goes to the system temp
 * folder, never into the repo.
 */
// REQ-01 · Evidence lives outside the repo: reports, traces and the reference screenshots.
const evidenceRoot =
  process.env.ONESHOOT_EVIDENCE_DIR || path.join(os.homedir(), 'oneshoot-rendimiento-integral-tmp');
const output = path.join(evidenceRoot, 'playwright-output');
const PORT = 5174;
const baseURL = `http://localhost:${PORT}`;

/** The specs that predate the REQ-01 suite; the new ones live in e2e/flows and e2e/visual. */
const LEGACY_SPECS = ['ab-grab.spec.ts', 'calendar.spec.ts', 'formations.spec.ts', 'smoke.spec.ts'];

const NEW_SPECS = ['flows/**/*.spec.ts', 'visual/**/*.spec.ts'];
const CHROMIUM_ARGS = ['--mute-audio', '--autoplay-policy=user-gesture-required'];

/** The flows (calendar, formations, A/B) run at the phone sizes the group uses; the smoke spec runs everywhere. */
const viewport = (name: string, width: number, height: number, mobile: boolean, flows = false) => ({
  name,
  testMatch: flows ? LEGACY_SPECS : 'smoke.spec.ts',
  use: {
    ...devices['Desktop Chrome'],
    launchOptions: { args: CHROMIUM_ARGS },
    viewport: { width, height },
    ...(mobile ? { isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : {}),
  },
});

export default defineConfig({
  testDir: './e2e',
  outputDir: output,
  snapshotPathTemplate: path
    .join(evidenceRoot, 'referencias', '{projectName}', '{testFilePath}', '{arg}{ext}')
    .split(path.sep)
    .join('/'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 8_000, toHaveScreenshot: { maxDiffPixelRatio: 0.002 } },
  reporter: [['list'], ['html', { open: 'never', outputFolder: path.join(output, 'report') }]],
  use: {
    baseURL,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    // No service worker: a cached shell must never answer instead of the dev server.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    viewport('mobile-375x812', 375, 812, true),
    viewport('tablet-768x1024', 768, 1024, true),
    viewport('desktop-1440x900', 1440, 900, false),
    viewport('phone-390x844', 390, 844, true, true),
    viewport('landscape-844x390', 844, 390, true, true),
    // REQ-01 · The new suite (flows + visual references). Chromium is muted per project: WebKit rejects those flags.
    {
      name: 'movil-chromium',
      testMatch: NEW_SPECS,
      use: { ...devices['Pixel 7'], launchOptions: { args: CHROMIUM_ARGS } },
    },
    { name: 'movil-webkit', testMatch: NEW_SPECS, use: { ...devices['iPhone 14'] } },
    {
      name: 'escritorio-chromium',
      testMatch: NEW_SPECS,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: CHROMIUM_ARGS },
      },
    },
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
