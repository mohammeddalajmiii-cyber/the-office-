// Shows alerts as pop-ups (with the device's alert sound), even when the site is closed, and opens the right page when one is tapped.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

// An alert sent by the push server while the site may be closed.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data ? e.data.text() : "" } }
  e.waitUntil((async () => {
    // If someone is looking at the site right now, the page shows it in the bell and plays its own sound.
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const looking = wins.some(c => c.visibilityState === "visible" && c.focused);
    if (looking && !d.force) { wins.forEach(c => c.postMessage({ type: "push", ...d })); return }
    await self.registration.showNotification(d.title || "Pitch Room", {
      body: d.body || "Something new in Pitch Room",
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: d.tag || undefined,
      renotify: false,          // if the open page already showed this same alert, replace it quietly
      silent: false,            // use the phone's or computer's alert sound
      vibrate: [180, 80, 180],
      timestamp: Date.now(),
      data: { go: d.go || "me" },
    });
  })());
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const go = (e.notification.data && e.notification.data.go) || "me";
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { await c.focus(); c.navigate && c.navigate(c.url.split("#")[0] + "#" + go); return } }
    await self.clients.openWindow("./#" + go);
  })());
});

