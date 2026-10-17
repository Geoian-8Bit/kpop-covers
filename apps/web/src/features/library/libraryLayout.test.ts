import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * P38 · Guard for the cards that stuck out of the library sheet on phones. The cause was layout, not data:
 * the phone grid had no column template, so its single implicit `auto` column grew to the widest caption that
 * couldn't wrap («ARrC» + «con archivo» in a 144 px thumb row) and every card, the featured one included, went
 * past the sheet's right edge. jsdom has no layout engine, so these checks pin the classes and the CSS rule
 * that make that impossible.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../../index.css');
const page = read('./LibraryPage.tsx');
const card = read('./VideoCard.tsx');

describe('library containment (P38)', () => {
  it('defaults every templateless grid to one shrinkable column', () => {
    expect(css).toMatch(/:where\(\.grid:not\(\.grid-flow-col\)\)\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  });

  it('gives both library grids an explicit minmax(0, 1fr) column on phones', () => {
    const grids = page.match(/className="grid [^"]*"/g) ?? [];
    expect(grids.length).toBeGreaterThanOrEqual(2);
    for (const grid of grids) expect(grid).toContain('grid-cols-1');
  });

  it('clips sideways overflow at the sheet, never vertically', () => {
    expect(page).toMatch(/className="paper [^"]*overflow-x-clip/);
    expect(page).not.toMatch(/className="paper [^"]*overflow-hidden/);
  });

  it('lets a card shrink below its caption and never truncates the whole caption line', () => {
    expect(card).toContain("cn('group relative min-w-0', className)");
    // The caption line wraps («con archivo» drops below) instead of being one nowrap line.
    expect(card).toMatch(/<p className="mt-1 flex flex-wrap/);
  });

  it('only animates card positions while the user filters', () => {
    expect(card).toContain("layout={animateLayout ? 'position' : false}");
    expect(page).toContain('animateLayout={filtering}');
  });
});
