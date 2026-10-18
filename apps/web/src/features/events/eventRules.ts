/**
 * F16 · Pure rules of the events: the countdown on the home page, which event it shows, the date fields of the
 * form and what the connections (bag of candidates, track of choruses) take from the repertoire. Local time
 * zone throughout (the phone's): «Hoy» is today on this phone's calendar. Covered by `eventRules.test.ts`.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** After it starts, an event keeps showing for a day; then it drops off the home on its own (nothing is deleted). */
export const SHOWN_AFTER_START_MS = DAY;

export const EVENT_NAME_MAX = 80;
export const EVENT_PLACE_MAX = 120;
/** event_songs.position goes 0–999. */
export const REPERTOIRE_MAX = 1000;

export type Countdown =
  /** A later day: «Faltan 12 días» (calendar days, not 24-hour blocks). */
  | { kind: 'days'; days: number; ms: number }
  /** Less than a day left but not today yet (tomorrow early): hours and minutes. */
  | { kind: 'hours'; hours: number; minutes: number; ms: number }
  /** The day of the event (before or after it starts). */
  | { kind: 'today'; started: boolean; hours: number; minutes: number; ms: number }
  /** It already happened, less than a day ago, on an earlier day. */
  | { kind: 'recent'; ms: number }
  /** Over: no longer shown. */
  | { kind: 'past'; ms: number };

/** Whole calendar days from `a` to `b` on this phone's calendar (a DST change never makes a day count twice). */
export function calendarDaysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY);
}

function hoursMinutes(ms: number): { hours: number; minutes: number } {
  // Rounded up to the minute: «Faltan 0 min» would read as «ya».
  const total = Math.max(0, Math.ceil(ms / MINUTE));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export function countdown(startsAt: Date | string, now: Date): Countdown {
  const start = typeof startsAt === 'string' ? new Date(startsAt) : startsAt;
  const ms = start.getTime() - now.getTime();
  const days = calendarDaysBetween(now, start);
  if (days === 0) return { kind: 'today', started: ms <= 0, ...hoursMinutes(ms), ms };
  if (ms > 0) {
    if (ms < DAY) return { kind: 'hours', ...hoursMinutes(ms), ms };
    return { kind: 'days', days, ms };
  }
  return -ms < SHOWN_AFTER_START_MS ? { kind: 'recent', ms } : { kind: 'past', ms };
}

/** Still on the home page: to come, today, or started less than a day ago. */
export function isShown(startsAt: Date | string, now: Date): boolean {
  return countdown(startsAt, now).kind !== 'past';
}

/** An event that has started stays ahead of the next one for this long (it's on now); then the next one shows. */
export const LIVE_FOR_MS = 3 * HOUR;

/**
 * The event the home page counts down to:
 *  1. one that started less than 3 h ago (it's on now; the latest start if several);
 *  2. else the nearest one still to come;
 *  3. else, while nothing is coming, the latest one that started less than a day ago («Hoy» / «Ayer»).
 */
export function nearestEvent<T extends { starts_at: string }>(events: readonly T[], now: Date): T | null {
  let live: T | null = null;
  let next: T | null = null;
  let leftover: T | null = null;
  const t = now.getTime();
  for (const event of events) {
    const start = Date.parse(event.starts_at);
    if (Number.isNaN(start) || countdown(event.starts_at, now).kind === 'past') continue;
    const later = (other: T | null) => !other || start > Date.parse(other.starts_at);
    if (start > t) {
      if (!next || start < Date.parse(next.starts_at)) next = event;
    } else if (t - start < LIVE_FOR_MS) {
      if (later(live)) live = event;
    } else if (later(leftover)) {
      leftover = event;
    }
  }
  return live ?? next ?? leftover;
}

/** Upcoming first (soonest on top), then the past ones (latest on top). */
export function splitEvents<T extends { starts_at: string }>(
  events: readonly T[],
  now: Date,
): { upcoming: T[]; past: T[] } {
  const upcoming = events.filter((e) => isShown(e.starts_at, now)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = events.filter((e) => !isShown(e.starts_at, now)).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return { upcoming, past };
}

// ───────────── Words ─────────────

/** The big line: «Faltan 12 días», «Falta 1 día», «Faltan 3 h 20 min», «Hoy», «Ayer», «Ya pasó». */
export function countdownHeadline(c: Countdown): string {
  switch (c.kind) {
    case 'days':
      return c.days === 1 ? 'Falta 1 día' : `Faltan ${c.days} días`;
    case 'hours':
      return `Faltan ${durationWords(c.hours, c.minutes)}`;
    case 'today':
      return 'Hoy';
    case 'recent':
      return 'Ayer';
    case 'past':
      return 'Ya pasó';
  }
}

/** The small line under it (only where it adds something): today, how long until it starts. */
export function countdownDetail(c: Countdown): string | null {
  if (c.kind === 'today') return c.started ? 'Ya ha empezado' : `Empieza en ${durationWords(c.hours, c.minutes)}`;
  if (c.kind === 'days' && c.days === 1) return 'Es mañana';
  return null;
}

export function durationWords(hours: number, minutes: number): string {
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

/** «sábado 12 de diciembre · 20:00» on this phone's calendar. */
export function eventDateLabel(startsAt: string, withYear = false): string {
  const date = new Date(startsAt);
  const day = date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  });
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}`;
}

// ───────────── Long countdown → lanterns ─────────────

/** Chōchin covers the last seven days: six days before (one lantern lit) up to the day itself (all seven). */
export const LANTERN_DAYS = 7;

/**
 * Which design the countdown wears: `long` (Tsuki, the moon filling up) while seven or more
 * calendar days are left, then `lanterns` (Chōchin) from six days before, when the first lantern lights up. Calendar
 * days on this phone, so a DST change or the time zone never moves the switch to another day.
 */
export type CountdownStage = 'long' | 'lanterns';

export function countdownStage(c: Countdown): CountdownStage {
  return c.kind === 'days' && c.days >= LANTERN_DAYS ? 'long' : 'lanterns';
}

/**
 * The switch to the lanterns is shown as the first lantern lighting up: when the countdown crosses into the last
 * week while on screen, or when it is first painted on that first day (six days left).
 */
export function ignitesFirstLantern(c: Countdown, previous: CountdownStage | null): boolean {
  if (countdownStage(c) !== 'lanterns') return false;
  if (previous === 'long') return true;
  return previous === null && c.kind === 'days' && c.days === LANTERN_DAYS - 1;
}

// ───────────── Tsuki (moon phases) ─────────────

/**
 * Tsuki: a lunar month of waiting. The moon is a first thin crescent 35 days before or more and full a week before
 * (then Chōchin).
 */
export const MOON_SPAN_DAYS = 28;
/** The least the current moon is lit: never a dark row, however far the event is (P39, the problem Chōchin had). */
export const MOON_MIN_ILLUMINATION = 0.1;
/** Moons in the row: new, three waxing steps, half, gibbous, full. */
export const MOON_COUNT = 7;

/**
 * Tsuki: how full the moon is (`MOON_MIN_ILLUMINATION`, a thin crescent → 1 full) with `days` calendar days left,
 * and which moon of the row it is (0 … MOON_COUNT − 1). Full at `LANTERN_DAYS`, the last day of the long countdown.
 */
export function moonPhase(days: number): { illumination: number; index: number } {
  const progress = Math.max(0, Math.min(1, 1 - (days - LANTERN_DAYS) / MOON_SPAN_DAYS));
  const illumination = MOON_MIN_ILLUMINATION + (1 - MOON_MIN_ILLUMINATION) * progress;
  return { illumination, index: Math.round(progress * (MOON_COUNT - 1)) };
}

/**
 * SVG path of the lit part of a waxing moon (lit on the right), `illumination` 0 → 1. The right half-circle, then
 * back along the terminator: an ellipse that bulges right while a crescent, left once past half.
 */
export function moonLitPath(cx: number, cy: number, r: number, illumination: number): string {
  const f = Math.max(0, Math.min(1, illumination));
  if (f === 0) return '';
  const rx = Math.abs(1 - 2 * f) * r;
  const sweep = f < 0.5 ? 0 : 1;
  const n = (v: number) => Math.round(v * 100) / 100;
  return `M${n(cx)} ${n(cy - r)} A${n(r)} ${n(r)} 0 0 1 ${n(cx)} ${n(cy + r)} A${n(rx)} ${n(r)} 0 0 ${sweep} ${n(cx)} ${n(cy - r)} Z`;
}

// ───────────── The lanterns (Chōchin) ─────────────

/**
 * How many of the seven lanterns are lit: none while it's more than a week away, one more per day of the last
 * week (six the day before), all on the day and the day after, none when over.
 */
export function litLanterns(c: Countdown): number {
  switch (c.kind) {
    case 'days':
      return Math.max(0, Math.min(6, 7 - c.days));
    case 'hours':
      return 6;
    case 'today':
    case 'recent':
      return 7;
    case 'past':
      return 0;
  }
}

// ───────────── Form ─────────────

const pad = (n: number) => String(n).padStart(2, '0');

/** An ISO instant → the value of a `datetime-local` input on this phone ('2026-12-12T20:00'). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A `datetime-local` value (local wall time) → ISO instant; null when it isn't a real date. */
export function fromLocalInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi);
  // 31 February rolls over to March: refuse instead of moving the date.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date.toISOString();
}

/** A sensible default for a new event: next Saturday at 19:00. */
export function defaultEventStart(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 19, 0);
  const ahead = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + ahead);
  return toLocalInput(d.toISOString());
}

export interface EventDraft {
  name: string;
  when: string;
  place: string;
}

export type DraftCheck =
  | { ok: true; row: { name: string; starts_at: string; place: string | null } }
  | { ok: false; field: 'name' | 'when' | 'place'; message: string };

export function checkEventDraft(draft: EventDraft): DraftCheck {
  const name = draft.name.trim();
  if (!name) return { ok: false, field: 'name', message: 'Ponle un nombre.' };
  if (name.length > EVENT_NAME_MAX) return { ok: false, field: 'name', message: `Máximo ${EVENT_NAME_MAX} letras.` };
  const startsAt = fromLocalInput(draft.when);
  if (!startsAt) return { ok: false, field: 'when', message: 'Elige el día y la hora.' };
  const place = draft.place.trim();
  if (place.length > EVENT_PLACE_MAX) return { ok: false, field: 'place', message: `Máximo ${EVENT_PLACE_MAX} letras.` };
  return { ok: true, row: { name, starts_at: startsAt, place: place || null } };
}

// ───────────── Connections ─────────────

/** `base`, or `base (2)`, `base (3)`… so it doesn't clash with a taken name (case-insensitive), within `max`. */
export function uniqueName(base: string, taken: readonly string[], max: number): string {
  const used = new Set(taken.map((n) => n.trim().toLowerCase()));
  const clean = base.trim().slice(0, max).trim();
  if (!used.has(clean.toLowerCase())) return clean;
  for (let i = 2; i < 1000; i++) {
    const suffix = ` (${i})`;
    const name = `${clean.slice(0, max - suffix.length).trim()}${suffix}`;
    if (!used.has(name.toLowerCase())) return name;
  }
  return clean;
}

const CHORUS_WORDS = new Set(['estribillo', 'estribillos', 'chorus', 'coro', 'coros', 'hook']);
const NOT_CHORUS_BEFORE = new Set(['pre', 'post']);

/**
 * A clip named as a chorus: one of the words on its own («Estribillo final», «Coro 2», «Chorus»), never right after
 * pre/post («Pre-estribillo», «Post-chorus») nor inside another word («Hooked»).
 */
export function isChorusName(name: string): boolean {
  const words = name.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return words.some((w, i) => CHORUS_WORDS.has(w) && !NOT_CHORUS_BEFORE.has(words[i - 1] ?? ''));
}

/**
 * «Crear pista con los estribillos»: per song of the repertoire, in its order, the clips named as a chorus
 * (estribillo, chorus, coro, hook); a song whose clips aren't named so gives all of them. By start time.
 */
export function chorusClips<C extends { id: string; video_id: string; name: string; start_seconds: number }>(
  songIds: readonly string[],
  clips: readonly C[],
): C[] {
  return songIds.flatMap((videoId) => {
    const own = clips.filter((c) => c.video_id === videoId).sort((a, b) => a.start_seconds - b.start_seconds);
    const named = own.filter((c) => isChorusName(c.name));
    return named.length ? named : own;
  });
}

/** The positions for songs appended after the current repertoire (0–999). */
export function appendPositions(current: readonly { position: number }[], count: number): number[] {
  const from = current.reduce((m, s) => Math.max(m, s.position + 1), 0);
  return Array.from({ length: count }, (_, i) => from + i);
}
