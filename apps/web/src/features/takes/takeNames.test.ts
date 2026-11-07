import type { Take } from '@coverscape/shared';
import { describe, expect, it } from 'vitest';
import { cleanLabel, labelFromFileName, TAKE_LABEL_MAX, takeOwnTitle, takeTitle } from './takeNames';
import { renamePatch, takeRow, unnamedHere } from './takeRules';

const base = {
  id: 't1',
  crew_id: 'c',
  video_id: 'v',
  member_id: null,
  clip_id: null,
  is_best: false,
  label: null,
  file_name: null,
  device_id: null,
} as unknown as Take;
const take = (patch: Partial<Take>): Take => ({ ...base, ...patch });

describe('the name typed for a take', () => {
  it('is trimmed, one space between words, at most 80 letters; empty is none', () => {
    expect(cleanLabel('  Grupo   1  ')).toBe('Grupo 1');
    expect(cleanLabel('   ')).toBeNull();
    expect(cleanLabel(null)).toBeNull();
    expect(cleanLabel('a'.repeat(100))).toHaveLength(TAKE_LABEL_MAX);
    // Cut at 80 never leaves a trailing space the database would trim to a different value.
    expect(cleanLabel(`${'a'.repeat(79)} b`)).toBe('a'.repeat(79));
  });

  it('comes from a file name without its extension', () => {
    expect(labelFromFileName('Grupo 1 · Primera versión.mp4')).toBe('Grupo 1 · Primera versión');
    expect(labelFromFileName('ensayo_final.MOV')).toBe('ensayo final');
    expect(labelFromFileName('sin extension')).toBe('sin extension');
    expect(labelFromFileName('.mp4')).toBeNull();
    expect(labelFromFileName(null)).toBeNull();
  });
});

describe('the title of a take row', () => {
  it('its own name first, with the person as the second line', () => {
    expect(takeTitle(take({ label: 'Grupo · primera', member_id: 'ana' }), 'Ana')).toEqual({
      title: 'Grupo · primera',
      person: 'Ana',
    });
    expect(takeTitle(take({ label: 'Grupo · primera' }), null)).toEqual({ title: 'Grupo · primera', person: null });
  });

  it('else who dances it', () => {
    expect(takeTitle(take({ member_id: 'ana' }), 'Ana')).toEqual({ title: 'Ana', person: null });
  });

  it('else an uploaded file’s name, never the recorder’s own file names', () => {
    expect(takeTitle(take({ file_name: 'Grupo 1 · Primera versión.mp4' }), null).title).toBe(
      'Grupo 1 · Primera versión',
    );
    expect(takeTitle(take({ file_name: 'one-shoot-dynamite-20261020-180000.webm' }), null).title).toBe('Sin nombre');
    expect(takeTitle(take({}), null).title).toBe('Sin nombre');
  });

  it('a blank label counts as none', () => {
    expect(takeOwnTitle(take({ label: '  ' }))).toBeNull();
  });
});

describe('editing a take', () => {
  it('saves the name alone when the person stays', () => {
    expect(renamePatch(take({ member_id: 'ana' }), { label: '  Mía ', memberId: 'ana' }, [])).toEqual({ label: 'Mía' });
    expect(renamePatch(take({}), { label: '', memberId: null }, [])).toEqual({ label: null });
  });

  it('moves it to another person or the group', () => {
    expect(renamePatch(take({ member_id: 'ana' }), { label: 'G', memberId: null }, [])).toEqual({
      label: 'G',
      member_id: null,
    });
  });

  it('drops the star that would clash with the new person’s best', () => {
    const mine = take({ id: 'a', member_id: 'ana', is_best: true });
    const theirs = take({ id: 'b', member_id: 'rei', is_best: true });
    expect(renamePatch(mine, { label: null, memberId: 'rei' }, [mine, theirs])).toEqual({
      label: null,
      member_id: 'rei',
      is_best: false,
    });
  });
});

describe('takes with their own name', () => {
  it('are not offered as this phone’s unnamed takes', () => {
    const list = [
      take({ id: '1', device_id: 'dev-aaaa-bbbb' }),
      take({ id: '2', device_id: 'dev-aaaa-bbbb', label: 'Grupo' }),
      take({ id: '3', device_id: 'dev-aaaa-bbbb', file_name: 'Grupo 2.mp4' }),
    ];
    expect(unnamedHere(list, 'dev-aaaa-bbbb').map((t) => t.id)).toEqual(['1']);
  });

  it('write their name on insert, and only when there is one', () => {
    const input = { id: 'x', videoId: 'v', memberId: null, songStart: 0, speed: 1, mirrored: false, durationSeconds: 3 };
    expect(takeRow({ ...input, label: '  Grupo 1 ' }, 'dev-aaaa-bbbb').label).toBe('Grupo 1');
    expect('label' in takeRow(input, 'dev-aaaa-bbbb')).toBe(false);
    expect('label' in takeRow({ ...input, label: '  ' }, 'dev-aaaa-bbbb')).toBe(false);
  });
});

describe('a take with a person and a file name', () => {
  it('shows the person, not the file', () => {
    expect(takeTitle(take({ member_id: 'ana', file_name: 'toma-01.webm' }), 'Ana')).toEqual({ title: 'Ana', person: null });
  });
});
