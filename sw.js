/* ==========================================================================
   sw.js – Service Worker
   --------------------------------------------------------------------------
   Strategie:
     • App-Shell wird bei der Installation vollstaendig vorgeladen
     • Navigationen: erst Netz, sonst die zwischengespeicherte Seite
     • Statische Dateien: aus dem Zwischenspeicher, Auffrischung im Hintergrund
     • /api/data: erst Netz; ohne Verbindung der zuletzt geladene Stand, damit
       Telefonnummern und Medikation auch beim Arzt ohne Empfang dastehen
     • Alle uebrigen /api-Aufrufe gehen ausschliesslich ans Netz

   Wird ein Zugang entzogen, antwortet der Server mit 401. Der zwischen-
   gespeicherte Datenstand wird dann sofort verworfen – sonst koennte ein
   ausgesperrtes Geraet die Daten offline weiter anzeigen.

   WICHTIG: Bei jeder Aenderung an den Dateien unten VERSION hochzaehlen.
   ========================================================================== */

const VERSION = 'v2';
const SHELL_CACHE = `familienbuch-shell-${VERSION}`;
const DATA_CACHE = 'familienbuch-daten';

const SHELL = [
  './',
  './index.html',
  './druck.html',
  './offline.html',
  './app.css',
  './druck.css',
  './js/ui.js',
  './js/api.js',
  './js/app.js',
  './js/druck.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // `cache: 'reload'` umgeht den HTTP-Zwischenspeicher des Browsers – sonst
    // wandern beim Update unter Umstaenden die alten Dateien in den neuen Cache.
    await Promise.all(SHELL.map(async url => {
      try {
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
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
    await Promise.all(keys
      .filter(key => key.startsWith('familienbuch-shell-') && key !== SHELL_CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

const isApi = url => url.pathname.includes('/api/');
const isDataCall = url => /\/api\/data$/.test(url.pathname);

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;   // fremde Hosts unangetastet lassen

  if (isApi(url)) {
    event.respondWith(handleApi(request, url));
    return;
  }
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

async function handleApi(request, url) {
  // Nur der lesende Gesamtabruf wird zwischengespeichert.
  const cacheable = isDataCall(url) && request.method === 'GET';

  try {
    const response = await fetch(request);

    if (response.status === 401) {
      // Zugang entzogen oder abgelaufen: gespeicherten Stand wegwerfen.
      await caches.delete(DATA_CACHE);
    } else if (cacheable && response.ok) {
      const cache = await caches.open(DATA_CACHE);
      await cache.put('data-snapshot', response.clone());
    }
    return response;
  } catch (err) {
    if (!cacheable) throw err;

    const cache = await caches.open(DATA_CACHE);
    const cached = await cache.match('data-snapshot');
    if (!cached) throw err;

    // Kennzeichnen, damit die Oberflaeche „zuletzt geladener Stand“ anzeigen kann.
    const headers = new Headers(cached.headers);
    headers.set('X-Aus-Zwischenspeicher', '1');
    return new Response(await cached.blob(), {
      status: 200,
      statusText: 'OK (Zwischenspeicher)',
      headers,
    });
  }
}

async function handleNavigation(event) {
  const cache = await caches.open(SHELL_CACHE);
  const url = new URL(event.request.url);
  const fallback = url.pathname.endsWith('/druck.html') ? './druck.html' : './index.html';

  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || await fetch(event.request);
    if (response && response.ok) await cache.put(fallback, response.clone());
    return response;
  } catch {
    return (await cache.match(fallback)) ||
           (await cache.match('./offline.html')) ||
           new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request).then(response => {
    if (response && response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || (await network) ||
    new Response('', { status: 504, statusText: 'Offline' });
}
