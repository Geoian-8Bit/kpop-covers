import { describe, expect, it } from 'vitest';
import {
  nextResultIndex,
  readPickerInput,
  resultsShown,
  searchAnnouncement,
  searchErrorOf,
  searchQueryOf,
  searchUrl,
} from './youTubePickerRules';

describe('readPickerInput', () => {
  it('spots a YouTube link or a bare id', () => {
    expect(readPickerInput('https://youtu.be/WPdWvnAAurg?si=abc')).toEqual({ kind: 'link', youtubeId: 'WPdWvnAAurg' });
    expect(readPickerInput('  https://www.youtube.com/watch?v=dQw4w9WgXcQ ')).toEqual({
      kind: 'link',
      youtubeId: 'dQw4w9WgXcQ',
    });
    expect(readPickerInput('gdZLi9oWNZg')).toEqual({ kind: 'link', youtubeId: 'gdZLi9oWNZg' });
  });

  it('tells a link it does not recognise from a search', () => {
    expect(readPickerInput('https://vimeo.com/123')).toEqual({ kind: 'bad-link' });
    expect(readPickerInput('ILLIT   Magnetic  ')).toEqual({ kind: 'search', query: 'ILLIT Magnetic' });
  });

  it('needs two characters to search', () => {
    expect(readPickerInput('')).toEqual({ kind: 'empty' });
    expect(readPickerInput(' a ')).toEqual({ kind: 'empty' });
    expect(searchQueryOf('ab')).toBe('ab');
  });

  it('caps the search at the server limit', () => {
    expect(searchQueryOf('x '.repeat(80))!.length).toBe(100);
  });

  it('never searches a link', () => {
    expect(searchQueryOf('https://youtu.be/WPdWvnAAurg')).toBeNull();
    expect(searchQueryOf('https://example.com')).toBeNull();
  });
});

describe('searchUrl', () => {
  it('lower-cases so the edge cache shares one entry per search', () => {
    expect(searchUrl('ILLIT Magnetic')).toBe('/api/youtube-search?q=illit%20magnetic');
    expect(searchUrl('aespa & NewJeans')).toBe('/api/youtube-search?q=aespa%20%26%20newjeans');
  });
});

describe('searchErrorOf', () => {
  it('flags the quota, the per-phone limit and a search not set up as limits', () => {
    expect(searchErrorOf(429, 'quota')).toEqual({ message: expect.stringContaining('búsquedas de hoy'), limit: true });
    expect(searchErrorOf(429, 'rate_limited')).toEqual({
      message: expect.stringContaining('Demasiadas búsquedas'),
      limit: true,
    });
    expect(searchErrorOf(503, 'not_configured').limit).toBe(true);
  });

  it('anything else is a plain retry', () => {
    expect(searchErrorOf(502, 'upstream_error')).toEqual({ message: 'No se pudo buscar. Prueba otra vez.', limit: false });
  });
});

describe('searchAnnouncement', () => {
  it('says how many results there are', () => {
    const hit = { id: 'x', title: 't', channel: 'c', thumbnail: '', duration: null };
    expect(searchAnnouncement({ status: 'ok', query: 'q', items: [hit] })).toBe('1 resultado de YouTube.');
    expect(searchAnnouncement({ status: 'ok', query: 'q', items: [hit, hit] })).toBe('2 resultados de YouTube.');
    expect(searchAnnouncement({ status: 'ok', query: 'q', items: [] })).toMatch(/Sin resultados/);
    expect(searchAnnouncement({ status: 'idle' })).toBe('');
  });
});

describe('nextResultIndex', () => {
  it('moves through the results and back up to the field', () => {
    expect(nextResultIndex(-1, 'ArrowDown', 3)).toBe(0);
    expect(nextResultIndex(2, 'ArrowDown', 3)).toBe(2);
    expect(nextResultIndex(0, 'ArrowUp', 3)).toBe(-1);
    expect(nextResultIndex(1, 'End', 3)).toBe(2);
    expect(nextResultIndex(2, 'Home', 3)).toBe(0);
    expect(nextResultIndex(0, 'ArrowDown', 0)).toBe(-1);
  });
});

describe('resultsShown', () => {
  const ok = { status: 'ok' as const, query: 'illit magnetic', items: [] };
  it('shows a search only while the field still says it', () => {
    expect(resultsShown(ok, 'illit magnetic')).toBe(true);
    // Typed something else without searching: the old results go.
    expect(resultsShown(ok, 'illit lucky')).toBe(false);
    // A link (or nothing) in the field: no results.
    expect(resultsShown(ok, null)).toBe(false);
    expect(resultsShown({ status: 'idle' }, 'illit')).toBe(false);
  });

  it('treats loading and errors the same way', () => {
    expect(resultsShown({ status: 'loading', query: 'illit' }, 'illit')).toBe(true);
    const failed = { status: 'error' as const, query: 'illit', message: 'x', limit: false };
    expect(resultsShown(failed, 'illit')).toBe(true);
    expect(resultsShown(failed, 'ive')).toBe(false);
  });
});
