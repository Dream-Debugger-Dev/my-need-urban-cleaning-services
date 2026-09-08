/* ===============================
   MyNeedUrban — service worker
   Enables install-to-home-screen and keeps the shell usable offline.

   Deliberately conservative: only same-origin GET requests are cached, and
   Firebase/Firestore traffic is never touched so live data stays live.
   =============================== */

const VERSION    = 'mnu-v1';
const SHELL      = `${VERSION}-shell`;
const RUNTIME    = `${VERSION}-runtime`;

// Kept small on purpose — just enough to boot the app shell offline.
const SHELL_ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'css/animations.css',
  'js/main.js',
  'assets/logo/MyNeedUrban_logo_v3.png',
  'assets/pwa/icon-192.png',
  'manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      // addAll fails the whole install if any one file 404s, so add individually
      .then(cache => Promise.allSettled(SHELL_ASSETS.map(a => cache.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/** Never cache these — they must always hit the network. */
function isBypassed(url) {
  return (
    url.origin !== self.location.origin ||       // Firebase, fonts, CDNs, maps
    url.pathname.includes('/pages/admin.html') || // live data, always fresh
    url.search.includes('nocache')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (isBypassed(url)) return;                   // let the browser handle it

  // Navigations: network first, fall back to cache when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(RUNTIME).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
    );
    return;
  }

  // Static assets: serve from cache, refresh in the background.
  event.respondWith(
    caches.match(req).then(hit => {
      const network = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(RUNTIME).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});

// Lets the page trigger an immediate update after a deploy.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
