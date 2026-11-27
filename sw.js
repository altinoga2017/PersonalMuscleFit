const CACHE = 'mf6-v3';
const FILES = [
  './', './index.html', './style.css', './app.js', './athlete.js',
  './manifest.json', './icon192.png', './icon512.png',
  './assets/athlete-model.js', './assets/vendor/three.module.min.js',
  './assets/vendor/three.core.min.js', './assets/vendor/OrbitControls.js',
  './assets/vendor/loaders/GLTFLoader.js', './assets/vendor/utils/BufferGeometryUtils.js',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map(path => new Request(path, {cache: 'reload'})));
    // Earlier versions cannot request activation from an open app window.
    const keys = await caches.keys();
    if (keys.some(key => ['mf5-v1', 'mf6-v1', 'mf6-v2'].includes(key))) await self.skipWaiting();
  })());
});

self.addEventListener('message', event => {
  if (event.data === 'activate-update') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key === 'mf5-v1' || (key.startsWith('mf6-') && key !== CACHE))
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Serve the app shell and its modules from the same installed release.
    return (await cache.match(request)) ||
      (request.mode === 'navigate' && await cache.match('./index.html')) ||
      fetch(request);
  })());
});
