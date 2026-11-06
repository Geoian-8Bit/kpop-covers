/**
 * P1 · Pure rules of the phone's quick menu (covered by `navRules.test.ts`): where you are, when the button hides,
 * and where the Hanafuda cards lie. No React, no DOM.
 */

export interface SectionPath {
  to: string;
  end?: boolean;
}

/** The section a path belongs to (its index), or -1 (Ajustes, Privacidad, the studio…). */
export function activeSectionIndex(pathname: string, sections: readonly SectionPath[]): number {
  return sections.findIndex(({ to, end }) =>
    end || to === '/' ? pathname === to : pathname === to || pathname.startsWith(`${to}/`),
  );
}

/**
 * The button stays out of the way where it would cover controls: the studio (/v/…, which also hosts the recorder
 * and the review), the Random Play Dance round (/rpd/jugar) and anything shown full screen.
 */
export function quickNavHidden(pathname: string, fullscreen: boolean): boolean {
  return fullscreen || pathname.startsWith('/v/') || pathname === '/rpd/jugar' || pathname.startsWith('/rpd/jugar/');
}

/** Accessible name of the closed button: it says where you are. */
export function quickNavLabel(section: string | null | undefined): string {
  return section ? `Secciones. Estás en ${section}` : 'Secciones';
}

/** Tab inside the open menu: the next control, wrapping at both ends. -1 → first (or last with Shift). */
export function trapFocusIndex(current: number, count: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return backwards ? (current - 1 + count) % count : (current + 1) % count;
}

// ───────────── Hanafuda: a dealer's spread out of the button ─────────────

interface CardPlace {
  x: number;
  y: number;
  rotate: number;
}

export interface HandLayout {
  cardW: number;
  cardH: number;
  cards: CardPlace[];
}

/** Horizontal step between neighbours, as a share of a card's width (the rest overlaps, like a spread deck). */
const STEP_X = 0.66;
/** Vertical climb per card, as a share of a card's height. */
const STEP_Y = 0.34;
/** Tilt of the card next to the deck and of the last one (degrees, leaning left). */
const TILT_NEAR = 3;
const TILT_FAR = 14;
/** Half-width of the deck (the 44 px button card) plus the strip a card stays tucked under it. */
const DECK_TUCK = 14;
const EDGE = 9;

/**
 * Cards spread like a croupier opening a deck: they slide out from under the button (the deck, bottom right, at
 * `ax`,`ay`) towards the left, each one a little higher and more tilted than the last. `cards[0]` lies farthest
 * left (reading order), the last next to the deck. Every card, tilted, keeps `EDGE` px from the sides and stays
 * below `top` (the phone's top bar).
 */
export function handLayout(n: number, w: number, ax: number, ay: number, top = 0): HandLayout {
  const tiltFar = (TILT_FAR * Math.PI) / 180;
  // Room from the deck to the left edge; the last card's tilt pushes its corner out by about a quarter of its width.
  const reach = Math.max(0, ax - DECK_TUCK - EDGE);
  const cardW = Math.round(Math.max(44, Math.min(80, reach / (1 + STEP_X * Math.max(0, n - 1) + 1.55 * Math.sin(tiltFar)))));
  const cardH = Math.round(cardW * 1.55);
  // With room to spare (a phone on its side) the cards spread wider and climb less; on a narrow phone they overlap
  // more and climb more, so each name still shows.
  const spare = n > 1 ? (reach - cardW * (1 + 1.55 * Math.sin(tiltFar))) / (n - 1) : 0;
  const stepX = Math.max(cardW * STEP_X, Math.min(cardW * 0.92, spare));
  const open = (stepX / cardW - STEP_X) / (0.92 - STEP_X);
  const bottom = ay + 28;
  const climb = Math.max(0, Math.min(cardH * STEP_Y * (1 - 0.6 * open) * (n - 1), bottom - cardH - top - 8));
  const cards = Array.from({ length: n }, (_, i) => {
    // k: 0 next to the deck … n-1 farthest left.
    const k = n - 1 - i;
    const t = n > 1 ? k / (n - 1) : 0;
    return {
      x: Math.min(w - EDGE - cardW / 2, ax - DECK_TUCK - cardW / 2 - k * stepX),
      // A touch steeper towards the end, like a ribbon spread curling up.
      y: bottom - cardH / 2 - climb * t * (0.7 + 0.3 * t),
      rotate: -(TILT_NEAR + (TILT_FAR - TILT_NEAR) * t),
    };
  });
  return { cardW, cardH, cards };
}
