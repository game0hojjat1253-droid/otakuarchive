// Otaku Archive service worker
// - صفحه‌ها: اول شبکه (تا آپدیت‌ها همیشه برسند)، اگر آفلاین بود از کش
// - فایل‌های ثابت: از کش + آپدیت در پس‌زمینه
// - پوسترها: کش می‌شوند تا آفلاین هم دیده شوند (حداکثر MAX_IMAGES عدد)
// - درخواست‌های API (AniList / TMDB) هرگز کش نمی‌شوند
const VERSION = 'v3';
const SHELL = 'otaku-shell-' + VERSION;
const IMAGES = 'otaku-images-' + VERSION;
const MAX_IMAGES = 400;
const SHELL_FILES = [
  './', './index.html', './manifest.webmanifest', './config.js',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('otaku-') && k !== SHELL && k !== IMAGES).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimImages() {
  const c = await caches.open(IMAGES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_IMAGES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // صفحه اصلی
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(SHELL).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // پوسترها (هر دامنه‌ای)
  if (req.destination === 'image' && url.origin !== location.origin) {
    e.respondWith(
      caches.open(IMAGES).then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === 'opaque')) { c.put(req, res.clone()); trimImages(); }
          return res;
        } catch (err) { return Response.error(); }
      })
    );
    return;
  }

  // فایل‌های هم‌دامنه: کش + آپدیت در پس‌زمینه
  if (url.origin === location.origin) {
    e.respondWith(
      caches.open(SHELL).then(async c => {
        const hit = await c.match(req);
        const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
