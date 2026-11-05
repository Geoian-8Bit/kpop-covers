import { describe, expect, it } from 'vitest';
import { holdsTouch } from './stageDrag';

/** A node whose ancestors (itself first) carry these attributes. */
const node = (...chain: string[][]) =>
  ({ closest: (sel: string) => (chain.some((attrs) => attrs.some((a) => sel === `[${a}]`)) ? {} : null) }) as unknown as EventTarget;

describe('holdsTouch', () => {
  const person = node([], ['data-drag']);
  const floor = node(['role']);

  it('keeps one finger on something draggable (the page must not scroll)', () => {
    expect(holdsTouch(person, 1, false)).toBe(true);
  });

  it('lets the floor scroll the page', () => {
    expect(holdsTouch(floor, 1, false)).toBe(false);
  });

  it('lets a second finger through (pinch)', () => {
    expect(holdsTouch(person, 2, false)).toBe(false);
  });

  it('a locked stage takes no drags: the page scrolls', () => {
    expect(holdsTouch(person, 1, true)).toBe(false);
  });

  it('ignores targets that are not elements', () => {
    expect(holdsTouch(null, 1, false)).toBe(false);
    expect(holdsTouch({} as EventTarget, 1, false)).toBe(false);
  });
});
