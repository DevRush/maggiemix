/* MaggieMix service worker — offline support for the installed app.
 *
 * Strategy
 *  - Same-origin files: network first (so a deploy is picked up on the next
 *    visit), falling back to the cache when offline or when the network is
 *    slow (> NETWORK_TIMEOUT_MS). The app shell is pre-cached on install so
 *    the site works offline after a single visit.
 *  - Google Fonts: stale-while-revalidate (font files are immutable anyway).
 *  - Everything else: untouched.
 *
 * Bump CACHE_VERSION when you want old caches purged on the next activation
 * (not required for routine content updates thanks to network-first).
 */
const CACHE_VERSION = 'v2';
const CACHE_NAME = `maggiemix-${CACHE_VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

const APP_SHELL = [
  './',
  './css/tailwind.css',
  './css/styles.css',
  './js/recipes.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon-180.png',
];

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// Best-effort extras: fetched at install if the network allows, never block installation.
const OPTIONAL = [
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all([
        cache.addAll(APP_SHELL),
        ...OPTIONAL.map(url => cache.add(url).catch(() => {})),
      ]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('maggiemix-') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  } else if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

function fetchWithTimeout(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(req).then(res => { clearTimeout(timer); resolve(res); }, err => { clearTimeout(timer); reject(err); });
  });
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  // Start the real fetch once; if it is slow we serve the cache but still let
  // the fetch finish so the cache is refreshed for next time.
  const networkPromise = fetch(req).then(res => {
    if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
    return res;
  });
  try {
    return await Promise.race([
      networkPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
  } catch (e) {
    networkPromise.catch(() => {}); // avoid unhandled rejection noise
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (cached) return cached;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./');
      if (shell) return shell;
    }
    // Last resort: let the real fetch settle (it may still succeed) or fail honestly.
    return networkPromise;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);
  const network = fetch(req).then(res => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => cached);
  return cached || network;
}
