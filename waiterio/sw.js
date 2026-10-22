const CACHE_NAME = 'waiterio-v7';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './script.js',
    './manifest.json',
    './icon.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Active la nouvelle version tout de suite, sans attendre la fermeture des onglets
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            caches.keys().then((cacheNames) => Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            )),
            self.clients.claim() // Prend le contrôle des pages déjà ouvertes, sans attendre un rechargement
        ])
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('firestore') || event.request.url.includes('identitytoolkit') || event.request.url.includes('googleapis')) {
        return;
    }

    // Réseau d'abord : la dernière version déployée arrive toujours en priorité.
    // Le cache ne sert que de secours si le téléphone est hors-ligne.
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const responseCopy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
