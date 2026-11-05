import type { Note } from '@coverscape/shared';
import { describe, expect, it, vi } from 'vitest';
import type { ListedNote } from '@/lib/backend/core';

vi.mock('@/lib/backend/core', () => ({ backend: {} }));
const { isSketchPending, sketchesOutdated, withSketch, withSketches } = await import('./notes');

const listed = (over: Partial<ListedNote> = {}): ListedNote => {
  const base: Omit<Note, 'sketch'> = {
    id: 'n1',
    crew_id: 'c1',
    video_id: 'v1',
    at_seconds: 10,
    body: 'Brazos',
    author_member_id: null,
    take_id: 't1',
    take_seconds: 3,
    category: null,
    for_member_id: null,
    status: 'open',
    has_sketch: false,
    created_at: '2026-10-01',
    created_by: null,
    updated_at: '2026-10-01',
    archived_at: null,
  };
  return { ...base, ...over };
};

describe('notes without drawings in the list (REQ-17)', () => {
  it('a listed note takes its drawing from the drawings query, by id', () => {
    const notes = withSketches([listed({ has_sketch: true }), listed({ id: 'n2' })], { n1: 'data:s1' });
    expect(notes.map((n) => n.sketch)).toEqual(['data:s1', null]);
  });

  it("a written note's own drawing wins, and a removed one stays removed", () => {
    expect(withSketch(listed({ has_sketch: true, sketch: 'data:new' }), { n1: 'data:old' }).sketch).toBe(
      'data:new',
    );
    expect(withSketch(listed({ has_sketch: false, sketch: null }), { n1: 'data:old' }).sketch).toBeNull();
  });

  it('waits only for a note that has a drawing still on its way', () => {
    const loading = { data: undefined, isFetching: true, isError: false };
    expect(isSketchPending(listed({ has_sketch: true }), loading)).toBe(true);
    expect(isSketchPending(listed({ has_sketch: false }), loading)).toBe(false);
    expect(
      isSketchPending(listed({ has_sketch: true }), { data: { n1: 'x' }, isFetching: false, isError: false }),
    ).toBe(false);
    expect(
      isSketchPending(listed({ has_sketch: true }), { data: undefined, isFetching: false, isError: true }),
    ).toBe(false);
    expect(isSketchPending(null, loading)).toBe(false);
  });
});

describe('kept drawings that went out of date (REQ-17)', () => {
  const drawn = listed({ has_sketch: true, updated_at: '2026-10-01' });

  it('a note that gained a drawing elsewhere, or whose drawn note was edited elsewhere, refreshes them', () => {
    expect(sketchesOutdated([drawn], [drawn], {})).toBe(true);
    expect(sketchesOutdated([{ ...drawn, updated_at: '2026-10-02' }], [drawn], { n1: 'data:s1' })).toBe(true);
  });

  it('nothing changed, a new note seen for the first time, or a note without a drawing: no refresh', () => {
    expect(sketchesOutdated([drawn], [drawn], { n1: 'data:s1' })).toBe(false);
    expect(sketchesOutdated([drawn], undefined, { n1: 'data:s1' })).toBe(false);
    expect(sketchesOutdated([listed({ updated_at: '2026-10-05' })], [listed()], {})).toBe(false);
  });
});
