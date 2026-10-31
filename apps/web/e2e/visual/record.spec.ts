import { expect, test, type Locator, type Page } from '@playwright/test';
import { DEMO_KEY } from '../demo';
import { FIXED_NOW, FIXTURE, fixClock, seedFixture } from '../support/seed';
import { atWidths, cssFrames, snap } from '../support/visual';
import {
  hideCamera,
  REC,
  keepAndOpenTakes,
  openRecorder,
  openReview,
  openTakesTab,
  recordTake,
  recorder,
  shutter,
  startTake,
  timerOff,
} from '../flows/record/helpers';

// REQ-02 · Visual references of the recorder, the takes and the review. The fake camera moves and a take's frame
// carries its frame counter, so the live preview is hidden (hideCamera) and recorded media is masked; everything
// else is the app as it is.

/**
 * The panels open with springs that cover most of their travel in the first 100 ms: one tick either side (the machine
 * under load) moves a frame by more than the 1 % allowed, so the references skip the first 400 ms (0 is the closed state; 200 ms of the settings fan still flickered).
 */
const PANEL_TIMES = [0, 400, 600, 1000] as const;

test.beforeEach(({ browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio (AudioNode): la app no arranca');
});
test.describe.configure({ timeout: 120_000 });

const settle = (page: Page, ms = 700) => page.waitForTimeout(ms);

/** Walks the fixed durations: a take's length and size depend on timing, so the store holds fixed ones. */
async function pinTakeNumbers(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const db = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, Record<string, unknown>[]>;
    for (const t of db['takes'] ?? [])
      if (t['video_id'] === '00000000-0000-4000-8002-000000000015') t['duration_seconds'] = 2.4;
    localStorage.setItem(key, JSON.stringify(db));
  }, DEMO_KEY);
  await page.reload();
}

/** The page's own scroll after opening the tab varies; the references start from the top of «Tomas». */
async function showTakes(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.querySelector('#takes-title')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  await page.waitForTimeout(300);
}

const stageVideo = (page: Page): Locator => page.locator('video');

test('grabador: inicio y cada panel (ajustes, imagen, visor, información, aplauso, inicio)', async ({
  page,
  browser,
}) => {
  await openRecorder(page, browser);
  await hideCamera(page);
  const rec = recorder(page);
  await atWidths(page, async (w) => {
    await settle(page);
    await snap(page, `grabador-inicio-${w}`);

    await rec.getByRole('button', { name: 'Ajustes del grabador' }).click();
    await settle(page, 1200);
    await snap(page, `grabador-ajustes-${w}`);
    await rec.getByRole('button', { name: /^Visor:/ }).click();
    await settle(page, 1000);
    await snap(page, `grabador-visor-${w}`);
    await rec.getByRole('button', { name: 'Volver al abanico' }).click();
    await settle(page, 1000);
    await rec.getByRole('button', { name: /^Imagen:/ }).click();
    await settle(page, 1000);
    await snap(page, `grabador-imagen-${w}`);
    await page.getByRole('button', { name: 'Cerrar los ajustes de imagen' }).click();
    await settle(page);
  });

  // Grid, level and the «i» button, switched on from «Visor».
  await rec.getByRole('button', { name: 'Ajustes del grabador' }).click();
  await rec.getByRole('button', { name: /^Visor:/ }).click();
  for (const name of [/Rejilla/, /Nivel/, /Información técnica/])
    await rec.getByRole('switch', { name }).click();
  await settle(page, 800);
  await rec.getByRole('button', { name: 'Cerrar los ajustes' }).last().click();
  await settle(page);
  // The same panel with its switches on, at each width (the preview's frame settles per size, so not left from before).
  await atWidths(page, async (w) => {
    await settle(page, 800);
    await rec.getByRole('button', { name: 'Ajustes del grabador' }).click();
    await rec.getByRole('button', { name: /^Visor:/ }).click();
    await settle(page, 1800);
    await snap(page, `grabador-visor-activado-${w}`);
    await rec.getByRole('button', { name: 'Cerrar los ajustes' }).last().click();
    await settle(page, 800);
  });

  await atWidths(page, async (w) => {
    await settle(page);
    await snap(page, `grabador-rejilla-nivel-${w}`);
  });
  await rec.getByRole('button', { name: 'Información técnica de la cámara' }).click();
  await settle(page, 1200);
  // The panel's readings come from the fake camera and are fixed; only the live sound list is masked.
  const info = page.getByRole('dialog', { name: 'Información técnica' });
  await expect(info).toBeVisible();
  await atWidths(page, async (w) => {
    await settle(page);
    await snap(page, `grabador-info-${w}`, {
      mask: [info.getByRole('list', { name: 'Últimos sonidos juzgados' })],
    });
  });
  await page.getByRole('button', { name: 'Cerrar la información' }).click();

  // Armed: waiting for the double clap.
  await timerOff(page);
  await rec.getByRole('button', { name: /^Armar:/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Sensibilidad del aplauso' })).toBeVisible();
  await atWidths(page, async (w) => {
    await settle(page, 900);
    await snap(page, `grabador-aplauso-${w}`, {
      mask: [page.getByRole('meter'), page.getByText(/^Se desarma solo en/)],
    });
  });
});

test('grabador: elegir el inicio de la toma', async ({ page, browser }) => {
  await openRecorder(page, browser);
  await hideCamera(page);
  const start = recorder(page).getByRole('button', { name: /^Empieza en:/ });
  const box = (await start.boundingBox())!;
  // A long press opens the list of starts (clips included).
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(page.getByRole('dialog', { name: '¿Desde dónde empieza?' })).toBeVisible();
  await atWidths(page, async (w) => {
    await settle(page, 900);
    await snap(page, `grabador-inicio-lista-${w}`);
  });
});

test('grabador: cuenta atrás y toma en marcha', async ({ page, browser }) => {
  await openRecorder(page, browser);
  await hideCamera(page);
  const rec = recorder(page);
  // A 10 s count keeps the screen as it is for as long as the capture needs to settle.
  const timer = rec.getByRole('button', { name: /^Cuenta atrás/ });
  while (!/10 segundos/.test((await timer.getAttribute('aria-label')) ?? '')) await timer.click();
  await shutter(page).click();
  await expect(rec.getByText('Toca para cancelar')).toBeAttached();
  // The digit springs in and out on every second of the count, and its width changes (10, then 9): it is hidden and
  // the screen around it is the reference.
  await page.addStyleTag({
    content: `[aria-label="${REC}"] .font-display.text-\\[9rem\\] { opacity: 0 !important; }`,
  });
  await page.waitForTimeout(500);
  await snap(page, `grabador-cuenta-${page.viewportSize()!.width}`);
  await shutter(page).click();
  await timerOff(page);
  await shutter(page).click();
  await expect(rec.getByRole('button', { name: 'Terminar la toma' })).toBeVisible({ timeout: 15_000 });
  // Mid-take the clock and the song bar move: those are the only masked parts.
  await shutter(page).click();
  await expect(shutter(page)).toHaveAccessibleName('Seguir grabando');
  await settle(page, 600);
  await atWidths(page, async (w) => {
    await settle(page);
    await snap(page, `grabador-pausa-${w}`, { mask: [rec.locator('span.font-mono')] });
  });
  await rec.getByRole('button', { name: 'Descartar la toma' }).click();
  await settle(page, 700);
  await atWidths(page, async (w) => {
    await settle(page);
    await snap(page, `grabador-descartar-${w}`, { mask: [rec.locator('span.font-mono')] });
  });
});

test('grabador: revisión de la toma recién grabada', async ({ page, browser }) => {
  await openRecorder(page, browser);
  await hideCamera(page);
  await recordTake(page, 2200);
  const rec = recorder(page);
  await atWidths(page, async (w) => {
    await settle(page, 900);
    // The take plays on a loop and its time and size vary: video and size line are masked.
    await snap(page, `grabador-revision-${w}`, {
      mask: [rec.locator('video'), rec.locator('p.tabular').first()],
    });
  });
});

test('grabador: toma sin guardar ofrecida al volver', async ({ page, browser }) => {
  await openRecorder(page, browser);
  await startTake(page, 4000);
  await page.reload();
  await page.getByRole('button', { name: 'Grabar baile con la canción' }).click();
  const leftover = page.getByRole('status', { name: 'Toma sin guardar' });
  await expect(leftover).toBeVisible({ timeout: 20_000 });
  await hideCamera(page);
  await atWidths(page, async (w) => {
    await settle(page, 900);
    // Its size line and date depend on the take just made.
    await snap(page, `grabador-toma-sin-guardar-${w}`, { mask: [leftover.locator('p').nth(1)] });
  });
});

test('tomas: lista con datos, filtros y sin resultados', async ({ page }) => {
  await fixClock(page);
  await seedFixture(page);
  await page.goto(`/v/${FIXTURE.youtubeVideoId}`);
  await openTakesTab(page);
  await expect(page.getByRole('radiogroup', { name: 'Filtrar por persona' })).toBeVisible();
  const mask = [page.locator('iframe')];
  await atWidths(page, async (w) => {
    await settle(page, 900);
    await showTakes(page);
    await snap(page, `tomas-lista-${w}`, { mask });
  });
  await page
    .getByRole('radiogroup', { name: 'Filtrar por persona' })
    .getByRole('radio', { name: 'Rei' })
    .click();
  await atWidths(page, async (w) => {
    await settle(page, 900);
    await showTakes(page);
    await snap(page, `tomas-filtro-persona-${w}`, { mask });
  });
});

test('tomas: vacío y toma de otro móvil', async ({ page }) => {
  await fixClock(page);
  await seedFixture(page, {
    overrides: (db) => {
      db['takes'] = db['takes']!.filter((t) => t['video_id'] !== FIXTURE.youtubeVideoId);
    },
  });
  await page.goto(`/v/${FIXTURE.youtubeVideoId}`);
  await openTakesTab(page);
  await expect(page.getByText('Aún no hay tomas')).toBeVisible();
  const mask = [page.locator('iframe')];
  await atWidths(page, async (w) => {
    await settle(page, 900);
    await showTakes(page);
    await snap(page, `tomas-vacio-${w}`, { mask });
  });
});

test('tomas: toma recién grabada, diálogo de compartir y de borrar', async ({ page, browser }) => {
  await openRecorder(page, browser);
  await recordTake(page);
  await keepAndOpenTakes(page);
  await pinTakeNumbers(page);
  await openTakesTab(page);
  // The song's video is a moving picture and the «Repasar» button of a playable take has a moving shine.
  const mask = [stageVideo(page), page.getByRole('button', { name: /^Repasar con el original/ })];
  await atWidths(page, async (w) => {
    await settle(page, 900);
    await showTakes(page);
    await snap(page, `tomas-grabada-${w}`, { mask });
  });
  await page.getByRole('button', { name: 'Compartir con el grupo' }).click();
  const share = page.getByRole('dialog', { name: 'Compartir con el grupo' });
  await expect(share.getByRole('button', { name: 'Compartir' })).toBeEnabled();
  await atWidths(page, async (w) => {
    await settle(page, 900);
    await showTakes(page);
    await snap(page, `tomas-compartir-${w}`, { mask });
  });
  await expect(async () => {
    if (await share.isVisible())
      await share.getByRole('button', { name: 'Ahora no' }).click({ timeout: 2000 });
    await expect(share).toBeHidden({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Borrar la toma' }).click();
  await expect(page.getByRole('dialog', { name: '¿Borrar esta toma?' })).toBeVisible();
  await atWidths(page, async (w) => {
    await settle(page, 900);
    await showTakes(page);
    await snap(page, `tomas-borrar-${w}`, { mask });
  });
});

/** The review of a take recorded just now: the take's own frame carries the camera's frame counter, so it is masked. */
async function reviewMasks(page: Page): Promise<Locator[]> {
  return [
    page.getByRole('group', { name: 'Toma: + para ampliar' }),
    page.getByRole('group', { name: /^Zoom sobre los dos/ }),
    page.getByRole('group', { name: /^Encaje del original/ }),
  ];
}

test('repaso: separado, superpuesto, ajustes y nota con dibujo', async ({ page, browser }) => {
  await openRecorder(page, browser);
  await recordTake(page);
  await keepAndOpenTakes(page);
  await pinTakeNumbers(page);
  await openTakesTab(page);
  await openReview(page);
  await settle(page, 1200);
  const masks = await reviewMasks(page);
  await atWidths(page, async (w) => {
    await settle(page, 900);
    await snap(page, `repaso-separado-${w}`, { mask: masks });
  });

  // The settings: a sheet on phones, a side panel on wide screens.
  const settings = page.getByRole('button', { name: 'Ajustes del repaso' }).first();
  if (await settings.isVisible()) {
    await settings.click();
    await settle(page, 900);
  }
  await atWidths(page, async (w) => {
    await settle(page, 900);
    await snap(page, `repaso-ajustes-${w}`, { mask: masks });
  });
  const close = page.getByRole('button', { name: 'Cerrar ajustes' }).first();
  if (await close.isVisible()) await close.click();

  await page.getByRole('radio', { name: 'Superpuesto' }).click();
  await settle(page, 900);
  await atWidths(page, async (w) => {
    await settle(page, 900);
    await snap(page, `repaso-superpuesto-${w}`, { mask: masks });
  });
  await page.getByRole('radio', { name: 'Separados' }).click();
  await settle(page, 700);

  // Note with a drawing on the frame (the frame itself is the take's, so the pad is masked).
  await page.getByRole('button', { name: 'Nota en este momento (N)' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nota sobre la toma' });
  await expect(dialog).toBeVisible();
  await settle(page, 700);
  await dialog.getByLabel('Qué hay que corregir').fill('El brazo llega tarde al giro');
  await dialog.getByRole('button', { name: 'Dibujar sobre el fotograma' }).click();
  const pad = dialog.getByRole('img', { name: /^Fotograma de la toma para dibujar/ });
  await expect(pad).toBeVisible();
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 6 });
  await page.mouse.up();
  await expect(dialog.getByRole('img', { name: /1 trazo/ })).toBeVisible();
  await atWidths(page, async (w) => {
    await settle(page, 900);
    await snap(page, `repaso-nota-dibujo-${w}`, {
      mask: [dialog.getByRole('img', { name: /^Fotograma de la toma para dibujar/ }), ...masks],
    });
  });
});

test('repaso: giro de vertical 390x844 a horizontal 844x390', async ({ page, browser }) => {
  await openRecorder(page, browser);
  await recordTake(page);
  await keepAndOpenTakes(page);
  await pinTakeNumbers(page);
  await openTakesTab(page);
  await openReview(page);
  await settle(page, 1200);
  const masks = await reviewMasks(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page, 1000);
  await snap(page, 'repaso-giro-separado-390x844', { mask: masks });
  await page.setViewportSize({ width: 844, height: 390 });
  await settle(page, 1200);
  await snap(page, 'repaso-giro-separado-844x390', { mask: masks });
  // Turned, the mode switch is the quick «Superpuesto» button on the side rail.
  await page.getByRole('button', { name: 'Superpuesto' }).click();
  await settle(page, 900);
  await snap(page, 'repaso-giro-superpuesto-844x390', { mask: masks });
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page, 1200);
  await snap(page, 'repaso-giro-superpuesto-390x844', { mask: masks });
});

test('grabador: giro de vertical a horizontal', async ({ page, browser }) => {
  await openRecorder(page, browser);
  await hideCamera(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page, 1000);
  await snap(page, 'grabador-giro-inicio-390x844');
  await page.setViewportSize({ width: 844, height: 390 });
  await settle(page, 1200);
  await snap(page, 'grabador-giro-inicio-844x390');
});

/**
 * Frames of a panel that is part JS (motion, on the faked clock) and part CSS / Web Animations (on the real one):
 * the clock is moved to each instant and every running animation is set to the same instant. Afterwards the
 * animations are released, or the panel's exit would wait for ever on a paused one.
 */
async function bothFrames(
  page: Page,
  name: string,
  start: () => Promise<void>,
  times: readonly number[] = PANEL_TIMES,
): Promise<void> {
  await start();
  let at = 0;
  for (const t of times) {
    if (t > at) await page.clock.runFor(t - at);
    at = t;
    await cssFrames(page, name, async () => undefined, [t]);
  }
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
}

test('fotogramas: apertura de los paneles del grabador', async ({ page, browser }) => {
  // The page clock is faked but runs on its own until a panel is about to open: then it is paused, and moved on
  // by hand from 0 to 1000 ms (motion's springs and the panels' fades follow it).
  await openRecorder(page, browser, { clock: 'install' });
  await hideCamera(page);
  const rec = recorder(page);
  // The «i» button has to exist before its panel can be framed.
  await rec.getByRole('button', { name: 'Ajustes del grabador' }).click();
  await rec.getByRole('button', { name: /^Visor:/ }).click();
  await rec.getByRole('switch', { name: /Información técnica/ }).click();
  await rec.getByRole('button', { name: 'Cerrar los ajustes' }).last().click();
  await settle(page, 1500);

  const width = page.viewportSize()!.width;
  const freeze = async () => {
    // The fake rAF ticks every 16 ms counted from the install time: pausing on a tick boundary makes every run
    // start its frames from the same phase.
    const now = await page.evaluate(() => Date.now());
    const tick = Math.ceil((now + 300 - FIXED_NOW.getTime()) / 16);
    await page.clock.pauseAt(new Date(FIXED_NOW.getTime() + tick * 16));
  };
  const frames = async (
    name: string,
    start: () => Promise<void>,
    close: () => Promise<void>,
    times: readonly number[] = PANEL_TIMES,
  ) => {
    await freeze();
    await bothFrames(page, `${name}-${width}`, start, times);
    await page.clock.resume();
    await close();
    await settle(page, 1500);
  };

  await frames(
    'grabador-marco-ajustes',
    () => rec.getByRole('button', { name: 'Ajustes del grabador' }).click(),
    () => rec.getByRole('button', { name: 'Cerrar los ajustes' }).last().click(),
  );
  await frames(
    'grabador-marco-info',
    () => rec.getByRole('button', { name: 'Información técnica de la cámara' }).click(),
    () => page.getByRole('button', { name: 'Cerrar la información' }).click(),
    // The sheet carries the camera readings and a list that refresh on their own: only the closed and the settled states are references.
    [0, 1000],
  );
  await timerOff(page);
  await frames(
    'grabador-marco-aplauso',
    () => rec.getByRole('button', { name: /^Armar:/ }).click(),
    () => page.getByRole('button', { name: 'Cancelar' }).click(),
  );
});
