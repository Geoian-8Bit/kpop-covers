import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { readDemo } from '../../demo';
import { FIXTURE, guardConsole, seedFixture } from '../../support/seed';

// Formations on a phone: a finger on a person drags them in any direction from the very first move, and the page never
// scrolls under it. Real touches through CDP `Input.dispatchTouchEvent` (they go through the browser's own gesture
// handling, `touch-action` included), so Chromium only. The phone sizes the group uses: upright and on its side.

const PLAN = '00000000-0000-4000-8017-000000000001';
const URL = `/v/${FIXTURE.youtubeVideoId}/formaciones/${PLAN}`;

type Stored = {
  formations?: { plan_id: string; at: number; archived_at: string | null; positions: Record<string, { x: number; y: number }> }[];
};

/** Where the fixture's first member stands in the plan's first formation (stage metres). */
async function firstSpot(page: Page) {
  const db = await readDemo<Stored>(page);
  const first = (db.formations ?? []).filter((f) => f.plan_id === PLAN && !f.archived_at).sort((a, b) => a.at - b.at)[0];
  return first?.positions[FIXTURE.memberId];
}

async function touchDrag(cdp: CDPSession, from: { x: number; y: number }, dx: number, dy: number, steps = 12) {
  const at = (t: number) => [{ x: from.x + dx * t, y: from.y + dy * t, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / steps) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

for (const size of [
  { width: 375, height: 812 },
  { width: 844, height: 390 },
]) {
  test.describe(`${size.width}×${size.height}`, () => {
    test.use({ viewport: size, isMobile: true, hasTouch: true });

    test('arrastrar a alguien en vertical desde el primer movimiento lo mueve sin desplazar la página', async ({ page }, info) => {
      test.skip(info.project.name !== 'movil-chromium', 'Input.dispatchTouchEvent is CDP: Chromium only (once)');
      const guard = guardConsole(page);
      await seedFixture(page);
      await page.goto(URL);
      const hana = page.getByRole('button', { name: /^Hana\. Flechas para moverle/ });
      await expect(hana).toBeVisible();
      const before = await firstSpot(page);
      expect(before).toBeTruthy();

      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      const box = (await hana.locator('circle').first().boundingBox())!;
      const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const scrollBefore = await page.evaluate(() => window.scrollY);

      // Straight down, every move vertical: the gesture a browser would take for a scroll.
      await touchDrag(cdp, start, 0, 70);

      await expect.poll(async () => (await firstSpot(page))?.y ?? 0).toBeGreaterThan(before!.y + 0.4);
      expect(Math.abs(((await firstSpot(page))?.x ?? 0) - before!.x)).toBeLessThan(0.3);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

      // And back up: also vertical from the first move.
      const mid = (await firstSpot(page))!;
      const box2 = (await hana.locator('circle').first().boundingBox())!;
      await touchDrag(cdp, { x: box2.x + box2.width / 2, y: box2.y + box2.height / 2 }, 0, -50);
      await expect.poll(async () => (await firstSpot(page))?.y ?? 99).toBeLessThan(mid.y - 0.3);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

      // The whole editor fits: no page to scroll while editing.
      const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      expect(overflow).toBeLessThanOrEqual(1);
      guard.check();
    });
  });
}
