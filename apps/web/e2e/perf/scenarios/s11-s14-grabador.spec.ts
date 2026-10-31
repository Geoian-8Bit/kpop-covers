import type { Page } from '@playwright/test';
import {
  keepAndOpenTakes,
  openReview,
  openTakesTab,
  recordTake,
  recorder,
  shutter,
  timerOff,
} from '../../flows/record/helpers';
import { fluid } from '../fluid';
import { scenario } from '../harness';
import { mark, measureMarks, type PassMetrics } from '../profile';
import { studioSetup } from '../studioSetup';
import { centerOf, gesture, pinchAt, slideAt, touchSession } from '../touch';

/** S-11 recorder pinch · S-12 record 20 s and save · S-13 share a take · S-14 review · S-17 «Tomas» + review after 2 min. */

/** Length of the 20 s takes; PERF_RECORD_SECONDS shortens it to debug the harness. */
const RECORD_MS = (Number(process.env.PERF_RECORD_SECONDS) || 20) * 1000;

/** A 720p fake camera: the default 1080p one crashes the new-headless renderer when a take longer than a few seconds is stopped. */
const CAMERA = { width: 1280, height: 720, fps: 30 };

/**
 * In this environment (Playwright Chromium 156, fake camera) stopping a take longer than ~4 s hangs or crashes the page,
 * whatever the camera size, scale factor or headless mode; a 2,5 s take (S-14) works. Long takes are recorded as skipped
 * unless PERF_RECORD_LONG=1 (try it on another machine).
 */
const LONG_TAKE_SKIP =
  'Parar una toma de más de ~4 s con la cámara falsa cuelga o hace caer la página en este Chromium (probado con cámara 1080p y 720p, escala 2 y 3, headless nuevo y shell); la toma de 2,5 s del S-14 sí funciona. Activar con PERF_RECORD_LONG=1 en otra máquina.';
const longTakes = () => process.env.PERF_RECORD_LONG === '1';

const setupWithCamera = (browser: Parameters<typeof studioSetup>[0]) =>
  studioSetup(browser, { fakeMedia: CAMERA });

async function openRecorder(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Grabar baile con la canción' }).click();
  await recorder(page).waitFor({ timeout: 30_000 });
  await shutter(page).waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(
    () => !document.querySelector('[data-record-shutter]')?.hasAttribute('disabled'),
    undefined,
    { timeout: 30_000 },
  );
  await recorder(page).getByRole('group', { name: 'Lentes y zoom' }).waitFor({ timeout: 30_000 });
}

scenario('S-11', 'Grabador con cámara falsa: pellizco de zoom 3 s', ['M-08', 'M-09'], async (browser) => {
  const result = await fluid(browser, {
    setup: await setupWithCamera(browser),
    prepare: openRecorder,
    action: async (page) => {
      const cdp = await touchSession(page);
      const box = (await recorder(page).boundingBox())!;
      const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await gesture(cdp, 3000, pinchAt(c, 30, Math.min(130, box.width / 2 - 10), 1.5));
    },
  });
  return { gestureSeconds: 3, ...result };
});

scenario('S-12', 'Grabar 20 s, parar, «Guardar»', ['M-13', 'M-09'], async (browser) => {
  if (!longTakes()) return { skipped: LONG_TAKE_SKIP };
  let saveMs: PassMetrics = {};
  const result = await fluid(browser, {
    setup: await setupWithCamera(browser),
    prepare: async (page) => {
      await openRecorder(page);
      await timerOff(page);
    },
    action: async (page) => {
      await shutter(page).click();
      await recorder(page).getByRole('button', { name: 'Terminar la toma' }).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(RECORD_MS);
      await recorder(page).getByRole('button', { name: 'Terminar la toma' }).click();
      const save = recorder(page).getByRole('button', { name: 'Guardar en «Tomas»' });
      await save.waitFor({ timeout: 120_000 });
      await mark(page, 'perf:save-click');
      const t0 = Date.now();
      await save.click();
      await recorder(page).getByRole('button', { name: 'En «Tomas»' }).waitFor({ timeout: 60_000 });
      saveMs = {
        'm13.saveToDomMs': Date.now() - t0,
        'm13.saveToMarkMs': await measureMarks(page, 'perf:save', 'perf:save-click', 'oneshoot:take-saved'),
      };
    },
    after: async () => saveMs,
    headline: ['m13.saveToDomMs'],
  });
  return { recordSeconds: 20, ...result };
});

scenario('S-13', '«Compartir con el grupo» una toma de 20 s', ['M-08'], async (browser) => {
  if (!longTakes()) return { skipped: LONG_TAKE_SKIP };
  const result = await fluid(browser, {
    setup: await setupWithCamera(browser),
    prepare: async (page) => {
      await openRecorder(page);
      await timerOff(page);
      await shutter(page).click();
      await recorder(page).getByRole('button', { name: 'Terminar la toma' }).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(RECORD_MS);
      await recorder(page).getByRole('button', { name: 'Terminar la toma' }).click();
      await recorder(page).getByRole('button', { name: 'Guardar en «Tomas»' }).waitFor({ timeout: 120_000 });
      await keepAndOpenTakes(page);
    },
    action: async (page) => {
      await page.getByRole('button', { name: 'Compartir con el grupo' }).first().click();
      const share = page.getByRole('dialog', { name: 'Compartir con el grupo' });
      await share.getByRole('button', { name: 'Compartir', exact: true }).click();
      // The demo has no cloud: the dialog ends in its own error or closes; either way the work of the copy is done.
      await share
        .getByText(/la nube no responde|Compartida|Reintentar/)
        .first()
        .waitFor({ timeout: 90_000 })
        .catch(() => undefined);
    },
    passes: 3,
  });
  return {
    note: 'Dialog commits (M-08) over the whole share. The number of frames of the 720p copy is not read: the demo keeps no copy to inspect.',
    copyFrames: null,
    ...result,
  };
});

scenario(
  'S-14',
  'Repaso: reproducir, arrastrar la bisagra, encajar superpuesto',
  ['M-08', 'M-09'],
  async (browser) => {
    const result = await fluid(browser, {
      setup: await setupWithCamera(browser),
      prepare: async (page) => {
        await openRecorder(page);
        await recordTake(page, 2500);
        await keepAndOpenTakes(page);
        await openReview(page);
      },
      action: async (page) => {
        await page.getByRole('button', { name: 'Reproducir los dos (espacio)' }).click();
        await page.waitForTimeout(10_000);
        const cdp = await touchSession(page);
        const hinge = await centerOf(
          page,
          '[role="separator"][aria-label="Reparto entre el original y la toma"]',
        );
        await gesture(cdp, 3000, slideAt(hinge, 60, 1.5));
        await page.getByRole('radio', { name: 'Superpuesto' }).click();
        await page.getByRole('button', { name: 'Encajar el original sobre la toma' }).click();
        await page.waitForTimeout(3000);
      },
    });
    return { play: 10, hingeSeconds: 3, fitSeconds: 3, ...result };
  },
);

scenario(
  'S-17',
  'Abrir «Tomas» con 10 tomas y pasar al repaso tras grabar 2 min',
  ['M-13'],
  async (browser) => {
    if (!longTakes()) return { skipped: LONG_TAKE_SKIP };
    let timings: PassMetrics = {};
    const result = await fluid(browser, {
      setup: await setupWithCamera(browser),
      prepare: async (page) => {
        await openRecorder(page);
        await timerOff(page);
      },
      action: async (page) => {
        await shutter(page).click();
        await recorder(page).getByRole('button', { name: 'Terminar la toma' }).waitFor({ timeout: 30_000 });
        await page.waitForTimeout(120_000);
        await mark(page, 'perf:stop-click');
        const t0 = Date.now();
        await recorder(page).getByRole('button', { name: 'Terminar la toma' }).click();
        await recorder(page)
          .getByRole('button', { name: 'Guardar en «Tomas»' })
          .waitFor({ timeout: 300_000 });
        const stopToKeep = Date.now() - t0;
        await recorder(page).getByRole('button', { name: 'Guardar en «Tomas»' }).click();
        await recorder(page).getByRole('button', { name: 'En «Tomas»' }).waitFor({ timeout: 120_000 });
        await recorder(page).getByRole('button', { name: 'Cerrar' }).click();
        const t1 = Date.now();
        await openTakesTab(page);
        const takesOpen = Date.now() - t1;
        const t2 = Date.now();
        await mark(page, 'perf:review-click');
        await openReview(page);
        timings = {
          'm13.stopToSaveButtonMs': stopToKeep,
          'm13.openTakesMs': takesOpen,
          'm13.reviewOpenDomMs': Date.now() - t2,
          'm13.reviewOpenMarkMs': await measureMarks(
            page,
            'perf:review',
            'perf:review-click',
            'oneshoot:review-ready',
          ),
        };
      },
      after: async () => timings,
      actionTimeoutMs: 600_000,
      passes: 3,
      headline: ['m13.reviewOpenDomMs'],
    });
    return {
      recordSeconds: 120,
      note: 'Three passes, not five: each one records two real minutes.',
      ...result,
    };
  },
);
