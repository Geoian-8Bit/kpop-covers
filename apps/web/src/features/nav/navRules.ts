/**
 * P1 · Pure rules of the phone's quick menu (covered by `navRules.test.ts`): where you are, when the button hides,
 * and the geometry of the four prototypes. No React, no DOM.
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

const rad = (deg: number) => (deg * Math.PI) / 180;

/** A point at `r` from (cx, cy), `deg` clockwise from straight up. */
export function polar(cx: number, cy: number, r: number, deg: number): { x: number; y: number } {
  return { x: cx + r * Math.sin(rad(deg)), y: cy - r * Math.cos(rad(deg)) };
}

// ───────────── Sensu: a quarter-circle fan from the corner ─────────────

export interface SensuGeometry {
  /** Outer radius of the leaf. */
  r: number;
  /** Inner radius (clear of the button). */
  r0: number;
  /** Width of each stick's wedge, in degrees. */
  wedge: number;
  /** Centre angle of each stick (−90 = to the left, 0 = straight up). */
  angles: number[];
  /** Too small for icon + name: name only. */
  compact: boolean;
}

/**
 * The fan opens up and to the left of the button at (ax, ay), filling a quarter circle (−90° to 0°). Its radius is
 * as long as fits: `top` px are kept clear above (the top bar), 10 px on the left.
 */
export function sensuGeometry(n: number, ax: number, ay: number, top: number): SensuGeometry {
  const room = Math.min(ax - 10, ay - top);
  const r = Math.round(Math.max(170, Math.min(310, room)));
  const wedge = 90 / Math.max(1, n);
  const angles = Array.from({ length: n }, (_, i) => -90 + wedge * (i + 0.5));
  return { r, r0: 64, wedge, angles, compact: r < 250 };
}

/** CSS `polygon()` of a wedge pointing up, in a 2r × r box whose bottom centre is the fan's rivet. */
export function wedgePolygon(r: number, r0: number, wedge: number, steps = 6): string {
  const half = wedge / 2;
  const points: string[] = [];
  const at = (radius: number, deg: number) => {
    const p = polar(r, r, radius, deg);
    return `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`;
  };
  for (let k = 0; k <= steps; k++) points.push(at(r, -half + (wedge * k) / steps));
  for (let k = steps; k >= 0; k--) points.push(at(r0, -half + (wedge * k) / steps));
  return `polygon(${points.join(', ')})`;
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
  const cardW = Math.round(Math.max(56, Math.min(80, (w - 24) / (n * 0.86))));
  const cardH = Math.round(cardW * 1.6);
  const radius = 560;
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

// ───────────── Kakejiku: a hanging scroll that unrolls upwards from the button ─────────────

/** Top rod (hassō) of the scroll, px. It travels up while the scroll unrolls. */
export const KAKEJIKU_ROD = 14;
/** Bottom roller (jiku) with its knobs, px. It stays just above the button. */
export const KAKEJIKU_ROLLER = 18;
/** Brocade strip (ichimonji) above and below the writing, px. */
export const KAKEJIKU_BAND = 10;
/** Space before «¿Quién eres?», the last line, px. */
export const KAKEJIKU_GAP = 6;
/** Rows of the writing: roomy when they fit, never under the 44 px touch target. */
export const KAKEJIKU_ROWS = [52, 44] as const;

export interface KakejikuLayout {
  /** Height of each line (one destination), px. */
  rowH: number;
  /** Height of the whole paper (bands, lines and the gap), px. */
  paperH: number;
  /** Height of the paper shown: `paperH`, or less when it has to scroll. */
  viewH: number;
  scrolls: boolean;
}

/**
 * The paper between the rod and the roller, above the button (`buttonTop`, 12 px gap), keeping `top` px clear above.
 * Tall lines when they fit, then 44 px lines; when even those don't (landscape, a page zoomed by large system text)
 * the scroll may reach 8 px from the top and its paper scrolls rather than going off screen.
 */
export function kakejikuLayout(n: number, buttonTop: number, top: number): KakejikuLayout {
  const frame = KAKEJIKU_ROD + KAKEJIKU_ROLLER;
  const paper = (rowH: number) => 2 * KAKEJIKU_BAND + n * rowH + KAKEJIKU_GAP;
  const room = buttonTop - 12 - top - frame;
  for (const rowH of KAKEJIKU_ROWS) {
    const paperH = paper(rowH);
    if (paperH <= room) return { rowH, paperH, viewH: paperH, scrolls: false };
  }
  const rowH = KAKEJIKU_ROWS[KAKEJIKU_ROWS.length - 1];
  const paperH = paper(rowH);
  // Never past 8 px from the top, rod and cord included, however zoomed: at worst one line shows and it scrolls.
  const viewH = Math.min(paperH, Math.max(rowH, buttonTop - 12 - 8 - frame));
  return { rowH, paperH, viewH, scrolls: viewH < paperH };
}

// ───────────── Rueda de kamon: a dial turned with the thumb ─────────────

export interface DialConfig {
  /** Degrees between two entries on the rim. */
  step: number;
  /** Screen angle of the golden notch. */
  notch: number;
  count: number;
}

/** Dial rotation that puts entry `index` in the notch. */
export function dialRotationFor(index: number, { step, notch }: DialConfig): number {
  return notch - index * step;
}

/** The entry closest to the notch for a rotation, within range. */
export function dialIndexAt(rotation: number, { step, notch, count }: DialConfig): number {
  const raw = Math.round((notch - rotation) / step);
  return Math.max(0, Math.min(count - 1, raw));
}

/** Past either end the dial resists (rubber band) instead of turning freely. */
export function clampDial(rotation: number, config: DialConfig, give = 0.3): number {
  const max = dialRotationFor(0, config);
  const min = dialRotationFor(config.count - 1, config);
  if (rotation > max) return max + (rotation - max) * give;
  if (rotation < min) return min + (rotation - min) * give;
  return rotation;
}

/** Angle (degrees, clockwise from up) of a pointer around the dial's centre. */
export function pointerAngle(cx: number, cy: number, x: number, y: number): number {
  return (Math.atan2(x - cx, cy - y) * 180) / Math.PI;
}

/** Shortest signed difference between two angles, in (−180, 180]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** The dial's ring radius: as large as fits in the quarter it shows, `top` px kept clear above. */
export function dialRadius(ax: number, ay: number, top: number): number {
  return Math.round(Math.max(140, Math.min(230, Math.min(ax - 40, ay - top - 40) * 0.72)));
}

export interface DialStepPlaces {
  /** Centre of «Sección anterior» (the entry before the notch sits counter-clockwise). */
  prev: { x: number; y: number };
  /** Centre of «Sección siguiente» (clockwise). */
  next: { x: number; y: number };
}

/**
 * The two 44 px step buttons that turn the dial one entry with a single tap (no circular drag needed): just outside
 * the seal's rim, either side of the notch, so each sits on the side the dial turns towards. Kept `size / 2 + 4` px
 * inside the stage (w × h) so neither is ever cut off.
 */
export function dialStepPlaces(
  ax: number,
  ay: number,
  discR: number,
  notch: number,
  w: number,
  h: number,
  size = 44,
  spread = 11,
): DialStepPlaces {
  const reach = discR + size / 2 + 6;
  const margin = size / 2 + 4;
  const keep = ({ x, y }: { x: number; y: number }) => ({
    x: Math.max(margin, Math.min(w - margin, x)),
    y: Math.max(margin, Math.min(h - margin, y)),
  });
  return {
    prev: keep(polar(ax, ay, reach, notch - spread)),
    next: keep(polar(ax, ay, reach, notch + spread)),
  };
}
