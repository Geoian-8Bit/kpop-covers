import { expect, test, type Page } from '@playwright/test';
import { FIXTURE, guardConsole } from '../../support/seed';
import { liveRows, openApp } from './support';

// REQ-02 · Shell · «¿Quién eres?» → «Corregir nombres»: rename a misspelt member and delete a repeated one (with its
// «¿Borrar…?» step) without leaving the dialog. Members live in the demo store; the device's identity in
// `oneshoot.me.v1`.

test.beforeEach(({ browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio: la app no arranca');
});

interface MemberRow extends Record<string, unknown> {
  id: string;
  archived_at: string | null;
  name: string;
}

const MINA = '00000000-0000-4000-8001-000000000002';
const members = (page: Page) => liveRows<MemberRow>(page, 'members');
const identity = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('oneshoot.me.v1') ?? 'null') as unknown);

/** «Eres Hana»: in the side rail from lg, in the top bar's «Más opciones» menu on phones. */
async function openWho(page: Page) {
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await page.getByRole('button', { name: 'Eres Hana' }).click();
  } else {
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('menu', { name: 'Más opciones' }).getByRole('menuitem', { name: /^Eres Hana/ }).click();
  }
  await expect(page.getByRole('dialog', { name: '¿Quién eres?' })).toBeVisible();
}

async function openFix(page: Page) {
  await openApp(page);
  await openWho(page);
  await page.getByRole('dialog', { name: '¿Quién eres?' }).getByRole('button', { name: 'Corregir nombres' }).click();
  const fix = page.getByRole('dialog', { name: 'Corregir nombres' });
  await expect(fix).toBeVisible();
  return fix;
}

test('corregir un nombre mal escrito: no acepta uno repetido y guarda el nuevo', async ({ page }) => {
  const guard = guardConsole(page);
  const fix = await openFix(page);
  await fix.getByRole('button', { name: 'Editar a Mina' }).click();
  const name = fix.getByLabel('Nombre');

  await name.fill(' yuna ');
  await expect(fix.getByRole('alert')).toHaveText('Ya hay alguien con ese nombre en el grupo.');
  await expect(fix.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  await name.fill('   ');
  await expect(fix.getByRole('button', { name: 'Guardar' })).toBeDisabled();

  await name.fill('Minah');
  await expect(fix.getByRole('alert')).toHaveCount(0);
  await fix.getByRole('button', { name: 'Guardar' }).click();
  await expect(fix.getByRole('button', { name: 'Editar a Minah' })).toBeVisible();
  expect((await members(page)).find((m) => m.id === MINA)?.name).toBe('Minah');

  await fix.getByRole('button', { name: 'Listo' }).click();
  const who = page.getByRole('dialog', { name: '¿Quién eres?' });
  await expect(who.getByRole('radio', { name: 'Minah' })).toBeVisible();
  guard.check();
});

test('borrar un miembro repetido pide confirmación y conserva la identidad del móvil', async ({ page }) => {
  const guard = guardConsole(page);
  const fix = await openFix(page);
  await fix.getByRole('button', { name: 'Borrar a Aoi' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Borrar a Aoi?' });
  await expect(confirm).toContainText('Sus tomas, notas, votos y ausencias se conservan.');
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByRole('dialog', { name: 'Corregir nombres' })).toBeVisible();
  expect((await members(page)).length).toBe(6);

  await fix.getByRole('button', { name: 'Borrar a Aoi' }).click();
  await confirm.getByRole('button', { name: 'Borrar' }).click();
  await expect(page.getByText('Aoi ya no está en la lista')).toBeVisible();
  await expect(fix.getByRole('button', { name: 'Editar a Aoi' })).toHaveCount(0);
  expect((await members(page)).some((m) => m.name === 'Aoi')).toBe(false);
  expect(await identity(page)).toMatchObject({ memberId: FIXTURE.memberId });
  guard.check();
});

test('borrarse a uno mismo vuelve a preguntar «¿Quién eres?» como la primera vez', async ({ page }) => {
  const guard = guardConsole(page);
  const fix = await openFix(page);
  await fix.getByRole('button', { name: 'Borrar a Hana' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Borrar a Hana?' });
  await expect(confirm).toContainText('Eres tú en este móvil');
  await confirm.getByRole('button', { name: 'Borrar' }).click();
  await expect(fix.getByRole('button', { name: 'Editar a Hana' })).toHaveCount(0);
  expect(await identity(page)).toEqual({ memberId: null, dismissed: false });

  await fix.getByRole('button', { name: 'Listo' }).click();
  const who = page.getByRole('dialog', { name: '¿Quién eres?' });
  await expect(who.getByRole('radio', { checked: true })).toHaveCount(0);
  await who.getByRole('radio', { name: 'Rei' }).click();
  await expect(who).toBeHidden();
  expect(await identity(page)).toMatchObject({ memberId: expect.any(String) });
  guard.check();
});
