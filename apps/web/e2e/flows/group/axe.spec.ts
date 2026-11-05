import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test } from '@playwright/test';
import { EVENT, POLL, TRACK, BAG, WEBKIT_SKIP } from './helpers';
import { EVIDENCE } from '../../support/visual';
import { FIXTURE, fixClock, seedFixture } from '../../support/seed';

// REQ-02 · Accessibility baseline of the group area: one axe report per screen, written as JSON to the evidence
// folder. It never fails on existing violations (it is the starting line to compare against later).

const SCREENS: [string, string][] = [
  ['bolsas', '/bolsas'],
  ['bolsa', `/bolsas/${BAG.songs}`],
  ['rpd', '/rpd'],
  ['pista', `/rpd/pista/${TRACK.contest}`],
  ['rpd-jugar', '/rpd/jugar'],
  ['deseos', '/deseos'],
  ['votacion-abierta', `/deseos/votacion/${POLL(1)}`],
  ['votacion-ranking', `/deseos/votacion/${POLL(3)}`],
  ['votacion-cerrada', `/deseos/votacion/${POLL(4)}`],
  ['eventos', '/eventos'],
  ['evento', `/eventos/${EVENT(1)}`],
  ['formaciones', `/v/${FIXTURE.youtubeVideoId}/formaciones/00000000-0000-4000-8017-000000000001`],
];

test('axe: informe por pantalla del área de grupo', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', WEBKIT_SKIP);
  test.setTimeout(120_000);
  await fixClock(page);
  await seedFixture(page);
  const report: Record<string, unknown> = {};
  for (const [name, url] of SCREENS) {
    await page.goto(url);
    await page.waitForTimeout(1200);
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .disableRules(['label-content-name-mismatch'])
      .exclude('iframe')
      .analyze();
    report[name] = violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  }
  const dir = path.join(EVIDENCE, 'fase-0');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `axe-group-${test.info().project.name}.json`),
    JSON.stringify(report, null, 2),
  );
});
