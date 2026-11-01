import { test } from '@playwright/test';
import { guardConsole } from '../support/seed';
import { cssFrames } from '../support/visual';
import { freeze, openApp, settle, tickUntilVisible } from '../flows/shell/support';

// REQ-09 · The splash seal is now a CSS animation (components/splash.css), so the faked clock of
// shell.spec.ts «splash (motion)» no longer drives it. Same scene, same instants, same frame names: the references
// are the phase-0 ones (copied byte for byte into this spec's folder; none was regenerated).

test.beforeEach(({ browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio: la app no arranca');
});

test.describe('fotogramas', () => {
  test('splash (CSS) al esperar una ruta perezosa', async ({ page }) => {
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
    await cssFrames(page, 'splash', async () => {}, [0, 350, 700, 1050, 1400]);
    release();
    guard.check();
  });
});
