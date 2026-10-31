import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, type Page } from '@playwright/test';
import { EVIDENCE } from '../../support/visual';
import { openApp, ready } from './support';

// REQ-02 · Shell · axe baseline: one report per screen and state (existing violations are the baseline, so this never
// fails on them). Written to <evidence>/fase-0/axe-shell.<project>.json; the per-project files are merged into
// axe-shell.json afterwards.

test.beforeEach(({ browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio: la app no arranca');
});

interface Report {
  screen: string;
  violations: {
    id: string;
    impact: string | null | undefined;
    help: string;
    nodes: number;
    targets: string[];
  }[];
}

async function scan(page: Page, screen: string): Promise<Report> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['label-content-name-mismatch'])
    .exclude('iframe')
    .analyze();
  return {
    screen,
    violations: violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    })),
  };
}

test('informe axe de las pantallas del shell', async ({ page }, info) => {
  test.setTimeout(120_000);
  const reports: Report[] = [];
  await openApp(page, '/');
  await ready(page);
  reports.push(await scan(page, 'biblioteca'));

  await page.getByRole('button', { name: 'Añadir vídeo' }).click();
  await page.getByRole('dialog', { name: 'Añadir vídeo' }).waitFor();
  reports.push(await scan(page, 'biblioteca · añadir vídeo'));
  await page.goBack();

  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await page.getByRole('button', { name: /^Secciones/ }).click();
    await page.getByRole('dialog', { name: 'Secciones' }).waitFor();
    await page.waitForTimeout(1200);
    reports.push(await scan(page, 'menú Hanafuda abierto'));
    await page.goBack();
    await page.getByRole('button', { name: 'Más opciones' }).click();
    await page.getByRole('menu', { name: 'Más opciones' }).waitFor();
    reports.push(await scan(page, 'menú Más opciones'));
    await page.keyboard.press('Escape');
  }

  for (const [url, screen] of [
    ['/ajustes', 'ajustes'],
    ['/privacidad', 'privacidad'],
    ['/calendario', 'calendario'],
  ] as const) {
    await page.goto(url);
    await ready(page);
    await page.waitForTimeout(800);
    reports.push(await scan(page, screen));
  }

  await openApp(page, '/', { overrides: { videos: [], clips: [] } });
  await ready(page);
  reports.push(await scan(page, 'biblioteca vacía'));

  const dir = path.join(EVIDENCE, 'fase-0');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `axe-shell.${info.project.name}.json`), JSON.stringify(reports, null, 2));
});
