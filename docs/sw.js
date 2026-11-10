// Network first and always revalidated, so phones get updates as soon as they are online; falls back to the cache offline.
const CACHE = 'referrals-v4';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'sound.js', 'redact.js', 'core.js', 'config.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  if (/\.mp3$/.test(new URL(e.request.url).pathname)) return;   // let the phone stream the song itself (range requests)
  e.respondWith(fetch(e.request, {cache: 'no-cache'}).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
// tapping a pop-up alert opens the app at that post
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = './' + (e.notification.tag || '');
  e.waitUntil(self.clients.matchAll({type: 'window'}).then(list => {
    for (const c of list) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
