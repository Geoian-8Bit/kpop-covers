import { expect, test, type Page } from '@playwright/test';
import { FIXTURE, guardConsole } from '../../support/seed';
import { testVideo } from '../../support/testVideo';
import { allRows, liveRows, openApp, ready } from './support';

// REQ-02 · Shell · Biblioteca: open, search/filter, open a pinned clip, add a YouTube video (search served by the
// dev server's mock), upload a file, archive a video. Results are checked on screen and in the demo store.

test.beforeEach(({ browserName }) => {
  // The Playwright WebKit build here has no Web Audio (`AudioNode` is undefined), so the app throws on load and stays blank.
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio: la app no arranca');
});

const cards = (page: Page) => page.getByRole('button', { name: /^Eliminar / });

test('la biblioteca abre con sus vídeos, el acceso rápido y el banner del próximo evento', async ({
  page,
}) => {
  const guard = guardConsole(page);
  await openApp(page);
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Biblioteca' }).first()).toBeAttached();
  await expect(page.getByPlaceholder('Buscar canción o artista')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Acceso rápido' })).toBeVisible();
  await expect(page.getByText('Dynamite').filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText('Último ensayo')).toBeVisible();
  await expect(cards(page)).toHaveCount(30);
  guard.check();
});

test('buscar filtra por canción o artista y sin coincidencias lo dice', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page);
  const search = page.getByPlaceholder('Buscar canción o artista');
  await search.fill('blackpink');
  await expect(page.getByRole('button', { name: 'Eliminar DDU-DU DDU-DU' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Eliminar Dynamite' })).toHaveCount(0);
  const videos = await liveRows<{ id: string; archived_at: null; title: string; artist: string | null }>(
    page,
    'videos',
  );
  const expected = videos.filter((v) => /blackpink/i.test(`${v.title} ${v.artist ?? ''}`)).length;
  await expect(cards(page)).toHaveCount(expected);

  await search.fill('zzzz sin resultados');
  await expect(page.getByText('Nada coincide con “zzzz sin resultados”.')).toBeVisible();
  await expect(cards(page)).toHaveCount(0);

  await search.fill('');
  await expect(cards(page)).toHaveCount(30);
  guard.check();
});

test('un clip fijado del acceso rápido abre el estudio con ese clip', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page);
  const quick = page.locator('section[aria-labelledby="quick-title"]');
  const first = quick.getByRole('link').first();
  await expect(first).toBeVisible();
  const href = (await first.getAttribute('href')) ?? '';
  expect(href).toMatch(/^\/v\/[\w-]+\?clip=[\w-]+$/);
  await first.click();
  // The studio consumes `?clip=` once it has applied the clip, so only the path is stable.
  await expect(page).toHaveURL(new RegExp(`${href.split('?')[0]}(\\?.*)?$`));
  guard.check();
});

test('añadir un vídeo de YouTube con la búsqueda simulada lo guarda y lo abre', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page);
  await page.getByRole('button', { name: 'Añadir vídeo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir vídeo' });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('Ej. ILLIT Magnetic dance practice').fill('rick astley');
  await dialog.getByRole('button', { name: 'Buscar', exact: true }).click();
  const results = dialog.getByRole('list', { name: 'Resultados' });
  await expect(results).toBeVisible();
  await results.getByRole('button').filter({ hasText: 'Never Gonna Give You Up' }).first().click();
  await dialog.getByRole('button', { name: 'Añadir y abrir' }).click();
  await expect(page).toHaveURL(/\/v\/[\w-]+$/);
  const videos = await liveRows<{ id: string; archived_at: null; youtube_id: string; source: string }>(
    page,
    'videos',
  );
  const added = videos.find((v) => v.youtube_id === 'dQw4w9WgXcQ');
  expect(added?.source).toBe('youtube');
  expect(videos.length).toBe(31);
  expect(page.url()).toContain(`/v/${added?.id}`);
  guard.check();
});

test('subir un archivo guarda el vídeo y lo abre', async ({ page, browser }) => {
  const guard = guardConsole(page);
  const video = await testVideo(browser);
  await openApp(page);
  await page.getByRole('button', { name: 'Añadir vídeo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir vídeo' });
  await dialog.getByRole('radio', { name: 'Subir archivo' }).click();
  await dialog
    .locator('input[type="file"]')
    .setInputFiles({ name: 'PRUEBA subida.webm', mimeType: video.mimeType, buffer: video.buffer });
  await expect(dialog.getByText('PRUEBA subida.webm')).toBeVisible();
  await dialog.getByLabel('Título').fill('PRUEBA subida shell');
  await dialog.getByLabel('Artista').fill('Tester');
  await dialog.getByRole('button', { name: 'Añadir y abrir' }).click();
  await expect(page).toHaveURL(/\/v\/[\w-]+$/);
  const videos = await liveRows<{
    id: string;
    archived_at: null;
    title: string;
    source: string;
    artist: string;
  }>(page, 'videos');
  const added = videos.find((v) => v.title === 'PRUEBA subida shell');
  expect(added).toMatchObject({ source: 'upload', artist: 'Tester' });
  guard.check();
});

test('archivar un vídeo lo quita de la biblioteca', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page);
  await page.getByRole('button', { name: 'Eliminar Dynamite' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Eliminar vídeo?' });
  await expect(dialog).toContainText('Dynamite');
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  expect((await liveRows(page, 'videos')).length).toBe(30);

  await page.getByRole('button', { name: 'Eliminar Dynamite' }).click();
  await dialog.getByRole('button', { name: 'Eliminar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Eliminar Dynamite' })).toHaveCount(0);
  // The demo store drops the row (production archives it with a trigger): either way it is out of the live list.
  const rows = await allRows(page, 'videos');
  const gone = rows.find((v) => v.id === FIXTURE.youtubeVideoId);
  expect(gone == null || gone.archived_at != null).toBe(true);
  expect((await liveRows(page, 'videos')).length).toBe(29);
  guard.check();
});

test('sin vídeos la biblioteca invita a añadir el primero', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/', { overrides: { videos: [], clips: [] } });
  await expect(page.getByRole('heading', { name: 'Empieza con vuestra próxima cover' })).toBeVisible();
  await expect(page.getByPlaceholder('Buscar canción o artista')).toHaveCount(0);
  await page.getByRole('button', { name: 'Añadir el primer vídeo' }).click();
  await expect(page.getByRole('dialog', { name: 'Añadir vídeo' })).toBeVisible();
  guard.check();
});
