import { describe, expect, it } from 'vitest';
import {
  clockMoved,
  ERROR_PAUSE_MS,
  errorAction,
  errorRetryDelayMs,
  RESIGN_MISS_LIMIT,
  resignMissAction,
  resumeAfterDrop,
  retryAtMs,
  retryGapMs,
  signatureExpired,
  STALL,
  stallAction,
} from './stallRules';

describe('stallAction', () => {
  it('waits quietly during a short wait (a normal seek)', () => {
    expect(stallAction({ stuckMs: 1200, retries: 0, readyState: 2 })).toBe('none');
  });

  it('first plays again when the data is there, else asks for it with a re-seek', () => {
    expect(stallAction({ stuckMs: STALL.firstMs, retries: 0, readyState: 4 })).toBe('play');
    expect(stallAction({ stuckMs: STALL.firstMs, retries: 0, readyState: 2 })).toBe('reseek');
  });

  it('from the second attempt on, signs the file again and reloads it', () => {
    const second = retryAtMs(1);
    expect(second).toBe(STALL.firstMs + STALL.everyMs);
    expect(stallAction({ stuckMs: second - 1, retries: 1, readyState: 2 })).toBe('none');
    expect(stallAction({ stuckMs: second, retries: 1, readyState: 2 })).toBe('resign');
    expect(stallAction({ stuckMs: retryAtMs(2), retries: 2, readyState: 4 })).toBe('resign');
  });

  it('reloads a source that never opened', () => {
    expect(stallAction({ stuckMs: STALL.firstMs, retries: 0, readyState: 0 })).toBe('reload');
  });

  it('never gives up: the attempts only get further apart, up to a ceiling', () => {
    expect(stallAction({ stuckMs: retryAtMs(50), retries: 50, readyState: 1 })).toBe('resign');
    expect(stallAction({ stuckMs: retryAtMs(50) - 1, retries: 50, readyState: 1 })).toBe('none');
    expect(retryGapMs(1)).toBe(STALL.everyMs);
    expect(retryGapMs(2)).toBe(2 * STALL.everyMs);
    expect(retryGapMs(3)).toBeGreaterThan(retryGapMs(2));
    expect(retryGapMs(40)).toBe(STALL.maxGapMs);
    expect(retryAtMs(41) - retryAtMs(40)).toBe(STALL.maxGapMs);
  });
});

describe('errorAction', () => {
  const opened = { hadMetadata: true, expired: false };
  it('always recovers a network error of a cloud file', () => {
    expect(errorAction({ code: 2, network: true, attempts: 0, ...opened })).toBe('recover');
    expect(errorAction({ code: 2, network: true, attempts: 99, ...opened })).toBe('recover');
  });

  it('tries a fresh signature for a refused source (an expired token), then shows the error', () => {
    expect(errorAction({ code: 4, network: true, attempts: 0, ...opened })).toBe('recover');
    expect(errorAction({ code: 4, network: true, attempts: 1, ...opened })).toBe('recover');
    expect(errorAction({ code: 4, network: true, attempts: 2, ...opened })).toBe('fail');
    const expired = { hadMetadata: false, expired: true };
    expect(errorAction({ code: 4, network: true, attempts: 0, ...expired })).toBe('recover');
  });

  it('fails at once a refused source that never opened on a valid signature, as before', () => {
    const fresh = { hadMetadata: false, expired: false };
    expect(errorAction({ code: 4, network: true, attempts: 0, ...fresh })).toBe('fail');
  });

  it('keeps today’s answer for broken files and device files', () => {
    expect(errorAction({ code: 3, network: true, attempts: 0, ...opened })).toBe('fail');
    expect(errorAction({ code: 2, network: false, attempts: 0, ...opened })).toBe('fail');
  });
});

describe('signatureExpired', () => {
  const tokenUrl = (exp: number) => {
    const payload = btoa(JSON.stringify({ exp })).replace(/=+$/, '');
    return `https://x.supabase.co/storage/v1/object/sign/b/a.mp4?token=h.${payload}.s`;
  };
  it('reads the JWT expiry of a signed URL', () => {
    expect(signatureExpired(tokenUrl(1000), 1_000_001)).toBe(true);
    expect(signatureExpired(tokenUrl(2000), 1_000_000)).toBe(false);
  });
  it('treats anything unreadable as not expired', () => {
    expect(signatureExpired('https://x/a.mp4', 0)).toBe(false);
    expect(signatureExpired('https://x/a.mp4?token=garbage', 0)).toBe(false);
    expect(signatureExpired('blob:http://localhost/1', 0)).toBe(false);
  });
});

describe('resignMissAction', () => {
  it('shows the error after the limit of empty signatures while online', () => {
    expect(resignMissAction({ online: true, misses: RESIGN_MISS_LIMIT - 1 })).toBe('retry');
    expect(resignMissAction({ online: true, misses: RESIGN_MISS_LIMIT })).toBe('fail');
  });
  it('keeps retrying while the network is down', () => {
    expect(resignMissAction({ online: false, misses: 99 })).toBe('retry');
  });
});

describe('resumeAfterDrop', () => {
  const base = { playing: false, droppedAt: 1000, errorAt: 1200, userPausedAt: -Infinity };
  it('resumes a song the element paused around the error', () => {
    expect(resumeAfterDrop(base)).toBe(true);
  });
  it('keeps a pause the dancer asked for during the wait', () => {
    expect(resumeAfterDrop({ ...base, userPausedAt: 1500 })).toBe(false);
  });
  it('does nothing when playing or the pause was long before the error', () => {
    expect(resumeAfterDrop({ ...base, playing: true })).toBe(false);
    expect(resumeAfterDrop({ ...base, errorAt: 1000 + ERROR_PAUSE_MS + 1 })).toBe(false);
  });
  it('never undoes a pause the system made well after the error (a call, headphones out)', () => {
    expect(resumeAfterDrop({ ...base, droppedAt: 1200 + ERROR_PAUSE_MS + 1 })).toBe(false);
  });

  it('waits a little before the first retry and backs off after', () => {
    expect(errorRetryDelayMs(0)).toBeLessThan(STALL.everyMs);
    expect(errorRetryDelayMs(1)).toBe(retryGapMs(1));
    expect(errorRetryDelayMs(30)).toBe(STALL.maxGapMs);
  });
});

describe('clockMoved', () => {
  it('ignores float noise', () => {
    expect(clockMoved(10, 10.005)).toBe(false);
    expect(clockMoved(10, 10.3)).toBe(true);
    expect(clockMoved(30, 12)).toBe(true);
  });
});
