import { describe, expect, it } from 'vitest';
import {
  activeSectionIndex,
  handLayout,
  quickNavHidden,
  quickNavLabel,
  trapFocusIndex,
} from './navRules';

const SECTIONS = [{ to: '/', end: true }, { to: '/bolsas' }, { to: '/deseos' }, { to: '/rpd' }, { to: '/eventos' }, { to: '/calendario' }];

describe('activeSectionIndex', () => {
  it('matches the library only on /', () => {
    expect(activeSectionIndex('/', SECTIONS)).toBe(0);
    expect(activeSectionIndex('/ajustes', SECTIONS)).toBe(-1);
  });

  it('matches a section and its sub-pages, not look-alike paths', () => {
    expect(activeSectionIndex('/bolsas', SECTIONS)).toBe(1);
    expect(activeSectionIndex('/bolsas/abc', SECTIONS)).toBe(1);
    expect(activeSectionIndex('/deseos/votacion/1', SECTIONS)).toBe(2);
    expect(activeSectionIndex('/rpd/pista/9', SECTIONS)).toBe(3);
    expect(activeSectionIndex('/eventos/3', SECTIONS)).toBe(4);
    expect(activeSectionIndex('/calendario', SECTIONS)).toBe(5);
    expect(activeSectionIndex('/bolsasx', SECTIONS)).toBe(-1);
    expect(activeSectionIndex('/v/abc', SECTIONS)).toBe(-1);
  });
});

describe('quickNavHidden', () => {
  it('hides in the studio, the Random Play Dance round and full screen', () => {
    expect(quickNavHidden('/v/abc', false)).toBe(true);
    expect(quickNavHidden('/rpd/jugar', false)).toBe(true);
    expect(quickNavHidden('/bolsas', true)).toBe(true);
  });

  it('shows everywhere else', () => {
    for (const path of ['/', '/bolsas/1', '/rpd', '/rpd/pista/2', '/deseos', '/eventos', '/calendario', '/ajustes']) {
      expect(quickNavHidden(path, false)).toBe(false);
    }
  });
});

describe('quickNavLabel', () => {
  it('says where you are', () => {
    expect(quickNavLabel('Bolsas')).toBe('Secciones. Estás en Bolsas');
    expect(quickNavLabel(null)).toBe('Secciones');
  });
});

describe('trapFocusIndex', () => {
  it('wraps both ways', () => {
    expect(trapFocusIndex(2, 3, false)).toBe(0);
    expect(trapFocusIndex(0, 3, true)).toBe(2);
    expect(trapFocusIndex(1, 3, false)).toBe(2);
  });

  it('enters from outside and handles an empty list', () => {
    expect(trapFocusIndex(-1, 3, false)).toBe(0);
    expect(trapFocusIndex(-1, 3, true)).toBe(2);
    expect(trapFocusIndex(0, 0, false)).toBe(-1);
  });
});

describe('handLayout', () => {
  /** The button's centre: bottom right, 16 px in, 56 px round. */
  const deck = (w: number, h: number) => ({ ax: w - 44, ay: h - 44 });
  /** Horizontal extent of a tilted card. */
  const half = (cardW: number, cardH: number, rotate: number) => {
    const r = (Math.abs(rotate) * Math.PI) / 180;
    return (cardW / 2) * Math.cos(r) + (cardH / 2) * Math.sin(r);
  };

  it('keeps every tilted card on screen, under the top bar and no lower than the button', () => {
    for (const [w, h] of [
      [320, 640],
      [360, 740],
      [390, 844],
      [430, 932],
      [844, 390],
    ] as const) {
      const { ax, ay } = deck(w, h);
      const { cardW, cardH, cards } = handLayout(6, w, ax, ay, 76);
      expect(cardH).toBeGreaterThan(cardW);
      for (const card of cards) {
        expect(card.x - half(cardW, cardH, card.rotate)).toBeGreaterThanOrEqual(4);
        expect(card.x + half(cardW, cardH, card.rotate)).toBeLessThanOrEqual(w - 4);
        expect(card.y - cardH / 2).toBeGreaterThanOrEqual(76 - cardH * 0.1);
        expect(card.y + cardH / 2).toBeLessThanOrEqual(ay + 28 + 0.5);
      }
    }
  });

  it('spreads out of the deck to the left: the last card next to the button, each one higher and more tilted', () => {
    const { ax, ay } = deck(390, 844);
    const { cardW, cards } = handLayout(6, 390, ax, ay, 76);
    expect(cards[5]!.x).toBeLessThan(ax);
    expect(cards[5]!.x + cardW / 2).toBeGreaterThan(ax - 22);
    for (let i = 1; i < cards.length; i++) {
      expect(cards[i - 1]!.x).toBeLessThan(cards[i]!.x);
      expect(cards[i - 1]!.y).toBeLessThan(cards[i]!.y);
      expect(cards[i - 1]!.rotate).toBeLessThan(cards[i]!.rotate);
      // Neighbours overlap like a spread deck, but most of each card shows.
      expect(cards[i]!.x - cards[i - 1]!.x).toBeGreaterThan(cardW * 0.6);
      expect(cards[i]!.x - cards[i - 1]!.x).toBeLessThan(cardW);
    }
  });
});
