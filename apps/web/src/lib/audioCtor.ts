// REQ-28 · One place for the WebKit fallback that seven modules used to repeat (older Safari only exposes the
// prefixed constructors). Each caller keeps its own options and its own reaction to a missing constructor.

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
  webkitOfflineAudioContext?: typeof OfflineAudioContext;
};

/** The page's `AudioContext` constructor (or Safari's prefixed one), or `null` where there is none. */
export function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as WebkitWindow).webkitAudioContext ?? null;
}

/** The page's `OfflineAudioContext` constructor (or Safari's prefixed one), or `null` where there is none. */
export function offlineAudioContextCtor(): typeof OfflineAudioContext | null {
  if (typeof window === 'undefined') return null;
  return window.OfflineAudioContext ?? (window as WebkitWindow).webkitOfflineAudioContext ?? null;
}
