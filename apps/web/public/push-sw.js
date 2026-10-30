/* REQ-05 · Calendar notices in the service worker (loaded by Workbox's generated sw.js via importScripts, see
 * vite.config.ts). Shows each push as a notification, keeps the icon's count of unseen notices (IndexedDB) for
 * setAppBadge where it exists, and opens or focuses the app on the notice's day when tapped. Plain JS on purpose:
 * no bundler runs over public/. */

const BADGE_DB = 'oneshoot-push';
const BADGE_STORE = 'kv';
const BADGE_KEY = 'unseen';

function badgeDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BADGE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(BADGE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Adds `delta` to the stored count (or sets it to 0 with `reset`) and returns the new count. */
async function updateCount(delta, reset) {
  const db = await badgeDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(BADGE_STORE, 'readwrite');
      const store = tx.objectStore(BADGE_STORE);
      const read = store.get(BADGE_KEY);
      let next = 0;
      read.onsuccess = () => {
        const current = typeof read.result === 'number' ? read.result : 0;
        next = reset ? 0 : Math.max(0, current + delta);
        store.put(next, BADGE_KEY);
      };
      tx.oncomplete = () => resolve(next);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Only paths of this app (a payload can't send the app anywhere else). */
function safePath(url) {
  // `/\host` is read as `//host` by URL parsing: backslashes are refused too.
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')
    ? url
    : '/calendario';
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Calendario';
  const body = typeof data.body === 'string' ? data.body : '';
  const tag = typeof data.tag === 'string' && data.tag ? data.tag : 'calendario';
  const url = safePath(data.url);

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body,
        tag,
        // Several changes of the same day replace each other in the tray, but each one still alerts.
        renotify: true,
        icon: '/pwa-192x192.png',
        lang: 'es',
        data: { url },
      });
      try {
        const count = await updateCount(1, false);
        if (self.navigator.setAppBadge) await self.navigator.setAppBadge(count);
      } catch {
        /* the badge is a nicety: the notification is what matters */
      }
      // An open app refreshes its calendar dot straight away.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: 'oneshoot-push' });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const app = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (app) {
        await app.focus();
        // The app routes itself (no reload): see PushHost.
        app.postMessage({ type: 'oneshoot-open', url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'oneshoot-badge-clear') {
    event.waitUntil(
      updateCount(0, true)
        .then(() => (self.navigator.clearAppBadge ? self.navigator.clearAppBadge() : undefined))
        .catch(() => undefined),
    );
  }
});
