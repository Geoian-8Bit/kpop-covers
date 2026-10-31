import { expect, test } from '@playwright/test';
import { fixClock, guardConsole, seedFixture } from '../../support/seed';
import { BAG, WEBKIT_SKIP, live, seedRandom, table } from './helpers';

// REQ-02.3 · Bags: create, add items, draw one / several, remove and put back, refill, history, settings.

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIP);
  await fixClock(page);
  await seedRandom(page);
  await seedFixture(page);
});

test('crear una bolsa de clips desde la lista', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto('/bolsas');
  await page.getByRole('button', { name: 'Nueva bolsa' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva bolsa' });
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill('Bolsa de prueba');
  await dialog.getByRole('radio', { name: 'Clips' }).check();
  await dialog.getByRole('radio', { name: 'Se queda' }).check();
  await dialog.getByRole('button', { name: 'Crear bolsa' }).click();
  await expect(page.getByRole('heading', { name: 'Bolsa de prueba', level: 1 })).toBeVisible();
  const created = (await live(page, 'bags')).find((b) => b.name === 'Bolsa de prueba');
  expect(created).toMatchObject({ kind: 'clips', draw_mode: 'keep' });
  expect(page.url()).toContain(`/bolsas/${created!.id as string}`);
  guard.check();
});

test('añadir canciones de la biblioteca a la bolsa', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/bolsas/${BAG.songs}`);
  const before = (await live(page, 'bag_items')).filter((i) => i.bag_id === BAG.songs).length;
  await page.getByRole('button', { name: 'Añadir canciones' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir canciones' });
  await dialog.getByRole('button', { name: /^Kill This Love/ }).click();
  await dialog.getByRole('button', { name: /^Growl/ }).click();
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'En la bolsa 9' })).toBeVisible();
  const after = (await live(page, 'bag_items')).filter((i) => i.bag_id === BAG.songs).length;
  expect(after).toBe(before + 2);
  guard.check();
});

test('sacar una canción: sale el premio, queda fuera y entra en el historial', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/bolsas/${BAG.songs}`);
  const draws = (await table(page, 'bag_draws')).length;
  await page.getByRole('button', { name: 'Sacar', exact: true }).click();
  await expect(page.getByText('¡Premio!')).toBeVisible();
  const rows = await table(page, 'bag_draws');
  expect(rows.length).toBe(draws + 1);
  const drawn = rows.find((r) => !(r.id as string).startsWith('00000000-0000-4000-8009'))!;
  await expect(page.getByText(`Ha salido: ${drawn.label as string}`)).toBeVisible();
  expect(drawn).toMatchObject({ bag_id: BAG.songs, removed: true });
  await expect(page.getByRole('tab', { name: 'En la bolsa 6' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Fuera 2' })).toBeVisible();
  guard.check();
});

test('sacar varias a la vez abre una ronda de Random Play Dance', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/bolsas/${BAG.songs}`);
  await page.getByRole('button', { name: 'Sacar uno más a la vez' }).click();
  await expect(page.getByRole('button', { name: /Sacar 4 a la vez/ })).toBeVisible();
  await page.getByRole('button', { name: 'Sacar uno menos a la vez' }).click();
  await page.getByRole('button', { name: /^Sacar 3 a la vez/ }).click();
  await expect(page.getByText('Ha salido:')).toHaveCount(1);
  expect((await table(page, 'bag_draws')).length).toBe(12 + 3);
  await page.getByRole('button', { name: /^Jugar la ronda/ }).click();
  await expect(page).toHaveURL(/\/rpd\/jugar/);
  guard.check();
});

test('quitar un elemento y devolver lo que ya salió', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/bolsas/${BAG.songs}`);
  await page.getByRole('button', { name: 'Borrar Dynamite de la bolsa' }).click();
  await page.getByRole('button', { name: 'Confirmar: borrar Dynamite de la bolsa' }).click();
  await expect(page.getByRole('tab', { name: 'En la bolsa 6' })).toBeVisible();
  await expect(page.getByRole('tabpanel').getByRole('listitem').filter({ hasText: 'Dynamite' })).toHaveCount(
    0,
  );
  await page.getByRole('tab', { name: 'Fuera 1' }).click();
  await page.getByRole('button', { name: 'Devolver' }).click();
  await expect(page.getByRole('tab', { name: 'En la bolsa 7' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Fuera/ })).toHaveCount(0);
  guard.check();
});

test('sacar a mano un elemento concreto', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/bolsas/${BAG.songs}`);
  const row = page.getByRole('tabpanel').getByRole('listitem').filter({ hasText: 'Butter' });
  await row.getByRole('button', { name: 'Sacar a mano' }).click();
  await expect(page.getByRole('tab', { name: 'Fuera 2' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'En la bolsa 6' })).toBeVisible();
  guard.check();
});

test('rellenar devuelve todo lo que salió', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/bolsas/${BAG.songs}`);
  await page.getByRole('tab', { name: 'Fuera 1' }).click();
  await page.getByRole('button', { name: 'Rellenar' }).click();
  await expect(page.getByRole('tab', { name: 'En la bolsa 8' })).toBeVisible();
  // «Fuera» disappears once everything is back in.
  await expect(page.getByRole('tab', { name: /^Fuera/ })).toHaveCount(0);
  guard.check();
});

test('el historial lista quién sacó cada cosa y cuándo', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/bolsas/${BAG.songs}`);
  await page.getByRole('tab', { name: 'Historial' }).click();
  const items = page.getByRole('tabpanel', { name: 'Historial' }).getByRole('listitem');
  await expect(items).toHaveCount(4);
  await expect(items.first()).toContainText('Dynamite');
  await expect(items.first()).toContainText('lo sacó Sora');
  await expect(items.nth(2)).toContainText('(quitada)');
  guard.check();
});

test('ajustes de la bolsa: renombrar y cambiar «Al sacar»', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/bolsas/${BAG.songs}`);
  await page.getByRole('button', { name: 'Ajustes de la bolsa' }).click();
  const dialog = page.getByRole('dialog', { name: 'Ajustes de la bolsa' });
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill('Canciones de otoño');
  await dialog.getByRole('radio', { name: 'Se queda' }).check();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Canciones de otoño', level: 1 })).toBeVisible();
  const bag = (await live(page, 'bags')).find((b) => b.id === BAG.songs);
  expect(bag).toMatchObject({ name: 'Canciones de otoño', draw_mode: 'keep' });
  guard.check();
});

test('borrar una bolsa la archiva y desaparece de la lista', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/bolsas/${BAG.people}`);
  await page.getByRole('button', { name: 'Borrar la bolsa' }).click();
  await page
    .getByRole('dialog', { name: '¿Borrar la bolsa?' })
    .getByRole('button', { name: 'Borrar' })
    .click();
  await expect(page).toHaveURL(/\/bolsas$/);
  await expect(page.getByText('Quién empieza')).toHaveCount(0);
  expect((await live(page, 'bags')).some((b) => b.id === BAG.people)).toBe(false);
  guard.check();
});
