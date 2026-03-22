/**
 * MAKÉ Service Worker (V12)
 * V12: precache list updated — landing page is index.html, app is app.html
 */

const BUILD_HASH = typeof __BUILD_HASH__ !== 'undefined' ? __BUILD_HASH__ : 'manual';
const CACHE = `make-${BUILD_HASH}`;

const PRECACHE = [
  './',
  './index.html',
  './app.html',
  './styles.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './app.js',
  './core/schema.js',
  './core/state.js',
  './core/storage.js',
  './utils/helpers.js',
  './utils/rich-text.js',
  './utils/syntax.js',
  './utils/drag.js',
  './utils/resize.js',
  './ui/cards.js',
  './ui/stickies.js',
  './ui/note-editor.js',
  './ui/code-editor.js',
  './ui/modals.js',
  './features/ambient.js',
  './features/data.js',
  './features/drawer.js',
  './features/search.js',
  './features/sort-menu.js',
  './features/onboarding.js',
  './features/save-as.js',
  './features/folders.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname === 'www.google.com' && url.pathname.startsWith('/s2/favicons')) return;
  if (url.hostname !== self.location.hostname && !url.pathname.startsWith(self.location.pathname)) return;
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && res.type === 'basic') {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      }).catch(() => new Response('Offline — open Maké while online first to cache it.', {
        status: 503, headers: { 'Content-Type': 'text/plain' },
      }));
    })
  );
});
