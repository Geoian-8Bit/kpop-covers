import { overlayStartOpacity, parseViewPrefs, type ViewPrefs } from './reviewRules';

const PREFS_KEY = 'oneshoot.review.v1';

export function readPrefs(): ViewPrefs {
  let prefs: ViewPrefs;
  try {
    prefs = parseViewPrefs(localStorage.getItem(PREFS_KEY));
  } catch {
    prefs = parseViewPrefs(null);
  }
  // Opening straight in «Superpuesto»: never with the one on top hiding the other.
  return prefs.mode === 'overlay' ? { ...prefs, opacity: overlayStartOpacity(prefs.opacity) } : prefs;
}

export function writePrefs(prefs: ViewPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode: this visit only */
  }
}
