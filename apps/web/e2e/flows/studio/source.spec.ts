import { expect, test, type Page } from '@playwright/test';
import { DEMO_KEY } from '../../demo';
import { FIXTURE, guardConsole } from '../../support/seed';
import { media, openStudio, shortClips, studioVideo, skipWithoutWebAudio } from './studio';

// REQ-02 · Source switch (YouTube / Archivo), linking a file with its sync, and the live voice modes.
// Dynamite (YouTube, no file) is the video to link; «How You Like That» (YouTube with a linked file) shows the row.

/** «How You Like That» (practice): a YouTube entry that already has its own file. */
const LINKED_ID = '00000000-0000-4000-8002-000000000003';

skipWithoutWebAudio();

let video: Buffer;
test.beforeAll(async ({ browser }) => {
  video = await studioVideo(browser);
});

const stored = (page: Page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, Record<string, unknown>[]>,
    DEMO_KEY,
  );

test('cambiar entre YouTube y Archivo en un vídeo con archivo vinculado', async ({ page }) => {
  const guard = guardConsole(page);
  await openStudio(page, { id: LINKED_ID, media: video, overrides: shortClips });
  // The device holds the file: the row offers both and starts on the file.
  const file = page.getByRole('radio', { name: 'Archivo' });
  const youtube = page.getByRole('radio', { name: 'YouTube' });
  await expect(file).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('video')).toHaveCount(1);
  await youtube.click();
  await expect(youtube).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.getByText('Con el archivo: sin anuncios ni esperas')).toBeVisible();
  // The arrows of the radio group switch too (the pick is remembered for this video).
  await page.keyboard.press('ArrowLeft');
  await expect(file).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('video')).toHaveCount(1);
  guard.check();
});

test('vincular un archivo a un vídeo de YouTube y sincronizarlo', async ({ page }) => {
  const guard = guardConsole(page);
  await openStudio(page, { id: FIXTURE.youtubeVideoId, overrides: shortClips });
  await page.getByRole('button', { name: 'Añadir archivo de este vídeo' }).click();
  const panel = page.getByRole('dialog', { name: 'Archivo de este vídeo' });
  await expect(panel).toContainText('La app no descarga nada de YouTube');
  await panel
    .locator('input[type=file]')
    .setInputFiles({ name: 'dynamite-practica.webm', mimeType: 'video/webm', buffer: video });
  await expect(panel).toContainText('dynamite-practica.webm');
  // 3 s against the song's length: the panel warns it may be another version, and links on request.
  await expect(panel.getByRole('alert')).toContainText('puede que sea otra versión');
  await panel.getByRole('button', { name: 'Vincular igualmente' }).click();

  const sync = page.getByRole('dialog', { name: 'Sincronizar con YouTube' });
  await expect(sync).toBeVisible();
  await expect(sync.locator('video')).toHaveCount(1);
  // Mark the same moment on both: YouTube at its start, the file one second in.
  await sync.getByRole('button', { name: 'Marcar aquí' }).first().click();
  await expect(sync.getByRole('button', { name: /^Marcado en / }).first()).toBeVisible();
  await sync.getByRole('button', { name: '+1 s' }).nth(1).click();
  await sync.getByRole('button', { name: 'Marcar aquí' }).click();
  await expect(sync.getByRole('button', { name: 'Marcado en 0:01.0' })).toBeVisible();
  await sync.getByRole('button', { name: '+0,01' }).click();
  await sync.getByRole('button', { name: 'Guardar sincronía' }).click();
  await expect(page.getByText('Archivo sincronizado')).toBeVisible();
  await expect(sync).toBeHidden();

  await expect
    .poll(async () => {
      const row = (await stored(page)).videos!.find((v) => v.id === FIXTURE.youtubeVideoId);
      return [row?.file_name, Number(row?.file_offset_seconds ?? 0) > 0.9];
    })
    .toEqual(['dynamite-practica.webm', true]);
  // The studio now offers the file next to YouTube.
  await expect(page.getByRole('radio', { name: 'Archivo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archivo de este vídeo' })).toBeVisible();
  guard.check();
});

test('quitar el archivo vinculado devuelve el vídeo a solo YouTube', async ({ page }) => {
  const guard = guardConsole(page);
  await openStudio(page, { id: LINKED_ID, media: video, overrides: shortClips });
  await page.getByRole('button', { name: 'Archivo de este vídeo' }).click();
  const panel = page.getByRole('dialog', { name: 'Archivo de este vídeo' });
  await expect(panel).toContainText('how-you-like-that-practica.mp4');
  await panel.getByRole('button', { name: 'Quitar el archivo' }).click();
  const ask = page.getByRole('dialog', { name: '¿Quitar el archivo?' });
  await ask.getByRole('button', { name: 'Quitar', exact: true }).click();
  await expect(page.getByText('Archivo quitado: el vídeo vuelve a ser solo de YouTube')).toBeVisible();
  await expect
    .poll(async () => (await stored(page)).videos!.find((v) => v.id === LINKED_ID)?.file_name ?? null)
    .toBeNull();
  guard.check();
});

test('voz y música en directo: Todo, Sin voz y Voz sobre el archivo', async ({ page }) => {
  const guard = guardConsole(page);
  await openStudio(page, { media: video, overrides: shortClips });
  const group = page.getByRole('radiogroup', { name: /voz/i }).first();
  const todo = group.getByRole('radio', { name: /Todo/ });
  const sinVoz = group.getByRole('radio', { name: /Sin voz/ });
  const voz = group.getByRole('radio', { name: /^Voz|voz$/ }).last();
  await expect(todo).toHaveAttribute('aria-checked', 'true');
  await sinVoz.click();
  await expect(sinVoz).toHaveAttribute('aria-checked', 'true');
  await expect(todo).toHaveAttribute('aria-checked', 'false');
  await voz.click();
  await expect(group.getByRole('radio', { checked: true })).toContainText('Voz');
  await todo.click();
  await expect(todo).toHaveAttribute('aria-checked', 'true');
  // The video keeps playing through a mode change.
  await page.getByRole('button', { name: 'Reproducir' }).nth(1).click();
  await sinVoz.click();
  await expect.poll(async () => (await media(page))?.t ?? 0).toBeGreaterThan(0.2);
  await page.getByRole('button', { name: 'Pausar' }).nth(1).click();
  guard.check();
});

test('voz y música también desde la pantalla completa', async ({ page }) => {
  const guard = guardConsole(page);
  await openStudio(page, { media: video, overrides: shortClips });
  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  const fs = page.locator('[data-fs]');
  const open = fs.getByRole('button', { name: /^Voz y música: / });
  await expect(open).toBeVisible();
  await open.click();
  const sinVoz = fs.getByRole('radio', { name: /Sin voz/ });
  await sinVoz.click();
  await expect(sinVoz).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: 'Salir de pantalla completa' }).click();
  await expect(page.getByRole('radio', { name: /Sin voz/ }).first()).toHaveAttribute('aria-checked', 'true');
  guard.check();
});
