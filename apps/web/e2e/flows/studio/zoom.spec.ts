import { expect, test, type Page } from '@playwright/test';
import { guardConsole } from '../../support/seed';
import { openStudio, shortClips, studioVideo, skipWithoutWebAudio } from './studio';

// REQ-02 · Zoom over an uploaded video: the wheel, a pinch (two fingers simulated through CDP Input.dispatchTouchEvent,
// Chromium only) and the way back; then fullscreen. The stage button says «vídeo ampliado» while it is zoomed, which
// is what these tests read.

skipWithoutWebAudio();

let video: Buffer;
test.beforeAll(async ({ browser }) => {
  video = await studioVideo(browser);
});

const open = (page: Page) => openStudio(page, { media: video, overrides: shortClips });
const stage = (page: Page) => page.locator('[data-stage]');
const zoomedStage = (page: Page) => page.getByRole('button', { name: /vídeo ampliado/ });

async function center(page: Page) {
  const box = (await stage(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, w: box.width, h: box.height };
}

test('rueda: acerca el vídeo y doble clic lo vuelve a mostrar entero', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await expect(zoomedStage(page)).toBeHidden();
  const c = await center(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.wheel(0, -400);
  await expect(zoomedStage(page)).toBeVisible();
  await expect(page.getByText(/^\d+ %$/).first()).toBeVisible();
  // Past the whole picture: wheel the other way zooms out again.
  await page.mouse.wheel(0, 2000);
  await expect(zoomedStage(page)).toBeHidden();
  await page.mouse.wheel(0, -400);
  await expect(zoomedStage(page)).toBeVisible();
  await stage(page).dblclick();
  await expect(zoomedStage(page)).toBeHidden();
  guard.check();
});

test('teclado sobre el vídeo: + acerca, flechas lo mueven, 0 lo muestra entero', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await stage(page).focus();
  await page.keyboard.press('+');
  await expect(zoomedStage(page)).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(zoomedStage(page)).toBeVisible();
  await page.keyboard.press('0');
  await expect(zoomedStage(page)).toBeHidden();
  guard.check();
});

test('pellizco con dos dedos (CDP) acerca y un arrastre mueve la vista', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Input.dispatchTouchEvent is CDP: Chromium only');
  const guard = guardConsole(page);
  await open(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const c = await center(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', spread: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints:
        type === 'touchEnd'
          ? []
          : [
              { x: c.x - spread, y: c.y, id: 1 },
              { x: c.x + spread, y: c.y, id: 2 },
            ],
    });
  await touch('touchStart', 30);
  for (const s of [45, 65, 90, 120]) await touch('touchMove', s);
  await touch('touchEnd', 0);
  await expect(zoomedStage(page)).toBeVisible();

  // One finger drags the zoomed picture.
  const drag = (type: 'touchStart' | 'touchMove' | 'touchEnd', dx: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x: c.x + dx, y: c.y, id: 1 }],
    });
  await drag('touchStart', 0);
  for (const dx of [10, 25, 40]) await drag('touchMove', dx);
  await drag('touchEnd', 0);
  await expect(zoomedStage(page)).toBeVisible();
  guard.check();
});

test('pantalla completa con el botón: controles, velocidad, espejo y salir', async ({ page }) => {
  const guard = guardConsole(page);
  await open(page);
  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  const exit = page.getByRole('button', { name: 'Salir de pantalla completa' });
  await expect(exit).toBeVisible();
  const fs = page.locator('[data-fs]');
  await expect(fs.getByRole('slider', { name: 'Progreso' })).toBeVisible();
  await expect(fs.getByRole('button', { name: /^Velocidad: / })).toBeVisible();
  await fs
    .getByRole('button', { name: /^(Reproducir|Pausar)$/ })
    .last()
    .click();
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.paused)).toBe(false);
  await page.mouse.move(100, 100); // keeps the controls up
  await fs
    .getByRole('button', { name: /^(Reproducir|Pausar)$/ })
    .last()
    .click();
  await expect.poll(() => page.evaluate(() => document.querySelector('video')?.paused)).toBe(true);
  const mirror = fs.getByRole('button', { name: 'Espejo' });
  const before = await mirror.getAttribute('aria-pressed');
  await mirror.click();
  await expect(mirror).not.toHaveAttribute('aria-pressed', before!);
  await exit.click();
  await expect(exit).toBeHidden();
  guard.check();
});
