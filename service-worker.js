/* =========================================================================
   Soundboard — service-worker.js
   Provides full offline support via the Cache API.

   IMPORTANT (GitHub Pages compatibility):
   All asset URLs are resolved relative to this file's own location
   (self.registration.scope), NOT the domain root. This means the app
   works correctly whether it's hosted at:
     https://username.github.io/            (user/org root site)
     https://username.github.io/soundboard/ (project site sub-path)
   No absolute "/" paths are used anywhere in this file.
   ========================================================================= */

'use strict';

/* -------------------------------------------------------------------------
 * CACHE VERSIONING
 * Bump CACHE_VERSION whenever you change any cached file. This creates a
 * new cache name, so the old one (and its stale files) gets cleaned up in
 * the 'activate' event. Forgetting to bump this is the #1 cause of
 * "my update isn't showing up" issues with service workers.
 * ---------------------------------------------------------------------- */
const CACHE_VERSION = 'v2';
const CACHE_NAME = `soundboard-cache-${CACHE_VERSION}`;

/* -------------------------------------------------------------------------
 * FILES TO PRE-CACHE ON INSTALL
 * Paths are relative to this service worker's location, so `self.registration
 * .scope` (resolved automatically by the browser for relative URLs) keeps
 * everything correct under any sub-path.
 * Add new sound files here whenever you add entries to the `sounds` array
 * in app.js, so they're available offline immediately after install.
 * ---------------------------------------------------------------------- */
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './sounds.js',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './sounds/airhorn.wav',
  './sounds/bell.wav',
  './sounds/clap.wav',
  './sounds/drum.wav',
  './sounds/laugh.wav',
  './sounds/siren.wav',
  './sounds/whistle.wav',
  './sounds/ding.wav',
];

/* -------------------------------------------------------------------------
 * INSTALL: pre-cache the app shell + assets.
 * ---------------------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll fails atomically if any single request fails (e.g. a typo'd
      // filename); that's intentional so problems surface immediately in
      // development rather than silently degrading offline support.
      return cache.addAll(PRECACHE_URLS);
    })
  );
  // Activate the new service worker as soon as it finishes installing.
  self.skipWaiting();
});

/* -------------------------------------------------------------------------
 * ACTIVATE: remove any caches from previous versions.
 * ---------------------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name.startsWith('soundboard-cache-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

/* -------------------------------------------------------------------------
 * FETCH: cache-first strategy with network fallback, and a background
 * "stale-while-revalidate" style refresh so updates are picked up over time.
 * ---------------------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  // Only handle GET requests; let everything else (if any) pass through.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const networkFetch = fetch(event.request)
        .then((networkResponse) => {
          // Only cache valid, same-origin responses.
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Network unavailable; if we also have no cache entry, there's
          // nothing more we can do — the calling code (app.js) already
          // handles missing/broken audio gracefully.
          return cachedResponse;
        });

      // Serve from cache immediately if available (fast + offline-capable);
      // otherwise wait for the network.
      return cachedResponse || networkFetch;
    })
  );
});
