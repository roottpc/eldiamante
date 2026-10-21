/* El Diamante: guarda la app para abrir rápido y sin señal. Los datos siempre vienen del servidor. */
const VERSION = 'diamante-bf1323b6c0';
const BASE = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { const copia = res.clone(); caches.open(VERSION).then(c => c.put(r, copia)); return res; }).catch(() => caches.match(r).then(m => m || caches.match('index.html'))));
});
