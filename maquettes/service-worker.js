// service-worker.js

// Ce listener s'active dès que le Service Worker est installé.
self.addEventListener('install', event => {
  console.log('Service Worker: Installation...');
  // Force le nouveau service worker à devenir actif immédiatement.
  self.skipWaiting();
});

// Ce listener s'active quand le Service Worker prend le contrôle de la page.
self.addEventListener('activate', event => {
  console.log('Service Worker: Activation...');
  // Permet au SW de contrôler les clients (onglets) ouverts sans avoir à les recharger.
  event.waitUntil(self.clients.claim());
});

// C'est l'événement le plus important : il se déclenche quand une notification push est reçue.
self.addEventListener('push', event => {
  console.log('Service Worker: Notification Push Reçue.');

  // On récupère les données envoyées par votre fonction Firebase (titre, corps, icône).
  let data = {};
  if (event.data) {
    data = event.data.json();
  }

  const title = data.title || 'Notification';
  const options = {
    body: data.body || 'Vous avez une nouvelle notification.',
    icon: data.icon || 'favicon.ico', // Une icône par défaut si non fournie
    badge: 'favicon.ico', // Pour Android
    vibrate: [200, 100, 200]
  };

  // On dit au navigateur d'afficher la notification.
  event.waitUntil(self.registration.showNotification(title, options));
});