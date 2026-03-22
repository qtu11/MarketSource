// Service Worker cho QtusDev Market
// Basic service worker để tránh 404 errors

const CACHE_NAME = 'qtusdev-market-v1';
const urlsToCache = [
  '/',
  '/products',
  '/manifest.json',
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch event - Network first strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // ✅ FIX: Ignore Vite-related requests và các file không tồn tại
  if (
    url.pathname.includes('@vite') ||
    url.pathname.includes('@react-refresh') ||
    url.pathname.includes('/src/main.tsx') ||
    url.pathname.includes('vite.svg') ||
    url.pathname.startsWith('/@')
  ) {
    // Return empty response cho các vite requests để tránh 404
    event.respondWith(new Response('', { status: 404 }));
    return;
  }
  
  // ✅ FIX: Redirect icon-192.png to logoqtusdev.png
  if (url.pathname === '/icon-192.png') {
    event.respondWith(
      fetch('/logoqtusdev.png')
        .then((response) => response)
        .catch(() => new Response('', { status: 404 }))
    );
    return;
  }
  
  // ✅ FIX: Only handle GET requests for caching
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response
        const responseToCache = response.clone();
        
        // Final check for GET and successful response
        if (event.request.method === 'GET' && response.status === 200 && !url.protocol.startsWith('chrome-extension')) {
          caches.open(CACHE_NAME)
            .then((cache) => {
              try {
                cache.put(event.request, responseToCache);
              } catch (e) {
                // Ignore caching errors like 'Request method POST is unsupported'
                console.warn('Cache put failed:', e);
              }
            }).catch(() => {});
        }
        
        return response;
      })
      .catch(async () => {
        // Fallback to cache if network fails
        const matched = await caches.match(event.request);
        return matched || new Response('Offline', { status: 503 });
      })
  );
});

// Activate event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

