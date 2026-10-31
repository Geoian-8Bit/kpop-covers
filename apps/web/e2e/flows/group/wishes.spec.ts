import { expect, test, type Page } from '@playwright/test';
import { fixClock, guardConsole, seedFixture } from '../../support/seed';
import { FIXTURE } from '../../support/seed';
import { POLL, WEBKIT_SKIP, live, seedRandom, table } from './helpers';

// REQ-02.3 · «Próxima cover»: propose a song, «Me apunto», create polls of each type, vote, close, tie-break
// (draw and second round) and the winner reveal.

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIP);
  await fixClock(page);
  await seedRandom(page);
  await seedFixture(page);
});

const pollPage = (id: number) => `/deseos/votacion/${POLL(id)}`;

/** The YouTube lookups are a server function the dev server does not have: answer them like the server would. */
async function mockYouTubeMeta(page: Page) {
  await page.route('**/api/youtube-meta*', (route) =>
    route.fulfill({ json: { title: 'Love Dive', author: 'IVE', width: 1280, height: 720 } }),
  );
}

test('proponer una canción pegando un enlace de YouTube', async ({ page }) => {
  const guard = guardConsole(page);
  await mockYouTubeMeta(page);
  await page.goto('/deseos');
  const before = (await live(page, 'wishes')).length;
  await page.getByRole('button', { name: /^Busca una canción o pega un enlace/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Proponer canción' });
  await dialog
    .getByRole('searchbox', { name: 'Buscar o pegar enlace' })
    .fill('https://www.youtube.com/watch?v=Ds-Q1sthgMw');
  await expect(dialog.getByRole('button', { name: 'Proponer', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Proponer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Love Dive', level: 3 })).toBeVisible();
  expect((await live(page, 'wishes')).length).toBe(before + 1);
  expect((await live(page, 'wishes')).find((w) => w.title === 'Love Dive')).toMatchObject({
    youtube_id: 'Ds-Q1sthgMw',
    proposed_by_member_id: FIXTURE.memberId,
  });
  guard.check();
});

test('«Me apunto» suma y quita el interés de quien eres', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto('/deseos');
  const interestBefore = await mineInterest(page);
  const card = page.getByRole('article', { name: 'Savage' });
  const button = card.getByRole('button', { name: /^Me apunto/ });
  await expect(button).toHaveAccessibleName('Me apunto 3');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  await expect(button).toHaveAccessibleName('Me apunto 4');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await mineInterest(page)).toBe(interestBefore + 1);
  await button.click();
  await expect(button).toHaveAccessibleName('Me apunto 3');
  guard.check();
});

test('elegir deseos de la lista para crear una votación', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto('/deseos');
  await page.getByRole('button', { name: 'Elegir para votar' }).click();
  const create = page
    .getByRole('region', { name: 'Elegir para votar' })
    .getByRole('button', { name: 'Crear votación' });
  await expect(create).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Elegir «Savage» para la votación' }).check();
  await page.getByRole('checkbox', { name: 'Elegir «HIP» para la votación' }).check();
  await expect(create).toBeEnabled();
  await create.click();
  const dialog = page.getByRole('dialog', { name: 'Crear votación' });
  await expect(dialog.getByRole('checkbox', { name: /^Savage/ })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /^HIP/ })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: /^WANNABE/ })).not.toBeChecked();
  guard.check();
});

for (const [label, type, hint] of [
  ['Un voto', 'single', 'Cada persona elige una.'],
  ['Varios votos', 'multi', 'Cada persona marca todas las que le valen.'],
  ['Ranking', 'ranking', 'Cada persona las ordena'],
] as const) {
  test(`crear una votación de tipo «${label}»`, async ({ page }) => {
    const guard = guardConsole(page);
    await page.goto('/deseos');
    await page.getByRole('tab', { name: /^Votaciones/ }).click();
    await page.getByRole('button', { name: 'Nueva votación' }).click();
    const dialog = page.getByRole('dialog', { name: 'Crear votación' });
    await dialog.getByRole('textbox', { name: 'Título' }).fill(`Votación ${type}`);
    await dialog.getByRole('checkbox', { name: /^Savage/ }).check();
    await dialog.getByRole('checkbox', { name: /^HIP/ }).check();
    await dialog.getByRole('checkbox', { name: /^FAKE LOVE/ }).check();
    await dialog.getByRole('radio', { name: label }).click();
    await dialog.getByRole('button', { name: 'Crear votación' }).click();
    await expect(page.getByRole('heading', { name: `Votación ${type}`, level: 1 })).toBeVisible();
    await expect(page.getByText(hint)).toBeVisible();
    const poll = (await live(page, 'polls')).find((p) => p.title === `Votación ${type}`)!;
    expect(poll).toMatchObject({ vote_type: type, closed_at: null });
    expect((await live(page, 'poll_options')).filter((o) => o.poll_id === poll.id)).toHaveLength(3);
    guard.check();
  });
}

test('votar: un voto, varios y ranking, y retirar el voto', async ({ page }) => {
  const guard = guardConsole(page);
  // Un voto: change from FAKE LOVE to HIP.
  await page.goto(pollPage(1));
  await page.getByRole('radio', { name: /^HIP/ }).check();
  await page.getByRole('button', { name: 'Cambiar voto' }).click();
  await expect(page.getByText('Voto guardado. Puedes cambiarlo hasta el cierre.')).toBeVisible();
  const mine = (id: number) =>
    live(page, 'poll_votes').then((v) =>
      v.filter((x) => x.poll_id === POLL(id) && x.member_id === FIXTURE.memberId),
    );
  expect(await mine(1)).toHaveLength(1);
  await expect(
    page.getByRole('region', { name: 'Resultados' }).getByRole('listitem').filter({ hasText: 'HIP' }),
  ).toContainText('1 voto');
  // Varios votos: add WANNABE.
  await page.goto(pollPage(2));
  await page.getByRole('checkbox', { name: /^WANNABE/ }).check();
  await page.getByRole('button', { name: 'Cambiar voto' }).click();
  await expect.poll(async () => (await mine(2)).length).toBe(3);
  // Ranking: move the second one up.
  await page.goto(pollPage(3));
  await page.getByRole('button', { name: 'Subir «Red Flavor»' }).click();
  await page.getByRole('button', { name: 'Cambiar voto' }).click();
  await expect.poll(async () => (await mine(3)).find((v) => v.rank === 1)?.option_id).toBeTruthy();
  // Withdraw the vote.
  await page.getByRole('button', { name: 'Retirar mi voto' }).click();
  await expect.poll(async () => (await mine(3)).length).toBe(0);
  guard.check();
});

test('cerrar una votación con ganadora: revelado y acciones sobre la ganadora', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(pollPage(1));
  await page.getByRole('button', { name: 'Cerrar votación' }).click();
  await page
    .getByRole('dialog', { name: '¿Cerrar la votación?' })
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click();
  await expect(page.getByRole('status', { name: 'Ganadora: FAKE LOVE, de BTS' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ver otra vez' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cerrar votación' })).toHaveCount(0);
  const poll = (await live(page, 'polls')).find((p) => p.id === POLL(1))!;
  expect(poll.closed_at).toBeTruthy();
  expect(poll.winner_wish_id).toBe('00000000-0000-4000-800c-000000000001');
  guard.check();
});

test('empate: sorteo entre las empatadas', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(pollPage(2));
  await page.getByRole('button', { name: 'Cerrar votación' }).click();
  await page
    .getByRole('dialog', { name: '¿Cerrar la votación?' })
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click();
  const tie = page.getByRole('dialog', { name: 'Hay empate' });
  await expect(tie.getByText('Empate entre «What is Love?» y «HIP» y «WANNABE»')).toBeVisible();
  await tie.getByRole('button', { name: 'Sorteo entre empatadas' }).click();
  await expect(tie.getByText('Sorteando entre las empatadas…')).toBeVisible();
  await expect(page.getByRole('status', { name: /^Ganadora: / })).toBeVisible({ timeout: 15_000 });
  const poll = (await live(page, 'polls')).find((p) => p.id === POLL(2))!;
  expect(poll.closed_at).toBeTruthy();
  expect(['What is Love?', 'HIP', 'WANNABE']).toContain(
    (await live(page, 'wishes')).find((w) => w.id === poll.winner_wish_id)?.title,
  );
  guard.check();
});

test('empate: segunda vuelta entre las empatadas', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto(pollPage(2));
  await page.getByRole('button', { name: 'Cerrar votación' }).click();
  await page
    .getByRole('dialog', { name: '¿Cerrar la votación?' })
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Hay empate' })
    .getByRole('button', { name: 'Segunda vuelta' })
    .click();
  const second = page.getByRole('dialog', { name: 'Segunda vuelta' });
  await expect(second.getByRole('textbox', { name: 'Título' })).toHaveValue(
    'Segunda vuelta · Próximas covers',
  );
  await second.getByRole('radio', { name: 'Un voto' }).click();
  await second.getByRole('button', { name: 'Crear votación' }).click();
  await expect(
    page.getByRole('heading', { name: 'Segunda vuelta · Próximas covers', level: 1 }),
  ).toBeVisible();
  const child = (await live(page, 'polls')).find((p) => p.parent_poll_id === POLL(2))!;
  expect(child).toBeTruthy();
  expect((await live(page, 'poll_options')).filter((o) => o.poll_id === child.id)).toHaveLength(3);
  // The first round stays closed, with no winner, pointing at its second round.
  expect((await live(page, 'polls')).find((p) => p.id === POLL(2))!.closed_at).toBeTruthy();
  await page.goto(pollPage(2));
  await expect(page.getByRole('link', { name: /^Hubo empate: segunda vuelta/ })).toBeVisible();
  guard.check();
});

test('votaciones cerradas: ganadora, empate con segunda vuelta y ranking', async ({ page }) => {
  const guard = guardConsole(page);
  await page.goto('/deseos');
  await page.getByRole('tab', { name: /^Votaciones/ }).click();
  const closed = page.getByRole('region', { name: 'Cerradas' });
  await expect(closed.getByRole('listitem')).toHaveCount(4);
  await expect(closed).toContainText('Ganadora: WANNABE');
  await closed.getByRole('link', { name: /^Cover de septiembre/ }).click();
  await expect(page.getByRole('status', { name: 'Ganadora: Red Flavor, de Red Velvet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retirar mi voto' })).toHaveCount(0);
  expect((await table(page, 'polls')).length).toBe(7);
  guard.check();
});

async function mineInterest(page: Page) {
  return (await live(page, 'wish_interest')).filter((i) => i.member_id === FIXTURE.memberId).length;
}
