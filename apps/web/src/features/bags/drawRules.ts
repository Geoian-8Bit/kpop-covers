import type { BagKind, DrawMode } from '@coverscape/shared';

/**
 * F13 · Pure rules of a bag: what can come out, in which order, and how the history reads. The server draws with
 * `draw_from_bag` (atomic, two phones can't take out the same item); the local demo draws with `drawOrder`, which
 * follows the same rules. No React, no storage — covered by `drawRules.test.ts`.
 */

/** «Sacar varios»: from 2 to 10 at once (the server never draws more than 10). */
export const MULTI_DRAW_MIN = 2;
export const MULTI_DRAW_MAX = 10;

export function clampDrawCount(count: number): number {
  if (!Number.isFinite(count)) return 1;
  return Math.min(MULTI_DRAW_MAX, Math.max(1, Math.round(count)));
}

export interface DrawCandidate {
  id: string;
  removed_at: string | null;
}

/** Fisher–Yates on a copy. `random` in [0, 1) (tests pass a seeded one). */
export function shuffle<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * What comes out of a draw, in order: only items still in the bag (not taken out), at random. «Sin repetir
 * seguidas» puts the item of the last draw at the very end, so it only comes out when nothing else is left —
 * the same ordering as the database function.
 */
export function drawOrder<T extends DrawCandidate>(
  items: readonly T[],
  opts: { count: number; noRepeat: boolean; lastItemId: string | null; random?: () => number },
): T[] {
  const inBag = items.filter((item) => item.removed_at == null);
  const mixed = shuffle(inBag, opts.random);
  if (opts.noRepeat && opts.lastItemId) {
    const at = mixed.findIndex((item) => item.id === opts.lastItemId);
    if (at >= 0) mixed.push(...mixed.splice(at, 1));
  }
  return mixed.slice(0, clampDrawCount(opts.count));
}

/** Whether a draw takes the item out: the one-off choice when given, else the bag's mode. */
export function drawRemoves(mode: DrawMode, override: boolean | null | undefined): boolean {
  return override ?? mode === 'remove';
}

/** «Sin repetir seguidas» only makes sense for bags that keep their items. */
export function effectiveNoRepeat(mode: DrawMode, noRepeat: boolean): boolean {
  return mode === 'keep' && noRepeat;
}

export const KIND_COPY: Record<
  BagKind,
  { label: string; one: string; many: string; removed: string; empty: string; glyph: string }
> = {
  songs: {
    label: 'Canciones',
    one: 'canción',
    many: 'canciones',
    removed: 'quitada',
    empty: 'Añade canciones de la biblioteca.',
    glyph: '曲',
  },
  clips: {
    label: 'Clips',
    one: 'clip',
    many: 'clips',
    removed: 'quitado',
    empty: 'Añade estribillos o tramos guardados como clips.',
    glyph: '帖',
  },
  people: {
    label: 'Personas',
    one: 'persona',
    many: 'personas',
    removed: 'quitada',
    empty: 'Añade a la gente del grupo.',
    glyph: '人',
  },
};

export const MODE_COPY: Record<DrawMode, { label: string; hint: string }> = {
  keep: { label: 'Se queda', hint: 'Vuelve a la bolsa y puede volver a salir.' },
  remove: { label: 'Se quita', hint: 'Sale de la bolsa hasta que la rellenes.' },
};

/** «3 canciones», «1 clip». */
export function countLabel(kind: BagKind, n: number): string {
  return `${n} ${n === 1 ? KIND_COPY[kind].one : KIND_COPY[kind].many}`;
}

const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });
const month = new Intl.DateTimeFormat('es-ES', { month: 'long' });

/**
 * The day of a draw as the history says it: «martes 14», with the month when it isn't this month's
 * («martes 14 de julio») and the year when it isn't this year's.
 */
export function historyDay(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  let day = `${weekday.format(at)} ${at.getDate()}`;
  if (at.getMonth() !== now.getMonth() || at.getFullYear() !== now.getFullYear())
    day += ` de ${month.format(at)}`;
  if (at.getFullYear() !== now.getFullYear()) day += ` de ${at.getFullYear()}`;
  return day;
}

/** «(quitada)» after a draw that took the item out; nothing when it stayed. */
export function historyState(kind: BagKind, removed: boolean): string {
  return removed ? `(${KIND_COPY[kind].removed})` : '';
}

/** One history line as plain text: «martes 14: salió Hype Boy (quitada)». */
export function historyLine(
  draw: { label: string; removed: boolean; drawn_at: string },
  kind: BagKind,
  now: Date = new Date(),
): string {
  const state = historyState(kind, draw.removed);
  return `${historyDay(draw.drawn_at, now)}: salió ${draw.label}${state ? ` ${state}` : ''}`;
}
