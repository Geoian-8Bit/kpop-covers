import { expect, test, type Page } from '@playwright/test';
import { FIXTURE, fixClock, seedFixture } from '../../support/seed';
import {
  guard as guardConsole,
  keepAndOpenTakes,
  openRecorder,
  openTakesTab,
  recordTake,
  storedDb,
} from './helpers';

// REQ-02 · The «Tomas» tab: list, filters, best take, download, share with the group (demo) and delete.

// REQ-02 · Playwright's WebKit build here has no Web Audio (`AudioNode` is undefined) and the app stops on load,
// before anything of this area can be reached: nothing here can run on it.
test.beforeEach(({ browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio (AudioNode): la app no arranca');
});

test.describe.configure({ timeout: 90_000 });

/** Dynamite (YouTube) has three seeded takes: Hana, Rei and Yuna. */
async function openSeededTakes(page: Page, overrides?: Parameters<typeof seedFixture>[1]) {
  await fixClock(page);
  await seedFixture(page, overrides);
  await page.goto(`/v/${FIXTURE.youtubeVideoId}`);
  await openTakesTab(page);
  await expect(page.getByRole('radiogroup', { name: 'Filtrar por persona' })).toBeVisible();
}

test('lista las tomas de la canción con su cuenta', async ({ page }) => {
  const guard = guardConsole(page);
  await openSeededTakes(page);
  await expect(page.getByRole('heading', { name: 'Tomas' })).toBeVisible();
  const takes = (await storedDb(page))['takes']!.filter((t) => t['video_id'] === FIXTURE.youtubeVideoId);
  expect(takes).toHaveLength(3);
  await expect(
    page.locator('#takes-title').locator('xpath=..').getByText('3', { exact: true }),
  ).toBeVisible();
  for (const name of ['Hana', 'Rei', 'Yuna']) {
    await expect(
      page.getByRole('radiogroup', { name: 'Filtrar por persona' }).getByRole('radio', { name }),
    ).toBeVisible();
  }
  guard.check();
});

test('filtra las tomas por persona y por clip, y quita los filtros', async ({ page }) => {
  const guard = guardConsole(page);
  await openSeededTakes(page);
  const persons = page.getByRole('radiogroup', { name: 'Filtrar por persona' });
  const stars = page.getByRole('button', { name: /mejor toma$/ });
  await expect(stars).toHaveCount(3);
  await persons.getByRole('radio', { name: 'Rei' }).click();
  await expect(persons.getByRole('radio', { name: 'Rei' })).toBeChecked();
  await expect(stars).toHaveCount(1);
  await persons.getByRole('radio', { name: 'Yuna' }).click();
  await expect(stars).toHaveCount(1);
  await persons.getByRole('radio', { name: 'Todos' }).click();
  await expect(stars).toHaveCount(3);
  // A clip filter that leaves nothing for the chosen person offers to clear the filters.
  const clips = page.getByRole('radiogroup', { name: 'Filtrar por clip' });
  if (await clips.isVisible()) {
    await persons.getByRole('radio', { name: 'Yuna' }).click();
    const options = clips.getByRole('radio');
    const n = await options.count();
    for (let i = 1; i < n; i++) {
      await options.nth(i).click();
      if (await page.getByText('Ninguna toma con estos filtros').isVisible()) break;
    }
    if (await page.getByText('Ninguna toma con estos filtros').isVisible()) {
      await page.getByRole('button', { name: 'Quitar filtros' }).click();
      await expect(stars).toHaveCount(3);
    }
  }
  guard.check();
});

test('marca y quita la mejor toma de una persona', async ({ page }) => {
  const guard = guardConsole(page);
  await openSeededTakes(page);
  const persons = page.getByRole('radiogroup', { name: 'Filtrar por persona' });
  await persons.getByRole('radio', { name: 'Rei' }).click();
  const mark = page.getByRole('button', { name: 'Marcar como mejor toma' }).first();
  await mark.click();
  await expect(page.getByRole('button', { name: 'Quitar de mejor toma' }).first()).toBeVisible();
  const reiTake = async () =>
    (await storedDb(page))['takes']!.find(
      (t) =>
        t['member_id'] === '00000000-0000-4000-8001-000000000005' && t['video_id'] === FIXTURE.youtubeVideoId,
    );
  await expect.poll(async () => (await reiTake())?.['is_best']).toBe(true);
  await page.getByRole('button', { name: 'Quitar de mejor toma' }).first().click();
  await expect(page.getByRole('button', { name: 'Marcar como mejor toma' }).first()).toBeVisible();
  await expect.poll(async () => (await reiTake())?.['is_best']).toBe(false);
  guard.check();
});

test('una toma de otro móvil avisa de que no se puede ver ni descargar', async ({ page }) => {
  const guard = guardConsole(page);
  await openSeededTakes(page, {
    overrides: (db) => {
      for (const t of db['takes']!) t['device_id'] = '00000000-0000-4000-8000-0000000000e9';
    },
  });
  await expect(
    page.getByRole('button', { name: 'No se puede ver: está en otro móvil' }).first(),
  ).toBeVisible();
  guard.check();
});

test('reacciones: una toma compartida muestra la barra y se puede reaccionar', async ({ page }) => {
  const guard = guardConsole(page);
  await openSeededTakes(page, {
    overrides: (db) => {
      const first = db['takes']!.find((t) => t['video_id'] === FIXTURE.youtubeVideoId)!;
      first['shared_path'] = 'demo/toma-01.webm';
      first['shared_size'] = 1_000_000;
    },
  });
  const bar = page.getByRole('group', { name: 'Reacciones' });
  await expect(bar).toBeVisible();
  const before = (await storedDb(page))['take_reactions']!.length;
  const buttons = bar.getByRole('button');
  const n = await buttons.count();
  expect(n).toBeGreaterThan(0);
  // Press the first reaction that this device's member (Hana) hasn't made yet.
  let pressed = false;
  for (let i = 0; i < n && !pressed; i++) {
    const b = buttons.nth(i);
    if ((await b.getAttribute('aria-pressed')) === 'false') {
      await b.click();
      await expect(b).toHaveAttribute('aria-pressed', 'true');
      pressed = true;
    }
  }
  expect(pressed).toBe(true);
  await expect.poll(async () => (await storedDb(page))['take_reactions']!.length).toBe(before + 1);
  guard.check();
});

test('descarga, comparte con el grupo y borra una toma grabada', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  await recordTake(page);
  await keepAndOpenTakes(page);

  // Download.
  const download = page.waitForEvent('download', { timeout: 15_000 });
  await page.getByRole('button', { name: 'Descargar la toma' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.(webm|mp4)$/);

  // Share with the group: the dialog warns, then (demo) uploads a reduced copy.
  await page.getByRole('button', { name: 'Compartir con el grupo' }).click();
  const share = page.getByRole('dialog', { name: 'Compartir con el grupo' });
  await expect(share).toBeVisible();
  await expect(share.getByText('Se sube una copia reducida a 720p')).toBeVisible();
  await share.getByRole('button', { name: 'Ahora no' }).click();
  await expect(share).toBeHidden();
  await page.getByRole('button', { name: 'Compartir con el grupo' }).click();
  await share.getByRole('button', { name: 'Compartir' }).click();
  // The demo has no cloud (REQ-03 adds a local one): the copy is reduced, the upload fails and the dialog says so
  // without touching the take. The successful upload is not covered here.
  await expect(share.getByText(/la nube no responde/)).toBeVisible({ timeout: 40_000 });
  await expect(share.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await share.getByRole('button', { name: 'Cerrar', exact: true }).last().click();
  await expect(share).toBeHidden();
  const mine = (await storedDb(page))['takes']!.find((t) => t['video_id'] === FIXTURE.uploadVideoId);
  expect(mine?.['shared_path'] ?? null).toBeNull();

  // Delete: the dialog says what happens; confirming archives it (the store keeps the row, hidden).
  await page.getByRole('button', { name: 'Borrar la toma' }).click();
  const del = page.getByRole('dialog', { name: '¿Borrar esta toma?' });
  await expect(del).toContainText('Se borra de este móvil');
  await del.getByRole('button', { name: 'Cancelar' }).click();
  await expect(del).toBeHidden();
  await page.getByRole('button', { name: 'Borrar la toma' }).click();
  await del.getByRole('button', { name: 'Borrar', exact: true }).click();
  await expect(page.getByText('Toma borrada')).toBeVisible();
  await expect(page.getByText('Aún no hay tomas')).toBeVisible();
  guard.check();
});
