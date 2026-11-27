const CACHE = 'mf6-v2';
const FILES = [
  './', './index.html', './style.css', './app.js', './athlete.js',
  './manifest.json', './icon192.png', './icon512.png',
  './assets/athlete-model.js', './assets/vendor/three.module.min.js',
  './assets/vendor/three.core.min.js', './assets/vendor/OrbitControls.js',
  './assets/vendor/loaders/GLTFLoader.js', './assets/vendor/utils/BufferGeometryUtils.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
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
