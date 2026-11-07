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

/** Gap between neighbouring cards (px): they lie side by side, never over each other's names. */
const GAP = 4;
/** Half of the deck (the 56 px button) and the margin kept from the screen's sides. */
const DECK_HALF = 28;
const EDGE = 6;
const MAX_W = 80;
/** Narrower than this, the row can't sit beside the deck: it lies just above it, across the screen. */
const MIN_BESIDE = 60;

/**
 * Cards spread like a croupier sliding a deck open on the table: a straight horizontal row, no tilt, coming out of
 * the button (the deck, bottom right, at `ax`,`ay`) towards the left. With room (a phone on its side) the row lies
 * level with the deck, beside it; on a narrow phone it lies just above it, its right edge flush with the deck's.
 * `cards[0]` lies farthest left (reading order), the last next to the deck. Every card keeps `EDGE` px from the
 * sides and stays below `top` (the phone's top bar).
 */
export function handLayout(n: number, w: number, ax: number, ay: number, top = 0): HandLayout {
  const count = Math.max(1, n);
  const fit = (room: number) => (room - GAP * (count - 1)) / count;
  const besideW = fit(ax - DECK_HALF - GAP - EDGE);
  const beside = besideW >= MIN_BESIDE;
  const right = beside ? ax - DECK_HALF - GAP : Math.min(w - EDGE, ax + DECK_HALF);
  const cardW = Math.floor(Math.max(36, Math.min(MAX_W, beside ? besideW : fit(right - EDGE))));
  // Narrow cards (a phone upright) drop the icon and give the name two lines: a taller card holds them.
  const cardH = Math.round(cardW * (cardW < 66 ? 1.8 : 1.7));
  const y = beside
    ? Math.max(top + cardH / 2 + 8, ay + DECK_HALF - cardH / 2)
    : Math.max(top + cardH / 2 + 8, ay - DECK_HALF - 10 - cardH / 2);
  const cards = Array.from({ length: n }, (_, i) => {
    // k: 0 next to the deck … n-1 farthest left.
    const k = n - 1 - i;
    return { x: right - cardW / 2 - k * (cardW + GAP), y, rotate: 0 };
  });
  return { cardW, cardH, cards };
}
