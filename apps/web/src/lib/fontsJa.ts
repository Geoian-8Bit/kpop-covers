import type { QueryClient } from '@tanstack/react-query';
import fontsJaUrl from '../fonts-ja.css?url';
import { whenIdle } from './idle';
import { watchForExtraFonts } from './needsExtraFonts';
import { markStartupSettled, whenStartupSettled } from './startupSettled';

/**
 * REQ-07 · The slices that are not needed for the first paint (Japanese, cyrillic, greek, vietnamese) are a separate
 * stylesheet, added as a plain <link> after the first render: it never blocks the paint and is not in index.html. It
 * is built by hand (not `import()`) on purpose: a failed dynamic import would fire `vite:preloadError` and reload the
 * page. A failure here is ignored: the text keeps the fallback font, as when Google Fonts was unreachable.
 * REQ-10 · It is ~590 kB of @font-face rules (148 kB on the wire): parsed at startup it held the first commit (and so
 * every startup request) back by ~450 ms on a repeat visit, and downloaded in a cold start it took the bandwidth of the
 * posters, the studio chunk and the song's file. It is added once the first screen has settled and the phone is idle.
 *
 * Golden rule: text on screen that only this sheet can draw (kana, kanji outside the UI subset, cyrillic...) must not
 * wait for that settling: it would sit in the system font for seconds, which the Google sheets never did. The watcher
 * scans the whole document (dialogs and toasts are portals outside #root; typed text and placeholders count) and the
 * first hit adds the sheet at normal priority. With only latin text the deferral stays as it is.
 */
export function startDeferredFonts(queryClient: QueryClient): void {
  let added = false;
  // Declared before use: the watcher could in principle report before its own return value is stored.
  const watcher: { stop?: () => void } = {};
  const addFontsJa = (urgent = false) => {
    if (added) return;
    added = true;
    watcher.stop?.();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = fontsJaUrl;
    if (!urgent) link.setAttribute('fetchpriority', 'low');
    document.head.appendChild(link);
  };
  watcher.stop = watchForExtraFonts(document.body, () => addFontsJa(true));

  whenStartupSettled(
    window.location.pathname,
    {
      loaded: () => document.readyState === 'complete',
      onLoad: (cb) => window.addEventListener('load', cb, { once: true }),
      hasMark: (name) => performance.getEntriesByName(name, 'mark').length > 0,
      onMark: (cb) => {
        if (typeof PerformanceObserver === 'undefined') return () => undefined;
        const observer = new PerformanceObserver(cb);
        try {
          observer.observe({ type: 'mark' });
        } catch {
          return () => undefined; // no mark observer: the deadline still applies
        }
        return () => observer.disconnect();
      },
      fetching: () => queryClient.isFetching(),
      onQueries: (cb) => queryClient.getQueryCache().subscribe(cb),
      setTimer: (cb, ms) => {
        const id = setTimeout(cb, ms);
        return () => clearTimeout(id);
      },
    },
    () => {
      markStartupSettled();
      whenIdle(() => addFontsJa(), { timeout: 2000, fallbackMs: 1000 });
    },
  );
}
