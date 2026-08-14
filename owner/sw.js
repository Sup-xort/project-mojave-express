const CACHE_NAME = 'mojave-owner-shell-v4';
const SHELL_ASSETS = [
  '/owner/',
  '/owner/css/owner.css',
  '/owner/js/api.js',
  '/owner/js/app.js',
  '/vendor/fonts/fonts.css',
  '/vendor/fonts/PretendardVariable.woff2',
  '/vendor/fonts/InterVariable.woff2',
  '/owner/icons/icon-192.png',
  '/owner/icons/icon-512.png',
  '/owner/icons/icon-192-maskable.png',
  '/owner/icons/icon-512-maskable.png',
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
  // 절대 캐시하지 않는다 — 대시보드/교환 요청은 실시간 데이터고 SSE 연결도 여기로 지나간다.
  if (url.pathname.startsWith('/api/')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
});
