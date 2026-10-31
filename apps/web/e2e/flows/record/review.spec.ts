import { expect, test, type Page } from '@playwright/test';
import { FIXTURE } from '../../support/seed';
import { guard as guardConsole, reviewRecordedTake, storedDb } from './helpers';

// REQ-02 · The review («Repaso»): the take against the original. Each test records a short take on the fake camera
// first (the media of a take lives in OPFS and can't be seeded), keeps it in «Tomas» and opens it.

// REQ-02 · Playwright's WebKit build here has no Web Audio (`AudioNode` is undefined) and the app stops on load,
// before anything of this area can be reached: nothing here can run on it.
test.beforeEach(({ browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio (AudioNode): la app no arranca');
});

test.describe.configure({ timeout: 90_000 });

const mine = async (page: Page) =>
  (await storedDb(page))['takes']!.find((t) => t['video_id'] === FIXTURE.uploadVideoId)!;

test('abre el repaso con la toma y el original, y lo cierra', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await reviewRecordedTake(page, browser);
  await expect(page.getByRole('heading', { name: 'Repaso' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Original: + para ampliar' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Toma: + para ampliar' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Separados' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Reproducir los dos (espacio)' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar el repaso' }).first().click();
  await expect(page.getByRole('heading', { name: 'Repaso' })).toBeHidden();
  guard.check();
});

test('cambia entre separados y superpuesto', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await reviewRecordedTake(page, browser);
  await page.getByRole('radio', { name: 'Superpuesto' }).click();
  await expect(page.getByRole('radio', { name: 'Superpuesto' })).toBeChecked();
  await expect(page.getByRole('separator', { name: 'Reparto entre el original y la toma' })).toBeHidden();
  await expect(page.getByRole('group', { name: /^Zoom sobre los dos/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Encajar el original sobre la toma' })).toBeVisible();
  await page.getByRole('radio', { name: 'Separados' }).click();
  await expect(page.getByRole('radio', { name: 'Separados' })).toBeChecked();
  await expect(page.getByRole('separator', { name: 'Reparto entre el original y la toma' })).toBeVisible();
  guard.check();
});

test('la bisagra reparte el espacio entre el original y la toma', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await reviewRecordedTake(page, browser);
  const hinge = page.getByRole('separator', { name: 'Reparto entre el original y la toma' });
  const start = Number(await hinge.getAttribute('aria-valuenow'));
  await hinge.focus();
  const forward =
    (await page.viewportSize())!.width > (await page.viewportSize())!.height ? 'ArrowRight' : 'ArrowDown';
  await hinge.press(forward);
  // The split is clamped and rounded by the app: it must move the way the key points, and come back the other way.
  await expect.poll(async () => Number(await hinge.getAttribute('aria-valuenow'))).toBeGreaterThan(start);
  const moved = Number(await hinge.getAttribute('aria-valuenow'));
  await hinge.press(forward === 'ArrowRight' ? 'ArrowLeft' : 'ArrowUp');
  await expect.poll(async () => Number(await hinge.getAttribute('aria-valuenow'))).toBeLessThan(moved);
  guard.check();
});

test('encaja el original sobre la toma en superpuesto', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await reviewRecordedTake(page, browser);
  await page.getByRole('radio', { name: 'Superpuesto' }).click();
  await page.getByRole('button', { name: 'Encajar el original sobre la toma' }).click();
  await expect(page.getByRole('button', { name: /^Encajando el original/ })).toBeVisible();
  const stage = page.getByRole('group', { name: /^Encaje del original/ });
  await stage.focus();
  await stage.press('ArrowRight');
  await stage.press('+');
  await stage.press('+');
  // The fit is saved with the take once it settles.
  await expect
    .poll(
      async () => {
        const t = await mine(page);
        return [Number(t['fit_x']), Number(t['fit_scale'])];
      },
      { timeout: 15_000 },
    )
    .not.toEqual([0, 1]);
  await page.getByRole('button', { name: /^Encajando el original/ }).click();
  await expect(page.getByRole('button', { name: 'Encajar el original sobre la toma' })).toBeVisible();
  guard.check();
});

test('velocidad: el botón rápido recorre las velocidades', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await reviewRecordedTake(page, browser);
  await page.getByRole('button', { name: 'Velocidad: 1×. Pulsa para 0,75×' }).click();
  await expect(page.getByRole('button', { name: /^Velocidad: 0,75×/ })).toBeVisible();
  guard.check();
});

test('sonido: alterna entre oír la toma y oír el original', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await reviewRecordedTake(page, browser);
  await page.getByRole('button', { name: 'Se oye la toma. Pulsa para oír el original' }).click();
  await expect(
    page.getByRole('button', { name: 'Se oye el original. Pulsa para oír la toma' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Se oye el original. Pulsa para oír la toma' }).click();
  await expect(
    page.getByRole('button', { name: 'Se oye la toma. Pulsa para oír el original' }),
  ).toBeVisible();
  guard.check();
});

test('ajuste de sincronía: se guarda con la toma', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await reviewRecordedTake(page, browser);
  // On a wide screen the settings are already beside the video; on a phone they open from a button.
  const settings = page.getByRole('button', { name: 'Ajustes del repaso' }).first();
  if (await settings.isVisible()) await settings.click();
  await expect(page.getByText('Ajuste fino')).toBeVisible();
  await page.getByRole('button', { name: 'Adelantar el original 0,01 s' }).click();
  await page.getByRole('button', { name: 'Adelantar el original 0,01 s' }).click();
  await page.getByRole('button', { name: 'Adelantar el original 0,01 s' }).click();
  await expect
    .poll(async () => Number((await mine(page))['sync_adjust_seconds']), { timeout: 15_000 })
    .toBeCloseTo(0.03, 2);
  await page.getByRole('button', { name: 'Poner a 0' }).click();
  await expect
    .poll(async () => Number((await mine(page))['sync_adjust_seconds']), { timeout: 15_000 })
    .toBeCloseTo(0, 2);
  guard.check();
});

test('nota de toma con dibujo: se guarda y se abre desde su marca', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await reviewRecordedTake(page, browser);
  await page.getByRole('button', { name: 'Nota en este momento (N)' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nota sobre la toma' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Guardar nota' })).toBeDisabled();
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
  await dialog.getByRole('button', { name: 'Guardar nota' }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => {
      const notes = (await storedDb(page))['notes']!.filter(
        (n) => n['body'] === 'El brazo llega tarde al giro',
      );
      return (
        notes.length === 1 &&
        typeof notes[0]!['sketch'] === 'string' &&
        String(notes[0]!['sketch']).length > 100
      );
    })
    .toBe(true);
  guard.check();
});
