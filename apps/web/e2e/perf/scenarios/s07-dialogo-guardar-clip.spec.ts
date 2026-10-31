import { fluid } from '../fluid';
import { scenario } from '../harness';
import { applyFirstClip, studioSetup } from '../studioSetup';

/** S-07 · Opening and closing the «Guardar clip» dialog (3 times, so the window holds enough frames) · M-09, M-10. */
scenario('S-07', 'Abrir y cerrar el diálogo «Guardar clip»', ['M-09', 'M-10'], async (browser) => {
  const result = await fluid(browser, {
    setup: await studioSetup(browser),
    prepare: applyFirstClip,
    action: async (page) => {
      for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: 'Guardar clip' }).first().click();
        const dialog = page.getByRole('dialog', { name: 'Guardar clip' });
        await dialog.waitFor();
        await page.waitForTimeout(500);
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        await page.waitForTimeout(300);
      }
    },
    trace: true,
  });
  return { cycles: 3, ...result };
});
