import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { BAG, EVENT, POLL, TRACK, WEBKIT_SKIP } from '../flows/group/helpers';
import { FIXED_NOW, FIXTURE, fixClock, guardConsole, seedFixture, type DemoFixture } from '../support/seed';
import { WIDTHS, atWidths, motionFrames, snap } from '../support/visual';

// REQ-02 · Visual references of the group area: bags, Random Play Dance, «Próxima cover» (wishes and polls), events
// and the formation editor (captures only), plus the animation frames of the winner reveal, the draw drum, the round
// countdown, the result bars and the event lanterns. Everything runs on the installed fake clock: JS animations only
// move when the test advances it, so every frame is the same on every run.

test.beforeEach(async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIP);
  await fixClock(page, 'install');
  // Playwright's installed clock keeps ticking by itself; pausing it makes only `runFor` move time, so every frame is exact.
  await page.clock.pauseAt(new Date(FIXED_NOW.getTime() + 1000));
  await stubThumbnails(page);
  await stubRandom(page);
});

/** YouTube thumbnails come from the network: every one is answered with the same flat picture. */
async function stubThumbnails(page: Page) {
  const png = new PNG({ width: 160, height: 90 });
  for (let i = 0; i < png.data.length; i += 4) png.data.set([58, 58, 74, 255], i);
  const body = PNG.sync.write(png);
  await page.route(/ytimg\.com|ggpht\.com/, (route) => route.fulfill({ contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body }));
}

/**
 * Reproducible draws and shuffles (mulberry32). Also turns off the Web Animations API, so motion animates from
 * requestAnimationFrame and performance.now: those follow the fake clock, while WAAPI animations run on the
 * browser's real timeline and would make every frame depend on how long the screenshot took.
 */
async function stubRandom(page: Page) {
  await page.addInitScript(() => {
    delete (Element.prototype as { animate?: unknown }).animate;
    let a = 20261020;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
}

/** Lets the page render and every entrance animation finish: the fake clock moves 250 ms at a time. */
async function settle(page: Page, ms = 2000) {
  await page.evaluate(() => document.fonts.ready);
  for (let t = 0; t < ms; t += 250) {
    await page.clock.runFor(250);
    await page.waitForTimeout(25);
  }
}

// A closed poll replays its winner reveal (2.6 s) every time it opens, and the formation editor draws the timeline
// asynchronously: those get a longer settle so the capture is of the resting state.
async function open(page: Page, url: string) {
  await page.goto(url);
  await settle(page, /votacion|formaciones/.test(url) ? 4500 : 2000);
}

const iframes = (page: Page) => [page.locator('iframe')];

type Step = (page: Page) => Promise<void>;

/** A static screen at the three widths. `prep` leaves the page in the state to capture. */
function screen(name: string, url: string, prep?: Step, seed?: Parameters<typeof seedFixture>[1]) {
  test(name, async ({ page }) => {
    const guard = guardConsole(page);
    await seedFixture(page, seed);
    await atWidths(page, async (width) => {
      await open(page, url);
      if (prep) {
        await prep(page);
        await settle(page, 1000);
      }
      await snap(page, `${name}-${width}`, { mask: iframes(page) });
    });
    guard.check();
  });
}

/** A screen whose state changes the stored data: one test (one fresh store) per width. */
function screenEach(name: string, url: string, prep: Step) {
  for (const width of WIDTHS) {
    test(`${name} ${width}`, async ({ page }) => {
      const guard = guardConsole(page);
      await seedFixture(page);
      await page.setViewportSize({ width, height: page.viewportSize()?.height ?? 844 });
      await open(page, url);
      await prep(page);
      await settle(page, 1000);
      await snap(page, `${name}-${width}`, { mask: iframes(page) });
      guard.check();
    });
  }
}

const click =
  (name: string | RegExp, role: 'button' | 'tab' | 'radio' | 'link' = 'button'): Step =>
  async (page) => {
    await page.getByRole(role, { name }).first().click();
  };
const then =
  (...steps: Step[]): Step =>
  async (page) => {
    for (const step of steps) {
      await step(page);
      await settle(page, 500);
    }
  };
const empty = (...tables: string[]) => ({
  overrides: (db: DemoFixture) => {
    for (const t of tables) db[t] = [];
  },
});
const confirmClose: Step = async (page) => {
  await page
    .getByRole('dialog', { name: '¿Cerrar la votación?' })
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click();
};

// ───────────── Bags ─────────────
screen('bolsas-lista', '/bolsas');
screen('bolsas-vacio', '/bolsas', undefined, empty('bags', 'bag_items', 'bag_draws'));
screen('bolsas-crear', '/bolsas', click('Nueva bolsa'));
screen('bolsa-canciones', `/bolsas/${BAG.songs}`);
screen('bolsa-clips', `/bolsas/${BAG.clips}`);
screen('bolsa-personas', `/bolsas/${BAG.people}`);
screen('bolsa-fuera', `/bolsas/${BAG.songs}`, click(/^Fuera/, 'tab'));
screen('bolsa-historial', `/bolsas/${BAG.songs}`, click('Historial', 'tab'));
screen('bolsa-ajustes', `/bolsas/${BAG.songs}`, click('Ajustes de la bolsa'));
screen('bolsa-anadir', `/bolsas/${BAG.songs}`, click('Añadir canciones'));
screen('bolsa-borrar', `/bolsas/${BAG.songs}`, click('Borrar la bolsa'));
screen('bolsa-quitar-confirmar', `/bolsas/${BAG.songs}`, click('Borrar Dynamite de la bolsa'));
screen('bolsa-vacia', `/bolsas/${BAG.songs}`, undefined, {
  overrides: (db) => {
    db.bag_items = db.bag_items!.filter((i) => i.bag_id !== BAG.songs);
    db.bag_draws = db.bag_draws!.filter((d) => d.bag_id !== BAG.songs);
  },
});
screenEach(
  'bolsa-premio',
  `/bolsas/${BAG.songs}`,
  then(click('Sacar'), (p) => settle(p, 2500)),
);
screenEach(
  'bolsa-varias',
  `/bolsas/${BAG.songs}`,
  then(click('Sacar 3 a la vez, para una ronda de Random Play Dance'), (p) => settle(p, 3000)),
);

// ───────────── Random Play Dance ─────────────
screen('rpd-montaje', '/rpd');
screen('rpd-vacio', '/rpd', undefined, empty('tracks', 'track_items', 'bags', 'bag_items'));
screen('rpd-a-mano', '/rpd', click('A mano', 'radio'));
screen('rpd-canciones', '/rpd', click('Canciones', 'radio'));
screen('rpd-guardar', '/rpd', click('Guardar como pista'));
screen('rpd-orden-completo', '/rpd', click(/^Ver el orden completo/));
screen('pista-adivinar', `/rpd/pista/${TRACK.contest}`);
screen('pista-calentamiento', `/rpd/pista/${TRACK.warmup}`);
screen('rpd-jugar-preparados', '/rpd', click('Empezar'));
screen('rpd-jugar-adivinar', '/rpd', click('Reproducir Ronda del concurso'));
screen(
  'rpd-jugar-salir',
  '/rpd',
  then(click('Empezar'), click('Empezar'), async (p) => {
    await p
      .getByRole('dialog', { name: 'Random Play Dance' })
      .getByRole('button', { name: 'Salir', exact: true })
      .first()
      .click();
  }),
);

test('rpd-jugar-giro', async ({ page }) => {
  const guard = guardConsole(page);
  await seedFixture(page);
  // The round on the phone, turned sideways (390x844 -> 844x390): the full-screen layout the group uses.
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/rpd');
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await settle(page, 1000);
  await snap(page, 'rpd-jugar-giro-preparados-390x844', { mask: iframes(page) });
  await page.setViewportSize({ width: 844, height: 390 });
  await settle(page, 1000);
  await snap(page, 'rpd-jugar-giro-preparados-844x390', { mask: iframes(page) });
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page, 600);
  await page
    .getByRole('dialog', { name: 'Random Play Dance' })
    .getByRole('button', { name: 'Empezar', exact: true })
    .click();
  await settle(page, 500);
  await snap(page, 'rpd-jugar-giro-cuenta-390x844');
  await page.setViewportSize({ width: 844, height: 390 });
  await settle(page, 500);
  await snap(page, 'rpd-jugar-giro-cuenta-844x390');
  guard.check();
});

// ───────────── Wishes and polls ─────────────
const poll = (n: number) => `/deseos/votacion/${POLL(n)}`;
screen('deseos-lista', '/deseos');
screen(
  'deseos-vacio',
  '/deseos',
  undefined,
  empty('wishes', 'wish_interest', 'polls', 'poll_options', 'poll_votes'),
);
screen('deseos-proponer', '/deseos', click(/^Busca una canción o pega un enlace/));
screen(
  'deseos-elegir',
  '/deseos',
  then(click('Elegir para votar'), async (p) => {
    await p.getByRole('checkbox', { name: 'Elegir «Savage» para la votación' }).check();
    await p.getByRole('checkbox', { name: 'Elegir «HIP» para la votación' }).check();
  }),
);
screen('deseos-votaciones', '/deseos', click(/^Votaciones/, 'tab'));
screen(
  'deseos-votaciones-vacio',
  '/deseos',
  click(/^Votaciones/, 'tab'),
  empty('polls', 'poll_options', 'poll_votes'),
);
screen('deseos-crear-votacion', '/deseos', then(click(/^Votaciones/, 'tab'), click('Nueva votación')));
screen('votacion-abierta-un-voto', poll(1));
screen('votacion-abierta-varios', poll(2));
screen('votacion-abierta-ranking', poll(3));
screen('votacion-cerrada-ganadora', poll(4));
screen('votacion-cerrada-ranking', poll(5));
screen('votacion-cerrada-empate', poll(6));
screen('votacion-segunda-vuelta', poll(7));
screen('votacion-menu', poll(4), click('Más acciones de la votación'));
screenEach('votacion-sin-voto', poll(1), click('Retirar mi voto'));
screenEach('votacion-cerrar', poll(1), click('Cerrar votación'));
screenEach('votacion-empate', poll(2), then(click('Cerrar votación'), confirmClose));
screenEach(
  'votacion-segunda-vuelta-form',
  poll(2),
  then(click('Cerrar votación'), confirmClose, async (p) => {
    await p
      .getByRole('dialog', { name: 'Hay empate' })
      .getByRole('button', { name: 'Segunda vuelta' })
      .click();
  }),
);
screenEach(
  'votacion-ganadora-revelada',
  poll(1),
  then(click('Cerrar votación'), confirmClose, (p) => settle(p, 6000)),
);

/** The rehearsal event moved to a nearer start (today, or tomorrow morning), for the countdown designs that animate. */
function soon(startsAt: string) {
  return {
    overrides: (db: DemoFixture) => {
      db.events = db.events!.map((e) =>
        e.id === EVENT(2) ? { ...e, starts_at: new Date(startsAt).toISOString() } : e,
      );
    },
  };
}

// ───────────── Events ─────────────
screen('eventos-lista', '/eventos');
screen('eventos-vacio', '/eventos', undefined, empty('events', 'event_songs'));
screen('evento-nuevo', '/eventos', click('Nuevo evento'));
screen('evento-luna', `/eventos/${EVENT(1)}`);
screen('evento-faroles', `/eventos/${EVENT(2)}`);
screen('evento-hoy', `/eventos/${EVENT(2)}`, undefined, soon('2026-10-20T21:30:00+02:00'));
screen('evento-horas', `/eventos/${EVENT(2)}`, undefined, soon('2026-10-21T10:00:00+02:00'));
screen('evento-pasado', `/eventos/${EVENT(3)}`);
screen('evento-editar', `/eventos/${EVENT(1)}`, click('Editar'));
screen('evento-repertorio-anadir', `/eventos/${EVENT(1)}`, click('Añadir canciones'));
screen('evento-borrar', `/eventos/${EVENT(1)}`, click('Borrar el evento'));
screen('evento-sin-repertorio', `/eventos/${EVENT(1)}`, undefined, {
  overrides: (db) => {
    db.event_songs = db.event_songs!.filter((s) => s.event_id !== EVENT(1));
  },
});

// ───────────── Formations (captures only) ─────────────
const plan = `/v/${FIXTURE.youtubeVideoId}/formaciones/00000000-0000-4000-8017-000000000001`;
screen('formaciones-editor', plan);
test('formaciones-editor-giro', async ({ page }) => {
  const guard = guardConsole(page);
  await seedFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, plan);
  await snap(page, 'formaciones-editor-giro-390x844', { mask: iframes(page) });
  await page.setViewportSize({ width: 844, height: 390 });
  await settle(page, 1000);
  await snap(page, 'formaciones-editor-giro-844x390', { mask: iframes(page) });
  guard.check();
});

// ───────────── Animation frames ─────────────
const REVEAL_TIMES = [0, 100, 200, 400, 600, 1000, 1500, 2000, 2500, 3000] as const;
// The drum turns once every 550 ms: these instants cover more than one full turn.
const DRUM_TIMES = [0, 100, 200, 300, 400, 550, 800, 1100] as const;
// The lead-in lasts 3 s: the last frame stays inside it (the card hides the player, so nothing here needs a mask). The
// 100 and 200 ms frames are left out: the card's slide-in spring lands a pixel or two apart from run to run there.
const COUNT_TIMES = [0, 400, 600, 1000, 1500, 2000, 2500] as const;
const BARS_TIMES = [0, 100, 200, 400, 600, 1000] as const;
const LANTERN_TIMES = [0, 400, 800, 1200, 1600, 2400, 3200] as const;

/** CSS transitions (the buttons' colour fades) run on the browser's real timeline, not on the fake clock: hold them at `t`. */
async function holdCss(page: Page, t: number) {
  await page.evaluate((ms) => {
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = ms;
    }
  }, t);
}

/** `motionFrames` plus the CSS hold: every frame is exact for both the JS (fake clock) and the CSS animations. */
async function frames(
  page: Page,
  name: string,
  start: () => Promise<void>,
  times: readonly number[],
  options: Parameters<typeof motionFrames>[4] = {},
) {
  const clock = page.clock;
  const runFor = clock.runFor.bind(clock);
  let elapsed = 0;
  clock.runFor = async (ms: number) => {
    await runFor(ms);
    elapsed += ms;
    await holdCss(page, elapsed);
  };
  try {
    await motionFrames(
      page,
      name,
      async () => {
        await start();
        await holdCss(page, 0);
      },
      times,
      options,
    );
  } finally {
    clock.runFor = runFor;
  }
}

async function sized(page: Page, width: number) {
  await page.setViewportSize({ width, height: page.viewportSize()?.height ?? 844 });
}

for (const width of [375, 1440]) {
  test(`frames votacion-revelado ${width}`, async ({ page }) => {
    const guard = guardConsole(page);
    await seedFixture(page);
    await sized(page, width);
    await open(page, poll(1));
    await page.getByRole('button', { name: 'Cerrar votación' }).click();
    await settle(page, 500);
    await frames(
      page,
      `votacion-revelado-${width}`,
      async () => {
        await confirmClose(page);
        // Let the click commit the close and mount the reveal before the first frame (the clock keeps still).
        await page.waitForTimeout(150);
      },
      REVEAL_TIMES,
    );
    guard.check();
  });

  test(`frames bombo ${width}`, async ({ page }) => {
    const guard = guardConsole(page);
    await seedFixture(page);
    await sized(page, width);
    await open(page, `/bolsas/${BAG.songs}`);
    await frames(
      page,
      `bolsa-bombo-${width}`,
      async () => {
        await page.getByRole('button', { name: 'Sacar', exact: true }).click();
        await page.waitForTimeout(150);
      },
      DRUM_TIMES,
    );
    guard.check();
  });

  test(`frames cuenta-previa ${width}`, async ({ page }) => {
    const guard = guardConsole(page);
    await seedFixture(page);
    await sized(page, width);
    await open(page, '/rpd');
    await page.getByRole('button', { name: 'Empezar', exact: true }).click();
    await settle(page, 800);
    await frames(
      page,
      `rpd-cuenta-previa-${width}`,
      async () => {
        await page
          .getByRole('dialog', { name: 'Random Play Dance' })
          .getByRole('button', { name: 'Empezar', exact: true })
          .click();
        // The first frame is taken only once the lead-in card is on screen, so every run starts from the same commit.
        await expect(page.getByText(/^[123]$/)).toHaveText('3');
      },
      COUNT_TIMES,
    );
    guard.check();
  });

  test(`frames barras-resultados ${width}`, async ({ page }) => {
    const guard = guardConsole(page);
    await seedFixture(page);
    await sized(page, width);
    await frames(
      page,
      `votacion-barras-${width}`,
      async () => {
        await page.goto(poll(1));
        await page.waitForTimeout(400);
      },
      BARS_TIMES,
    );
    guard.check();
  });

  // The lanterns only move on the day itself (swing) and the day before (the last one flickers): the other events
  // are static, so these two get their own seeded event.
  for (const [label, startsAt] of [
    ['hoy', '2026-10-20T21:30:00+02:00'],
    ['horas', '2026-10-21T10:00:00+02:00'],
  ] as const) {
    test(`frames cuenta-atras-faroles-${label} ${width}`, async ({ page }) => {
      const guard = guardConsole(page);
      await seedFixture(page, soon(startsAt));
      await sized(page, width);
      await frames(
        page,
        `evento-faroles-${label}-${width}`,
        async () => {
          await page.goto(`/eventos/${EVENT(2)}`);
          await page.waitForTimeout(400);
        },
        LANTERN_TIMES,
      );
      guard.check();
    });
  }
}
