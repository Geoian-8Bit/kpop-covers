import { expect, test, type Page } from '@playwright/test';
import { guardConsole } from '../support/seed';
import { testVideo } from '../support/testVideo';
import { atWidths, FRAME_TIMES, motionFrames, snap, type SnapOptions } from '../support/visual';
import {
  freeze,
  openApp,
  openStill,
  rest,
  settle,
  syncedFrames,
  tick,
  tickUntilVisible,
} from '../flows/shell/support';

// REQ-02 · Shell · visual references (phase 0, spec 3.4): library, quick-access row, settings, «¿Quién eres?»,
// privacy, calendar, the shell at the three widths and across `lg` (64rem), plus the animation frames of the splash,
// the hanging quick-access items and the Hanafuda menu. Everything runs on a faked clock (nothing moves unless the
// test advances it) with YouTube thumbnails replaced by a flat picture, so captures depend on neither speed nor
// network. The shell has no YouTube iframe; the only mask is the dev build's date, which changes with every server
// start.

test.beforeEach(({ browserName }) => {
  // The Playwright WebKit build here has no Web Audio (`AudioNode` is undefined), so the app throws on load and stays blank.
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio: la app no arranca');
});

/** Captures the current screen at 375, 768 and 1440 wide: `<name>-<width>`. */
async function shotAtWidths(
  page: Page,
  name: string,
  options: SnapOptions = {},
  prepare?: () => Promise<void>,
) {
  await atWidths(page, async (width) => {
    await rest(page, 1500);
    await prepare?.();
    await snap(page, `${name}-${width}`, options);
  });
}

const search = (page: Page) => page.getByPlaceholder('Buscar canción o artista');
const version = (page: Page) => page.getByText(/^Versión de desarrollo/);
const addDialog = (page: Page) => page.getByRole('dialog', { name: 'Añadir vídeo' });
const quickMenu = (page: Page) => page.getByRole('button', { name: /^Secciones/ });
const toTop = (page: Page) => page.evaluate(() => window.scrollTo(0, 0));

test.describe('biblioteca', () => {
  test('con datos', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(page, '/', search(page));
    await shotAtWidths(page, 'biblioteca-datos', {}, () => toTop(page));
    guard.check();
  });

  test('vacía', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(page, '/', page.getByRole('heading', { name: 'Empieza con vuestra próxima cover' }), {
      overrides: { videos: [], clips: [] },
    });
    await shotAtWidths(page, 'biblioteca-vacia');
    guard.check();
  });

  test('búsqueda sin resultados', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(page, '/', search(page));
    await search(page).fill('zzzz sin resultados');
    await tickUntilVisible(page, page.getByText('Nada coincide con “zzzz sin resultados”.'));
    await shotAtWidths(page, 'biblioteca-sin-resultados', {}, () => toTop(page));
    guard.check();
  });

  test('banner del próximo evento', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(page, '/', search(page));
    await shotAtWidths(page, 'banner-evento-cercano', {}, () => toTop(page));
    guard.check();
  });

  test('banner con el evento lejano', async ({ page }) => {
    const guard = guardConsole(page);
    // Only the event 12 days ahead and the past one: the countdown is in days.
    await openStill(page, '/', search(page), {
      overrides: (db) => {
        const far = db.events!.filter(
          (e) =>
            String(e.starts_at ?? '').startsWith('2026-11-01') || String(e.starts_at ?? '') < '2026-10-20',
        );
        return { ...db, events: far };
      },
    });
    await shotAtWidths(page, 'banner-evento-lejano', {}, () => toTop(page));
    guard.check();
  });
});

test.describe('añadir vídeo', () => {
  test('pestaña YouTube, resultados y pestaña de archivo', async ({ page, browser }) => {
    const guard = guardConsole(page);
    const video = await testVideo(browser);
    await openStill(page, '/', search(page));
    await page.getByRole('button', { name: 'Añadir vídeo' }).click();
    const dialog = addDialog(page);
    await tickUntilVisible(page, dialog);
    await tick(page, 1000);
    await shotAtWidths(page, 'anadir-video-youtube', {});

    await dialog.getByPlaceholder('Ej. ILLIT Magnetic dance practice').fill('rick astley');
    await dialog.getByRole('button', { name: 'Buscar', exact: true }).click();
    await tickUntilVisible(page, dialog.getByRole('list', { name: 'Resultados' }));
    await shotAtWidths(page, 'anadir-video-resultados', {});

    await dialog.getByRole('radio', { name: 'Subir archivo' }).click();
    await tick(page, 1000);
    await shotAtWidths(page, 'anadir-video-archivo', {});

    await dialog
      .locator('input[type="file"]')
      .setInputFiles({ name: 'ensayo-prueba.webm', mimeType: video.mimeType, buffer: video.buffer });
    await tickUntilVisible(page, dialog.getByText('ensayo-prueba.webm'));
    await tick(page, 1500);
    await settle(page);
    // The poster and the length come from the browser decoding the clip: only the frame around them is a reference.
    await expect(dialog.getByLabel('Título')).toHaveValue(/.+/);
    guard.check();
  });
});

test.describe('accesos rápidos', () => {
  test('con clips fijados', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(page, '/', search(page));
    await shotAtWidths(page, 'accesos-rapidos-datos', {}, async () => {
      await page.locator('#quick-title').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    });
    guard.check();
  });

  test('sin clips', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(page, '/', search(page), { overrides: { clips: [] } });
    await shotAtWidths(page, 'accesos-rapidos-vacio', {}, async () => {
      await page.locator('#quick-title').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    });
    guard.check();
  });
});

test.describe('ajustes', () => {
  test('pantalla, edición y confirmación de quitar', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(page, '/ajustes', version(page));
    const mask = [version(page)];
    await shotAtWidths(page, 'ajustes-datos', { mask }, () => toTop(page));

    await page.getByRole('button', { name: 'Editar a Mina' }).click();
    await tick(page, 800);
    await shotAtWidths(page, 'ajustes-editando-miembro', { mask });
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await tick(page, 800);

    await page.getByRole('button', { name: 'Quitar a Aoi del grupo' }).click();
    const dialog = page.getByRole('dialog', { name: '¿Quitar a Aoi?' });
    await tickUntilVisible(page, dialog);
    await tick(page, 800);
    await shotAtWidths(page, 'ajustes-quitar-miembro', { mask });
    guard.check();
  });

  test('alta de un miembro', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(page, '/ajustes', version(page));
    await page.getByRole('button', { name: 'Añadir miembro' }).click();
    await page.getByLabel('Nombre').fill('Nami');
    await tick(page, 800);
    await shotAtWidths(page, 'ajustes-alta-miembro', { mask: [version(page)] });
    guard.check();
  });
});

test.describe('¿Quién eres?', () => {
  test('lista de miembros', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(page, '/calendario', page.getByRole('heading', { name: 'octubre 2026' }), { me: null });
    await page.getByRole('gridcell').getByRole('button', { name: /hoy/ }).click();
    await page.getByRole('button', { name: 'Marcar ausencia' }).click();
    const who = page.getByRole('dialog', { name: '¿Quién eres?' });
    await tickUntilVisible(page, who);
    await tick(page, 1000);
    await shotAtWidths(page, 'quien-eres-lista', {});
    await who.getByRole('button', { name: 'No estoy en la lista' }).click();
    await tick(page, 1000);
    await shotAtWidths(page, 'quien-eres-alta', {});
    guard.check();
  });
});

test.describe('privacidad y calendario', () => {
  test('privacidad', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(
      page,
      '/privacidad',
      page.getByRole('heading', { name: 'Privacidad y condiciones', level: 1 }),
    );
    await shotAtWidths(page, 'privacidad-datos', {}, () => toTop(page));
    guard.check();
  });

  test('calendario con datos', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(page, '/calendario', page.getByRole('heading', { name: 'octubre 2026' }));
    await shotAtWidths(page, 'calendario-datos', {}, () => toTop(page));
    guard.check();
  });

  test('calendario sin ausencias y detalle de un día', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(page, '/calendario', page.getByRole('heading', { name: 'octubre 2026' }), {
      overrides: { absences: [] },
    });
    await shotAtWidths(page, 'calendario-sin-ausencias', {}, () => toTop(page));
    await page.getByRole('gridcell').getByRole('button', { name: /hoy/ }).click();
    const detail = page.getByRole('dialog', { name: / de \p{L}+$/u });
    await tickUntilVisible(page, detail);
    await tick(page, 1000);
    await shotAtWidths(page, 'calendario-dia', {});
    guard.check();
  });
});

test.describe('shell', () => {
  test('menú de secciones abierto en los tres anchos', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(page, '/', search(page));
    await atWidths(page, async (width) => {
      await rest(page, 1500);
      await toTop(page);
      if (width < 1024) {
        await quickMenu(page).click();
        await tickUntilVisible(page, page.getByRole('dialog', { name: 'Secciones' }));
        await tick(page, 1500);
      } else {
        await page.getByRole('link', { name: 'Calendario' }).first().hover();
      }
      await snap(page, `shell-menu-${width}`);
      if (width < 1024) {
        await page.getByRole('button', { name: 'Cerrar secciones' }).click();
        await tick(page, 1000);
      }
    });
    guard.check();
  });

  test('menú «Más opciones» del móvil', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 1024, 'Solo existe por debajo de lg');
    const guard = guardConsole(page);
    await openStill(page, '/', search(page));
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await tickUntilVisible(page, page.getByRole('menu', { name: 'Más opciones' }));
    await tick(page, 1000);
    for (const width of [375, 768]) {
      await page.setViewportSize({ width, height: page.viewportSize()?.height ?? 844 });
      await rest(page, 1000);
      await snap(page, `shell-mas-opciones-${width}`, { mask: [version(page)] });
    }
    guard.check();
  });

  test('cruce de lg en ambos sentidos', async ({ page }) => {
    const guard = guardConsole(page);
    await openStill(page, '/', search(page));
    const height = page.viewportSize()?.height ?? 844;
    // Up across 64rem (1023 → 1024 → 1280) and back down, so each step is a reference of its own.
    for (const [sense, width] of [
      ['subiendo', 1023],
      ['subiendo', 1024],
      ['subiendo', 1280],
      ['bajando', 1024],
      ['bajando', 1023],
    ] as const) {
      await page.setViewportSize({ width, height });
      // The quick menu mounts again below lg and shows its name tag for 2.8 s: wait it out.
      await rest(page, 3500);
      await toTop(page);
      await snap(page, `shell-cruce-${sense}-${width}`);
    }
    guard.check();
  });
});

// ── Animation frames ──────────────────────────────────────────────────────────────────────────

test.describe('fotogramas', () => {
  test('splash (motion) al esperar una ruta perezosa', async ({ page }) => {
    const guard = guardConsole(page);
    // The settings chunk is held back, so the route's Suspense fallback (the splash) stays on screen.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/src\/features\/settings\/SettingsPage\.tsx/, async (route) => {
      await gate;
      await route.continue();
    });
    await openApp(page, '/ajustes', { clock: 'install' });
    const splash = page.getByRole('status', { name: 'Cargando' });
    await tickUntilVisible(page, splash);
    await settle(page);
    await freeze(page);
    await motionFrames(page, 'splash', async () => {}, [0, 350, 700, 1050, 1400]);
    release();
    guard.check();
  });

  test('colgantes de los accesos rápidos tras desplazar la fila', async ({ page }) => {
    const guard = guardConsole(page);
    // The row only overflows on a phone; the hanging items are the same component everywhere.
    await page.setViewportSize({ width: 390, height: 844 });
    await openStill(page, '/', search(page));
    const row = page.locator('section[aria-labelledby="quick-title"] ul').first();
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await tick(page, 300);
    await freeze(page);
    await motionFrames(
      page,
      'accesos-colgantes',
      async () => {
        // A wheel event marks the scroll as the user's (the row only sways for those); the scroll itself is instant, so
        // no real-time smooth scrolling sits under the faked clock. Its event comes with the next frame: wait for it.
        await row.evaluate(
          (el) =>
            new Promise<void>((done) => {
              el.addEventListener('scroll', () => done(), { once: true });
              el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaX: 260 }));
              el.scrollBy({ left: 260, behavior: 'instant' });
            }),
        );
        await page.waitForTimeout(100);
      },
      [0, 100, 200, 400, 600, 1000],
    );
    guard.check();
  });

  test('apertura del menú Hanafuda (motion)', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 1024, 'El menú Hanafuda solo existe por debajo de lg');
    const guard = guardConsole(page);
    await openStill(page, '/', search(page));
    await freeze(page);
    await syncedFrames(
      page,
      'hanafuda-apertura',
      async () => {
        await quickMenu(page).click();
      },
      FRAME_TIMES,
    );
    guard.check();
  });
});
