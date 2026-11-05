import { expect, test } from '@playwright/test';
import { guardConsole } from '../../support/seed';
import { openApp } from './support';

// REQ-02 · Shell · Calendario: the screen and its basic states (month, navigation, today, empty month, day detail).
// Marking an absence end to end is already covered by e2e/calendar.spec.ts and is not repeated here.

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

test('los botones de mes y «Hoy» recorren los meses', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/calendario');
  const month = page.getByRole('heading', { level: 2 }).first();
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await expect(month).toHaveText('noviembre 2026');
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await expect(month).toHaveText('diciembre 2026');
  await page.getByRole('button', { name: 'Mes anterior' }).click();
  await expect(month).toHaveText('noviembre 2026');
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(month).toHaveText('octubre 2026');
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
