/**
 * REQ-05 · Pure rules of the `notify-calendar` Edge Function (no Deno, no network): read the Database Webhook's
 * body, pick who gets the notice and build what is sent. Tested with vitest from apps/web
 * (`supabase/functions/notify-calendar/rules.test.ts`).
 */

/** A row of `public.calendar_changes` as the webhook sends it. */
export interface CalendarChangeRecord {
  id: string;
  crew_id: string;
  author_member: string | null;
  subject_member: string | null;
  target_date: string;
  body: string;
  created_at?: string;
}

/** A row of `public.push_subscriptions` (only what sending needs). */
export interface SubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
  member_id: string | null;
}

export interface PushPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const optionalUuid = (value: unknown): value is string | null =>
  value === null || value === undefined || (typeof value === 'string' && UUID.test(value));

/**
 * The webhook body (`{ type, table, schema, record, old_record }`) → the new change, or null when it isn't an
 * insert into `public.calendar_changes` with a well-formed row.
 */
export function parseWebhook(body: unknown): CalendarChangeRecord | null {
  if (!isObject(body) || body.type !== 'INSERT' || body.table !== 'calendar_changes') return null;
  if (body.schema !== undefined && body.schema !== 'public') return null;
  const r = body.record;
  if (!isObject(r)) return null;
  if (typeof r.id !== 'string' || typeof r.crew_id !== 'string' || !UUID.test(r.crew_id)) return null;
  if (!optionalUuid(r.author_member) || !optionalUuid(r.subject_member)) return null;
  if (typeof r.target_date !== 'string' || !DAY.test(r.target_date)) return null;
  if (typeof r.body !== 'string' || !r.body.trim()) return null;
  return {
    id: r.id,
    crew_id: r.crew_id,
    author_member: (r.author_member as string | null | undefined) ?? null,
    subject_member: (r.subject_member as string | null | undefined) ?? null,
    target_date: r.target_date,
    body: r.body.slice(0, 300),
    created_at: typeof r.created_at === 'string' ? r.created_at : undefined,
  };
}

/** What the service worker shows: title «Calendario», one tag per day (same-day notices replace each other). */
export function buildPayload(change: Pick<CalendarChangeRecord, 'body' | 'target_date'>): PushPayload {
  return {
    title: 'Calendario',
    body: change.body,
    tag: `calendario-${change.target_date}`,
    url: `/calendario?dia=${change.target_date}`,
  };
}

/** Known Web Push services (Chrome/Android, Firefox, Edge/Windows, Safari/iOS): nothing else is ever called. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/,
];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

/**
 * Everyone in the group except the devices of whoever made the change. The person a change is about still gets it
 * when someone else made it (they are only skipped as its author). A device without «¿Quién eres?» gets every
 * notice; an anonymous change goes to everyone.
 */
export function pickRecipients<T extends SubscriptionRow>(
  subscriptions: readonly T[],
  change: Pick<CalendarChangeRecord, 'author_member'>,
): T[] {
  const seen = new Set<string>();
  return subscriptions.filter((s) => {
    if (seen.has(s.endpoint) || !isPushEndpoint(s.endpoint)) return false;
    seen.add(s.endpoint);
    return change.author_member == null || s.member_id !== change.author_member;
  });
}

/** 404 / 410 from the push service: the subscription is gone for good and is removed. */
export const isGoneStatus = (status: number | undefined) => status === 404 || status === 410;

/** Compares the webhook's secret header without leaking how much of it matched. */
export function sameSecret(given: string | null | undefined, expected: string | null | undefined): boolean {
  if (!given || !expected) return false;
  let diff = given.length ^ expected.length;
  for (let i = 0; i < expected.length; i++)
    diff |= given.charCodeAt(i % Math.max(given.length, 1)) ^ expected.charCodeAt(i);
  return diff === 0;
}
