import { expect, test, type Page } from '@playwright/test';
import { FIXTURE } from '../support/seed';
import { atWidths, cssFrames, FRAME_TIMES, snap } from '../support/visual';
import { openStudio, shortClips, skipWithoutWebAudio, studioVideo } from '../flows/studio/studio';

// REQ-02 · Visual references of the studio: an uploaded file and YouTube (its iframe masked, the only thing that
// depends on the network), the A–B range, the clip list, every dialog, fullscreen, the link-a-file panel, the turn
// 390×844 → 844×390, and the frames of the timeline's tide, the zoom, the active-clip pill and a dialog opening.

test.describe.configure({ timeout: 120_000 });
skipWithoutWebAudio();

let video: Buffer;
test.beforeAll(async ({ browser }) => {
  video = await studioVideo(browser);
});

/** The fixture's single clip for the upload, plus a second one, all inside the 3 s of the test video. */
function clips(db: Record<string, Record<string, unknown>[]>): void {
  shortClips(db);
  const first = db.clips!.find((c) => c.video_id === FIXTURE.uploadVideoId)!;
  db.clips!.push({
    ...first,
    id: '00000000-0000-4000-8003-0000000000f1',
    name: 'Giro final',
    color: 'gold',
    start_seconds: 1.6,
    end_seconds: 2.6,
    speed: 0.75,
    mirrored: false,
    is_pinned: true,
  });
}

const openFile = (page: Page, clock: 'fixed' | 'install' = 'fixed') =>
  openStudioReady(page, { media: video, overrides: clips, clock });
const iframe = (page: Page) => page.locator('iframe');

/**
 * With the clock installed nothing moves until it is advanced (React timers, the player's readiness): tick it until
 * the player is ready.
 */
async function openStudioReady(page: Page, options: Parameters<typeof openStudio>[1]) {
  if (options?.clock !== 'install') return openStudio(page, options);
  const track = page.getByRole('slider', { name: 'Línea de tiempo' });
  const opening = openStudio(page, options).catch(() => undefined);
  const deadline = Date.now() + 20_000;
  let settled = false;
  void opening.then(() => (settled = true));
  while (!settled && Date.now() < deadline) {
    await page.clock.runFor(200).catch(() => undefined);
    await page.waitForTimeout(60);
  }
  await opening;
  await expect(track).not.toHaveAttribute('aria-valuemax', '0');
  await page.clock.runFor(1000);
  return track;
}

/** Fonts loaded and the page still: nothing mid-transition when the picture is taken. */
async function still(page: Page, ms = 600) {
  // Back to the top: a sticky sidebar shifts a pixel between full-page captures of a scrolled page.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    return document.fonts.ready;
  });
  await page.waitForTimeout(ms);
}

const key = (page: Page, keys: string[]) =>
  keys.reduce((p, k) => p.then(() => page.keyboard.press(k)), Promise.resolve());

/** A at 0.5 s and B at 1.5 s, with the keyboard. */
async function markRange(page: Page) {
  await key(page, ['.', '.', '.', '.', '.', 'a', 'Shift+ArrowRight', 'b']);
  await expect(page.getByTitle('Mover el final aquí (B)')).toContainText('0:01.5');
}

async function shoot(page: Page, name: string, opts: { fullPage?: boolean; mask?: boolean } = {}) {
  await atWidths(page, async (width) => {
    await still(page);
    await snap(page, `${name}-${width}`, {
      fullPage: opts.fullPage ?? false,
      mask: opts.mask ? [iframe(page)] : undefined,
    });
  });
}

test('estudio con archivo: pantalla y lista de clips', async ({ page }) => {
  await openFile(page);
  await shoot(page, 'estudio-archivo', { fullPage: true });
});

test('estudio con archivo sin clips ni notas', async ({ page }) => {
  await openStudioReady(page, {
    media: video,
    overrides: (db) => void (db.clips = db.clips!.filter((c) => c.video_id !== FIXTURE.uploadVideoId)),
  });
  await shoot(page, 'estudio-archivo-vacio', { fullPage: true });
});

test('estudio con YouTube (iframe enmascarado)', async ({ page }) => {
  await openStudio(page, { id: FIXTURE.youtubeVideoId });
  await shoot(page, 'estudio-youtube', { fullPage: true, mask: true });
});

test('estudio con YouTube y archivo vinculado: fila «Vídeo»', async ({ page }) => {
  await openStudio(page, { id: '00000000-0000-4000-8002-000000000003', media: video });
  await shoot(page, 'estudio-vinculado', { fullPage: true, mask: true });
});

test('tramo A–B marcado y repetido', async ({ page }) => {
  await openFile(page);
  await markRange(page);
  await page.getByRole('button', { name: /^Repetir el tramo/ }).click();
  await shoot(page, 'estudio-tramo', { fullPage: true });
});

test('tramo A–B con pausa entre repeticiones', async ({ page }) => {
  await openFile(page);
  await markRange(page);
  await page.getByRole('button', { name: /^Repetir el tramo/ }).click({ button: 'right' });
  await expect(page.getByRole('menu', { name: 'Pausa entre vueltas del clip' })).toBeVisible();
  await shoot(page, 'estudio-pausa-selector');
  await page.getByRole('menuitemradio', { name: '2 s' }).click();
  await page.keyboard.press('Escape');
  await shoot(page, 'estudio-pausa-puesta', { fullPage: true });
});

test('tramo en YouTube', async ({ page }) => {
  await openStudio(page, { id: FIXTURE.youtubeVideoId });
  await key(page, ['Shift+ArrowRight', 'a', 'Shift+ArrowRight', 'Shift+ArrowRight', 'b']);
  await expect(page.getByTitle('Mover el final aquí (B)')).toContainText('0:03.0');
  await shoot(page, 'estudio-youtube-tramo', { fullPage: true, mask: true });
});

test('menú de velocidad abierto', async ({ page }) => {
  await openFile(page);
  await page.getByRole('button', { name: /^Velocidad: / }).click();
  await expect(page.getByRole('menu', { name: 'Velocidad' })).toBeVisible();
  await shoot(page, 'estudio-velocidad');
});

test('espejo activo', async ({ page }) => {
  await openFile(page);
  const mirror = page.getByRole('button', { name: 'Espejo' }).first();
  if ((await mirror.getAttribute('aria-pressed')) !== 'true') await mirror.click();
  await key(page, ['5']);
  await shoot(page, 'estudio-espejo', { fullPage: true });
});

test('diálogo guardar clip', async ({ page }) => {
  await openFile(page);
  await markRange(page);
  await page.getByRole('button', { name: 'Guardar clip' }).click();
  await expect(page.getByRole('dialog', { name: 'Guardar clip' })).toBeVisible();
  await shoot(page, 'estudio-dialogo-guardar');
});

test('diálogo guardar clip con el tramo repetido (aviso)', async ({ page }) => {
  await openFile(page);
  await markRange(page);
  await page.getByRole('button', { name: 'Guardar clip' }).click();
  const dialog = page.getByRole('dialog', { name: 'Guardar clip' });
  await dialog.getByRole('textbox', { name: 'Nombre del clip' }).fill('Intro 5');
  await shoot(page, 'estudio-dialogo-guardar-nombre');
});

test('diálogo editar clip', async ({ page }) => {
  await openFile(page);
  await page.getByRole('button', { name: 'Editar Giro final' }).click();
  await expect(page.getByRole('dialog', { name: 'Editar clip' })).toBeVisible();
  await shoot(page, 'estudio-dialogo-editar');
});

test('clip activo (la píldora) y clip en borrado', async ({ page }) => {
  await openFile(page);
  const list = page.getByRole('list');
  await list.getByRole('button', { name: /^Giro final [0-9]/ }).click();
  // Applying a clip starts it: pause and go back to its start so the playhead is where the picture says.
  await page.getByRole('button', { name: 'Pausar' }).nth(1).click();
  await page.keyboard.press('Home');
  await expect(page.getByRole('timer', { name: 'Tiempo' })).toHaveText('0:01.6');
  // The speed flash over the video («0,75×») fades after a moment: wait for it.
  await page.waitForTimeout(3000);
  await shoot(page, 'estudio-clip-activo', { fullPage: true });
  // The delete confirmation disarms itself after a few seconds: one picture, at the project's own width.
  await page.getByRole('button', { name: 'Borrar Giro final' }).click();
  await expect(page.getByRole('button', { name: 'Confirmar borrar Giro final' })).toBeVisible();
  await snap(page, `estudio-clip-borrar-${page.viewportSize()!.width}`, { fullPage: true });
});

test('diálogo nota nueva y nota abierta', async ({ page }) => {
  await openFile(page);
  await key(page, ['Shift+ArrowRight']);
  await page.getByRole('button', { name: 'Añadir una nota en este momento' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva nota' });
  await expect(dialog).toBeVisible();
  await shoot(page, 'estudio-dialogo-nota');
  await dialog.getByRole('textbox').fill('Aquí entra el giro, brazos más arriba');
  await shoot(page, 'estudio-dialogo-nota-escrita');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  // The «Nota en 0:01» toast lingers a few seconds over the dialog's foot: wait for it to go.
  await expect(page.getByText('Nota en 0:01', { exact: true })).toBeHidden({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /^Nota en 0:01: / })).toBeVisible();
  await page.getByRole('button', { name: /^Nota en 0:01: / }).click({ force: true });
  await expect(page.getByRole('dialog', { name: 'Nota', exact: true })).toBeVisible();
  await shoot(page, 'estudio-dialogo-nota-abierta');
});

test('estudio con una nota en la línea de tiempo (YouTube, notas del fixture)', async ({ page }) => {
  await openStudio(page, { id: FIXTURE.youtubeVideoId });
  await page
    .getByRole('button', { name: /^Nota en .*Aquí entra el cambio de formación/ })
    .click({ force: true });
  await expect(page.getByRole('dialog', { name: 'Nota', exact: true })).toBeVisible();
  await shoot(page, 'estudio-youtube-nota-abierta', { mask: true });
});

test('ayuda de atajos', async ({ page }) => {
  await openFile(page);
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Atajos de teclado' })).toBeVisible();
  await shoot(page, 'estudio-atajos');
});

test('pantalla completa', async ({ page }) => {
  await openFile(page);
  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  await expect(page.getByRole('button', { name: 'Salir de pantalla completa' })).toBeVisible();
  // Fullscreen can't be resized: one picture, at the project's own width.
  await page.mouse.move(40, 40);
  await still(page);
  await snap(page, `estudio-pantalla-completa-${page.viewportSize()!.width}`);
});

test('panel vincular archivo: inicio, comprobación y sincronía', async ({ page }) => {
  await openStudio(page, { id: FIXTURE.youtubeVideoId });
  await page.getByRole('button', { name: 'Añadir archivo de este vídeo' }).click();
  const panel = page.getByRole('dialog', { name: 'Archivo de este vídeo' });
  await expect(panel).toBeVisible();
  await shoot(page, 'estudio-vincular-inicio', { mask: true });
  await panel
    .locator('input[type=file]')
    .setInputFiles({ name: 'dynamite-practica.webm', mimeType: 'video/webm', buffer: video });
  await expect(panel.getByRole('alert')).toBeVisible();
  await shoot(page, 'estudio-vincular-comprobar', { mask: true });
  await panel.getByRole('button', { name: 'Vincular igualmente' }).click();
  await expect(page.getByRole('dialog', { name: 'Sincronizar con YouTube' })).toBeVisible();
  await shoot(page, 'estudio-vincular-sincronia', { mask: true });
});

test('panel del archivo ya vinculado', async ({ page }) => {
  await openStudio(page, { id: '00000000-0000-4000-8002-000000000003', media: video });
  await page.getByRole('button', { name: 'Archivo de este vídeo' }).click();
  await expect(page.getByRole('dialog', { name: 'Archivo de este vídeo' })).toContainText(
    'how-you-like-that-practica.mp4',
  );
  await shoot(page, 'estudio-vincular-vinculado', { mask: true });
});

test('voz y música: modo «Sin voz» elegido', async ({ page }) => {
  await openFile(page);
  await page
    .getByRole('radio', { name: /Sin voz/ })
    .first()
    .click();
  // The mono check polls every 0.6 s and may add its note: let it settle before the picture.
  await page.waitForTimeout(2000);
  await shoot(page, 'estudio-voz-sin-voz', { fullPage: true });
});

test('giro del móvil 390×844 → 844×390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFile(page);
  await markRange(page);
  await still(page);
  await snap(page, 'estudio-giro-390x844');
  await page.setViewportSize({ width: 844, height: 390 });
  await still(page, 600);
  await snap(page, 'estudio-giro-844x390');
  await page.getByRole('button', { name: /^Velocidad: / }).click();
  await expect(page.getByRole('menu', { name: 'Velocidad' })).toBeVisible();
  await still(page);
  await snap(page, 'estudio-giro-844x390-velocidad');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Guardar clip' }).click();
  await expect(page.getByRole('dialog', { name: 'Guardar clip' })).toBeVisible();
  await still(page);
  await snap(page, 'estudio-giro-844x390-guardar');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  await expect(page.getByRole('button', { name: 'Salir de pantalla completa' })).toBeVisible();
  await page.mouse.move(40, 40);
  await snap(page, 'estudio-giro-844x390-pantalla-completa');
  await page.getByRole('button', { name: 'Salir de pantalla completa' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await still(page, 600);
  await snap(page, 'estudio-giro-vuelta-390x844');
});

// ───────────── Frames ─────────────

test('fotogramas: ola de la línea de tiempo (la marea sube con la reproducción)', async ({ page }) => {
  await openFile(page, 'install');
  const track = page.getByRole('slider', { name: 'Línea de tiempo' });
  // The tide follows the playhead: the video is parked at fixed moments (clock frozen, the player reads the element).
  for (const ms of [0, 600, 1200, 1800, 2400, 3000]) {
    await page.evaluate((s) => {
      const v = document.querySelector('video')!;
      v.pause();
      v.currentTime = Math.min(s, v.duration - 0.05);
    }, ms / 1000);
    await page.waitForFunction(
      (s) =>
        Math.abs(document.querySelector('video')!.currentTime - Math.min(s, 2.95)) < 0.01 &&
        !document.querySelector('video')!.seeking,
      ms / 1000,
    );
    await page.clock.runFor(120);
    await snap(page, `estudio-ola-${ms}ms`, { maxDiffPixelRatio: 0.01 });
  }
  await expect(track).toBeVisible();
});

/**
 * Frames of a `motion` animation on the installed clock (same idea as motionFrames): the clock advances to each
 * instant, then real time is left for the async work React does after a timer (it reads no clock we control) before
 * the picture, so a frame never depends on how busy the machine is.
 */
async function frames(
  page: Page,
  name: string,
  start: () => Promise<void>,
  times: readonly number[] = FRAME_TIMES,
) {
  await start();
  let at = 0;
  for (const t of times) {
    if (t > at) await page.clock.runFor(t - at);
    at = t;
    await page.waitForTimeout(150);
    await snap(page, `${name}-${t}ms`, { maxDiffPixelRatio: 0.01 });
  }
}

/** The element keeps still while the store thinks it plays: a frame never shows a moving picture. */
const freezeMedia = (page: Page) =>
  page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });

test('fotogramas: zoom al soltar (animación soft)', async ({ page }) => {
  await openFile(page, 'install');
  await page.locator('[data-stage]').focus();
  await frames(page, 'estudio-zoom-suelta', () => page.keyboard.press('+'));
  await page.clock.runFor(1000);
  await page.waitForTimeout(150);
  await snap(page, 'estudio-zoom-suelta-final', { maxDiffPixelRatio: 0.01 });
  await frames(page, 'estudio-zoom-vuelta', () => page.keyboard.press('0'), [100, 200, 400, 1000]);
});

test('fotogramas: píldora clip-active al cambiar de clip', async ({ page }) => {
  await freezeMedia(page);
  await openFile(page, 'install');
  const list = page.getByRole('list');
  await list.getByRole('button', { name: /^Intro 5 [0-9]/ }).click();
  await page.clock.runFor(1500);
  await frames(page, 'estudio-clip-activo', async () => {
    await list.getByRole('button', { name: /^Giro final [0-9]/ }).click();
  });
  await page.clock.runFor(1000);
  await page.waitForTimeout(150);
  await snap(page, 'estudio-clip-activo-final', { maxDiffPixelRatio: 0.01 });
});

// The dialog's own entrance runs on the Web Animations API (motion's hardware path), which the fake clock does not
// drive: its frames are taken by pausing every running animation at the instant (cssFrames).
test('fotogramas: apertura del diálogo', async ({ page }) => {
  await openFile(page);
  await cssFrames(page, 'estudio-dialogo-apertura', async () => {
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Atajos de teclado' })).toBeAttached();
  });
});
