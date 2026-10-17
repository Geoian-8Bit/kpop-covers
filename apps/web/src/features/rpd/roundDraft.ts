import { create } from 'zustand';
import {
  DEFAULT_ROUND_OPTIONS,
  DEFAULT_ROUND_SETUP,
  sanitizeOptions,
  sanitizeSetup,
  type RoundOptions,
  type RoundSetup,
} from './roundRules';

/**
 * The round on its way to the screen: the clips in order and the options. Not playback state (that is the
 * player's, in `player/store.ts`): just which list «Empezar» plays. Kept for this tab, so a reload doesn't lose it.
 */
export interface RoundDraft {
  clipIds: string[];
  options: RoundOptions;
  /** The saved track it came from (to save over it), if any. */
  trackId: string | null;
  /** Where the clips came from, to say it on screen («Bolsa “Calentar”», «Pista …»). */
  from: string;
  /** Bumped by «Volver a mezclar»: the round starts over even when the new order happens to be the same. */
  mix?: number;
}

const KEY = 'oneshoot.rpd.round.v1';

function read(): RoundDraft | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as Partial<RoundDraft> | null;
    if (!raw || !Array.isArray(raw.clipIds)) return null;
    return {
      clipIds: raw.clipIds.filter((id): id is string => typeof id === 'string'),
      options: sanitizeOptions(raw.options),
      trackId: typeof raw.trackId === 'string' ? raw.trackId : null,
      from: typeof raw.from === 'string' ? raw.from : '',
      mix: typeof raw.mix === 'number' && Number.isFinite(raw.mix) ? raw.mix : 0,
    };
  } catch {
    return null;
  }
}

function write(draft: RoundDraft | null) {
  try {
    if (draft) sessionStorage.setItem(KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: this visit only */
  }
}

export const useRoundDraft = create<{ draft: RoundDraft | null }>(() => ({ draft: read() }));

export function setRoundDraft(draft: RoundDraft | null): void {
  useRoundDraft.setState({ draft });
  write(draft);
}

// ── The last «Nueva ronda» setup (source and options), remembered on this device across visits ──

const SETUP_KEY = 'oneshoot.rpd.setup.v1';

export function readRoundSetup(): RoundSetup {
  try {
    return sanitizeSetup(JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null'));
  } catch {
    return DEFAULT_ROUND_SETUP;
  }
}

export function writeRoundSetup(setup: RoundSetup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    /* private mode or full: the defaults next time */
  }
}

export function newDraft(
  clipIds: string[],
  options: Partial<RoundOptions> = {},
  from = '',
  trackId: string | null = null,
): RoundDraft {
  return {
    clipIds,
    options: sanitizeOptions({ ...DEFAULT_ROUND_OPTIONS, ...options, count: clipIds.length || 1 }),
    trackId,
    from,
  };
}
