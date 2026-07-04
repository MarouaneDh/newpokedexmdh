/* Pokédex service worker — app shell + runtime caching for offline use */
const CACHE = 'pokedex-v5';
const SHELL = ['./', './index.html', './app.js', './styles.css', './manifest.json', './icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // PokeAPI data: network-first, fall back to cache (offline)
  if (url.hostname === 'pokeapi.co') {
    e.respondWith(
      fetch(request)
        .then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(request, cp)); return r; })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else (shell, sprites, fonts, CDN): cache-first with runtime fill
  e.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((r) => {
      if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(request, cp)); }
      return r;
    }).catch(() => cached))
  );
});
