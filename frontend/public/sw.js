/*
 * CUR-MIS service worker.
 *
 * Purpose: make the app installable and let it open its shell offline.
 * It deliberately does NOT cache API responses, so users always see live
 * data and never a stale balance, roster, or approval state.
 *
 * Strategy
 *  - Non-GET requests and any /api/ request: passed straight to the network.
 *  - Page navigations: network first, falling back to the cached shell.
 *  - Hashed build assets (same origin, under /assets/): cache first.
 */

const VERSION = 'cur-mis-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const SCOPE_PATH = new URL(self.registration.scope).pathname; // e.g. "/" or "/umis/"
const SHELL_URL = SCOPE_PATH; // the SPA entry point is served for the scope root

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.add(new Request(SHELL_URL, { cache: 'reload' })))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('cur-mis-') && !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return; // never cache live data

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (url.pathname.startsWith(SCOPE_PATH + 'assets/')) {
    event.respondWith(cacheFirst(request));
  }
});

/*
 * Device alerts. The server sends an encrypted JSON payload:
 *   { title, body, url, tag, badge }
 * Every push must show a notification (browsers penalise silent pushes), and
 * the icon badge follows the user's unread count even when the app is closed.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'CUR-MIS', body: event.data ? event.data.text() : '' };
  }

  const icon = SCOPE_PATH + 'icons/icon-192.png';
  const show = self.registration.showNotification(data.title || 'CUR-MIS', {
    body: data.body || '',
    icon,
    badge: icon,
    tag: data.tag || 'cur-mis',
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  });

  event.waitUntil(Promise.all([show, updateBadge(data.badge)]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Payload urls are app-relative ("/applicant"); the app may live under a sub-folder.
  const path = String(event.notification.data?.url || '/').replace(/^\//, '');
  const target = new URL(SCOPE_PATH + path, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((c) => c.url.startsWith(self.registration.scope));
    if (existing) {
      await existing.focus();
      if ('navigate' in existing) await existing.navigate(target);
      return;
    }
    await self.clients.openWindow(target);
  })());
});

async function updateBadge(count) {
  if (typeof count !== 'number' || !self.navigator) return;
  try {
    if (count > 0 && self.navigator.setAppBadge) {
      await self.navigator.setAppBadge(count);
    } else if (self.navigator.clearAppBadge) {
      await self.navigator.clearAppBadge();
    }
  } catch {
    // Badging is optional; a refusal must not hide the notification itself.
  }
}

async function networkFirstShell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(SHELL_URL);
    return cached || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
