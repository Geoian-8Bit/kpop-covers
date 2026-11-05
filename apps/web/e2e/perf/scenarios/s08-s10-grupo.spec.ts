import { BAG, POLL } from '../../flows/group/helpers';
import { fluid } from '../fluid';
import { scenario } from '../harness';

/** S-08 poll winner reveal · S-09 drawing from a bag (spinning drum) · S-10 count-down between clips in an RPD round. */

scenario('S-08', 'Revelado del ganador de una votación', ['M-09', 'M-10'], async (browser) => {
  const result = await fluid(browser, {
    setup: { url: `/deseos/votacion/${POLL(1)}` },
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Cerrar votación' }).waitFor({ timeout: 30_000 });
    },
    action: async (page) => {
      await page.getByRole('button', { name: 'Cerrar votación' }).click();
      await page
        .getByRole('dialog', { name: '¿Cerrar la votación?' })
        .getByRole('button', { name: 'Cerrar', exact: true })
        .click();
      await page.getByRole('status', { name: /^Ganadora: / }).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1500);
    },
    trace: true,
  });
  return { ...result };
});

scenario('S-09', '«Sacar» de una bolsa (bombo girando)', ['M-09', 'M-10'], async (browser) => {
  const result = await fluid(browser, {
    setup: { url: `/bolsas/${BAG.songs}` },
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Sacar', exact: true }).waitFor({ timeout: 30_000 });
    },
    action: async (page) => {
      await page.getByRole('button', { name: 'Sacar', exact: true }).click();
      await page.getByText('¡Premio!').waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1000);
    },
    trace: true,
  });
  return { ...result };
});

scenario('S-10', 'Cuenta previa entre clips en una ronda de Random Play Dance', ['M-08'], async (browser) => {
  const result = await fluid(browser, {
    setup: { url: '/rpd' },
    prepare: async (page) => {
      await page.getByRole('button', { name: 'Empezar', exact: true }).waitFor({ timeout: 30_000 });
    },
    action: async (page) => {
      await page.getByRole('button', { name: 'Empezar', exact: true }).click();
      const play = page.getByRole('dialog', { name: 'Random Play Dance' });
      await play.getByRole('button', { name: 'Empezar', exact: true }).click();
      await page.waitForTimeout(7000);
    },
  });
  return { seconds: 7, ...result };
});
