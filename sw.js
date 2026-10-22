/* El Diamante: guarda la app para abrir rápido y sin señal. Los datos siempre vienen del servidor. */
const VERSION = 'diamante-87995200ec';
const BASE = ['./', 'index.html', 'manifest.webmanifest', 'icons/badge-96.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== VERSION).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
const API_URL = "https://script.google.com/macros/s/AKfycbx_myB0-tQoGIjrci5SZh-UAH_F97YgiN--v5nDSFIBrGupZ5LPpLJfTLWLfvLtKxSw4Q/exec";
/* Notificación: llega vacía y aquí se pide el texto al servidor. */
self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let m = null;
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: 'pubPushPendiente', args: [sub && sub.endpoint] }) });
      const j = await r.json(); m = j && j.ok ? j.r : null;
    } catch (err) {}
    await self.registration.showNotification(m ? m.t : 'El Diamante', {
      body: m ? m.b : 'Tienes algo nuevo en El Diamante.', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
      vibrate: [200, 100, 200], tag: m ? m.id : 'diamante', renotify: true, data: { vista: m ? m.v : 'inicio' }
    });
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const vista = (e.notification.data && e.notification.data.vista) || 'inicio';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { c.postMessage({ vista: vista }); return c.focus(); } }
    return self.clients.openWindow('./#' + vista);
  }));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { const copia = res.clone(); caches.open(VERSION).then(c => c.put(r, copia)); return res; }).catch(() => caches.match(r).then(m => m || caches.match('index.html'))));
});
