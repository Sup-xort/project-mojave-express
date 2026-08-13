const CACHE_NAME = 'mojave-shell-v2';
const SHELL_ASSETS = [
  '/',
  '/css/style.css',
  '/js/api.js',
  '/js/app.js',
  '/vendor/jsQR.js',
  '/vendor/fonts/fonts.css',
  '/vendor/fonts/PretendardVariable.woff2',
  '/vendor/fonts/InterVariable.woff2',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 절대 캐시하지 않는다 — 스탬프/쿠폰은 실시간 데이터다.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/s/')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
});
