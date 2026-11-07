import { expect, test, type Page } from '@playwright/test';
import { guardConsole } from '../../support/seed';
import { touchSwipe } from '../../support/swipeRow';
import { openApp } from './support';

// REQ-02 · Shell · Calendario: the screen and its basic states (month, navigation, today, empty month, day detail).
// Marking an absence end to end is already covered by e2e/calendar.spec.ts and is not repeated here.

/** Swipes the month grid with a real finger: `-1` left (next month), `1` right (previous). */
async function swipe(page: Page, dir: 1 | -1) {
  // While a month slides out, two grids coexist for a moment: wait for the new one alone.
  await expect(page.getByRole('grid')).toHaveCount(1);
  const box = await page.getByRole('grid').boundingBox();
  if (!box) throw new Error('calendar grid not found');
  await touchSwipe(page, { x: box.x + box.width / 2 - dir * 80, y: box.y + 40 }, dir * 160);
}

test.beforeEach(({ browserName }) => {
  // The Playwright WebKit build here has no Web Audio (`AudioNode` is undefined), so the app throws on load and stays blank.
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio: la app no arranca');
});

test('el calendario abre en el mes de hoy con el día marcado', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/calendario');
  await expect(page.getByRole('heading', { name: 'octubre 2026' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Calendario', level: 1 })).toBeAttached();
  await expect(page.getByRole('gridcell').getByRole('button', { name: /hoy/ })).toHaveCount(1);
  guard.check();
});

test('los botones de mes y «Hoy» recorren los meses', async ({ page, hasTouch }) => {
  const guard = guardConsole(page);
  await openApp(page, '/calendario');
  const month = page.getByRole('heading', { level: 2 }).first();
  const hoy = page.getByRole('button', { name: 'Hoy', exact: true });
  // Touch: no arrows, the grid is swiped sideways. Mouse: the arrows.
  const next = () =>
    hasTouch ? swipe(page, -1) : page.getByRole('button', { name: 'Mes siguiente' }).click();
  const previous = () =>
    hasTouch ? swipe(page, 1) : page.getByRole('button', { name: 'Mes anterior' }).click();
  await expect(hoy).toHaveCount(0);
  if (hasTouch) await expect(page.getByRole('button', { name: 'Mes siguiente' })).toBeHidden();
  await next();
  await expect(month).toHaveText('noviembre 2026');
  await next();
  await expect(month).toHaveText('diciembre 2026');
  await previous();
  await expect(month).toHaveText('noviembre 2026');
  await hoy.click();
  await expect(month).toHaveText('octubre 2026');
  await expect(hoy).toHaveCount(0);
  guard.check();
});

test('un mes sin ausencias lo dice', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/calendario', { overrides: { absences: [] } });
  await expect(
    page.getByText('Nadie ha marcado ausencias este mes. Toca un día para marcar una.'),
  ).toBeVisible();
  guard.check();
});

test('tocar un día abre su detalle y se cierra', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/calendario');
  await page.getByRole('gridcell').getByRole('button', { name: /hoy/ }).click();
  const detail = page.getByRole('dialog', { name: / de \p{L}+$/u });
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('button', { name: 'Marcar ausencia' })).toBeVisible();
  await detail.getByRole('button', { name: 'Cerrar' }).click();
  await expect(detail).toBeHidden();
  guard.check();
});
