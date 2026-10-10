/* AirData scanner service worker: offline app shell + Background Sync wake-up.
 * - Cache-first for same-origin navigations/static (offline kiosk shell).
 * - Network-first for /api (never serve stale scans/wallets).
 * - On Background Sync, poke open tabs to flush the IndexedDB scan queue.
 */
const VERSION = 'airdata-v3';
const SHELL = [ '/', '/index.html', '/scanner', '/manifest.webmanifest' ];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API: network first, no cache fallback (stale money/scan data is worse than offline).
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request).catch(() => Response.error()));
    return;
  }

  // Navigations: network first, fall back to cached shell for offline kiosk.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/index.html', copy).catch(() => undefined));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r ?? Response.error())),
    );
    return;
  }

  // Static: cache first, refresh in background.
  event.respondWith(
    caches.match(request).then((hit) => {
      const net = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(request, copy).catch(() => undefined));
          }
          return res;
        })
        .catch(() => hit);
      return hit ?? net;
    }),
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag !== 'scan-queue') return;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      clients.forEach((c) => c.postMessage({ type: 'SYNC_SCAN_QUEUE' }));
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
