// Atelio : service de l'application installée.
// Stratégie « réseau d'abord » : l'application est toujours à jour dès qu'on a du réseau ;
// la copie en mémoire ne sert qu'en secours si la connexion tombe. Les données (Supabase) ne sont jamais mises en mémoire.
const CACHE = 'atelio-v1';
const FICHIERS = ['./', 'index.html', 'app.js', 'logo.png', 'favicon.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FICHIERS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(r).then((rep) => {
      if (rep && rep.ok) { const copie = rep.clone(); caches.open(CACHE).then((c) => c.put(r, copie)).catch(() => {}); }
      return rep;
    }).catch(() => caches.match(r).then((m) => m || caches.match('index.html')))
  );
});
