import { describe, expect, it } from 'vitest';
import {
  UPLOAD_RETRY_DELAYS_MS,
  isTransientUploadFailure,
  retriedUploadLanded,
  uploadRetryDelay,
} from './uploadRetryRules';

describe('uploadRetryDelay', () => {
  it('retries a network or server failure after 2 s, 5 s and 15 s, then gives up', () => {
    const fail = { ok: false, reason: 'network' } as const;
    expect([0, 1, 2, 3].map((n) => uploadRetryDelay(n, fail))).toEqual([...UPLOAD_RETRY_DELAYS_MS, null]);
    expect(uploadRetryDelay(0, { ok: false, reason: 'unavailable' })).toBe(2000);
  });
  it('reports a real refusal at once', () => {
    for (const reason of ['too-big', 'type', 'denied', 'exists'] as const) {
      expect(uploadRetryDelay(0, { ok: false, reason })).toBeNull();
      expect(isTransientUploadFailure(reason)).toBe(false);
    }
  });
  it('nothing to retry after a success', () => {
    expect(uploadRetryDelay(0, { ok: true, path: 'g/v.mp4' })).toBeNull();
  });
});

describe('retriedUploadLanded', () => {
  const exists = { ok: false, reason: 'exists' } as const;
  it('an earlier unclear try that got the same file through counts as uploaded', () => {
    expect(retriedUploadLanded({ earlierTransient: true, result: exists, bytes: 10, storedBytes: 10 })).toBe(
      true,
    );
    const denied = { ok: false, reason: 'denied' } as const;
    expect(retriedUploadLanded({ earlierTransient: true, result: denied, bytes: 10, storedBytes: 10 })).toBe(
      true,
    );
  });
  it('not on the first try, with another size, or when the size cannot be read', () => {
    expect(retriedUploadLanded({ earlierTransient: false, result: exists, bytes: 10, storedBytes: 10 })).toBe(
      false,
    );
    expect(retriedUploadLanded({ earlierTransient: true, result: exists, bytes: 10, storedBytes: 9 })).toBe(
      false,
    );
    expect(
      retriedUploadLanded({ earlierTransient: true, result: exists, bytes: 10, storedBytes: null }),
    ).toBe(false);
  });
  it('other refusals stay refusals', () => {
    const big = { ok: false, reason: 'too-big' } as const;
    expect(retriedUploadLanded({ earlierTransient: true, result: big, bytes: 10, storedBytes: 10 })).toBe(
      false,
    );
  });
});
