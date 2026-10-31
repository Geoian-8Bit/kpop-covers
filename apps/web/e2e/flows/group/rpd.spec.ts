import { expect, test, type Page } from '@playwright/test';
import { fixClock, guardConsole, seedFixture } from '../../support/seed';
import { BAG, TRACK, WEBKIT_SKIP, live, seedRandom } from './helpers';

// REQ-02.3 · Random Play Dance: build a round (from a bag, by hand), play it (countdown, pause, guess mode), save it
// as a track, edit and reorder the track.

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIP);
  await seedRandom(page);
  await seedFixture(page);
});

const round = (page: Page) => page.getByRole('region', { name: 'Nueva ronda' });

test('montar una ronda desde una bolsa: cuántos clips y volver a mezclar', async ({ page }) => {
  const guard = guardConsole(page);
  await fixClock(page);
  await page.goto('/rpd');
  const r = round(page);
  await expect(r.getByRole('radio', { name: 'Una bolsa' })).toBeChecked();
  await expect(r.getByRole('radio', { name: /^Clips para calentar/ })).toBeChecked();
  await expect(r.getByRole('status')).toHaveText('8');
  const order = r.getByRole('listitem');
  const first = await order.first().innerText();
  await r.getByRole('button', { name: 'Un clip menos' }).click();
  await r.getByRole('button', { name: 'Un clip menos' }).click();
  await expect(r.getByRole('status')).toHaveText('6');
  await expect(r.getByText('6 clips')).toBeVisible();
  await r.getByRole('button', { name: 'Un clip más' }).click();
  await expect(r.getByRole('status')).toHaveText('7');
  // Re-shuffling keeps the same clips but (with this fixed seed) a new order.
  await r.getByRole('button', { name: 'Volver a mezclar' }).click();
  await expect(order.first()).not.toHaveText(first);
  await expect(r.getByRole('button', { name: 'Empezar' })).toBeEnabled();
  guard.check();
});

test('montar una ronda a mano eligiendo clips', async ({ page }) => {
  const guard = guardConsole(page);
  await fixClock(page);
  await page.goto('/rpd');
  const r = round(page);
  await r.getByRole('radio', { name: 'A mano' }).click();
  await r.getByRole('button', { name: /^Intro 0:44–0:55/ }).click();
  await r.getByRole('button', { name: /^Cambio 1:54–2:04/ }).click();
  await expect(r.getByText('2 clips')).toBeVisible();
  await expect(r.getByRole('button', { name: 'Empezar' })).toBeEnabled();
  // The song picker is the third way in.
  await r.getByRole('radio', { name: 'Canciones' }).click();
  await expect(r.getByRole('textbox', { name: 'Buscar' })).toBeVisible();
  guard.check();
});

test('jugar con cuenta previa y pausa: 3-2-1, pausar y seguir, salir', async ({ page }) => {
  const guard = guardConsole(page);
  await fixClock(page, 'install');
  await page.goto('/rpd');
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  const play = page.getByRole('dialog', { name: 'Random Play Dance' });
  await expect(play.getByRole('heading', { name: '¿Preparados?' })).toBeVisible();
  await expect(play.getByText('Clip 1 de 8')).toBeVisible();
  await play.getByRole('button', { name: 'Empezar', exact: true }).click();
  // Lead-in of the first clip: no pause, just the 3-2-1 card over the picture.
  const count = play.getByText(/^[123]$/);
  await expect(count).toHaveText('3');
  await page.clock.runFor(1000);
  await expect(count).toHaveText('2');
  await page.clock.runFor(1000);
  await expect(count).toHaveText('1');
  // The control bar is live from the first clip; pausing freezes the countdown.
  await play.getByRole('button', { name: 'Pausa', exact: true }).click();
  await page.clock.runFor(5000);
  await expect(count).toHaveText('1');
  await expect(play.getByRole('button', { name: 'Seguir', exact: true }).last()).toBeVisible();
  await play.getByRole('button', { name: 'Seguir', exact: true }).last().click();
  await page.clock.runFor(1500);
  await expect(count).toHaveCount(0);
  await play.getByRole('button', { name: 'Salir', exact: true }).first().click();
  await page
    .getByRole('dialog', { name: '¿Salir de la ronda?' })
    .getByRole('button', { name: 'Salir', exact: true })
    .click();
  await expect(page).toHaveURL(/\/rpd$/);
  guard.check();
});

test('modo adivinar: la pista del concurso esconde el título hasta después', async ({ page }) => {
  const guard = guardConsole(page);
  await fixClock(page, 'install');
  await page.goto('/rpd');
  await page.getByRole('button', { name: 'Reproducir Ronda del concurso' }).click();
  await expect(page).toHaveURL(/\/rpd\/jugar/);
  const play = page.getByRole('dialog', { name: 'Random Play Dance' });
  await expect(play.getByRole('heading', { name: '¿Preparados?' })).toBeVisible();
  await expect(
    play.getByText('6 clips · Pausa 3,5 s · modo adivinar · sin cuenta atrás · velocidad normal'),
  ).toBeVisible();
  await play.getByRole('button', { name: 'Empezar', exact: true }).click();
  // «Título después»: while the clip plays the title is hidden behind a question mark.
  await expect(play.getByRole('heading', { name: '¿Qué canción es?' })).toBeVisible();
  guard.check();
});

test('guardar la ronda como pista', async ({ page }) => {
  const guard = guardConsole(page);
  await fixClock(page);
  await page.goto('/rpd');
  const tracks = (await live(page, 'tracks')).length;
  await page.getByRole('button', { name: 'Guardar como pista' }).click();
  const dialog = page.getByRole('dialog', { name: 'Guardar como pista' });
  await dialog.getByRole('textbox', { name: 'Nombre de la pista' }).fill('Pista de prueba');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('button', { name: 'Reproducir Pista de prueba' })).toBeVisible();
  expect((await live(page, 'tracks')).length).toBe(tracks + 1);
  const saved = (await live(page, 'tracks')).find((t) => t.name === 'Pista de prueba')!;
  expect((await live(page, 'track_items')).filter((i) => i.track_id === saved.id)).toHaveLength(8);
  guard.check();
});

test('editar una pista: nombre, opciones, reordenar y quitar un clip', async ({ page }) => {
  const guard = guardConsole(page);
  await fixClock(page);
  await page.goto(`/rpd/pista/${TRACK.contest}`);
  const name = page.getByRole('textbox', { name: 'Nombre de la pista' });
  await name.fill('Ronda final');
  await name.blur();
  await page.getByRole('radio', { name: '1 segundo' }).click();
  await page.getByRole('radio', { name: 'Antes de sonar' }).click();
  await page.getByRole('switch', { name: 'Cuenta atrás antes de cada clip' }).click();
  const clips = page.getByRole('region', { name: 'Clips' }).getByRole('listitem');
  await expect(clips.first()).toContainText('DDU-DU DDU-DU');
  await page.getByRole('button', { name: 'Bajar «DDU-DU DDU-DU · Estribillo»' }).click();
  await expect(clips.first()).toContainText('Boy With Luv');
  await expect(clips.nth(1)).toContainText('DDU-DU DDU-DU');
  await page.getByRole('button', { name: 'Quitar Butter · Paso 1 3 de la pista' }).click();
  await expect(clips).toHaveCount(5);
  await expect
    .poll(async () => (await live(page, 'tracks')).find((t) => t.id === TRACK.contest))
    .toMatchObject({
      name: 'Ronda final',
      pause_seconds: 1,
      title_mode: 'before',
      countdown: true,
    });
  const items = (await live(page, 'track_items'))
    .filter((i) => i.track_id === TRACK.contest)
    .sort((a, b) => (a.position as number) - (b.position as number));
  expect(items).toHaveLength(5);
  // Reload: what was saved is what comes back.
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Nombre de la pista' })).toHaveValue('Ronda final');
  await expect(page.getByRole('region', { name: 'Clips' }).getByRole('listitem').first()).toContainText(
    'Boy With Luv',
  );
  guard.check();
});

test('una ronda de la bolsa de clips se juega desde la bolsa', async ({ page }) => {
  const guard = guardConsole(page);
  await fixClock(page);
  await page.goto('/rpd');
  await expect(page.getByText(`Bolsa «Clips para calentar»`)).toBeVisible();
  expect(BAG.clips).toBeTruthy();
  await page.getByRole('link', { name: /^Ronda calentamiento/ }).click();
  await expect(page).toHaveURL(new RegExp(`/rpd/pista/${TRACK.warmup}`));
  await page.getByRole('button', { name: 'Reproducir', exact: true }).click();
  await expect(page).toHaveURL(/\/rpd\/jugar/);
  await expect(page.getByRole('heading', { name: '¿Preparados?' })).toBeVisible();
  guard.check();
});
