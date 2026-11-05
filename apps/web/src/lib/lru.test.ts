import { describe, expect, it } from 'vitest';
import { lruGet, lruSet } from './lru';

describe('lru', () => {
  it('keeps at most max entries, dropping the least recently used', () => {
    const m = new Map<string, number>();
    lruSet(m, 'a', 1, 2);
    lruSet(m, 'b', 2, 2);
    expect(lruGet(m, 'a')).toBe(1); // «a» is now the most recent
    lruSet(m, 'c', 3, 2);
    expect([...m.keys()]).toEqual(['a', 'c']);
  });

  it('a missing key is undefined and changes nothing; a stored undefined is kept', () => {
    const m = new Map<string, number | undefined>([['x', undefined]]);
    expect(lruGet(m, 'y')).toBeUndefined();
    expect(m.size).toBe(1);
    lruSet(m, 'x', 5, 3);
    expect(lruGet(m, 'x')).toBe(5);
  });
});
