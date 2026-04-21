const CACHE_NAME = 'plan-posilkow-v8';

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './przepisy.js',
  './przepisy-sniadania2.js',
  './przepisy-sniadania2.js',
  './js/config.js',
  './js/sync.js',
  './js/editor.js',
  './js/stats.js',
  './js/today.js',
  './js/plan.js',
  './js/shopping.js',
  './js/recipes.js',
  './js/settings.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.hostname !== location.hostname) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      });
    })
  );
});

// ─── POWIADOMIENIA ──────────────────────────────────────────
let notifTimer = null;
let dailyTimer = null;

self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SCHEDULE_NOTIF') {
    const { delay, title, body } = event.data;

    // Wyczyść poprzedni timer żeby nie dublować powiadomień
    if (notifTimer) { clearTimeout(notifTimer); notifTimer = null; }

    notifTimer = setTimeout(async () => {
      try {
        await self.registration.showNotification(title || '🍳 Dzień dobry!', {
          body:    body || 'Sprawdź swój plan posiłków',
          icon:    './icons/icon-192.png',
          badge:   './icons/icon-72.png',
          tag:     'breakfast-reminder',   // zastępuje poprzednie zamiast się nakładać
          renotify: false,
          requireInteraction: false,
          data: { url: self.registration.scope }
        });

        // Zaplanuj kolejne powiadomienie za 24h
        if (dailyTimer) clearTimeout(dailyTimer);
        dailyTimer = setTimeout(() => {
          // Powiadom otwarte karty żeby przeliczały tekst przepisu
          self.clients.matchAll().then(clients =>
            clients.forEach(c => c.postMessage({ type: 'RESCHEDULE_NOTIF' }))
          );
        }, 24 * 60 * 60 * 1000);

      } catch (err) {
        console.error('[SW] Błąd powiadomienia:', err);
      }
    }, delay);
  }
});

// Kliknięcie w powiadomienie — otwiera aplikację
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url === targetUrl);
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});
