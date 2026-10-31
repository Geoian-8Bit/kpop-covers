import type { Browser, BrowserContext, CDPSession, Page } from '@playwright/test';
import { pageProbes } from './metrics';
import { stubOutside } from './stubs';

export * from './metrics';
export * from './requests';
export * from './stats';

/**
 * REQ-03 · The measurement profile of spec 3.1: Chromium, 390x844 at 3x, touch; CPU slowed x4 and the «4G lenta»
 * network (150 ms, 1,6 Mbit/s down, 750 kbit/s up) through CDP.
 */
export const PROFILE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: Number(process.env.PERF_DSF) || 3,
  cpuThrottlingRate: Number(process.env.PERF_CPU) || 4,
  network: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 },
} as const;

export interface Opened {
  context: BrowserContext;
  page: Page;
}

/**
 * A clean browser context with the profile's device and the page probes installed. `serviceWorkers: 'block'` is the
 * «frío» case; `'allow'` lets the app install its worker for the «repetida» one.
 */
export async function openContext(
  browser: Browser,
  serviceWorkers: 'block' | 'allow' = 'block',
): Promise<Opened> {
  const context = await browser.newContext({
    viewport: PROFILE.viewport,
    deviceScaleFactor: PROFILE.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    serviceWorkers,
  });
  await context.addInitScript(pageProbes);
  await stubOutside(context);
  return { context, page: await context.newPage() };
}

/**
 * CPU x4 and the 4G network on this page. Fluid scenarios call it right before the measured window (seeding and
 * navigation run at full speed: the number is about the interaction, not about how long the setup took).
 */
export async function throttle(page: Page, { cpu = true, network = true } = {}): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  if (cpu && process.env.PERF_CPU !== '0')
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: PROFILE.cpuThrottlingRate });
  if (network)
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: PROFILE.network.latency,
      downloadThroughput: PROFILE.network.downloadThroughput,
      uploadThroughput: PROFILE.network.uploadThroughput,
    });
  return cdp;
}

export async function unthrottle(cdp: CDPSession): Promise<void> {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
}
