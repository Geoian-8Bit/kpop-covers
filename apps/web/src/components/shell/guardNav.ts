import { type MouseEvent } from 'react';

/** Path + query of the page actually on screen; null while the shell isn't mounted. */
let shownPath: string | null = null;

/**
 * `onClick` for in-app links. The next route may still be loading inside a transition (the old page
 * stays on screen and the URL has already changed): a second tap then would push a duplicate history
 * entry, so it is swallowed — as is a tap on a link to the page already shown.
 */
export function guardNav(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const { pathname, search } = window.location;
  const current = pathname + search;
  const target = new URL(event.currentTarget.href);
  if ((shownPath != null && shownPath !== current) || target.pathname + target.search === current) {
    event.preventDefault();
  }
}

/** Called by the routed page's layout effects: which path + query is on screen now (null: shell unmounted). */
export function setShownPath(path: string | null) {
  shownPath = path;
}
