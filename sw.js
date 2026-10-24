// Робота без інтернету: спершу мережа (щоб оновлення приходили одразу), без мережі — збережена копія.
const CACHE = 'na-sviy-lad-v5';
const CORE = [
  './', './index.html', './css/styles.css', './manifest.webmanifest',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
  './js/utils.js', './js/storage.js', './js/state.js', './js/ui.js', './js/week.js', './js/board.js', './js/goals.js',
  './js/habits.js', './js/balance.js', './js/stats.js', './js/year.js', './js/meals.js', './js/tools.js', './js/help.js',
  './js/select.js', './js/datepick.js', './js/app.js', './js/sync.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // шрифти Google — з кешу, у фоні оновлюються
  if (url.host.includes('fonts.googleapis.com') || url.host.includes('fonts.gstatic.com')) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((r) => {
      if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone()));
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('./index.html')))
  );
});
