import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MARK_LIBRARY_PAINTED, MARK_PLAYER_READY, MARK_PREFIX, perfMark } from './perfProbe';
import {
  afterStartupSettled,
  firstScreenMark,
  markStartupSettled,
  resetStartupSettledForTests,
  whenStartupSettled,
  type SettledEnv,
} from './startupSettled';

function fakeEnv() {
  const state = { loaded: false, marks: new Set<string>(), fetching: 0 };
  const loadCbs: (() => void)[] = [];
  const markCbs = new Set<() => void>();
  const queryCbs = new Set<() => void>();
  const timers = new Set<() => void>();
  const env: SettledEnv = {
    loaded: () => state.loaded,
    onLoad: (cb) => loadCbs.push(cb),
    hasMark: (name) => state.marks.has(name),
    onMark: (cb) => (markCbs.add(cb), () => markCbs.delete(cb)),
    fetching: () => state.fetching,
    onQueries: (cb) => (queryCbs.add(cb), () => queryCbs.delete(cb)),
    setTimer: (cb) => (timers.add(cb), () => timers.delete(cb)),
  };
  return {
    env,
    load: () => {
      state.loaded = true;
      loadCbs.forEach((cb) => cb());
    },
    mark: (name: string) => {
      state.marks.add(name);
      markCbs.forEach((cb) => cb());
    },
    setFetching: (n: number) => {
      state.fetching = n;
      queryCbs.forEach((cb) => cb());
    },
    fireTimers: () => [...timers].forEach((cb) => cb()),
    listeners: () => markCbs.size + queryCbs.size + timers.size,
  };
}

describe('firstScreenMark (REQ-10)', () => {
  it('names the mark of the library and the studio only', () => {
    expect(firstScreenMark('/')).toBe('oneshoot:library-painted');
    expect(firstScreenMark('/v/abc')).toBe('oneshoot:player-ready');
    expect(firstScreenMark('/v/abc/formaciones/p1')).toBe('oneshoot:player-ready');
    expect(firstScreenMark('/bolsas')).toBeNull();
  });
});

describe('whenStartupSettled (REQ-10)', () => {
  it('waits for load, the screen mark and no fetching, then runs once and stops listening', () => {
    const f = fakeEnv();
    const run = vi.fn();
    whenStartupSettled('/', f.env, run);
    f.setFetching(2);
    expect(run).not.toHaveBeenCalled(); // not loaded yet
    f.load();
    f.mark('oneshoot:library-painted');
    expect(run).not.toHaveBeenCalled(); // still fetching
    f.setFetching(0);
    expect(run).toHaveBeenCalledTimes(1);
    f.setFetching(1);
    f.setFetching(0);
    f.fireTimers();
    expect(run).toHaveBeenCalledTimes(1);
    expect(f.listeners()).toBe(0);
  });

  it('a screen without a mark only waits for its queries', () => {
    const f = fakeEnv();
    const run = vi.fn();
    f.load();
    whenStartupSettled('/eventos', f.env, run);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('never waits past the deadline (offline, an error)', () => {
    const f = fakeEnv();
    const run = vi.fn();
    f.load();
    f.setFetching(1);
    whenStartupSettled('/v/abc', f.env, run);
    expect(run).not.toHaveBeenCalled();
    f.fireTimers();
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('mark names (REQ-10)', () => {
  it('are the ones perfMark really sets', () => {
    // perfMark prefixes its argument; the wait must look for exactly that name or it hangs until the deadline.
    expect(firstScreenMark('/')).toBe(MARK_PREFIX + MARK_LIBRARY_PAINTED);
    expect(firstScreenMark('/v/x')).toBe(MARK_PREFIX + MARK_PLAYER_READY);
    perfMark(MARK_LIBRARY_PAINTED);
    expect(performance.getEntriesByName(firstScreenMark('/')!, 'mark').length).toBeGreaterThan(0);
  });
});

describe('afterStartupSettled (REQ-10)', () => {
  beforeEach(resetStartupSettledForTests);
  it('waits for the signal, skips cancelled ones and runs late callers at once', () => {
    const first = vi.fn();
    const cancelled = vi.fn();
    afterStartupSettled(first);
    afterStartupSettled(cancelled)();
    expect(first).not.toHaveBeenCalled();
    markStartupSettled();
    markStartupSettled();
    expect(first).toHaveBeenCalledTimes(1);
    expect(cancelled).not.toHaveBeenCalled();
    const late = vi.fn();
    afterStartupSettled(late);
    expect(late).toHaveBeenCalledTimes(1);
  });
});
