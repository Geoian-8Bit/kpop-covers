import { describe, expect, it } from 'vitest';
import {
  buildPayload,
  isGoneStatus,
  isPushEndpoint,
  parseWebhook,
  pickRecipients,
  sameSecret,
} from './rules';

const ANA = '0d0d0d0d-0000-4000-8000-0000000000a1';
const BEA = '0d0d0d0d-0000-4000-8000-0000000000a2';
const CREW = '0d0d0d0d-0000-4000-8000-0000000000c1';

const record = {
  id: '0d0d0d0d-0000-4000-8000-000000000001',
  crew_id: CREW,
  author_member: BEA,
  subject_member: ANA,
  target_date: '2031-11-08',
  body: 'Ana no puede el sáb 8 nov',
  created_at: '2031-11-01T10:00:00Z',
};

const sub = (n: number, member: string | null, host = 'fcm.googleapis.com') => ({
  endpoint: `https://${host}/fcm/send/${n}`,
  p256dh: 'p',
  auth: 'a',
  member_id: member,
});

describe('parseWebhook', () => {
  it('reads an insert into calendar_changes', () => {
    expect(
      parseWebhook({ type: 'INSERT', table: 'calendar_changes', schema: 'public', record, old_record: null }),
    ).toEqual(record);
  });
  it('ignores anything else', () => {
    expect(parseWebhook(null)).toBeNull();
    expect(parseWebhook({ type: 'UPDATE', table: 'calendar_changes', record })).toBeNull();
    expect(parseWebhook({ type: 'INSERT', table: 'absences', record })).toBeNull();
    expect(parseWebhook({ type: 'INSERT', table: 'calendar_changes', schema: 'private', record })).toBeNull();
    expect(
      parseWebhook({
        type: 'INSERT',
        table: 'calendar_changes',
        record: { ...record, target_date: 'mañana' },
      }),
    ).toBeNull();
    expect(
      parseWebhook({ type: 'INSERT', table: 'calendar_changes', record: { ...record, body: '  ' } }),
    ).toBeNull();
    expect(
      parseWebhook({ type: 'INSERT', table: 'calendar_changes', record: { ...record, author_member: 'x' } }),
    ).toBeNull();
  });
  it('accepts an anonymous change', () => {
    expect(
      parseWebhook({ type: 'INSERT', table: 'calendar_changes', record: { ...record, author_member: null } })
        ?.author_member,
    ).toBeNull();
  });
});

describe('buildPayload', () => {
  it('titles it «Calendario», tags and links it by day', () => {
    expect(buildPayload(record)).toEqual({
      title: 'Calendario',
      body: 'Ana no puede el sáb 8 nov',
      tag: 'calendario-2031-11-08',
      url: '/calendario?dia=2031-11-08',
    });
  });
});

describe('pickRecipients', () => {
  const subs = [sub(1, ANA), sub(2, BEA), sub(3, null), sub(4, BEA)];
  it('skips the author, keeps the person marked and the devices without a name', () => {
    expect(pickRecipients(subs, { author_member: BEA }).map((s) => s.endpoint)).toEqual([
      subs[0]!.endpoint,
      subs[2]!.endpoint,
    ]);
  });
  it('marking yourself: you are the author, so not you', () => {
    expect(pickRecipients(subs, { author_member: ANA }).map((s) => s.member_id)).toEqual([BEA, null, BEA]);
  });
  it('an anonymous change goes to everyone', () => {
    expect(pickRecipients(subs, { author_member: null })).toHaveLength(4);
  });
  it('only known push services, each endpoint once', () => {
    const odd = [
      sub(5, null, 'evil.test'),
      sub(1, null),
      sub(1, null),
      sub(6, null, 'web.push.apple.com'),
      sub(7, null, 'updates.push.services.mozilla.com'),
    ];
    expect(pickRecipients(odd, { author_member: null }).map((s) => s.endpoint)).toEqual([
      odd[1]!.endpoint,
      odd[3]!.endpoint,
      odd[4]!.endpoint,
    ]);
  });
});

describe('helpers', () => {
  it('push endpoints', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.test/x')).toBe(false);
    expect(isPushEndpoint('basura')).toBe(false);
  });
  it('gone statuses', () => {
    expect(isGoneStatus(404) && isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(429) || isGoneStatus(500) || isGoneStatus(undefined)).toBe(false);
  });
  it('secret comparison', () => {
    expect(sameSecret('abc123', 'abc123')).toBe(true);
    expect(sameSecret('abc124', 'abc123')).toBe(false);
    expect(sameSecret('abc', 'abc123')).toBe(false);
    expect(sameSecret('', 'abc')).toBe(false);
    expect(sameSecret('abc', '')).toBe(false);
    expect(sameSecret(null, 'abc')).toBe(false);
  });
});
