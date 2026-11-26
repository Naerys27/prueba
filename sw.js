// Versión de la app (año.mes.número): cambiarla en cada subida. El menú la muestra pidiéndosela al SW.
const VERSION = '2026.11.2';
const CACHE = 'partes-loco-' + VERSION;
const FILES = [
  'index.html',
  'parte_combustible.html',
  'parte_servicio_diario.html',
  'orden_reparacion.html',
  'storage.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data && e.data.type === 'GET_VERSION' && e.ports[0]) e.ports[0].postMessage(VERSION);
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).catch(() => caches.match('index.html')))
  );
});
