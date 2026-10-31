import { defineConfig, devices } from '@playwright/test';
import { DEMO_URL, PREVIEW_URL, PW_OUTPUT } from './env';
import { PROFILE } from './profile';

/**
 * REQ-03 · `pnpm perf` (all scenarios) and `pnpm perf -- --grep S-03` (one). One Chromium project at the profile of spec
 * 3.1 (390x844 at 3x, touch) in two flavours of server:
 *   carga    S-01, S-02: a production build against the simulated Supabase, started by globalSetup (:4180)
 *   fluidez  the rest: the demo dev server (:5174), reused when it is up
 * One worker: parallel scenarios would steal each other's CPU and spoil the numbers.
 * Everything Playwright writes goes to the evidence folder, outside the repo.
 */
const use = {
  ...devices['Desktop Chrome'],
  viewport: PROFILE.viewport,
  deviceScaleFactor: PROFILE.deviceScaleFactor,
  isMobile: true,
  hasTouch: true,
  locale: 'es-ES',
  timezoneId: 'Europe/Madrid',
  // `chromium` = the new headless mode (the full browser). The default headless shell crashes its renderer on a page
  // load served by the app's service worker, which the «repetida» scenarios need.
  launchOptions: {
    ...(process.env.PERF_HEADLESS_SHELL === '1' ? {} : { channel: 'chromium' as const }),
    args: ['--mute-audio', '--autoplay-policy=user-gesture-required'],
  },
};

export default defineConfig({
  testDir: './scenarios',
  outputDir: PW_OUTPUT,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // A scenario runs 5 to 9 passes under a x4 CPU and a slow network; the time limit is for a hang, not for the work.
  timeout: 20 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  globalSetup: './globalSetup.ts',
  projects: [
    { name: 'carga', testMatch: /s0[12]-.*\.spec\.ts$/, use: { ...use, baseURL: PREVIEW_URL } },
    { name: 'fluidez', testMatch: /s(0[3-9]|1\d)-.*\.spec\.ts$/, use: { ...use, baseURL: DEMO_URL } },
  ],
  webServer: {
    command: 'pnpm exec vite --port 5174 --strictPort',
    cwd: '../..',
    url: DEMO_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { VITE_DEMO: 'true' },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
