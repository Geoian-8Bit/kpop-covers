import { expect, test } from '@playwright/test';
import { expectNoSeriousA11y } from './axe';
import { seedDemo } from './demo';
import { guardConsole } from './guard';

// REQ-00 · The library opens in every viewport, never scrolls sideways and passes axe.
test('la biblioteca abre sin scroll horizontal y pasa axe', async ({ page }) => {
  const guard = guardConsole(page);
  await seedDemo(page);
  await page.goto('/');
  await expect(page.getByText('PRUEBA canción').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expectNoSeriousA11y(page);
  guard.check();
});
