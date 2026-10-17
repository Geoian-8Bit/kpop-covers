import { parseYouTubeId } from '@coverscape/shared';

/**
 * Pure rules of the shared YouTube picker (`YouTubePicker.tsx`, tested in `youTubePickerRules.test.ts`): what the
 * one field holds (a search or a link), the search URL and the search errors in the group's words.
 */

/** One hit of `/api/youtube-search` (same shape as `YouTubeSearchItem` in `api/youtube-search.ts`). */
export interface YouTubeSearchHit {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  /** Seconds, or null when YouTube did not report it. */
  duration: number | null;
}

export type YouTubeSearchState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'ok'; query: string; items: YouTubeSearchHit[] }
  | { status: 'error'; query: string; message: string; limit: boolean };

/** What the field holds: a YouTube link (or bare id), a link we don't recognise, a search, or nothing yet. */
export type PickerInput =
  | { kind: 'link'; youtubeId: string }
  | { kind: 'bad-link' }
  | { kind: 'search'; query: string }
  | { kind: 'empty' };

/** Searches shorter than this aren't sent (the server refuses them too). */
export const MIN_QUERY = 2;
/** The server's limit. */
export const MAX_QUERY = 100;

export function readPickerInput(text: string): PickerInput {
  const youtubeId = parseYouTubeId(text);
  if (youtubeId) return { kind: 'link', youtubeId };
  const query = text.trim().replace(/\s+/g, ' ');
  if (/^https?:\/\//i.test(query)) return { kind: 'bad-link' };
  if (query.length < MIN_QUERY) return { kind: 'empty' };
  return { kind: 'search', query: query.slice(0, MAX_QUERY) };
}

/** The search text, or null when the field holds a link or too little to search. */
export function searchQueryOf(text: string): string | null {
  const input = readPickerInput(text);
  return input.kind === 'search' ? input.query : null;
}

/** Lower-cased so every spelling of the same search hits Vercel's edge cache instead of the daily quota. */
export function searchUrl(query: string): string {
  return `/api/youtube-search?q=${encodeURIComponent(query.toLowerCase())}`;
}

/**
 * A failed search in the group's words. `limit`: the daily quota or this phone searching too fast — the picker
 * shows it as a warning and points to pasting the link, which always works.
 */
export function searchErrorOf(status: number, code?: string): { message: string; limit: boolean } {
  if (code === 'rate_limited') {
    return { message: 'Demasiadas búsquedas seguidas. Espera unos minutos o pega el enlace.', limit: true };
  }
  if (status === 429) return { message: 'Se acabaron las búsquedas de hoy. Pega el enlace o prueba mañana.', limit: true };
  if (status === 503) return { message: 'La búsqueda todavía no está activada. Pega el enlace del vídeo.', limit: true };
  return { message: 'No se pudo buscar. Prueba otra vez.', limit: false };
}

/**
 * The results (or the search's error) belong to what the field says now: typed something else without searching, or
 * cleared a pasted link, and the old search's results are no longer shown.
 */
export function resultsShown(state: YouTubeSearchState, query: string | null): boolean {
  if (state.status === 'idle' || query == null) return false;
  return state.query === query;
}

/** The screen reader's line for the results area. */
export function searchAnnouncement(state: YouTubeSearchState): string {
  switch (state.status) {
    case 'idle':
      return '';
    case 'loading':
      return 'Buscando en YouTube…';
    case 'error':
      return state.message;
    case 'ok':
      if (state.items.length === 0) return 'Sin resultados. Prueba con otras palabras.';
      return state.items.length === 1 ? '1 resultado de YouTube.' : `${state.items.length} resultados de YouTube.`;
  }
}

/** Next result to focus with the arrow keys: −1 means back to the field. */
export function nextResultIndex(current: number, key: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End', count: number): number {
  if (count <= 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return Math.min(count - 1, current + 1);
  return current - 1 < 0 ? -1 : current - 1;
}
