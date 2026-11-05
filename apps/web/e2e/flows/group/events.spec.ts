import { expect, test } from '@playwright/test';
import { fixClock, guardConsole, seedFixture } from '../../support/seed';
import { EVENT, WEBKIT_SKIP, live, seedRandom } from './helpers';

// REQ-02.3 · Events: create, edit, countdown (more than a week away, last week), repertoire, and the bag and the
// track the event makes for rehearsing.

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIP);
  await fixClock(page);
  await seedRandom(page);
  await seedFixture(page);
});

test('la lista separa próximos y pasados, con la cuenta atrás de cada uno', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto('/eventos');
  const next = page.getByRole('region', { name: 'Próximos' }).getByRole('listitem');
  await expect(next).toHaveCount(2);
  await expect(next.first()).toContainText('Ensayo general');
  await expect(next.first()).toContainText('Faltan 3 días');
  await expect(next.nth(1)).toContainText('Concurso de otoño');
  await expect(next.nth(1)).toContainText('Faltan 12 días');
  const past = page.getByRole('region', { name: 'Pasados' }).getByRole('listitem');
  await expect(past).toHaveCount(1);
  await expect(past.first()).toContainText('Showcase de verano');
  guard.check();
});

test('crear un evento', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto('/eventos');
  await page.getByRole('button', { name: 'Nuevo evento' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo evento' });
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill('Showcase de diciembre');
  await dialog.getByRole('textbox', { name: 'Día y hora' }).fill('2026-12-05T18:00');
  await dialog.getByRole('textbox', { name: 'Lugar (opcional)' }).fill('Sala Razzmatazz');
  await dialog.getByRole('button', { name: 'Crear evento' }).click();
  await expect(page.getByRole('heading', { name: 'Showcase de diciembre', level: 1 })).toBeVisible();
  await expect(page.getByText('Sala Razzmatazz')).toBeVisible();
  const created = (await live(page, 'events')).find((e) => e.name === 'Showcase de diciembre');
  expect(created).toMatchObject({ place: 'Sala Razzmatazz' });
  // 18:00 in Madrid (+01:00 in December) is 17:00 UTC.
  expect(created!.starts_at).toBe('2026-12-05T17:00:00.000Z');
  guard.check();
});

test('editar un evento: nombre, día y lugar', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/eventos/${EVENT(1)}`);
  await page.getByRole('button', { name: 'Editar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Editar evento' });
  await expect(dialog.getByRole('textbox', { name: 'Día y hora' })).toHaveValue('2026-11-01T18:30');
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill('Concurso de invierno');
  await dialog.getByRole('textbox', { name: 'Día y hora' }).fill('2026-11-08T12:00');
  await dialog.getByRole('textbox', { name: 'Lugar (opcional)' }).fill('Sala Bikini');
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('heading', { name: 'Concurso de invierno', level: 1 })).toBeVisible();
  expect((await live(page, 'events')).find((e) => e.id === EVENT(1))).toMatchObject({
    name: 'Concurso de invierno',
    place: 'Sala Bikini',
    starts_at: '2026-11-08T11:00:00.000Z',
  });
  guard.check();
});

test('cuenta atrás: más de una semana (ensayos) y la última semana', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/eventos/${EVENT(1)}`);
  await expect(page.getByText('Cuenta atrás', { exact: true })).toBeVisible();
  await expect(page.getByText('Faltan 4 ensayos')).toBeVisible();
  await expect(page.getByText('Hoy hay ensayo')).toBeVisible();
  await page.goto(`/eventos/${EVENT(2)}`);
  await expect(page.getByText('Último ensayo')).toBeVisible();
  guard.check();
});

test('repertorio: añadir canciones, reordenar y quitar', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/eventos/${EVENT(1)}`);
  const songs = page.getByRole('region', { name: 'Repertorio' }).getByRole('listitem');
  await expect(songs).toHaveCount(3);
  await page.getByRole('button', { name: 'Añadir canciones' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir al repertorio' });
  await dialog.getByRole('button', { name: /^Kill This Love/ }).click();
  await dialog.getByRole('button', { name: 'Añadir', exact: true }).click();
  await expect(songs).toHaveCount(4);
  await expect(songs.last()).toContainText('Kill This Love');
  await page.getByRole('button', { name: 'Bajar «Dynamite»' }).click();
  await expect(songs.first()).toContainText('TT');
  await expect(songs.nth(1)).toContainText('Dynamite');
  await page.getByRole('button', { name: 'Quitar Hype Boy del repertorio' }).click();
  await expect(songs).toHaveCount(3);
  const rows = (await live(page, 'event_songs'))
    .filter((s) => s.event_id === EVENT(1))
    .sort((a, b) => (a.position as number) - (b.position as number));
  expect(rows).toHaveLength(3);
  guard.check();
});

test('crear una bolsa de candidatas desde el evento', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/eventos/${EVENT(1)}`);
  await page.getByRole('button', { name: /^Crear bolsa de candidatas/ }).click();
  await expect(page).toHaveURL(/\/bolsas\//);
  await expect(page.getByRole('heading', { name: 'Candidatas · Concurso de otoño', level: 1 })).toBeVisible();
  const bag = (await live(page, 'bags')).find((b) => b.name === 'Candidatas · Concurso de otoño')!;
  expect(bag).toMatchObject({ kind: 'songs' });
  expect((await live(page, 'bag_items')).filter((i) => i.bag_id === bag.id)).toHaveLength(3);
  guard.check();
});

test('crear una pista con los estribillos del repertorio', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/eventos/${EVENT(1)}`);
  await page.getByRole('button', { name: /^Crear pista con los estribillos/ }).click();
  await expect(page).toHaveURL(/\/rpd\/pista\//);
  await expect(page.getByRole('textbox', { name: 'Nombre de la pista' })).toHaveValue(
    'Estribillos · Concurso de otoño',
  );
  const track = (await live(page, 'tracks')).find((t) => t.name === 'Estribillos · Concurso de otoño')!;
  expect((await live(page, 'track_items')).filter((i) => i.track_id === track.id)).toHaveLength(7);
  guard.check();
});

test('borrar un evento lo saca de la lista', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(`/eventos/${EVENT(2)}`);
  await page.getByRole('button', { name: 'Borrar el evento' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar', exact: true }).click();
  await expect(page).toHaveURL(/\/eventos$/);
  await expect(page.getByText('Ensayo general')).toHaveCount(0);
  expect((await live(page, 'events')).some((e) => e.id === EVENT(2))).toBe(false);
  guard.check();
});
