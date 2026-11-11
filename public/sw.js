/* Service worker do app: notificações push (Firebase Cloud Messaging) e instalação. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Necessário para o app ser instalável; não altera as requisições.
self.addEventListener("fetch", () => {});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }
  const d = payload.data || payload.notification || {};
  const title = d.title || "Nova mensagem";
  const options = {
    body: d.body || "",
    icon: d.icon || "/pwa-icon/192",
    badge: "/pwa-icon/96",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    vibrate: [180, 80, 180],
    data: { url: d.url || "/atendimentos" },
  };
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Se o sistema está aberto e visível, a própria página já toca o som e mostra o aviso.
      const visible = list.some((c) => c.visibilityState === "visible" && c.focused);
      if (visible) return;
      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/atendimentos";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
