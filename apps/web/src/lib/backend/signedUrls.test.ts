import { describe, expect, it, vi } from 'vitest';
import { forgetSigned, memoSigned, seedSigned } from './signedUrls';

const HOUR = 60 * 60 * 1000;

describe('memoSigned (REQ-15)', () => {
  it('reuses the URL while it has more than 30 min left', async () => {
    let t = 0;
    const now = () => t;
    const sign = vi.fn(async () => ({ url: `u${sign.mock.calls.length}`, expiresAt: 6 * HOUR }));
    expect(await memoSigned('b/reuse', sign, now)).toBe('u1');
    t = 5 * HOUR; // 1 h left
    expect(await memoSigned('b/reuse', sign, now)).toBe('u1');
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it('signs again when the remembered URL is about to expire', async () => {
    let t = 0;
    const now = () => t;
    const sign = vi.fn(async () => ({ url: `u${sign.mock.calls.length}`, expiresAt: t + 6 * HOUR }));
    expect(await memoSigned('b/expire', sign, now)).toBe('u1');
    t = 6 * HOUR - 29 * 60 * 1000; // 29 min left
    expect(await memoSigned('b/expire', sign, now)).toBe('u2');
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it('signs again after forgetSigned', async () => {
    const sign = vi.fn(async () => ({ url: `u${sign.mock.calls.length}`, expiresAt: Date.now() + 6 * HOUR }));
    expect(await memoSigned('b/forget', sign)).toBe('u1');
    forgetSigned('b/forget');
    expect(await memoSigned('b/forget', sign)).toBe('u2');
  });

  it('shares one promise between two calls at once', async () => {
    let release!: (v: { url: string; expiresAt: number }) => void;
    const sign = vi.fn(() => new Promise<{ url: string; expiresAt: number }>((r) => (release = r)));
    const a = memoSigned('b/share', sign);
    const b = memoSigned('b/share', sign);
    release({ url: 'one', expiresAt: Date.now() + 6 * HOUR });
    expect(await Promise.all([a, b])).toEqual(['one', 'one']);
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it('does not remember a failed signature', async () => {
    const sign = vi
      .fn<() => Promise<{ url: string; expiresAt: number }>>()
      .mockRejectedValueOnce(new Error('sign failed'))
      .mockResolvedValueOnce({ url: 'ok', expiresAt: Date.now() + 6 * HOUR });
    await expect(memoSigned('b/fail', sign)).rejects.toThrow('sign failed');
    expect(await memoSigned('b/fail', sign)).toBe('ok');
    expect(sign).toHaveBeenCalledTimes(2);
  });

  it('serves a seeded URL without signing', async () => {
    seedSigned('b/seed', 'seeded', Date.now() + 6 * HOUR);
    const sign = vi.fn(async () => ({ url: 'fresh', expiresAt: Date.now() + 6 * HOUR }));
    expect(await memoSigned('b/seed', sign)).toBe('seeded');
    expect(sign).not.toHaveBeenCalled();
  });
});
