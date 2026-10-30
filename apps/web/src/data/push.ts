import { create } from 'zustand';
import { isIos, isStandalone } from '@/components/InstallApp';
import {
  pushAvailability,
  shouldSuggestPush,
  vapidKeyBytes,
  type PushAvailability,
  type PushPermission,
} from '@/features/calendar/pushRules';
import { IS_DEMO, pushBackend, type PushKeys } from '@/lib/backend';
import { useIdentity } from './members';

/**
 * REQ-05 · «Avisos» on this device: subscribe to Web Push and keep the server's copy of the subscription in step
 * (its member follows «¿Quién eres?»). Everything degrades quietly: no VAPID key in the deploy hides the switch, no
 * service worker or no permission only explains, and the in-app dot (data/calendar.ts) works without any of it.
 */

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() || null;
const SUGGESTED_KEY = 'oneshoot.push.suggested.v1';
const DEMO_KEY = 'oneshoot.push.demo.v1';
const DEMO_ENDPOINT = 'https://demo.invalid/one-shoot-push';

export class PushError extends Error {}

function permission(): PushPermission {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export function readAvailability(): PushAvailability {
  if (typeof window === 'undefined') return 'hidden';
  return pushAvailability({
    vapidKey: VAPID_KEY,
    demo: IS_DEMO,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: typeof Notification !== 'undefined',
    ios: isIos(),
    standalone: isStandalone(),
    permission: permission(),
  });
}

interface PushState {
  availability: PushAvailability;
  subscribed: boolean;
  busy: boolean;
  /** The one-time suggestion after choosing «¿Quién eres?». */
  suggestOpen: boolean;
}

export const usePush = create<PushState>()(() => ({
  availability: readAvailability(),
  subscribed: false,
  busy: false,
  suggestOpen: false,
}));

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* this visit only */
    }
  },
};

/** The app's service worker, once it runs (none on the dev server, or for a moment on the very first visit). */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  const found = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  if (!found) return null;
  if (found.active) return found;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription().catch(() => null) : null;
}

function keysOf(subscription: PushSubscription): PushKeys {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new PushError('el navegador no dio las claves de la suscripción');
  return { endpoint: subscription.endpoint, p256dh, auth };
}

/** Reads what the device has now (permission and subscription). */
export async function refreshPush(): Promise<void> {
  const availability = readAvailability();
  if (availability === 'demo') {
    usePush.setState({ availability, subscribed: storage.get(DEMO_KEY) === 'on' });
    return;
  }
  if (availability !== 'ready') {
    usePush.setState({ availability, subscribed: false });
    return;
  }
  const subscription = permission() === 'granted' ? await currentSubscription() : null;
  usePush.setState({ availability, subscribed: Boolean(subscription) });
}

/** «Activar avisos»: asks for permission, subscribes and tells the server. Throws a PushError with the reason. */
export async function enablePush(): Promise<void> {
  usePush.setState({ busy: true });
  try {
    if (IS_DEMO) {
      // Simulated: nothing leaves the device.
      await pushBackend.saveSubscription({ endpoint: DEMO_ENDPOINT, p256dh: 'demo', auth: 'demo' }, useIdentity.getState().memberId);
      storage.set(DEMO_KEY, 'on');
      usePush.setState({ subscribed: true });
      return;
    }
    if (!VAPID_KEY) throw new PushError('esta versión de la app no tiene avisos configurados');
    const answer = await Notification.requestPermission();
    if (answer !== 'granted') {
      usePush.setState({ availability: readAvailability() });
      throw new PushError(answer === 'denied' ? 'el navegador ha bloqueado los avisos' : 'no se dio permiso');
    }
    const reg = await registration();
    if (!reg) throw new PushError('la app aún se está preparando; prueba otra vez en un momento');
    let subscription = await reg.pushManager.getSubscription();
    try {
      subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(VAPID_KEY) });
    } catch {
      throw new PushError('el navegador no pudo suscribirse');
    }
    try {
      await pushBackend.saveSubscription(keysOf(subscription), useIdentity.getState().memberId);
    } catch (error) {
      // The server doesn't know it: don't leave a subscription that would never get anything.
      await subscription.unsubscribe().catch(() => false);
      throw error instanceof PushError ? error : new PushError('no hay conexión con el servidor');
    }
    usePush.setState({ subscribed: true });
  } finally {
    usePush.setState({ busy: false });
  }
}

/** Switch off: unsubscribes here and forgets the subscription on the server. */
export async function disablePush(): Promise<void> {
  usePush.setState({ busy: true });
  try {
    if (IS_DEMO) {
      await pushBackend.deleteSubscription(DEMO_ENDPOINT);
      storage.set(DEMO_KEY, null);
      usePush.setState({ subscribed: false });
      return;
    }
    const subscription = await currentSubscription();
    if (subscription) {
      const { endpoint } = subscription;
      await subscription.unsubscribe().catch(() => false);
      // If this fails the server finds out by itself: the next push to it answers 410 and is removed.
      await pushBackend.deleteSubscription(endpoint).catch(() => undefined);
    }
    usePush.setState({ subscribed: false });
  } finally {
    usePush.setState({ busy: false });
  }
}

/** The new «¿Quién eres?» goes to the server, so this device stops hearing about its own changes. */
async function syncMember(memberId: string | null): Promise<void> {
  if (!usePush.getState().subscribed) return;
  if (IS_DEMO) {
    await pushBackend.saveSubscription({ endpoint: DEMO_ENDPOINT, p256dh: 'demo', auth: 'demo' }, memberId);
    return;
  }
  const subscription = await currentSubscription();
  if (subscription) await pushBackend.saveSubscription(keysOf(subscription), memberId);
}

function maybeSuggest(): void {
  const state = usePush.getState();
  const suggest = shouldSuggestPush({
    availability: state.availability,
    permission: permission(),
    subscribed: state.subscribed,
    alreadySuggested: storage.get(SUGGESTED_KEY) === '1',
  });
  if (!suggest) return;
  // Once every dialog has gone («¿Quién eres?» itself, or the form it was asked from): never two at once, and never
  // over someone's form. Gives up after two minutes (it comes back with the next first choice of a name).
  let tries = 0;
  const timer = window.setInterval(() => {
    tries++;
    if (tries > 120) {
      window.clearInterval(timer);
      return;
    }
    if (tries < 2 || document.querySelector('[role="dialog"]')) return;
    window.clearInterval(timer);
    storage.set(SUGGESTED_KEY, '1');
    usePush.setState({ suggestOpen: true });
  }, 1000);
}

export const closePushSuggestion = () => usePush.setState({ suggestOpen: false });

let started = false;

/** Once per app: reads the device's state and follows «¿Quién eres?». */
export function startPush(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  void refreshPush();
  useIdentity.subscribe((state, previous) => {
    if (state.memberId === previous.memberId) return;
    void syncMember(state.memberId).catch(() => undefined);
    if (!previous.memberId && state.memberId) maybeSuggest();
  });
}

/** Opening (or coming back to) the app: the icon's count of unseen notices goes back to 0. */
export function clearAppBadge(): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
  void nav.clearAppBadge?.().catch(() => undefined);
  navigator.serviceWorker?.controller?.postMessage({ type: 'oneshoot-badge-clear' });
}
