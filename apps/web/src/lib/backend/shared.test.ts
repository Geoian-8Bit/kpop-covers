import { describe, expect, it } from 'vitest';
import { fetchAll, fromJson, must, toJson } from './shared';

describe('must (REQ-29)', () => {
  it('returns the data of an answer that went through', () => {
    expect(must({ data: [1, 2], error: null })).toEqual([1, 2]);
    expect(must({ data: null, error: null })).toBeNull();
  });

  it('throws the very error object of a failed answer', () => {
    const error = Object.assign(new Error('boom'), { code: '23505' });
    expect(() => must({ data: null, error })).toThrow(error);
    try {
      must({ data: null, error });
    } catch (e) {
      expect(e).toBe(error);
    }
  });

  it('keeps the answer status on the error without changing its shape', () => {
    expect.assertions(3);
    const error = { message: 'TypeError: Failed to fetch', code: '' };
    try {
      must({ data: null, error, status: 0 });
    } catch (e) {
      expect(e).toBe(error);
      expect((e as { status?: number }).status).toBe(0);
      expect(Object.keys(e as object)).toEqual(['message', 'code']);
    }
  });
});

describe('toJson / fromJson (REQ-29)', () => {
  it('pass values through untouched', () => {
    const value = { ok: true, revision: 3 };
    expect(toJson(value)).toBe(value);
    expect(fromJson<{ ok: boolean }>(value)).toBe(value);
  });
});

describe('fetchAll', () => {
  it('reads page after page until a short one', async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => i);
    const pages: [number, number][] = [];
    const out = await fetchAll<number>((from, to) => {
      pages.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    });
    expect(out).toEqual(rows);
    expect(pages).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it('throws the first error', async () => {
    const error = new Error('down');
    await expect(fetchAll(() => Promise.resolve({ data: null, error }))).rejects.toBe(error);
  });
});
