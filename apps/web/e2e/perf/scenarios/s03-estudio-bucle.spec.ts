import { fluid } from '../fluid';
import { scenario } from '../harness';
import { applyFirstClip, ensurePlaying, studioSetup } from '../studioSetup';

/** S-03 · Studio playing a clip in a loop for 10 s · M-08, M-09, M-10. */
scenario('S-03', 'Estudio reproduciendo un clip en bucle 10 s', ['M-08', 'M-09', 'M-10'], async (browser) => {
  const result = await fluid(browser, {
    setup: await studioSetup(browser),
    prepare: applyFirstClip,
    action: async (page) => {
      await ensurePlaying(page);
      await page.waitForTimeout(10_000);
    },
    trace: true,
  });
  return { seconds: 10, ...result };
});
