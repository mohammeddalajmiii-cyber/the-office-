// Shows alerts as pop-ups (with the device's alert sound), even when the site is closed, and opens the right page when one is tapped.
// It also keeps a copy of the site on the device, so Pitch Room opens at once, even on a slow connection:
// the saved page shows straight away while a fresh copy is fetched in the background for next time.
const SHELL = "pitchroom-shell-v1";
const HOME = new URL("./", self.registration.scope).href;
const FIREBASE = /^https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|auth|firestore)\.js$/;
const FOREVER = u => u.pathname.includes("/assets/app-") || FIREBASE.test(u.href) || u.host === "fonts.gstatic.com" || /\/(torch-[\w-]+\.png|torch-icon\.svg|favicon\.ico)$/.test(u.pathname);

// Save a fresh copy of the page, and the app code it points to, so the next visit has everything ready.
async function refreshHome(res) {
  const cache = await caches.open(SHELL);
  const r = res || await fetch(HOME, { cache: "no-store" });
  if (!r || !r.ok) return;
  const html = await r.clone().text();
  await cache.put(HOME, r.clone());
  const code = (html.match(/src="(assets\/app-\d+\.js)"/) || [])[1];
  const wants = [code && new URL(code, HOME).href, ...["app", "auth", "firestore"].map(m => (html.match(new RegExp('https://www\\.gstatic\\.com/firebasejs/[\\d.]+/firebase-' + m + '\\.js')) || [])[0])].filter(Boolean);
  for (const u of wants) if (!(await cache.match(u))) { try { const x = await fetch(u, { mode: u.startsWith(self.location.origin) ? "same-origin" : "cors" }); if (x.ok) await cache.put(u, x) } catch { } }
  // keep only the two newest versions of the app code
  const keys = (await cache.keys()).filter(k => k.url.includes("/assets/app-")).sort((a, b) => b.url.localeCompare(a.url));
  for (const k of keys.slice(2)) if (k.url !== (code && new URL(code, HOME).href)) await cache.delete(k);
}

self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(refreshHome().catch(() => {})) });
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("pitchroom-shell-") && k !== SHELL) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const u = new URL(req.url);
  // the page itself: the saved copy at once, a fresh one fetched for next time
  if (req.mode === "navigate" && u.origin === self.location.origin && new URL("./", u).href === HOME && (u.pathname.endsWith("/") || u.pathname.endsWith("/index.html"))) {
    // "tap to update" (and any link with ?v=) always gets the newest page
    if (u.searchParams.has("v")) {
      const got = fetch(req).then(r => [r, r.ok ? refreshHome(r.clone()) : null]);
      e.waitUntil(got.then(x => x[1]).catch(() => {}));
      e.respondWith(got.then(x => x[0]).catch(() => caches.match(HOME).then(r => r || Response.error())));
      return;
    }
    const got = fetch(HOME, { cache: "no-store" }).then(r => [r, r.ok ? refreshHome(r.clone()) : null]);
    e.waitUntil(got.then(x => x[1]).catch(() => {}));
    e.respondWith(caches.match(HOME).then(saved => saved || got.then(x => x[0])).catch(() => got.then(x => x[0])));
    return;
  }
  // code, fonts and icons that never change once published: from the device, no waiting on the network
  if (FOREVER(u)) {
    const got = caches.open(SHELL).then(async c => {
      const hit = await c.match(req); if (hit) return [hit, null];
      const r = await fetch(req); return [r, r.ok || r.type === "opaque" ? c.put(req, r.clone()) : null];
    });
    e.waitUntil(got.then(x => x[1]).catch(() => {}));
    e.respondWith(got.then(x => x[0]));
  }
});

// An alert sent by the push server while the site may be closed.
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data ? e.data.text() : "" } }
  e.waitUntil((async () => {
    // If someone is looking at the site right now, the page shows it in the bell and plays its own sound.
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const looking = wins.some(c => c.visibilityState === "visible" && c.focused);
    if (looking && !d.force) {
      wins.forEach(c => c.postMessage({ type: "push", ...d }));
      // Browsers (Safari on iPhone above all) stop delivering alerts to a site that receives them without
      // showing anything. So show it quietly and close it at once: the open page already shows its own card.
      const tag = d.tag || "quiet-" + Date.now();
      await self.registration.showNotification(d.title || "Pitch Room", { body: d.body || "", tag, silent: true, icon: d.icon || "torch-192.png", badge: "torch-badge.png", data: { go: d.go || "me" } });
      (await self.registration.getNotifications({ tag })).forEach(n => n.close());
      return;
    }
    await self.registration.showNotification(d.title || "Pitch Room", {
      body: d.body || "Something new in Pitch Room",
      icon: d.icon || "torch-192.png",   // the person's photo when there is one
      badge: "torch-badge.png",               // the small white mark in the phone's status bar
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

