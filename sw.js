/* ===============================
   MyNeedUrban — service worker
   Install-to-home-screen + a usable shell when offline.

   Strategy
   - Pages, JS, CSS, manifests: NETWORK FIRST (revalidated with the server),
     falling back to the cache only when offline. A deploy therefore reaches
     installed users on their next open, instead of being hidden behind a
     cache-first copy — the old worker served cache first and its cache name
     never changed, so installed phones could keep an old page indefinitely.
   - Images and fonts: cache first, refreshed in the background.
   - Other origins (Firebase, Google Fonts, CDNs, Maps): never touched.

   Bump VERSION on every deploy (use the same value as the pages' ?v=). That
   changes this file, the browser installs the new worker, and old caches are
   deleted on activation.
   =============================== */

const VERSION = 'mnu-20260924b';
const SHELL   = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const SHELL_ASSETS = [
  './',
  'index.html',
  'pages/account.html',
  'manifest.webmanifest',
  'assets/logo/MyNeedUrban_logo_v3.png',
  'assets/favicon/MyNeedUrban_favicon_v3.png',
  'assets/pwa/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      // addAll fails the whole install if any one file 404s, so add individually
      .then(cache => Promise.allSettled(SHELL_ASSETS.map(a => cache.add(new Request(a, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const FRESH = /\.(?:js|css|webmanifest|json)$/i;

function isBypassed(url) {
  return url.origin !== self.location.origin || url.search.includes('nocache');
}

/** Network (revalidated) → cache fallback. */
async function networkFirst(req, cacheKeyReq = req) {
  const cache = await caches.open(RUNTIME);
  try {
    let fresh;
    try { fresh = await fetch(new Request(req, { cache: 'no-cache' })); }
    catch (e) { if (e instanceof TypeError && !navigator.onLine) throw e; fresh = await fetch(req); }
    if (fresh && fresh.ok && fresh.type === 'basic') cache.put(cacheKeyReq, fresh.clone());
    return fresh;
  } catch (err) {
    const hit = await cache.match(cacheKeyReq) ||
                await caches.match(cacheKeyReq, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}

/** Cache → network, refreshing the cache in the background. */
async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req) || await caches.match(req);
  const network = fetch(req).then(res => {
    if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  }).catch(() => hit);
  return hit || network;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isBypassed(url)) return;                         // let the browser handle it

  if (req.mode === 'navigate') {
    event.respondWith(
      networkFirst(req).catch(async () =>
        (await caches.match('index.html')) || Response.error())
    );
    return;
  }
  if (FRESH.test(url.pathname)) {
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(cacheFirst(req));
});

// Lets a page trigger an immediate update after a deploy.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Tapping a "New booking" alert (shown by the admin page) focuses the
// dashboard if it's already open, otherwise opens it.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || 'pages/admin.html', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.includes('/pages/admin.html'));
      return open ? open.focus() : self.clients.openWindow(target);
    })
  );
});
