import type { TitleMode } from '@coverscape/shared';
import { shuffle } from '@/features/bags/drawRules';

/**
 * F14 · Pure rules of a Random Play Dance round: building it from a source, reordering a saved track, skipping
 * clips that are no longer available, and the timing of the pause and the countdown before each clip. No React,
 * no player — covered by `roundRules.test.ts`.
 */

export { shuffle };

export interface RoundOptions {
  /** How many clips the round takes from its source. */
  count: number;
  /** Silence between two clips, 0–5 s (the next one loads meanwhile). */
  pauseSeconds: number;
  /** 3, 2, 1 before each clip. */
  countdown: boolean;
  /** Play each clip with its saved mirror and speed (else: normal speed, this device's mirror). */
  useClipSettings: boolean;
  /** «before»: the title shows before it sounds; «after»: modo adivinar, it shows once it has been heard. */
  titleMode: TitleMode;
}

export const MAX_ROUND = 50;
export const PAUSE_MAX = 5;
export const COUNTDOWN_SECONDS = 3;
/** Modo adivinar: the title appears after this long sounding (or halfway through a shorter clip). */
export const GUESS_REVEAL_SECONDS = 4;

export const DEFAULT_ROUND_OPTIONS: RoundOptions = {
  count: 8,
  pauseSeconds: 2,
  countdown: true,
  useClipSettings: true,
  titleMode: 'before',
};

/** Pause in half seconds within 0–5 (the database keeps one decimal and checks the range). */
export function clampPause(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_ROUND_OPTIONS.pauseSeconds;
  return Math.min(PAUSE_MAX, Math.max(0, Math.round(seconds * 2) / 2));
}

export function clampCount(count: number, available = MAX_ROUND): number {
  const top = Math.max(1, Math.min(MAX_ROUND, available));
  if (!Number.isFinite(count)) return Math.min(DEFAULT_ROUND_OPTIONS.count, top);
  return Math.min(top, Math.max(1, Math.round(count)));
}

/** Whatever came from storage or a form → valid options. */
export function sanitizeOptions(raw: Partial<RoundOptions> | null | undefined): RoundOptions {
  const o = raw ?? {};
  return {
    count: clampCount(Number(o.count ?? DEFAULT_ROUND_OPTIONS.count)),
    pauseSeconds: clampPause(Number(o.pauseSeconds ?? DEFAULT_ROUND_OPTIONS.pauseSeconds)),
    countdown: o.countdown ?? DEFAULT_ROUND_OPTIONS.countdown,
    useClipSettings: o.useClipSettings ?? DEFAULT_ROUND_OPTIONS.useClipSettings,
    titleMode: o.titleMode === 'after' ? 'after' : 'before',
  };
}

/** A saved track's options, from its row. */
export function optionsFromTrack(
  track: {
    pause_seconds: number;
    countdown: boolean;
    use_clip_settings: boolean;
    title_mode: string;
  },
  count: number,
): RoundOptions {
  return sanitizeOptions({
    count,
    pauseSeconds: Number(track.pause_seconds),
    countdown: track.countdown,
    useClipSettings: track.use_clip_settings,
    titleMode: track.title_mode === 'after' ? 'after' : 'before',
  });
}

/**
 * Reorders so that two neighbours never share a key (the same song twice in a row) whenever that is possible.
 * Greedy swaps forward, then moves any leftover clash to the first slot where it fits. Keeps every element.
 */
export function spreadBy<T>(list: readonly T[], key: (item: T) => string): T[] {
  const out = [...list];
  for (let i = 1; i < out.length; i++) {
    if (key(out[i]!) !== key(out[i - 1]!)) continue;
    const j = out.findIndex((item, k) => k > i && key(item) !== key(out[i - 1]!));
    if (j > i) [out[i], out[j]] = [out[j]!, out[i]!];
  }
  for (let guard = 0; guard < out.length * out.length; guard++) {
    const i = out.findIndex((item, k) => k > 0 && key(item) === key(out[k - 1]!));
    if (i < 0) break;
    const [moved] = out.splice(i, 1);
    const k = key(moved!);
    let slot = -1;
    for (let p = 0; p <= out.length; p++) {
      const before = p > 0 ? key(out[p - 1]!) : null;
      const after = p < out.length ? key(out[p]!) : null;
      if (before !== k && after !== k) {
        slot = p;
        break;
      }
    }
    if (slot < 0) {
      out.splice(i, 0, moved!);
      break;
    }
    out.splice(slot, 0, moved!);
  }
  return out;
}

export interface RoundClip {
  id: string;
  video_id: string;
}

/** Where a round's clips come from. */
export type RoundSource =
  | { kind: 'bag'; bagId: string }
  | { kind: 'manual'; clipIds: string[] }
  | { kind: 'songs'; videoIds: string[] };

/** The clips a source offers (each once), from everything the group has. */
export function clipsForSource<T extends RoundClip>(
  source: RoundSource,
  all: readonly T[],
  bagClipIds: readonly string[] = [],
): T[] {
  const byId = new Map(all.map((clip) => [clip.id, clip]));
  const pick = (ids: readonly string[]) =>
    [...new Set(ids)].map((id) => byId.get(id)).filter((clip): clip is T => clip != null);
  if (source.kind === 'bag') return pick(bagClipIds);
  if (source.kind === 'manual') return pick(source.clipIds);
  const songs = new Set(source.videoIds);
  return all.filter((clip) => songs.has(clip.video_id));
}

/** A new round: the pool at random, the same song never twice in a row when it can be helped, `count` long. */
export function buildRound<T extends RoundClip>(
  pool: readonly T[],
  count: number,
  random: () => number = Math.random,
): T[] {
  const unique = [...new Map(pool.map((clip) => [clip.id, clip])).values()];
  const taken = shuffle(unique, random).slice(0, clampCount(count, unique.length));
  return spreadBy(taken, (clip) => clip.video_id);
}

/** Moves one element (drag, or the up/down buttons). Out-of-range moves return the list unchanged. */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const out = [...list];
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved!);
  return out;
}

/** After a reorder: the positions to write (0…n−1 in list order), only for the rows that changed. */
export function positionPatches(
  items: readonly { id: string; position: number }[],
): { id: string; position: number }[] {
  return items.flatMap((item, index) => (item.position === index ? [] : [{ id: item.id, position: index }]));
}

/** First playable index at or after `from` (archived clips are «no disponible» and skipped); -1 when none. */
export function nextPlayable(available: readonly boolean[], from: number): number {
  for (let i = Math.max(0, from); i < available.length; i++) if (available[i]) return i;
  return -1;
}

/** The playable one after the current one (for «Siguiente»); -1 at the end. */
export function followingPlayable(available: readonly boolean[], current: number): number {
  return nextPlayable(available, current + 1);
}

// ───────────── Timing ─────────────

export interface LeadIn {
  pauseMs: number;
  countdownMs: number;
}

/** Before a clip: the pause (not before the first one, nor when repeating) and then the countdown. */
export function leadIn(
  options: Pick<RoundOptions, 'pauseSeconds' | 'countdown'>,
  withPause: boolean,
): LeadIn {
  return {
    pauseMs: withPause ? clampPause(options.pauseSeconds) * 1000 : 0,
    countdownMs: options.countdown ? COUNTDOWN_SECONDS * 1000 : 0,
  };
}

export type LeadPhase = 'pause' | 'countdown' | 'go';

export interface LeadStatus {
  phase: LeadPhase;
  /** 3, 2, 1 during the countdown; null otherwise. */
  count: number | null;
  /** Until this phase ends. */
  remainingMs: number;
}

/** Where the lead-in is after `elapsedMs`. */
export function leadStatus(elapsedMs: number, lead: LeadIn): LeadStatus {
  const t = Math.max(0, elapsedMs);
  if (t < lead.pauseMs) return { phase: 'pause', count: null, remainingMs: lead.pauseMs - t };
  const c = t - lead.pauseMs;
  if (c < lead.countdownMs) {
    const remainingMs = lead.countdownMs - c;
    return { phase: 'countdown', count: Math.ceil(remainingMs / 1000), remainingMs };
  }
  return { phase: 'go', count: null, remainingMs: 0 };
}

/**
 * When a clip counts as finished: a hair before its end (the engine reports in frames), and never later than just
 * before the song's own end, where YouTube would show its end screen or a whole-song loop would jump to 0.
 */
export function clipEndAt(end: number, duration: number): number {
  const hardEnd = duration > 1 ? Math.min(end, duration - 0.35) : end;
  return hardEnd - 0.06;
}

/** Whether the title is on screen. Modo adivinar hides it until the clip has sounded a while. */
export function titleShown(
  mode: TitleMode,
  playing: boolean,
  playedSeconds: number,
  clipSeconds: number,
): boolean {
  if (mode === 'before') return true;
  if (!playing) return false;
  return playedSeconds >= Math.min(GUESS_REVEAL_SECONDS, Math.max(0.5, clipSeconds / 2));
}

// ───────────── Playback state machine ─────────────

export type RoundPhase = 'idle' | 'lead' | 'play' | 'done';

export interface RoundState {
  phase: RoundPhase;
  /** Index into the round's list (-1 before starting or once done). */
  index: number;
  /** performance.now() when the current lead-in started (shifted forward by any pause). */
  leadStart: number;
  lead: LeadIn;
  /** Paused by the user: when, so the lead-in can resume where it was. */
  pausedAt: number | null;
  /** How many clips have been played (or started) in this round. */
  played: number;
}

export type RoundAction =
  | { type: 'start'; now: number }
  | { type: 'advance'; now: number }
  | { type: 'repeat'; now: number }
  | { type: 'go' }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'finish' };

export const IDLE_ROUND: RoundState = {
  phase: 'idle',
  index: -1,
  leadStart: 0,
  lead: { pauseMs: 0, countdownMs: 0 },
  pausedAt: null,
  played: 0,
};

/**
 * The round as a reducer: start → (lead-in → play)… → done. Unavailable clips are skipped on the way; a user pause
 * freezes the lead-in clock. `go` is sent by the screen once the lead-in is over and the clip is loaded.
 */
export function roundReducer(
  state: RoundState,
  action: RoundAction,
  ctx: { available: readonly boolean[]; options: Pick<RoundOptions, 'pauseSeconds' | 'countdown'> },
): RoundState {
  const toLead = (index: number, now: number, withPause: boolean): RoundState =>
    index < 0
      ? { ...state, phase: 'done', index: -1, pausedAt: null }
      : {
          ...state,
          phase: 'lead',
          index,
          leadStart: now,
          lead: leadIn(ctx.options, withPause),
          pausedAt: null,
        };

  switch (action.type) {
    case 'start':
      return { ...toLead(nextPlayable(ctx.available, 0), action.now, false), played: 0 };
    case 'advance':
      if (state.phase === 'idle' || state.phase === 'done') return state;
      return toLead(followingPlayable(ctx.available, state.index), action.now, true);
    case 'repeat':
      if (state.index < 0 || state.phase === 'done' || state.phase === 'idle') return state;
      return toLead(state.index, action.now, false);
    case 'go':
      return state.phase === 'lead'
        ? { ...state, phase: 'play', pausedAt: null, played: state.played + 1 }
        : state;
    case 'pause':
      if (state.pausedAt != null || (state.phase !== 'lead' && state.phase !== 'play')) return state;
      return { ...state, pausedAt: action.now };
    case 'resume': {
      if (state.pausedAt == null) return state;
      const held = action.now - state.pausedAt;
      return {
        ...state,
        pausedAt: null,
        leadStart: state.phase === 'lead' ? state.leadStart + held : state.leadStart,
      };
    }
    case 'finish':
      return { ...state, phase: 'done', index: -1, pausedAt: null };
  }
}

/** The lead-in as seen at `now` (frozen while paused). */
export function roundLeadStatus(state: RoundState, now: number): LeadStatus | null {
  if (state.phase !== 'lead') return null;
  const at = state.pausedAt ?? now;
  return leadStatus(at - state.leadStart, state.lead);
}
