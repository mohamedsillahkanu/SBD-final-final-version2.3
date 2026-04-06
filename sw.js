// ============================================================
//  ICF-SL ITN Distribution — Service Worker
//  Version: bump this string to force a full cache refresh
// ============================================================
const CACHE_VERSION = 'icf-itn-v3';

// ── FILES TO CACHE ────────────────────────────────────────────
// Edit this list whenever you add / rename / remove files.
// Paths are relative to the folder where sw.js lives.
const APP_FILES = [
  './',
  './index.html',
  './script_option2.js',
  './ai_agent.js',
  './cascading_data1.csv',
  './manifest.json',
  './offline.html',
  './ICF-SL.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

// External CDN libraries (cached on first load)
const CDN_FILES = [
  'https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js',
  'https://cdn.jsdelivr.net/npm/signature_pad@4.1.7/dist/signature_pad.umd.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
];

// These URLs are NEVER cached (always go to network)
const NEVER_CACHE = [
  'script.google.com',   // GAS endpoints
  'docs.google.com',     // sheet CSV exports
  'api.anthropic.com',   // Claude API
];

const ALL_PRECACHE = [...APP_FILES, ...CDN_FILES];

// ── INSTALL ───────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(
        ALL_PRECACHE.map(url =>
          url.startsWith('http') ? url : new URL(url, self.location.href).href
        )
      ))
      .then(() => {
        console.log('[SW] Precache complete');
        return self.skipWaiting(); // activate immediately
      })
      .catch(err => console.error('[SW] Precache failed:', err))
  );
});

// ── ACTIVATE ──────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating', CACHE_VERSION);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION) // delete ALL old caches
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim()) // take control of all open tabs
  );
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  // Never cache — always go straight to network
  if (NEVER_CACHE.some(pattern => url.includes(pattern))) return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        // Return cached version instantly
        if (cached) {
          // Background-refresh app files (stale-while-revalidate)
          if (!url.includes('fonts.g')) {
            fetch(event.request)
              .then(fresh => {
                if (fresh && fresh.status === 200) {
                  caches.open(CACHE_VERSION)
                    .then(cache => cache.put(event.request, fresh));
                }
              })
              .catch(() => {});
          }
          return cached;
        }

        // Not in cache — fetch from network and cache it
        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200) return response;
            const clone = response.clone();
            caches.open(CACHE_VERSION)
              .then(cache => cache.put(event.request, clone));
            return response;
          })
          .catch(() => {
            // Network failed — show offline page for navigation
            if (event.request.mode === 'navigate') {
              return caches.match(
                new URL('./offline.html', self.location.href).href
              );
            }
            return new Response('Offline', {
              status: 503,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});

// ── MESSAGES from the app ─────────────────────────────────────
self.addEventListener('message', event => {
  if (!event.data) return;

  // Force SW update (called from updateApp())
  if (event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Skip waiting triggered');
    self.skipWaiting();
  }

  // Wipe cache (called from updateApp())
  if (event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_VERSION).then(() =>
      console.log('[SW] Cache cleared')
    );
  }
});

// ── BACKGROUND SYNC ───────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-submissions') {
    console.log('[SW] Background sync: sync-submissions');
    // Sync is triggered from script_option2.js syncPending()
  }
});
