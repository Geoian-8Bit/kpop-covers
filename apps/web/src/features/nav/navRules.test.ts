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
  it('keeps every card on screen and above the button', () => {
    for (const w of [320, 390, 430, 844]) {
      const { cardW, cardH, cards } = handLayout(6, w, 772);
      expect(cardH).toBeGreaterThanOrEqual(cardW);
      for (const card of cards) {
        expect(card.x - cardW / 2).toBeGreaterThanOrEqual(9);
        expect(card.x + cardW / 2).toBeLessThanOrEqual(w - 9);
        expect(card.y + cardH / 2).toBeLessThan(772 + 20);
      }
    }
  });

  it('fits the six sections and «¿Quién eres?» (7 cards) from 320 px, each card showing most of its face', () => {
    for (const w of [320, 375, 390]) {
      const { cardW, cards } = handLayout(7, w, 772);
      expect(cards[0]!.x - cardW / 2).toBeGreaterThanOrEqual(9);
      expect(cards[6]!.x + cardW / 2).toBeLessThanOrEqual(w - 9);
      // Neighbours overlap like a hand of cards, but never hide more than a third of the card below.
      for (let i = 1; i < cards.length; i++) expect(cards[i]!.x - cards[i - 1]!.x).toBeGreaterThan(cardW * 0.66);
    }
  });

  it('fans the cards symmetrically', () => {
    const { cards } = handLayout(6, 390, 772);
    expect(cards[0]!.rotate).toBeCloseTo(-cards[5]!.rotate);
    expect(cards[0]!.x).toBeLessThan(cards[1]!.x);
  });
});
