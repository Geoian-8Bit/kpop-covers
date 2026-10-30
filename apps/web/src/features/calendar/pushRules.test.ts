import { describe, expect, it } from 'vitest';
import {
  calendarDayUrl,
  canToggle,
  nextSeenMark,
  pushAvailability,
  readSeenMark,
  safeAppPath,
  shouldSuggestPush,
  unseenChanges,
  vapidKeyBytes,
  type PushEnv,
} from './pushRules';

const env = (over: Partial<PushEnv> = {}): PushEnv => ({
  vapidKey: 'BExampleKey',
  demo: false,
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  ios: false,
  standalone: false,
  permission: 'default',
  ...over,
});

describe('pushAvailability', () => {
  it('hides the switch without a VAPID key (a deploy with no keys yet)', () => {
    expect(pushAvailability(env({ vapidKey: '' }))).toBe('hidden');
    expect(pushAvailability(env({ vapidKey: undefined }))).toBe('hidden');
  });
  it('simulates it in the demo, even without a key', () => {
    expect(pushAvailability(env({ demo: true, vapidKey: '' }))).toBe('demo');
  });
  it('asks iPhones to install first', () => {
    expect(pushAvailability(env({ ios: true }))).toBe('ios-install');
    expect(pushAvailability(env({ ios: true, standalone: true }))).toBe('ready');
  });
  it('explains a browser without Web Push and a blocked permission', () => {
    expect(pushAvailability(env({ hasPushManager: false }))).toBe('unsupported');
    expect(pushAvailability(env({ permission: 'unsupported' }))).toBe('unsupported');
    expect(pushAvailability(env({ permission: 'denied' }))).toBe('denied');
  });
  it('is ready otherwise', () => {
    expect(pushAvailability(env())).toBe('ready');
    expect(pushAvailability(env({ permission: 'granted' }))).toBe('ready');
    expect(canToggle('ready') && canToggle('demo') && !canToggle('denied') && !canToggle('ios-install')).toBe(true);
  });
});

describe('shouldSuggestPush', () => {
  const base = { availability: 'ready' as const, permission: 'default' as const, subscribed: false, alreadySuggested: false };
  it('suggests once, when the permission has not been asked yet', () => {
    expect(shouldSuggestPush(base)).toBe(true);
    expect(shouldSuggestPush({ ...base, alreadySuggested: true })).toBe(false);
    expect(shouldSuggestPush({ ...base, subscribed: true })).toBe(false);
    expect(shouldSuggestPush({ ...base, permission: 'denied' })).toBe(false);
    expect(shouldSuggestPush({ ...base, permission: 'granted' })).toBe(false);
  });
  it('never where the switch cannot work', () => {
    expect(shouldSuggestPush({ ...base, availability: 'hidden' })).toBe(false);
    expect(shouldSuggestPush({ ...base, availability: 'ios-install' })).toBe(false);
    expect(shouldSuggestPush({ ...base, availability: 'demo', permission: 'unsupported' })).toBe(true);
  });
});

describe('vapidKeyBytes', () => {
  it('decodes base64url without padding', () => {
    expect(Array.from(vapidKeyBytes('AQID_w'))).toEqual([1, 2, 3, 255]);
    expect(Array.from(vapidKeyBytes('-_8'))).toEqual([251, 255]);
  });
});

describe('the unseen dot', () => {
  const changes = [
    { created_at: '2026-11-01T10:00:00Z', author_member: 'ana' },
    { created_at: '2026-11-01T12:00:00Z', author_member: 'bea' },
    { created_at: '2026-11-01T13:00:00Z', author_member: null },
  ];
  it('counts changes after the mark made by someone else', () => {
    expect(unseenChanges(changes, '2026-11-01T11:00:00Z', 'bea')).toEqual([changes[2]]);
    expect(unseenChanges(changes, '2026-11-01T11:00:00Z', 'ana')).toEqual([changes[1], changes[2]]);
    expect(unseenChanges(changes, '2026-11-01T09:00:00Z', null)).toHaveLength(3);
    expect(unseenChanges(changes, '2026-11-01T13:00:00Z', null)).toHaveLength(0);
  });
  it('moves the mark to now, or past a change from a server clock ahead', () => {
    expect(nextSeenMark(changes, '2026-11-01T14:00:00.000Z')).toBe('2026-11-01T14:00:00.000Z');
    expect(nextSeenMark(changes, '2026-11-01T12:30:00.000Z')).toBe('2026-11-01T13:00:00.000Z');
  });
  it('reads a stored mark', () => {
    expect(readSeenMark(null)).toBeNull();
    expect(readSeenMark('basura')).toBeNull();
    expect(readSeenMark('2026-11-01T13:00:00.000Z')).toBe('2026-11-01T13:00:00.000Z');
  });
});

describe('links', () => {
  it('opens the day of the notice', () => {
    expect(calendarDayUrl('2026-11-08')).toBe('/calendario?dia=2026-11-08');
    expect(calendarDayUrl('mañana')).toBe('/calendario');
  });
  it('only follows paths of this app', () => {
    expect(safeAppPath('/calendario?dia=2026-11-08')).toBe('/calendario?dia=2026-11-08');
    expect(safeAppPath('//evil.test/x')).toBeNull();
    expect(safeAppPath('https://evil.test')).toBeNull();
    expect(safeAppPath(42)).toBeNull();
  });
});
