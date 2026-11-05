import { fluid } from '../fluid';
import { scenario } from '../harness';
import { applyFirstClip, studioSetup } from '../studioSetup';
import { centerOf, gesture, pinchAt, touchSession } from '../touch';

/** S-04 · 3 s pinch zoom on the studio with a file · M-08, M-09. */
scenario('S-04', 'Pellizco de zoom de 3 s en el estudio con archivo', ['M-08', 'M-09'], async (browser) => {
  const result = await fluid(browser, {
    setup: await studioSetup(browser),
    prepare: applyFirstClip,
    action: async (page) => {
      const cdp = await touchSession(page);
      const c = await centerOf(page, '[data-stage]');
      await gesture(cdp, 3000, pinchAt(c, 30, Math.min(130, c.w / 2 - 10), 1.5));
    },
  });
  return { gestureSeconds: 3, ...result };
});
