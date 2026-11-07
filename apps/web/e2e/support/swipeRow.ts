import type { Locator, Page } from '@playwright/test';

/**
 * A real finger drag (CDP `Input.dispatchTouchEvent`: it goes through the browser's gesture handling, `touch-action`
 * included), horizontal by `dx` px from `from`. Chromium only, like the app's touch tests.
 */
export async function touchSwipe(page: Page, from: { x: number; y: number }, dx: number, steps = 10) {
  const cdp = await page.context().newCDPSession(page);
  const at = (t: number) => [{ x: from.x + dx * t, y: from.y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(0) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: at(i / steps) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/**
 * On a touch screen the rows built on SwipeRow (library cards, clips, takes) keep their corner buttons out of reach
 * (invisible or screen-reader only) and show the same actions behind the row: a finger swipes left to reveal them.
 * While closed that layer (`data-swipe-actions`) is `inert` + `aria-hidden`, so role queries only see the row's own
 * buttons.
 *
 * `rowButton` returns the button a real user can press: the swipe action on a touch screen (it swipes the row open
 * first when closed), the row's own button otherwise. The row closes by itself once an action is chosen.
 */
export async function rowButton(page: Page, name: string): Promise<Locator> {
  const selector = `button[aria-label=${JSON.stringify(name)}]`;
  // The row may still be rendering: wait for it first.
  await page.locator(selector).first().waitFor({ state: 'attached' });
  const layer = page.locator('[data-swipe-actions]').filter({ has: page.locator(selector) });
  if ((await layer.count()) === 0) return page.getByRole('button', { name, exact: true });

  const root = layer.first().locator('xpath=..');
  const action = root.locator(selector).first();
  if ((await layer.first().getAttribute('aria-hidden')) !== 'true') return action; // already open

  const content = root.locator('xpath=./div').last();
  await content.scrollIntoViewIfNeeded();
  const box = await content.boundingBox();
  if (!box) throw new Error(`row for «${name}» is not on screen`);
  const from = { x: box.x + box.width - 12, y: box.y + box.height / 2 };
  // A dialog that is still closing (or any overlay) would take the finger: wait until the row is what's under it.
  await page.waitForFunction(
    ({ el, x, y }) => el.contains(document.elementFromPoint(x, y)),
    { el: (await content.elementHandle())!, ...from },
  );
  // Far enough to open, well short of the full swipe that would run the primary action.
  await touchSwipe(page, from, -Math.min(170, box.width * 0.45));
  // Open once the layer is no longer inert.
  const handle = await action.elementHandle();
  await page.waitForFunction((el) => el?.closest('[inert]') === null, handle);
  // Pressable once the slide has settled and nothing (a toast, say) sits on top of it.
  await page.waitForFunction((el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  }, handle);
  return action;
}

/** Presses a row's action by its accessible name (see `rowButton`). */
export async function pressRowButton(page: Page, name: string) {
  await (await rowButton(page, name)).click();
}
