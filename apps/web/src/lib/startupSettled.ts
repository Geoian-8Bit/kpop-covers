import { MARK_LIBRARY_PAINTED, MARK_PLAYER_READY, MARK_PREFIX } from './perfProbe';

/**
 * REQ-10 · «The first screen is done»: the page has loaded, the screen's own first data is on screen (the library's
 * `library-painted` or the studio's `player-ready` mark; other screens don't wait for one) and no query is fetching.
 * Downloads that nothing on screen needs yet (the deferred font slices) wait for it, so in a cold start on a slow
 * network they don't take the bandwidth of the posters, the studio chunk or the song's file. Never later than
 * `maxWaitMs` after load, so a screen that never settles (offline, an error) still gets them.
 */

/** The marks (perfMark names) that say a screen has its first data on screen, by route. */
export function firstScreenMark(pathname: string): string | null {
  if (pathname === '/') return MARK_PREFIX + MARK_LIBRARY_PAINTED;
  if (/^\/v\/[^/]+/.test(pathname)) return MARK_PREFIX + MARK_PLAYER_READY;
  return null;
}

export interface SettledEnv {
  /** True once the `load` event has fired; `onLoad` subscribes otherwise. */
  loaded: () => boolean;
  onLoad: (cb: () => void) => void;
  /** True when this mark has been set; `onMark` calls back on every new mark. */
  hasMark: (name: string) => boolean;
  onMark: (cb: () => void) => () => void;
  /** Queries fetching right now, and a subscription to their changes. */
  fetching: () => number;
  onQueries: (cb: () => void) => () => void;
  setTimer: (cb: () => void, ms: number) => () => void;
}

/** REQ-10 · Calls `run` once: loaded, first-screen mark set and no query fetching, or at the deadline. */
export function whenStartupSettled(
  pathname: string,
  env: SettledEnv,
  run: () => void,
  maxWaitMs = 10_000,
): void {
  const mark = firstScreenMark(pathname);
  let done = false;
  const cleanups: (() => void)[] = [];
  const finish = () => {
    if (done) return;
    done = true;
    for (const stop of cleanups) stop();
    run();
  };
  const check = () => {
    if ((!mark || env.hasMark(mark)) && env.fetching() === 0) finish();
  };
  const start = () => {
    cleanups.push(env.setTimer(finish, maxWaitMs), env.onMark(check), env.onQueries(check));
    check();
  };
  if (env.loaded()) start();
  else env.onLoad(start);
}

// REQ-10 · The app's own signal (fontsJa.ts sets it once): idle warm-ups that nothing on screen needs wait for it too.
// Module state on purpose (one page, one startup); tests that need a clean slate call `resetStartupSettledForTests`.
let settled = false;
const waiting = new Set<() => void>();

/** Test-only: forgets that the first screen settled and drops everything waiting for it. */
export function resetStartupSettledForTests(): void {
  settled = false;
  waiting.clear();
}

/** REQ-10 · Says the first screen has settled and runs what waited for it (once; later calls do nothing). */
export function markStartupSettled(): void {
  if (settled) return;
  settled = true;
  const list = [...waiting];
  waiting.clear();
  for (const cb of list) cb();
}

/** REQ-10 · Runs `cb` once the first screen has settled (at once if it already has). Returns a cancel. */
export function afterStartupSettled(cb: () => void): () => void {
  if (settled) {
    cb();
    return () => undefined;
  }
  waiting.add(cb);
  return () => waiting.delete(cb);
}
