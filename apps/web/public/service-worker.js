// S107a — Web Push service worker.
//
// Receives encrypted push payloads from the server (via web-push)
// and surfaces them as native browser notifications. The payload
// shape matches what notifications.ts publishes:
//   { kind: "notification", notification: { id, kind, preview,
//     subjectType, subjectId, contextSlug, ... } }
//
// Clicking the notification focuses an existing tab or opens a new
// one to the user's notifications page. Per-kind deep linking lives
// on the client (NotificationBell.notificationLink) and we just
// route to /notifications here for simplicity — re-rendering the
// click into a deep link would require shipping that logic twice.

/* global self */

self.addEventListener("push", (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    // best-effort
  }
  const n = payload?.notification;
  if (!n) return;
  const title = n.actor?.username
    ? `@${n.actor.username}`
    : "Axiomic";
  const body = n.preview ?? "You have a new notification";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon.ico",
      tag: n.id, // collapse multiple notifications for the same item
      data: { url: "/notifications" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/notifications";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          // Already-open tab — focus it + navigate.
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(target);
            return;
          }
        }
        if (self.clients.openWindow) self.clients.openWindow(target);
      }),
  );
});
