import { recorder } from '../../flows/record/helpers';
import { fluid } from '../fluid';
import { scenario } from '../harness';
import type { PassMetrics } from '../profile';
import { studioSetup } from '../studioSetup';

/**
 * REQ-23 · M-13 «camera-ready»: from the tap on «Grabar» in the studio to the recorder having the camera's picture, at
 * the profile of spec 3.1 (x4 CPU, slow network) on the demo dev server. Each pass is a fresh context, so the
 * recorder's code is fetched from cold every time.
 *
 * The end is the shutter turning enabled (it waits for `view.status === 'ready'`, the same render that sets
 * `oneshoot:camera-ready`), timed from Node: the harness fixes the page's clock, which hides User Timing entries from
 * `performance.getEntriesByName`, so the app's own mark cannot be read here.
 */
const CAMERA = { width: 1280, height: 720, fps: 30 };

scenario('S-18', 'Del toque en «Grabar» a la cámara lista', ['M-13'], async (browser) => {
  let timings: PassMetrics = {};
  const result = await fluid(browser, {
    setup: await studioSetup(browser, { fakeMedia: CAMERA }),
    action: async (page) => {
      const t0 = Date.now();
      await page.getByRole('button', { name: 'Grabar baile con la canción' }).click();
      await recorder(page).waitFor({ timeout: 60_000 });
      await page.waitForFunction(
        () => {
          const button = document.querySelector('[data-record-shutter]');
          return button != null && !button.hasAttribute('disabled');
        },
        undefined,
        { timeout: 60_000 },
      );
      timings = { 'm13.cameraReadyMs': Date.now() - t0 };
    },
    after: async () => timings,
    headline: ['m13.cameraReadyMs'],
  });
  return { ...result };
});
