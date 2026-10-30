import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** REQ-00 · Runs axe on the page (or a part of it) and fails on `serious` or `critical` violations. */
export async function expectNoSeriousA11y(page: Page, options: { include?: string; exclude?: string[] } = {}) {
  let builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    // axe-core marks this rule `experimental` (off in its default run; picking tags turns it on). It flags the logo
    // link and the avatar button, whose names are deliberate (the app name + page; the menu it opens).
    .disableRules(['label-content-name-mismatch']);
  if (options.include) builder = builder.include(options.include);
  // Third-party frames (the YouTube player) are not ours to fix.
  builder = builder.exclude('iframe');
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  const blocking = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.impact} · ${v.id}: ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).slice(0, 5).join('\n  ')}`);
  expect(blocking, blocking.join('\n')).toEqual([]);
}
