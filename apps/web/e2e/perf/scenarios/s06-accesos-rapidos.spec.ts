import { fluid } from '../fluid';
import { scenario } from '../harness';
import { gesture, slideAt, touchSession } from '../touch';

/** S-06 · Scrolling the library's quick access sideways for 3 s · M-09, M-10 (no commit probe in this screen). */
scenario('S-06', 'Desplazar lateralmente los accesos rápidos 3 s', ['M-09', 'M-10'], async (browser) => {
  const result = await fluid(browser, {
    setup: { url: '/' },
    prepare: async (page) => {
      // The strip is a skeleton until its data arrives; the sideways scroller exists only after that.
      await page
        .locator('section[aria-labelledby="quick-title"] .overflow-x-auto a')
        .first()
        .waitFor({ timeout: 30_000 });
    },
    action: async (page) => {
      const scroller = page.locator('section[aria-labelledby="quick-title"] .overflow-x-auto').first();
      const r = await scroller.boundingBox();
      const box = r && { x: r.x, y: r.y + r.height / 2, w: r.width };
      if (!box) throw new Error('no sideways scroller found in the quick access');
      const cdp = await touchSession(page);
      await gesture(cdp, 3000, slideAt({ x: box.x + box.w * 0.8, y: box.y }, -box.w * 0.6, 1.5));
    },
    trace: true,
  });
  return { gestureSeconds: 3, ...result };
});
