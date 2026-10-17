import { describe, expect, it } from 'vitest';
import { editMeta, EMPTY_META, shownMeta, suggestMeta } from './addVideoRules';

describe('«Añadir vídeo» title per tab', () => {
  it('keeps each tab’s own suggestion', () => {
    let m = suggestMeta(EMPTY_META, 'youtube', { title: 'Magnetic', artist: 'HYBE LABELS' });
    m = suggestMeta(m, 'file', { title: 'IMG 1234', artist: '' });
    expect(shownMeta(m, 'file')).toEqual({ title: 'IMG 1234', artist: '' });
    // Back on «YouTube»: the YouTube video's own title, not the file's name.
    expect(shownMeta(m, 'youtube')).toEqual({ title: 'Magnetic', artist: 'HYBE LABELS' });
  });

  it('keeps what was typed on both tabs, over any later suggestion', () => {
    let m = suggestMeta(EMPTY_META, 'youtube', { title: 'Magnetic', artist: 'HYBE LABELS' });
    m = editMeta(m, 'youtube', { artist: 'ILLIT' });
    expect(shownMeta(m, 'youtube')).toEqual({ title: 'Magnetic', artist: 'ILLIT' });
    m = suggestMeta(m, 'file', { title: 'IMG 1234', artist: '' });
    expect(shownMeta(m, 'file')).toEqual({ title: 'Magnetic', artist: 'ILLIT' });
    m = editMeta(m, 'file', { title: 'Magnetic — Practice' });
    expect(shownMeta(m, 'youtube')).toEqual({ title: 'Magnetic — Practice', artist: 'ILLIT' });
  });

  it('empties a tab’s suggestion when its choice is removed', () => {
    let m = suggestMeta(EMPTY_META, 'file', { title: 'IMG 1234', artist: '' });
    m = suggestMeta(m, 'file', { title: '', artist: '' });
    expect(shownMeta(m, 'file').title).toBe('');
    expect(shownMeta(EMPTY_META, 'youtube')).toEqual({ title: '', artist: '' });
  });
});
