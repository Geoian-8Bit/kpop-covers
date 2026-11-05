import type { Note } from '@coverscape/shared';
import { describe, expect, it } from 'vitest';
import {
  categoryLabel,
  cleanNoteBody,
  crossedNote,
  isNoteCategory,
  noteStatus,
  songNotes,
  takeNotes,
} from './reviewNotes';
import { atNoteMoment } from './reviewSketch';

describe('notes on a take (F6)', () => {
  const note = (id: string, over: Partial<Note>): Note =>
    ({
      id,
      take_id: null,
      take_seconds: null,
      for_member_id: null,
      status: 'open',
      at_seconds: 0,
      body: id,
      ...over,
    }) as Note;

  it('knows the seven categories', () => {
    expect(isNoteCategory('direccion')).toBe(true);
    expect(isNoteCategory('cabeza')).toBe(false);
    expect(categoryLabel('energia')).toBe('Energía');
    expect(categoryLabel(null)).toBeNull();
  });

  it('defaults the status to pending', () => {
    expect(noteStatus({})).toBe('open');
    expect(noteStatus({ status: 'done' })).toBe('done');
    expect(noteStatus({ status: 'weird' })).toBe('open');
  });

  it('trims the text and refuses an empty one', () => {
    expect(cleanNoteBody('  brazos  ')).toBe('brazos');
    expect(cleanNoteBody('   ')).toBeNull();
    expect(cleanNoteBody('x'.repeat(600))).toHaveLength(500);
  });

  it('lists a take’s notes in take order', () => {
    const notes = [
      note('b', { take_id: 't1', take_seconds: 9 }),
      note('song', {}),
      note('a', { take_id: 't1', take_seconds: 2 }),
      note('other', { take_id: 't2', take_seconds: 1 }),
    ];
    expect(takeNotes(notes, 't1').map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('shows a take’s notes on the song only to their recipient', () => {
    const notes = [
      note('song', {}),
      note('for-me', { take_id: 't', for_member_id: 'me' }),
      note('for-ana', { take_id: 't', for_member_id: 'ana' }),
      note('for-all', { take_id: 't', for_member_id: null }),
    ];
    expect(songNotes(notes, 'me').map((n) => n.id)).toEqual(['song', 'for-me', 'for-all']);
    expect(songNotes(notes, null).map((n) => n.id)).toEqual(['song', 'for-all']);
  });

  it('announces a note only on natural forward playback', () => {
    const notes = [note('a', { take_id: 't', take_seconds: 5 })];
    expect(crossedNote(notes, 4.9, 5.02)?.id).toBe('a');
    expect(crossedNote(notes, 5.02, 5.1)).toBeNull();
    expect(crossedNote(notes, 1, 6)).toBeNull(); // a jump
    expect(crossedNote(notes, 6, 4)).toBeNull(); // backwards
  });
});

describe('atNoteMoment (P1)', () => {
  it('is true only within 0.2 s of the note', () => {
    expect(atNoteMoment(10.1, 10)).toBe(true);
    expect(atNoteMoment(9.85, 10)).toBe(true);
    expect(atNoteMoment(10.25, 10)).toBe(false);
    expect(atNoteMoment(0, null)).toBe(false);
    expect(atNoteMoment(0, undefined)).toBe(false);
    expect(atNoteMoment(3, '3.1')).toBe(true);
    expect(atNoteMoment(3, 'x')).toBe(false);
  });
});
