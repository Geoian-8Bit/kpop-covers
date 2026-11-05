import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, type Page } from '@playwright/test';
import { FIXTURE, guardConsole } from '../../support/seed';
import { EVIDENCE } from '../../support/visual';
import { openStudio, shortClips, skipWithoutWebAudio, studioVideo } from './studio';

// REQ-02 · Accessibility baseline of the studio: axe-core on each state, written as JSON to the evidence folder
// (fase-0/axe-studio.json). It never fails on violations: they are the starting line to compare against later.

skipWithoutWebAudio();

const OUT = path.join(EVIDENCE, 'fase-0', 'axe-studio.json');

let video: Buffer;
test.beforeAll(async ({ browser }) => {
  video = await studioVideo(browser);
});

async function scan(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['label-content-name-mismatch'])
    .exclude('iframe')
    .analyze();
  return {
    screen,
    project: test.info().project.name,
    violations: violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    })),
  };
}

test('axe: estudio, diálogos y panel de archivo', async ({ page }) => {
  test.setTimeout(120_000);
  const guard = guardConsole(page);
  const results = [];
  await openStudio(page, { media: video, overrides: shortClips });
  results.push(await scan(page, 'estudio-archivo'));

  await page.keyboard.press('?');
  await page.getByRole('dialog', { name: 'Atajos de teclado' }).waitFor();
  results.push(await scan(page, 'estudio-atajos'));
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Atajos de teclado' }).waitFor({ state: 'hidden' });

  await page.keyboard.press('a');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('b');
  results.push(await scan(page, 'estudio-tramo'));
  await page.getByRole('button', { name: 'Guardar clip' }).click();
  await page.getByRole('dialog', { name: 'Guardar clip' }).waitFor();
  results.push(await scan(page, 'estudio-dialogo-guardar'));
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Editar Intro 5' }).click();
  await page.getByRole('dialog', { name: 'Editar clip' }).waitFor();
  results.push(await scan(page, 'estudio-dialogo-editar'));
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('button', { name: 'Añadir una nota en este momento' }).click();
  await page.getByRole('dialog', { name: 'Nueva nota' }).waitFor();
  results.push(await scan(page, 'estudio-dialogo-nota'));
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'Nueva nota' }).waitFor({ state: 'hidden' });

  await page.getByRole('button', { name: 'Pantalla completa' }).click();
  await page.getByRole('button', { name: 'Salir de pantalla completa' }).waitFor();
  results.push(await scan(page, 'estudio-pantalla-completa'));
  await page.getByRole('button', { name: 'Salir de pantalla completa' }).click();

  await openStudio(page, { id: FIXTURE.youtubeVideoId });
  results.push(await scan(page, 'estudio-youtube'));
  await page.getByRole('button', { name: 'Añadir archivo de este vídeo' }).click();
  await page.getByRole('dialog', { name: 'Archivo de este vídeo' }).waitFor();
  results.push(await scan(page, 'estudio-vincular-archivo'));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const file = OUT.replace('.json', `-${test.info().project.name}.json`);
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  guard.check();
});
