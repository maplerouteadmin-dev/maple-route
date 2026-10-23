// Keeps OSMS map pictures, renders and lists in this player's browser after the first load, so each
// map is fetched from OSMS once per player, not every visit. Lists (.json) are refreshed when online.
// Only OSMS files are touched; the app's own files load normally.
const CACHE = 'osms-v1';
const OSMS = 'https://osmsdataexplorer.com/data/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.href.startsWith(OSMS)) return;
  url.searchParams.delete('retry');
  const key = url.href;
  if (url.pathname.endsWith('.json')) {
    // Lists: fresh when OSMS answers, the saved copy when it is busy or offline.
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(key, copy)); }
      return response;
    }).catch(() => caches.match(key).then(saved => saved ?? Response.error())));
    return;
  }
  // Pictures never change for a game version: the saved copy first, OSMS only the first time.
  event.respondWith(caches.match(key).then(saved => saved ?? fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(key, copy)); }
    return response;
  })));
});
