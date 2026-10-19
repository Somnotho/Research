const cache_name = 'research_office_shell_v1';
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(cache_name).then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icon.svg'])),
  );
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== cache_name).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(cache_name).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/') || ['/icon.svg', '/manifest.webmanifest'].includes(url.pathname))
    event.respondWith(
      caches.match(event.request).then(
        (saved) =>
          saved ||
          fetch(event.request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(cache_name).then((cache) => cache.put(event.request, copy));
            }
            return response;
          }),
      ),
    );
});
