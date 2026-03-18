const CACHE = 'make-v1';
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './manifest.json',
    './core/app.js',
    './core/state.js',
    './core/storage.js',
    './core/commandParser.js',
    './core/gridEngine.js',
    './components/Card.js',
    './components/Grid.js',
    './components/CommandPalette.js',
    './components/Modal.js',
    './components/TopBar.js',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(res => res || fetch(e.request))
    );
});
