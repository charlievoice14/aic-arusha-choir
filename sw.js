/* AIC Arusha Choir — service worker: makes the app installable, opens fast, and shows notifications.
   Always tries the network first so members get updates straight away. */
const CACHE = 'aic-choir-v5';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return; // never touch Firebase traffic
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
/* Notifications sent by the choir server (arrive even when the app is closed). */
self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (x) { p = { data: { body: e.data ? e.data.text() : '' } }; }
  const d = p.data || p.notification || p;
  const title = d.title || 'AIC Arusha Choir';
  const opts = {
    body: d.body || '', tag: d.tag || undefined, icon: 'icon-192.png', badge: 'icon-192.png',
    vibrate: [80, 40, 80], data: { url: d.url || './' }
  };
  const apple = /iPhone|iPad|Macintosh/.test(self.navigator.userAgent);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    // the app is open on screen: it shows its own pop-up, so skip the system one (Apple requires one, so always show there)
    if (!apple && list.some(c => c.visibilityState === 'visible' && c.focused)) return;
    return self.registration.showNotification(title, opts);
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
