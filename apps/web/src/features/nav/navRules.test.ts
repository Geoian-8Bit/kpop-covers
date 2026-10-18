import { describe, expect, it } from 'vitest';
import {
  activeSectionIndex,
  angleDelta,
  clampDial,
  dialIndexAt,
  dialRadius,
  dialRotationFor,
  dialStepPlaces,
  handLayout,
  KAKEJIKU_ROD,
  KAKEJIKU_ROLLER,
  kakejikuLayout,
  pointerAngle,
  polar,
  quickNavHidden,
  quickNavLabel,
  sensuGeometry,
  trapFocusIndex,
  wedgePolygon,
} from './navRules';

const SECTIONS = [{ to: '/', end: true }, { to: '/bolsas' }, { to: '/deseos' }, { to: '/rpd' }, { to: '/eventos' }];

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
    for (const path of ['/', '/bolsas/1', '/rpd', '/rpd/pista/2', '/deseos', '/eventos', '/ajustes']) {
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

describe('polar', () => {
  it('measures clockwise from straight up', () => {
    const up = polar(0, 0, 10, 0);
    const left = polar(0, 0, 10, -90);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-10);
    expect(left.x).toBeCloseTo(-10);
    expect(left.y).toBeCloseTo(0);
  });
});

describe('sensuGeometry', () => {
  it('fills the quarter with one wedge per entry', () => {
    const g = sensuGeometry(6, 346, 800, 72);
    expect(g.wedge).toBe(15);
    expect(g.angles[0]).toBe(-82.5);
    expect(g.angles[5]).toBe(-7.5);
    expect(g.r).toBe(310);
    expect(g.compact).toBe(false);
  });

  it('never leaves the screen on the left or under the top bar', () => {
    for (const [ax, ay] of [
      [346, 800],
      [276, 600],
      [800, 346],
    ] as const) {
      const g = sensuGeometry(6, ax, ay, 72);
      expect(ax - g.r).toBeGreaterThanOrEqual(0);
      expect(ay - g.r).toBeGreaterThanOrEqual(72 - 1);
    }
  });

  it('goes compact on a short screen', () => {
    expect(sensuGeometry(6, 300, 300, 72).compact).toBe(true);
  });

  it('draws a closed polygon', () => {
    const poly = wedgePolygon(300, 64, 15, 4);
    expect(poly.startsWith('polygon(')).toBe(true);
    expect(poly.split(',')).toHaveLength(10);
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

  it('fans the cards symmetrically', () => {
    const { cards } = handLayout(6, 390, 772);
    expect(cards[0]!.rotate).toBeCloseTo(-cards[5]!.rotate);
    expect(cards[0]!.x).toBeLessThan(cards[1]!.x);
  });
});

describe('kakejikuLayout', () => {
  const frame = KAKEJIKU_ROD + KAKEJIKU_ROLLER;

  it('keeps roomy 52 px lines in portrait, on the phone and in the lab stage', () => {
    // 390×844 (button top 772, 76 px top bar) and the lab stage (520 high, 12 px clear).
    for (const [buttonTop, top] of [
      [772, 76],
      [448, 12],
    ] as const) {
      const layout = kakejikuLayout(6, buttonTop, top);
      expect(layout).toMatchObject({ rowH: 52, scrolls: false });
      expect(layout.viewH).toBe(layout.paperH);
      expect(layout.viewH + frame).toBeLessThanOrEqual(buttonTop - 12 - top);
    }
  });

  it('tightens to 44 px lines before it ever scrolls', () => {
    const layout = kakejikuLayout(6, 430, 76);
    expect(layout).toMatchObject({ rowH: 44, scrolls: false });
    expect(layout.viewH + frame).toBeLessThanOrEqual(430 - 12 - 76);
  });

  it('scrolls its paper when even 44 px lines do not fit, and never goes off screen', () => {
    // 844×390, the same zoomed to 130 % (650×300), 150 % (562×260), ~180 % and 200 %, and the lab stage in landscape
    // (294 high).
    for (const buttonTop of [318, 228, 188, 160, 123, 222]) {
      const layout = kakejikuLayout(6, buttonTop, 76);
      expect(layout).toMatchObject({ rowH: 44, scrolls: true });
      expect(layout.viewH).toBeLessThan(layout.paperH);
      expect(layout.viewH).toBeGreaterThanOrEqual(layout.rowH);
      expect(layout.viewH + frame).toBeLessThanOrEqual(buttonTop - 12 - 8);
    }
  });
});

describe('dial', () => {
  const config = { step: 32, notch: -45, count: 6 };

  it('puts each entry in the notch and finds it back', () => {
    for (let i = 0; i < 6; i++) {
      expect(dialIndexAt(dialRotationFor(i, config), config)).toBe(i);
    }
    expect(dialIndexAt(dialRotationFor(2, config) - 10, config)).toBe(2);
    expect(dialIndexAt(dialRotationFor(2, config) - 20, config)).toBe(3);
  });

  it('stays within range', () => {
    expect(dialIndexAt(500, config)).toBe(0);
    expect(dialIndexAt(-500, config)).toBe(5);
  });

  it('resists past the ends', () => {
    const max = dialRotationFor(0, config);
    const min = dialRotationFor(5, config);
    expect(clampDial(max + 30, config)).toBeCloseTo(max + 9);
    expect(clampDial(min - 30, config)).toBeCloseTo(min - 9);
    expect(clampDial(max - 10, config)).toBe(max - 10);
  });

  it('reads pointer angles and their shortest difference', () => {
    expect(pointerAngle(0, 0, 0, -5)).toBeCloseTo(0);
    expect(pointerAngle(0, 0, -5, 0)).toBeCloseTo(-90);
    expect(angleDelta(170, -170)).toBe(20);
    expect(angleDelta(-170, 170)).toBe(-20);
  });

  it('fits its ring in the visible quarter', () => {
    expect(dialRadius(346, 800, 72)).toBe(220);
    expect(dialRadius(200, 500, 72)).toBe(140);
  });

  it('puts the step buttons outside the rim, either side of the notch, on screen', () => {
    // Portrait 390×844, landscape 844×390, and both with the page zoomed to 130 %.
    for (const [w, h] of [
      [390, 844],
      [844, 390],
      [300, 650],
      [650, 300],
    ] as const) {
      const ax = w - 44;
      const ay = h - 44;
      const r = dialRadius(ax, ay, 76);
      const discR = r + 62;
      const { prev, next } = dialStepPlaces(ax, ay, discR, -45, w, h);
      for (const p of [prev, next]) {
        expect(p.x).toBeGreaterThanOrEqual(26);
        expect(p.x).toBeLessThanOrEqual(w - 26);
        expect(p.y).toBeGreaterThanOrEqual(26);
        expect(p.y).toBeLessThanOrEqual(h - 26);
      }
      // «Anterior» is the counter-clockwise one: lower and further left than «Siguiente».
      expect(prev.y).toBeGreaterThan(next.y);
      expect(prev.x).toBeLessThan(next.x);
      // Never under the seal (44 px button wholly outside the disc), and 44 px targets don't overlap.
      expect(Math.hypot(prev.x - ax, prev.y - ay)).toBeGreaterThanOrEqual(discR + 22);
      expect(Math.hypot(next.x - prev.x, next.y - prev.y)).toBeGreaterThanOrEqual(44);
    }
  });
});
