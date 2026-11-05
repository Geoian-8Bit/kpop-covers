import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, type Page } from '@playwright/test';
import { EVIDENCE } from '../../support/visual';
import { FIXTURE, fixClock, seedFixture } from '../../support/seed';
import {
  guard as guardConsole,
  keepAndOpenTakes,
  openRecorder,
  openReview,
  openTakesTab,
  recordTake,
  recorder,
} from './helpers';

// REQ-02 · Accessibility baseline of the recorder, the takes and the review: one axe report per screen, written to
// `<evidence>/fase-0/axe-record.json`. Existing violations are the baseline, not failures.

test.beforeEach(({ browserName }) => {
  test.skip(browserName === 'webkit', 'WebKit de Playwright sin Web Audio (AudioNode): la app no arranca');
});
test.describe.configure({ timeout: 120_000, mode: 'serial' });

const OUT = path.join(EVIDENCE, 'fase-0', 'axe-record.json');
const report: Record<string, unknown> = {};

async function scan(page: Page, screen: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['label-content-name-mismatch'])
    .exclude('iframe')
    .analyze();
  const key = `${test.info().project.name} · ${screen}`;
  report[key] = violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // Merge with what the other projects already wrote.
  const before = fs.existsSync(OUT)
    ? (JSON.parse(fs.readFileSync(OUT, 'utf8')) as Record<string, unknown>)
    : {};
  fs.writeFileSync(OUT, JSON.stringify({ ...before, ...report }, null, 2));
}

test('axe: grabador y sus paneles', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  const rec = recorder(page);
  await scan(page, 'grabador-inicio');
  await rec.getByRole('button', { name: 'Ajustes del grabador' }).click();
  await page.waitForTimeout(1200);
  await scan(page, 'grabador-ajustes');
  await rec.getByRole('button', { name: /^Visor:/ }).click();
  await page.waitForTimeout(1000);
  await scan(page, 'grabador-visor');
  for (const name of [/Rejilla/, /Nivel/, /Información técnica/])
    await rec.getByRole('switch', { name }).click();
  await rec.getByRole('button', { name: 'Cerrar los ajustes' }).last().click();
  await page.waitForTimeout(800);
  await rec.getByRole('button', { name: 'Información técnica de la cámara' }).click();
  await page.waitForTimeout(1000);
  await scan(page, 'grabador-info');
  await page.getByRole('button', { name: 'Cerrar la información' }).click();
  await rec.getByRole('button', { name: /^Armar:/ }).click();
  await page.waitForTimeout(1000);
  await scan(page, 'grabador-aplauso');
  guard.check();
});

test('axe: revisión, tomas y repaso', async ({ page, browser }) => {
  const guard = guardConsole(page);
  await openRecorder(page, browser);
  await recordTake(page);
  await scan(page, 'grabador-revision');
  await keepAndOpenTakes(page);
  await page.waitForTimeout(800);
  await scan(page, 'tomas-lista-grabada');
  await openReview(page);
  await page.waitForTimeout(1000);
  await scan(page, 'repaso-separado');
  await page.getByRole('radio', { name: 'Superpuesto' }).click();
  await page.waitForTimeout(800);
  await scan(page, 'repaso-superpuesto');
  guard.check();
});

test('axe: lista de tomas del fixture', async ({ page }) => {
  const guard = guardConsole(page);
  await fixClock(page);
  await seedFixture(page);
  await page.goto(`/v/${FIXTURE.youtubeVideoId}`);
  await openTakesTab(page);
  await page.waitForTimeout(800);
  await scan(page, 'tomas-lista');
  guard.check();
});
