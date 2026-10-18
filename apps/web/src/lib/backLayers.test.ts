import { describe, expect, it } from 'vitest';
import { historySettleStep, isLayerEntry } from '@/features/rpd/roundRules';
import { createBackLayers, SETTLE_MS } from './backLayers';

/** A browser history: `go` lands later (as in a browser), and fires popstate. */
function fakeBrowser(initial: unknown[] = [null]) {
  const entries: unknown[] = [...initial];
  let index = entries.length - 1;
  const listeners: (() => void)[] = [];
  const pending: (() => void)[] = [];
  /** `go` calls, to count how many steps were taken. */
  const gos: number[] = [];
  const history = {
    get state() {
      return entries[index];
    },
    pushState(state: unknown, _unused?: string) {
      entries.splice(index + 1);
      entries.push(state);
      index = entries.length - 1;
    },
    replaceState(state: unknown, _unused?: string) {
      entries[index] = state;
    },
    go(delta: number) {
      gos.push(delta);
      pending.push(() => {
        index = Math.max(0, Math.min(entries.length - 1, index + delta));
        for (const l of listeners) l();
      });
    },
  };
  return {
    history,
    gos,
    /** The phone's «Atrás» / the browser's «Adelante». */
    back: () => history.go(-1),
    forward: () => history.go(1),
    listen: (l: () => void) => listeners.push(l),
    /** Lets microtasks run, then lands every pending `go`, in order. */
    settle: async () => {
      for (let i = 0; i < 12; i++) {
        await Promise.resolve();
        const next = pending.shift();
        if (!next) {
          await new Promise((r) => setTimeout(r, 0));
          if (!pending.length) return;
          continue;
        }
        next();
      }
    },
    /** Where the history stands (0 = the first entry). */
    depth: () => index,
    length: () => entries.length,
    env: (loadId = 'load-a') => ({
      history,
      onPopState: (l: () => void) => listeners.push(l),
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
      queueMicrotask: (fn: () => void) => queueMicrotask(fn),
      loadId,
    }),
  };
}

function layer(layers: ReturnType<typeof createBackLayers>, busy = false) {
  const state = { closed: 0, busy };
  const close = layers.open({ onClose: () => state.closed++, busy: () => state.busy });
  return { state, close };
}

describe('«Atrás» closes layers (useBackToClose)', () => {
  it('one layer: «Atrás» closes it; its entry goes with it', async () => {
    const b = fakeBrowser();
    const layers = createBackLayers(b.env());
    const a = layer(layers);
    expect(b.depth()).toBe(1);
    b.back();
    await b.settle();
    expect(a.state.closed).toBe(1);
    a.close(); // React's cleanup after closing
    await b.settle();
    expect(b.depth()).toBe(0);
  });

  it('two layers: «Atrás» closes only the top one, then the other', async () => {
    const b = fakeBrowser();
    const layers = createBackLayers(b.env());
    const review = layer(layers);
    const settings = layer(layers);
    b.back();
    await b.settle();
    expect(settings.state.closed).toBe(1);
    expect(review.state.closed).toBe(0);
    settings.close();
    await b.settle();
    expect(b.depth()).toBe(1);
    b.back();
    await b.settle();
    expect(review.state.closed).toBe(1);
    expect(b.depth()).toBe(0);
  });

  it('closed with its button: its entry is taken back, the layer below stays', async () => {
    const b = fakeBrowser();
    const layers = createBackLayers(b.env());
    const review = layer(layers);
    const settings = layer(layers);
    settings.close();
    await b.settle();
    expect(b.depth()).toBe(1);
    expect(review.state.closed).toBe(0);
    b.back();
    await b.settle();
    expect(review.state.closed).toBe(1);
  });

  it("closing several at once (the review's X with its settings open) goes back once, leaving nothing", async () => {
    const b = fakeBrowser();
    const layers = createBackLayers(b.env());
    const review = layer(layers);
    const settings = layer(layers);
    const note = layer(layers);
    note.close();
    settings.close();
    review.close();
    await b.settle();
    expect(b.depth()).toBe(0);
    expect(b.gos).toEqual([-3]);
  });

  it('an entry left by an earlier page load never blocks «Atrás»', async () => {
    const b = fakeBrowser([null, { backToClose: 7, backToCloseLoad: 'load-old' }]);
    const layers = createBackLayers(b.env('load-new'));
    const review = layer(layers);
    b.back();
    await b.settle();
    expect(review.state.closed).toBe(1);
  });

  it('closing one and opening another in the same moment (saving a note) leaves no dead entry', async () => {
    const b = fakeBrowser();
    const layers = createBackLayers(b.env());
    const review = layer(layers);
    const composer = layer(layers);
    composer.close();
    const note = layer(layers);
    await b.settle();
    expect(b.depth()).toBe(2); // review + note
    b.back();
    await b.settle();
    expect(note.state.closed).toBe(1);
    note.close();
    await b.settle();
    b.back();
    await b.settle();
    expect(review.state.closed).toBe(1);
    expect(b.depth()).toBe(0);
  });

  it('closing the layer below with the one above open: each «Atrás» closes a layer, none is spent on nothing', async () => {
    const b = fakeBrowser();
    const layers = createBackLayers(b.env());
    const review = layer(layers);
    const settings = layer(layers);
    const note = layer(layers);
    settings.close(); // its X, with the note still open on top: it can't go back, the review adopts its entry
    await b.settle();
    expect(b.gos).toEqual([]);
    b.back();
    await b.settle();
    expect(note.state.closed).toBe(1);
    expect(review.state.closed).toBe(0);
    note.close();
    await b.settle();
    b.back(); // the very next press closes the review…
    await b.settle();
    expect(review.state.closed).toBe(1);
    review.close(); // …and its own entry goes with it
    await b.settle();
    expect(b.depth()).toBe(0);
  });

  it('a dialog that navigates replaces its entry: «Atrás» from the new page goes straight back to the list', async () => {
    const b = fakeBrowser([{ page: 'list' }]);
    const layers = createBackLayers(b.env());
    const dialog = layer(layers);
    const navigate = (to: string, options?: { replace?: boolean }) =>
      options?.replace ? b.history.replaceState({ page: to }) : b.history.pushState({ page: to });
    layers.navigateFromLayer(navigate, 'new');
    dialog.close(); // closes with the page change: its entry is gone, no going back
    await b.settle();
    expect(b.gos).toEqual([]);
    expect(b.history.state).toEqual({ page: 'new' });
    b.back();
    await b.settle();
    expect(b.history.state).toEqual({ page: 'list' });
    // Not from a layer: a plain push.
    layers.navigateFromLayer(navigate, 'other');
    expect(b.history.state).toEqual({ page: 'other' });
    expect(b.length()).toBe(2); // pushed after the list (the page ahead was dropped, as a browser does)
  });

  it('«Adelante» is never turned into a step back', async () => {
    const b = fakeBrowser();
    const layers = createBackLayers(b.env());
    const dialog = layer(layers);
    dialog.close();
    await b.settle();
    expect(b.depth()).toBe(0);
    b.forward(); // onto the closed dialog's entry
    await b.settle();
    expect(b.depth()).toBe(1);
    expect(b.gos).toEqual([-1, 1]);
  });

  it('our going back landing late (after the wait) leaves no dead entry', async () => {
    const b = fakeBrowser();
    const layers = createBackLayers(b.env());
    const composer = layer(layers);
    composer.close(); // its go(-1) is sent but doesn't land yet
    await Promise.resolve();
    const note = layer(layers);
    await new Promise((r) => setTimeout(r, SETTLE_MS + 30)); // the note pushes anyway
    await b.settle(); // the late go lands on the composer's entry: the note takes it over
    expect(b.depth()).toBe(1);
    b.back();
    await b.settle();
    expect(note.state.closed).toBe(1);
    expect(b.depth()).toBe(0);
  });

  it('a busy layer keeps itself and its entry', async () => {
    const b = fakeBrowser();
    const layers = createBackLayers(b.env());
    const recorder = layer(layers, true);
    b.back();
    await b.settle();
    expect(recorder.state.closed).toBe(0);
    expect(b.depth()).toBe(1);
    recorder.state.busy = false;
    b.back();
    await b.settle();
    expect(recorder.state.closed).toBe(1);
  });

  it('a layer waiting for a back that never lands pushes anyway after a moment', async () => {
    const b = fakeBrowser();
    const layers = createBackLayers(b.env());
    layers.ownHistoryBack(); // never settled below
    layer(layers);
    expect(b.depth()).toBe(0);
    await new Promise((r) => setTimeout(r, SETTLE_MS + 30));
    expect(b.depth()).toBe(1);
  });
});

describe('with the round\'s history settling (useHistorySettled)', () => {
  /** The steps `useHistorySettled` takes, on the same history (its own listener after the layers'). */
  function settler(b: ReturnType<typeof fakeBrowser>, layers: ReturnType<typeof createBackLayers>) {
    const steps: string[] = [];
    let popped = false;
    let backs = 0;
    const step = () => {
      const next = historySettleStep(isLayerEntry(b.history.state), popped, layers.ownBackPending(), backs);
      steps.push(next);
      if (next === 'back') {
        backs++;
        popped = false;
        layers.ownHistoryBack();
      }
    };
    b.listen(() => {
      popped = true;
      step();
    });
    return { steps, step };
  }

  it('«¿Salir de la ronda?» → «Salir»: it waits for the dialog to go, then leaves once', async () => {
    const b = fakeBrowser([{ page: 'rpd' }, { page: 'round' }]);
    const layers = createBackLayers(b.env());
    const guard = layer(layers); // the round's «Atrás» guard
    const confirm = layer(layers); // «¿Salir de la ronda?»
    // «Salir»: both close in the same commit, and the settling starts in it.
    confirm.close();
    guard.close();
    const s = settler(b, layers);
    s.step();
    expect(s.steps[0]).toBe('wait'); // still on the dialog's entry, its going back on the way
    await b.settle();
    expect(s.steps.at(-1)).toBe('ready');
    expect(b.history.state).toEqual({ page: 'round' });
    expect(b.gos).toEqual([-2]); // one step, never a second one on top
  });

  it('a reload with the guard open: one step over its old entry, and no more', async () => {
    const b = fakeBrowser([{ page: 'rpd' }, { page: 'round' }, { page: 'round', backToClose: 1, backToCloseLoad: 'old' }]);
    const layers = createBackLayers(b.env('new'));
    const s = settler(b, layers);
    s.step();
    expect(s.steps[0]).toBe('back');
    await b.settle();
    expect(s.steps.at(-1)).toBe('ready');
    expect(b.history.state).toEqual({ page: 'round' });
    expect(b.gos).toEqual([-1]);
  });
});
