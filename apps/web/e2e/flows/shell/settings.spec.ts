import { expect, test, type Page } from '@playwright/test';
import { FIXTURE, guardConsole } from '../../support/seed';
import { liveRows, openApp } from './support';

// REQ-02 · Shell · Ajustes: members (add, rename, recolour, archive), «¿Quién eres?», «Buscar actualización» and the
// version line. Members live in the demo store; the identity of the device in `oneshoot.me.v1`.

test.beforeEach(({ browserName }) => {
  // The Playwright WebKit build here has no Web Audio (`AudioNode` is undefined), so the app throws on load and stays blank.
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio: la app no arranca');
});

interface MemberRow extends Record<string, unknown> {
  id: string;
  archived_at: string | null;
  name: string;
  color: string;
}

const members = (page: Page) => liveRows<MemberRow>(page, 'members');
const identity = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('oneshoot.me.v1') ?? 'null') as {
        memberId: string | null;
        dismissed: boolean;
      } | null,
  );

test('ajustes muestra el dispositivo, los miembros y la versión', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/ajustes');
  await expect(page.getByRole('heading', { name: 'Ajustes', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Este dispositivo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Versión de la app' })).toBeVisible();
  // Hana is who this device says it is.
  await expect(page.getByText('Eres tú')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Editar a / })).toHaveCount(6);
  await expect(page.getByText(/^Versión de desarrollo/)).toBeVisible();
  guard.check();
});

test('alta de un miembro con su color', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/ajustes');
  await page.getByRole('button', { name: 'Añadir miembro' }).click();
  await page.getByLabel('Nombre').fill('PRUEBA Nami');
  await page.getByRole('radio', { name: 'Cerezo' }).click();
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page.getByText('PRUEBA Nami')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Editar a / })).toHaveCount(7);
  const added = (await members(page)).find((m) => m.name === 'PRUEBA Nami');
  expect(added?.color).toBe('sakura');
  guard.check();
});

test('renombrar y cambiar el color de un miembro', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/ajustes');
  await page.getByRole('button', { name: 'Editar a Mina' }).click();
  await page.getByLabel('Nombre').fill('Mina Dos');
  await page.getByRole('radio', { name: 'Washi' }).click();
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Mina Dos')).toBeVisible();
  await expect(page.getByText('Mina', { exact: true })).toHaveCount(0);
  const mina = (await members(page)).find((m) => m.id === '00000000-0000-4000-8001-000000000002');
  expect(mina).toMatchObject({ name: 'Mina Dos', color: 'washi' });
  guard.check();
});

test('cancelar la edición deja al miembro como estaba', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/ajustes');
  await page.getByRole('button', { name: 'Editar a Mina' }).click();
  await page.getByLabel('Nombre').fill('Otro nombre');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByText('Mina', { exact: true })).toBeVisible();
  expect((await members(page)).some((m) => m.name === 'Otro nombre')).toBe(false);
  guard.check();
});

test('quitar un miembro pide confirmación y lo saca del grupo', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/ajustes');
  await page.getByRole('button', { name: 'Quitar a Aoi del grupo' }).click();
  const dialog = page.getByRole('dialog', { name: '¿Quitar a Aoi?' });
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
  expect((await members(page)).length).toBe(6);

  await page.getByRole('button', { name: 'Quitar a Aoi del grupo' }).click();
  await dialog.getByRole('button', { name: 'Quitar' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Editar a Aoi' })).toHaveCount(0);
  expect((await members(page)).some((m) => m.name === 'Aoi')).toBe(false);
  guard.check();
});

test('«Soy yo» cambia la identidad de este dispositivo', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/ajustes');
  expect((await identity(page))?.memberId).toBe(FIXTURE.memberId);
  const mina = page.getByRole('listitem').filter({ hasText: 'Mina' });
  await mina.getByRole('button', { name: 'Soy yo' }).click();
  await expect(mina.getByText('Eres tú')).toBeVisible();
  expect((await identity(page))?.memberId).toBe('00000000-0000-4000-8001-000000000002');
  guard.check();
});

test('«¿Quién eres?» aparece al marcar una ausencia sin nombre y recuerda la elección', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/calendario', { me: null });
  await page.getByRole('gridcell').getByRole('button', { name: /hoy/ }).click();
  await page.getByRole('button', { name: 'Marcar ausencia' }).click();
  const who = page.getByRole('dialog', { name: '¿Quién eres?' });
  await expect(who).toBeVisible();
  await who.getByRole('radio', { name: 'Yuna' }).click();
  await expect(who).toBeHidden();
  expect((await identity(page))?.memberId).toBe('00000000-0000-4000-8001-000000000003');
  guard.check();
});

test('«Ahora no» en «¿Quién eres?» no vuelve a sugerirse', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/calendario', { me: null });
  await page.getByRole('gridcell').getByRole('button', { name: /hoy/ }).click();
  await page.getByRole('button', { name: 'Marcar ausencia' }).click();
  const who = page.getByRole('dialog', { name: '¿Quién eres?' });
  await who.getByRole('button', { name: 'Ahora no' }).click();
  await expect(who).toBeHidden();
  expect(await identity(page)).toEqual({ memberId: null, dismissed: true });
  guard.check();
});

test('«Buscar actualización» en desarrollo lo dice y no recarga', async ({ page }) => {
  const guard = guardConsole(page);
  await openApp(page, '/ajustes');
  await page.getByRole('button', { name: 'Buscar actualización' }).click();
  await expect(
    page.getByText('Es la versión de desarrollo: aquí no hay actualizaciones que buscar.'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/ajustes$/);
  guard.check();
});
