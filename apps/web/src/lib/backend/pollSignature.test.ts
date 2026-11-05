import { describe, expect, it } from 'vitest';
import { md5Hex, pollVotesSignature } from './pollSignature';

describe('md5Hex', () => {
  it('matches the reference vectors', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5Hex('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6');
    expect(md5Hex('12345678901234567890123456789012345678901234567890123456789012345678901234567890')).toBe(
      '57edf4a22be3c955ac49da2e2107b67a',
    );
  });
  it('hashes UTF-8 bytes', () => {
    expect(md5Hex('canción ñ')).toBe('8ca2627aaaa1a2e1754be9ed9ecc564e');
  });
});

describe('pollVotesSignature', () => {
  const vote = (option_id: string, member_id: string, rank: number | null = null) => ({
    option_id,
    member_id,
    rank,
  });

  it('is null without votes, like md5 of an empty aggregate', () => {
    expect(pollVotesSignature([])).toBeNull();
  });

  it('is md5 of the sorted «option:member:rank» list', () => {
    expect(pollVotesSignature([vote('b', 'm1'), vote('a', 'm2', 1), vote('a', 'm1', 2)])).toBe(
      md5Hex('a:m1:2,a:m2:1,b:m1:'),
    );
  });

  it('does not depend on the order the rows come in', () => {
    const rows = [vote('a', 'm1'), vote('b', 'm2'), vote('c', 'm3')];
    expect(pollVotesSignature(rows)).toBe(pollVotesSignature([...rows].reverse()));
  });

  it('changes when a vote is cast, changed or withdrawn', () => {
    const base = [vote('a', 'm1'), vote('b', 'm2')];
    const sig = pollVotesSignature(base);
    expect(pollVotesSignature([...base, vote('a', 'm3')])).not.toBe(sig);
    expect(pollVotesSignature([vote('a', 'm1'), vote('c', 'm2')])).not.toBe(sig);
    expect(pollVotesSignature([vote('a', 'm1')])).not.toBe(sig);
    expect(pollVotesSignature([vote('a', 'm1', 1), vote('b', 'm2')])).not.toBe(sig);
  });
});
