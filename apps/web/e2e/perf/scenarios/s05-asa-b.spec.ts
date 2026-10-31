import { fluid } from '../fluid';
import { scenario } from '../harness';
import { applyFirstClip, handleB, studioSetup } from '../studioSetup';
import { centerOf, gesture, slideAt, touchSession } from '../touch';

/** S-05 · Dragging the B handle of the range back and forth for 3 s · M-08, M-09. */
scenario('S-05', 'Arrastrar el asa B del tramo 3 s', ['M-08', 'M-09'], async (browser) => {
  const result = await fluid(browser, {
    setup: await studioSetup(browser),
    prepare: applyFirstClip,
    action: async (page) => {
      const cdp = await touchSession(page);
      const b = await centerOf(page, handleB);
      await gesture(cdp, 3000, slideAt(b, -60, 1.5));
    },
  });
  return { gestureSeconds: 3, ...result };
});
