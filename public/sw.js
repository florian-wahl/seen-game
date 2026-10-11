// Seen! service worker: web push + the picture-library bundle cache (nothing else is cached).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Seen!";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (new URL(w.url).origin === target.origin && "focus" in w) {
          return w.focus().then((c) => ("navigate" in c ? c.navigate(target.href) : c));
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});

// --- Picture library bundle ---------------------------------------------------------------
// library-*.json is content-hashed (immutable): cache-first, and drop older bundles when a new
// one arrives. current.json (the pointer) is network-first, falling back to the cached copy.
const LIB_CACHE = "seen-library-v1";
const BUNDLE_RE = /^\/library\/bundles\/library-[^/]+\.json$/;
const CURRENT_PATH = "/library/bundles/current.json";

async function cacheFirstBundle(request) {
  const cache = await caches.open(LIB_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const keep = new URL(request.url).pathname;
    for (const key of await cache.keys()) {
      const p = new URL(key.url).pathname;
      if (BUNDLE_RE.test(p) && p !== keep) await cache.delete(key);
    }
    await cache.put(request, res.clone());
  }
  return res;
}

async function networkFirstCurrent(request) {
  const cache = await caches.open(LIB_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(CURRENT_PATH, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(CURRENT_PATH);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (BUNDLE_RE.test(url.pathname)) event.respondWith(cacheFirstBundle(req));
  else if (url.pathname === CURRENT_PATH) event.respondWith(networkFirstCurrent(req));
});
