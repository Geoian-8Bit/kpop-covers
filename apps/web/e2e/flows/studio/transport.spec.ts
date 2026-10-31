import { expect, test, type Page } from '@playwright/test';
import { DEMO_KEY } from '../../demo';
import { FIXTURE, guardConsole } from '../../support/seed';
import { media, openStudio, shortClips, studioVideo, skipWithoutWebAudio } from './studio';

// REQ-02 · Studio flows on an uploaded video (a real <video>, so playback, speed, loops and clips are checked on the
// element itself). The fixture's own clips for this upload are moved inside its 3 s.

skipWithoutWebAudio();

let video: Buffer;
test.beforeAll(async ({ browser }) => {
  video = await studioVideo(browser);
});

const open = (page: Page, extra: Parameters<typeof openStudio>[1] = {}) =>
  openStudio(page, { media: video, overrides: shortClips, ...extra });

const timer = (page: Page) => page.getByRole('timer', { name: 'Tiempo' });
const playBtn = (page: Page) => page.getByRole('button', { name: /^(Reproducir|Pausar)$/ }).nth(1);
const stored = (page: Page, table: string) =>
  page.evaluate(
    ([key, t]) => (JSON.parse(localStorage.getItem(key!) ?? '{}')[t!] ?? []) as Record<string, unknown>[],
    [DEMO_KEY, table],
  );

/**
 * Seeks with the keyboard: Home goes to the start (of the A–B range once A is marked: `home`), Shift+→ is 1 s and
 * «.» is 0.1 s from there.
 */
async function seekTo(page: Page, seconds: number, home = 0) {
  await page.keyboard.press('Home');
  const delta = Math.round((seconds - home) * 10);
  for (let i = 0; i < Math.floor(delta / 10); i++) await page.keyboard.press('Shift+ArrowRight');
  for (let i = 0; i < delta % 10; i++) await page.keyboard.press('.');
  await expect(timer(page)).toHaveText(`0:0${Math.floor(seconds)}.${Math.round((seconds % 1) * 10)}`);
}

test('reproducir y pausar con el botón: el vídeo corre y se detiene', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await playBtn(page).click();
  await expect(page.getByRole('button', { name: 'Pausar' }).nth(1)).toBeVisible();
  await expect.poll(async () => (await media(page))?.t ?? 0).toBeGreaterThan(0.3);
  await playBtn(page).click();
  await expect(page.getByRole('button', { name: 'Reproducir' }).nth(1)).toBeVisible();
  const paused = await media(page);
  expect(paused?.paused).toBe(true);
  await page.waitForTimeout(400);
  expect((await media(page))?.t).toBeCloseTo(paused!.t, 1);
  await expect(timer(page)).not.toHaveText('0:00.0');
  guard.check();
});

test('tocar el vídeo reproduce y pausa', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await page.locator('[data-stage]').click();
  await expect.poll(async () => (await media(page))?.paused).toBe(false);
  await page.locator('[data-stage]').click();
  await expect.poll(async () => (await media(page))?.paused).toBe(true);
  guard.check();
});

test('espejo: el botón lo activa y lo quita', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  const mirror = page.getByRole('button', { name: 'Espejo' }).first();
  const before = await mirror.getAttribute('aria-pressed');
  await mirror.click();
  await expect(mirror).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
  await mirror.click();
  await expect(mirror).toHaveAttribute('aria-pressed', before!);
  guard.check();
});

test('velocidad: un preset y el ajuste fino de 0,05×', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await page.getByRole('button', { name: /^Velocidad: / }).click();
  const menu = page.getByRole('menu', { name: 'Velocidad' });
  await menu.getByRole('menuitemradio', { name: '0,75×' }).click();
  await expect(page.getByRole('button', { name: 'Velocidad: 0,75×' })).toBeVisible();
  expect((await media(page))?.rate).toBeCloseTo(0.75, 2);
  await menu.getByRole('button', { name: 'Más rápido' }).click();
  await expect(page.getByRole('button', { name: 'Velocidad: 0,8×' })).toBeVisible();
  await menu.getByRole('button', { name: 'Más lento' }).click();
  await menu.getByRole('button', { name: 'Más lento' }).click();
  await expect(page.getByRole('button', { name: 'Velocidad: 0,7×' })).toBeVisible();
  expect((await media(page))?.rate).toBeCloseTo(0.7, 2);
  await page.keyboard.press('Escape'); // closes the menu first; the A–B range is untouched
  await expect(menu).toBeHidden();
  guard.check();
});

test('marcar A y B y repetir el tramo en bucle', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await seekTo(page, 0.5);
  await page.keyboard.press('a');
  await seekTo(page, 1.5, 0.5);
  await page.keyboard.press('b');
  const row = page.getByRole('button', { name: /^Repetir el tramo/ });
  await expect(page.getByTitle('Mover el inicio aquí (A)')).toContainText('0:00.5');
  await expect(page.getByTitle('Mover el final aquí (B)')).toContainText('0:01.5');
  if ((await row.getAttribute('aria-pressed')) !== 'true') await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Home'); // goes to the start of the range
  await expect(timer(page)).toHaveText('0:00.5');
  await playBtn(page).click();
  const seen: number[] = [];
  for (let i = 0; i < 28; i++) {
    seen.push((await media(page))?.t ?? 0);
    await page.waitForTimeout(100);
  }
  expect(Math.max(...seen)).toBeLessThan(1.75);
  expect(Math.min(...seen)).toBeGreaterThan(0.35);
  expect(
    seen.some((t, i) => i > 0 && t < seen[i - 1]! - 0.3),
    'wrapped back to A',
  ).toBe(true);
  await page.getByRole('button', { name: 'Quitar tramo' }).click();
  await expect(row).toBeHidden();
  guard.check();
});

test('pausa entre repeticiones: el selector pone 2 s y el distintivo lo muestra', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await seekTo(page, 0.5);
  await page.keyboard.press('a');
  await seekTo(page, 1.5, 0.5);
  await page.keyboard.press('b');
  const row = page.getByRole('button', { name: /^Repetir el tramo/ });
  await row.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Pausa entre vueltas del clip' });
  await menu.getByRole('menuitemradio', { name: '2 s' }).click();
  await expect(menu.getByRole('menuitemradio', { name: '2 s' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: /^Repetir el tramo, pausa de 2 s/ })).toBeVisible();
  const tick = menu.getByRole('menuitemcheckbox');
  const was = await tick.getAttribute('aria-checked');
  await tick.click();
  await expect(tick).toHaveAttribute('aria-checked', was === 'true' ? 'false' : 'true');
  await menu.getByRole('menuitemradio', { name: 'No' }).click();
  await expect(page.getByRole('button', { name: /^Repetir el tramo \(/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  guard.check();
});

test('bucle de la canción entera, con su pausa', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  const all = page.getByRole('button', { name: /^Bucle: repetir la canción entera/ });
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await all.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Pausa entre vueltas de la canción' });
  await menu.getByRole('menuitemradio', { name: '3 s' }).click();
  await expect(page.getByRole('button', { name: /pausa de 3 s/ }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await all.click();
  await expect(all).toHaveAttribute('aria-pressed', 'false');
  guard.check();
});

test('guardar un clip, editarlo y borrarlo', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await seekTo(page, 0.5);
  await page.keyboard.press('a');
  await seekTo(page, 1.5, 0.5);
  await page.keyboard.press('b');
  await page.getByRole('button', { name: 'Guardar clip' }).click();
  const dialog = page.getByRole('dialog', { name: 'Guardar clip' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('0:00.5 → 0:01.5');
  await dialog.getByRole('textbox', { name: 'Nombre del clip' }).fill('PRUEBA gancho');
  await dialog.getByRole('radio').nth(2).click();
  await dialog.getByRole('button', { name: 'Guardar clip' }).click();
  await expect(page.getByText('“PRUEBA gancho” guardado')).toBeVisible();
  await expect(dialog).toBeHidden();
  const row = page.getByRole('button', { name: 'Editar PRUEBA gancho' });
  await expect(row).toBeVisible();
  await expect
    .poll(async () => (await stored(page, 'clips')).find((c) => c.name === 'PRUEBA gancho')?.start_seconds)
    .toBeCloseTo(0.5, 1);

  // Edit: new name and slower.
  await row.click();
  const edit = page.getByRole('dialog', { name: 'Editar clip' });
  await edit.getByRole('textbox', { name: 'Nombre del clip' }).fill('PRUEBA gancho 2');
  await edit.getByRole('button', { name: 'Más lento' }).click();
  await edit.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('«PRUEBA gancho 2» actualizado')).toBeVisible();
  await expect
    .poll(async () => (await stored(page, 'clips')).find((c) => c.name === 'PRUEBA gancho 2')?.speed)
    .toBeCloseTo(0.95, 2);

  // Delete with the two-step confirmation.
  await page.getByRole('button', { name: 'Borrar PRUEBA gancho 2' }).click();
  const confirm = page.getByRole('button', { name: 'Confirmar borrar PRUEBA gancho 2' });
  await expect(confirm).toBeVisible();
  await page.waitForTimeout(450);
  await confirm.click();
  await expect(page.getByRole('button', { name: 'Editar PRUEBA gancho 2' })).toBeHidden();
  await expect
    .poll(
      async () =>
        (await stored(page, 'clips')).filter((c) => c.name === 'PRUEBA gancho 2' && !c.archived_at).length,
    )
    .toBe(0);
  guard.check();
});

test('aplicar un clip de la lista activa su tramo, velocidad y espejo', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page, {
    overrides: (db) => {
      shortClips(db);
      const c = db.clips!.find((x) => x.video_id === FIXTURE.uploadVideoId)!;
      Object.assign(c, { speed: 0.75, mirrored: true, start_seconds: 0.5, end_seconds: 1.5 });
    },
  });
  const first = page.getByRole('list').getByRole('button', { name: /^Intro 5 [0-9]/ });
  await first.click();
  await expect(first).toHaveAttribute('aria-current', 'true');
  await expect(page.getByRole('button', { name: 'Velocidad: 0,75×' })).toBeVisible();
  await expect(page.getByTitle('Mover el inicio aquí (A)')).toContainText('0:00.5');
  await expect(page.getByRole('button', { name: 'Espejo' }).first()).toHaveAttribute('aria-pressed', 'true');
  guard.check();
});

test('nota con tiempo: crear, ver el punto en la línea y borrarla', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await seekTo(page, 1);
  await page.getByRole('button', { name: 'Añadir una nota en este momento' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva nota' });
  await expect(dialog).toContainText('En el 0:01.0 de la canción.');
  await dialog.getByRole('textbox').fill('PRUEBA aquí entra el giro');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Nota en 0:01')).toBeVisible();
  const dot = page.getByRole('button', { name: /^Nota en 0:01: PRUEBA aquí entra el giro/ });
  await expect(dot).toBeVisible();
  await expect
    .poll(
      async () =>
        (await stored(page, 'notes')).find((n) => n.body === 'PRUEBA aquí entra el giro')?.at_seconds,
    )
    .toBeCloseTo(1, 1);

  await dot.click({ force: true });
  const opened = page.getByRole('dialog', { name: 'Nota', exact: true });
  await expect(opened.getByRole('textbox')).toHaveValue('PRUEBA aquí entra el giro');
  await opened.getByRole('button', { name: 'Borrar la nota' }).click();
  await page.waitForTimeout(450);
  await opened.getByRole('button', { name: 'Confirmar borrar la nota' }).click();
  await expect(page.getByText('Nota borrada')).toBeVisible();
  await expect(dot).toBeHidden();
  guard.check();
});
