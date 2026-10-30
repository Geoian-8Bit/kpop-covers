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

// ───────────── Hanafuda: a hand of cards above the button ─────────────

export interface CardPlace {
  x: number;
  y: number;
  rotate: number;
}

export interface HandLayout {
  cardW: number;
  cardH: number;
  cards: CardPlace[];
}

/**
 * Cards spread like a hand of playing cards on a wide arc, across the screen and just above the button's top edge
 * (`buttonTop`). Every card keeps at least 10 px from the sides.
 */
export function handLayout(n: number, w: number, buttonTop: number): HandLayout {
  // Seven cards or more (six sections and «¿Quién eres?»): a touch narrower and a flatter arc, because a tilted card's
  // bottom slides under its neighbour and would hide the end of its label («Biblioteca», «Calendario»).
  const crowded = n >= 7;
  const cardW = Math.round(Math.max(56, Math.min(80, (w - 24) / (n * (crowded ? 0.9 : 0.86)))));
  const cardH = Math.round(cardW * 1.6);
  const radius = crowded ? 900 : 560;
  const span = Math.max(0, w - 20 - cardW);
  const step = n > 1 ? Math.min(span / (n - 1), cardW * 0.94) : 0;
  const cx = w / 2;
  const baseY = buttonTop - 16 - cardH / 2;
  const cards = Array.from({ length: n }, (_, i) => {
    const offset = (i - (n - 1) / 2) * step;
    const angle = Math.asin(Math.max(-1, Math.min(1, offset / radius)));
    return {
      x: cx + radius * Math.sin(angle),
      y: baseY + radius * (1 - Math.cos(angle)),
      rotate: (angle * 180) / Math.PI,
    };
  });
  return { cardW, cardH, cards };
}
