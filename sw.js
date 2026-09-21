/* ==========================================================================
   sw.js – Service Worker
   --------------------------------------------------------------------------
   Strategie:
     • App-Shell wird bei der Installation vollstaendig vorgeladen
     • Navigationen: erst Netz, bei Fehlschlag die zwischengespeicherte
       index.html, zuletzt offline.html
     • Statische Dateien: sofort aus dem Cache, Aktualisierung im Hintergrund
       (stale-while-revalidate)

   WICHTIG: Bei jeder Aenderung an den Dateien unten VERSION hochzaehlen.
   Nur dann laeuft install/activate erneut und alte Caches werden geraeumt.
   ========================================================================== */

const VERSION = 'v1';
const CACHE = `familienakte-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './offline.html',
  './app.css',
  './js/store.js',
  './js/auth.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // `cache: 'reload'` umgeht den HTTP-Cache des Browsers – sonst wandern
    // beim Update unter Umstaenden die alten Dateien in den neuen Cache.
    await Promise.all(SHELL.map(async url => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        // Eine fehlende Einzeldatei darf die Installation nicht verhindern.
        console.warn('[sw] nicht vorgeladen:', url, err);
      }
    }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('familienakte-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Wird vom Aktualisieren-Banner in app.js ausgeloest.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;   // Fremde Hosts unangetastet lassen

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function handleNavigation(event) {
  const cache = await caches.open(CACHE);
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || await fetch(event.request);
    if (response && response.ok) cache.put('./index.html', response.clone());
    return response;
  } catch {
    return (await cache.match('./index.html')) ||
           (await cache.match('./offline.html')) ||
           new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  const network = fetch(request).then(response => {
    // Nur vollstaendige Antworten vom eigenen Server ablegen.
    if (response && response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || (await network) ||
    new Response('', { status: 504, statusText: 'Offline' });
}
