import type { NavigateFunction, NavigateOptions, To } from 'react-router';

/**
 * The phone's «Atrás» for layers (dialogs, sheets, the review…): each open layer pushes one history entry; «Atrás»
 * closes the layer on top and only that one; a layer closed some other way takes its entry back with it.
 *
 * Framework-free so it can be tested with a fake history (`useBackToClose` is the React side). The rules:
 * - Entries carry the layer's id and an id of this page load, so an entry left by an earlier load (a reload, Safari
 *   bringing a discarded tab back) is never taken for a live layer.
 * - A layer opened while one of our own `back()` calls is on its way waits for it to land before pushing (otherwise
 *   the `back()` lands on the new entry and leaves a dead one below).
 * - Layers that close in the same moment (the review's X with its settings open) go back once, by as many entries
 *   as they had, so nothing is left behind.
 * - A layer that closes under another one can't take its entry back (it isn't on top): the layer below it adopts
 *   that entry, so the «Atrás» that lands there and the next one each close a layer, none is spent on nothing.
 * - A page navigation from a layer replaces the layer's entry (`navigateFromLayer`) instead of pushing over it.
 * - Nothing here ever goes back on its own from a popstate: the history only moves when the person moves it or a
 *   layer closes.
 */

export interface HistoryLike {
  readonly state: unknown;
  pushState(state: unknown, unused: string): void;
  replaceState(state: unknown, unused: string): void;
  go(delta: number): void;
}

export interface BackEnv {
  history: HistoryLike;
  onPopState(listener: () => void): void;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  queueMicrotask(fn: () => void): void;
  loadId: string;
}

export interface LayerOptions {
  onClose: () => void;
  /** Can't close now (recording, saving…): «Atrás» keeps the layer and its entry. */
  busy: () => boolean;
}

/** How long a layer waits for our own `back()` before pushing anyway. */
export const SETTLE_MS = 400;

interface Entry {
  backToClose?: unknown;
  backToCloseLoad?: unknown;
}

interface Layer {
  id: number;
  /** Its entry is in the history. */
  marked: boolean;
  /** The highest entry it answers for: its own, or one it adopted from a layer that closed just above it. */
  top: number;
}

export function createBackLayers(env: BackEnv) {
  let nextId = 1;
  /** Popstates of our own `go(-n)` / `back()` still on their way. */
  let ownPops = 0;
  let swallowed = false;
  let listening = false;
  /** Open layers, in the order they opened. */
  const live: Layer[] = [];
  const handlers: (() => void)[] = [];
  const closing = new Set<number>();
  let flushQueued = false;
  const waiters = new Set<() => void>();

  const state = (): Entry => (env.history.state && typeof env.history.state === 'object' ? (env.history.state as Entry) : {});
  /** The current entry's layer id, if it is one of this load's. */
  const currentId = (): number | null => {
    const s = state();
    return s.backToCloseLoad === env.loadId && typeof s.backToClose === 'number' ? s.backToClose : null;
  };

  /** The current entry is a layer's that no open layer answers for (closed, or from an earlier load). */
  const onDeadEntry = (): boolean => {
    const s = state();
    if (s.backToClose == null) return false;
    const id = currentId();
    if (id == null) return true;
    return !live.some((l) => l.marked && !closing.has(l.id) && id >= l.id && id <= l.top);
  };

  const runWaiters = () => {
    for (const w of [...waiters]) w();
  };

  const listen = () => {
    if (listening) return;
    listening = true;
    // One dispatcher, registered before anything else listens: it decides whether a pop is ours, then each layer
    // (in the order they opened) sees it, then layers waiting to push do.
    env.onPopState(() => {
      swallowed = ownPops > 0;
      if (swallowed) ownPops--;
      for (const handler of [...handlers]) handler();
      if (ownPops === 0 && !flushQueued) runWaiters();
    });
  };

  const removeLive = (id: number) => {
    const i = live.findIndex((l) => l.id === id);
    if (i >= 0) live.splice(i, 1);
  };

  /**
   * The layers that closed together go back once, by as many entries as they had on top. One that closed under a
   * layer still open hands its entry to the open layer just below it.
   */
  const flush = () => {
    flushQueued = false;
    let count = 0;
    let top: number | null = null;
    let i = live.length - 1;
    for (; i >= 0; i--) {
      const layer = live[i]!;
      if (!layer.marked) continue; // a layer still waiting to push has no entry yet
      if (!closing.has(layer.id)) break;
      top ??= layer.top;
      count++;
    }
    // Below an open layer: each closing one's entry goes to the nearest open layer under it.
    for (let j = i; j >= 0; j--) {
      const layer = live[j]!;
      if (!closing.has(layer.id) || !layer.marked) continue;
      const heir = live.slice(0, j).reverse().find((l) => l.marked && !closing.has(l.id));
      if (heir) heir.top = Math.max(heir.top, layer.top);
    }
    for (const id of closing) removeLive(id);
    closing.clear();
    // Only when the top entry is really the topmost closing layer's (nothing else navigated on top of it).
    if (count > 0 && top != null && currentId() === top) {
      ownPops++;
      env.history.go(-count);
    } else if (ownPops === 0) runWaiters();
  };

  function open({ onClose, busy }: LayerOptions): () => void {
    listen();
    const id = nextId++;
    const layer: Layer = { id, marked: false, top: id };
    live.push(layer);
    let popped = false;
    let done = false;
    let timer: unknown;

    const mark = () => {
      const entry = { ...state(), backToClose: id, backToCloseLoad: env.loadId };
      // On a dead layer's entry (our going back came late, after we pushed anyway): take it over instead of pushing
      // on top of it, so it isn't left behind.
      if (layer.marked && onDeadEntry()) env.history.replaceState(entry, '');
      else env.history.pushState(entry, '');
      layer.marked = true;
      layer.top = id;
    };
    /** Our entry is still there: the current one is ours (or adopted) or a later layer's (ids grow in push order). */
    const stillOurs = () => {
      const current = currentId();
      return current != null && current >= layer.top;
    };
    const handler = () => {
      if (done || popped || !layer.marked) return;
      // The entry that went was a layer's above ours: that layer closes, ours stays as it is.
      if (stillOurs()) return;
      if (swallowed || busy()) {
        // Our own going back took our entry with it, or we can't close now: put ours back on top.
        mark();
        return;
      }
      popped = true;
      onClose();
    };
    handlers.push(handler);

    const waiter = () => {
      waiters.delete(waiter);
      env.clearTimeout(timer);
      if (!done && !layer.marked) mark();
    };
    if (ownPops > 0 || flushQueued) {
      waiters.add(waiter);
      timer = env.setTimeout(waiter, SETTLE_MS);
    } else mark();

    return () => {
      if (done) return;
      done = true;
      const i = handlers.indexOf(handler);
      if (i >= 0) handlers.splice(i, 1);
      waiters.delete(waiter);
      env.clearTimeout(timer);
      if (popped && layer.top > id && currentId() === id) {
        // Closed by «Atrás» from an entry it had adopted: its own entry, now on top, goes with it (as a button close).
        layer.top = id;
      } else if (popped || !layer.marked) {
        removeLive(id);
        return;
      }
      closing.add(id);
      if (!flushQueued) {
        flushQueued = true;
        env.queueMicrotask(flush);
      }
    };
  }

  return {
    open,
    /** One of our own `back()` calls is still on its way (or about to be sent). */
    ownBackPending: () => ownPops > 0 || flushQueued,
    /** `history.back()` counted as ours: a layer open when its popstate lands keeps its entry instead of closing. */
    ownHistoryBack: () => {
      listen();
      ownPops++;
      env.history.go(-1);
    },
    /**
     * A page navigation started from a layer (a dialog that saves and goes to what it made): when the current entry
     * is a layer's, the navigation replaces it instead of pushing over it, so «Atrás» from the new page goes straight
     * back. The layer, closing with the page change, finds its entry gone and doesn't go back.
     */
    navigateFromLayer<T, O extends { replace?: boolean }>(navigate: (to: T, options?: O) => void, to: T, options?: O): void {
      const onLayer = state().backToClose != null;
      navigate(to, { ...(options ?? ({} as O)), replace: options?.replace || onLayer });
    },
  };
}

export type BackLayers = ReturnType<typeof createBackLayers>;

function newLoadId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

let shared: BackLayers | null = null;
/** The page's layers (one per page load). */
export function backLayers(): BackLayers {
  shared ??= createBackLayers({
    history: window.history,
    onPopState: (listener) => window.addEventListener('popstate', listener),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    queueMicrotask: (fn) => queueMicrotask(fn),
    loadId: newLoadId(),
  });
  return shared;
}

/** A page navigation from a layer (see `navigateFromLayer` above), on the page's layers. */
export function navigateFromLayer(navigate: NavigateFunction, to: To, options?: NavigateOptions): void {
  backLayers().navigateFromLayer((t: To, o?: NavigateOptions) => void navigate(t, o), to, options);
}
