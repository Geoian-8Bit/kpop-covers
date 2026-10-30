import { expect, test, type Locator, type Page } from '@playwright/test';
import { seedDemo, VIDEO_ID } from './demo';
import { guardConsole } from './guard';

/** Opens the song and marks A at 0:30 and B at 1:00 with the keyboard (Home, →×6, A, →×6, B). */
async function openWithLoop(page: Page) {
  await seedDemo(page);
  await page.goto(`/v/${VIDEO_ID}`);
  const track = page.getByRole('slider', { name: 'Línea de tiempo' });
  await expect(track).not.toHaveAttribute('aria-valuemax', '0', { timeout: 20_000 });
  await track.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await track.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('a');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('b');
  const band = track.locator('div.border-x-2');
  await expect(band).toBeVisible();
  const timer = page.getByRole('timer', { name: 'Tiempo' });
  await expect(timer).toHaveText('1:00.0');
  return { track, band, timer };
}

const bandLeft = (band: Locator) => band.evaluate((el) => (el as HTMLElement).style.left);

async function drag(page: Page, from: { x: number; y: number }, dx: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y, { steps: 4 });
  await page.mouse.move(from.x + dx, from.y, { steps: 4 });
  await page.mouse.up();
}

// REQ-01 · Over the red edge the track scrubs: the time moves, A and B stay.
test('tocar la línea roja mueve el tiempo, no A', async ({ page }) => {
  const guard = guardConsole(page);
  const { track, band, timer } = await openWithLoop(page);
  const left = await bandLeft(band);
  const edge = (await band.boundingBox())!;
  const rail = (await track.boundingBox())!;
  await drag(page, { x: edge.x + 1, y: rail.y + rail.height / 2 }, 40);
  await expect(timer).not.toHaveText('1:00.0');
  expect(await bandLeft(band)).toBe(left);
  guard.check();
});

// REQ-01 · The A seal grabs A.
test('arrastrar el sello A mueve A', async ({ page }) => {
  const guard = guardConsole(page);
  const { band } = await openWithLoop(page);
  const left = await bandLeft(band);
  const seal = band.getByText('A', { exact: true });
  const box = (await seal.boundingBox())!;
  await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, -30);
  await expect.poll(() => bandLeft(band)).not.toBe(left);
  guard.check();
});
