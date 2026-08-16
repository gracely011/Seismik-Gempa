// ==========================================================================
// SEISMOGRAPH - SERVICE WORKER CACHING LAYER (PWA)
// ==========================================================================

const CACHE_NAME = 'seismo-cache-v13.0';

const PRECACHE_ASSETS = [
    './',
    'index.html',
    'manifest.json',
    'icon.svg',
    'faults.js?v=13.0',
    'style.css?v=13.0',
    'app.js?v=13.0',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Roboto:wght@400;500;700&family=JetBrains+Mono:wght@400;600;700&display=swap'
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

    // Biarkan browser memuat tile peta, API live, dan tracker analitik langsung via HTTP cache native (menghindari isu CORS/tracking)
    if (
        url.hostname.includes('bmkg.go.id') ||
        url.hostname.includes('usgs.gov') ||
        url.hostname.includes('open-meteo.com') ||
        url.hostname.includes('bigdatacloud.net') ||
        url.hostname.includes('sesmograp.my.id') ||
        url.hostname.includes('cartocdn.com') ||
        url.hostname.includes('arcgisonline.com') ||
        url.hostname.includes('opentopomap.org') ||
        url.hostname.includes('openstreetmap.org') ||
        url.hostname.includes('googletagmanager.com') ||
        url.hostname.includes('google-analytics.com') ||
        url.hostname.includes('histats.com')
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
