/**
 * REQ-05 · Pure rules of the calendar notices on this device (covered by `pushRules.test.ts`): can it get Web Push at
 * all, what the «Avisos» switch says, when to suggest it once, and which changes of the feed are still unseen.
 */

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

export interface PushEnv {
  /** VITE_VAPID_PUBLIC_KEY (empty: the deploy has no keys yet, the switch hides). */
  vapidKey: string | null | undefined;
  /** Local demo: the switch is simulated (nothing is sent anywhere). */
  demo: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  ios: boolean;
  /** Opened from the home screen (installed). */
  standalone: boolean;
  permission: PushPermission;
}

/**
 * What the device can do:
 * - `hidden`: no VAPID key in this deploy → no switch at all.
 * - `demo`: simulated switch.
 * - `ios-install`: an iPhone only gets Web Push from the home screen.
 * - `unsupported`: this browser has no Web Push.
 * - `denied`: the browser blocked notifications for the app (only the browser's settings can undo it).
 * - `ready`: the switch works.
 */
export type PushAvailability = 'hidden' | 'demo' | 'ios-install' | 'unsupported' | 'denied' | 'ready';

export function pushAvailability(env: PushEnv): PushAvailability {
  if (env.demo) return 'demo';
  if (!env.vapidKey?.trim()) return 'hidden';
  if (env.ios && !env.standalone) return 'ios-install';
  if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification || env.permission === 'unsupported') {
    return 'unsupported';
  }
  if (env.permission === 'denied') return 'denied';
  return 'ready';
}

/** The switch can be pressed (the rest only explain). */
export const canToggle = (availability: PushAvailability) => availability === 'ready' || availability === 'demo';

/** The one-time suggestion after choosing «¿Quién eres?» for the first time. */
export function shouldSuggestPush(input: {
  availability: PushAvailability;
  permission: PushPermission;
  subscribed: boolean;
  alreadySuggested: boolean;
}): boolean {
  if (input.alreadySuggested || input.subscribed || !canToggle(input.availability)) return false;
  return input.availability === 'demo' || input.permission === 'default';
}

/** The base64url VAPID public key as the bytes `pushManager.subscribe` wants. */
export function vapidKeyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const clean = base64url.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

// ───────────── The dot inside the app ─────────────

export interface FeedEntry {
  created_at: string;
  author_member: string | null;
}

/** Changes newer than this device's mark and made by someone else (a device without a name sees them all). */
export function unseenChanges<T extends FeedEntry>(changes: readonly T[], seenAt: string, me: string | null): T[] {
  const mark = Date.parse(seenAt);
  return changes.filter((c) => Date.parse(c.created_at) > mark && (me == null || c.author_member !== me));
}

/**
 * The new mark after looking at the calendar: now, or the newest change seen if the server's clock runs ahead of
 * this phone's (otherwise that change would keep the dot on).
 */
export function nextSeenMark(changes: readonly FeedEntry[], nowIso: string): string {
  let best = Date.parse(nowIso);
  for (const c of changes) best = Math.max(best, Date.parse(c.created_at));
  return new Date(best).toISOString();
}

/** A stored mark, or null when missing or unreadable. */
export function readSeenMark(raw: string | null): string | null {
  if (!raw) return null;
  return Number.isFinite(Date.parse(raw)) ? raw : null;
}

/** Where a notice takes you: `/calendario?dia=AAAA-MM-DD`. */
export function calendarDayUrl(day: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `/calendario?dia=${day}` : '/calendario';
}

/** A link handed over by the service worker: only paths of this app, never another site. */
export function safeAppPath(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return null;
  return url;
}
