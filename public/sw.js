// Service Worker der App „Maler Brinkmann“.
//
// Bewusst schlank: KEIN Offline-Cache (wird nicht gebraucht) und KEIN
// fetch-Handler, d. h. alle Anfragen gehen ganz normal ins Netz.
// Er ist die Grundlage für spätere Push-Benachrichtigungen (Phase 6).
// Updates erkennt die App selbst über /api/version (Hinweis „Neue Version“).

self.addEventListener("install", () => {
  // Neue Service-Worker-Version sofort aktivieren statt zu warten.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
