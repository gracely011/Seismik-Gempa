// ==========================================================================
// SEISMOGRAPH - SERVICE WORKER CACHING LAYER (PWA)
// ==========================================================================

const CACHE_NAME = 'seismo-cache-v35.0';

const PRECACHE_ASSETS = [
    './',
    'index.html',
    'manifest.json',
    'icon.svg',
    'icon-sprite-1x.png',
    'faults.js?v=24.0',
    'style.css?v=28.0',
    'app.js?v=32.0',
    'modals.js?v=31.0',
    'https://unpkg.com/maplibre-gl@5.2.0/dist/maplibre-gl.css',
    'https://unpkg.com/maplibre-gl@5.2.0/dist/maplibre-gl.js',
    'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500;700&display=swap',
    'google-symbols.woff2'
];

// 1. INSTALLATION: Pre-cache essential app shell assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(PRECACHE_ASSETS).catch(err => {
                console.warn('[SW] Pre-cache partial fail:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// 2. ACTIVATION: Clean up legacy caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// 3. FETCH STRATEGY
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Biarkan browser memuat tile peta, API live, dan tracker analitik langsung via HTTP cache native (tanpa overhead SW)
    if (
        url.hostname.includes('bmkg.go.id') ||
        url.hostname.includes('usgs.gov') ||
        url.hostname.includes('open-meteo.com') ||
        url.hostname.includes('bigdatacloud.net') ||
        url.hostname.includes('cartocdn.com') ||
        url.hostname.includes('arcgisonline.com') ||
        url.hostname.includes('opentopomap.org') ||
        url.hostname.includes('openstreetmap.org') ||
        url.hostname.includes('google.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('nasa.gov') ||
        url.hostname.includes('aqicn.org') ||
        url.hostname.includes('googletagmanager.com') ||
        url.hostname.includes('google-analytics.com') ||
        url.hostname.includes('histats.com') ||
        url.pathname.includes('/tile/') ||
        url.pathname.includes('/vt/') ||
        url.pathname.includes('/rastertiles/')
    ) {
        return; // Native browser handling
    }

    // 3A. HTML Navigation (Page Document): Network First, Cache Fallback (Always loads fresh UI when online)
    if (event.request.mode === 'navigate' || event.request.destination === 'document') {
        event.respondWith(
            fetch(event.request)
                .then(networkResponse => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => caches.match(event.request) || caches.match('./') || caches.match('index.html'))
        );
        return;
    }

    // 3B. Static Assets & App Shell: Cache First, Network Fallback
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then(networkResponse => {
                if (
                    networkResponse &&
                    networkResponse.status === 200 &&
                    (event.request.url.startsWith('http') || event.request.url.startsWith('https'))
                ) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            });
        })
    );
});
