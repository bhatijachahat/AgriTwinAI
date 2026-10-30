// AgriTwinAI offline support: app shell + last-seen farm data. Never caches logins, OTPs or POSTs.
const V = "agritwin-v1";
const DATA_OK = /^\/api\/(farms|meta|mandi)/;
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(V).then(c => c.addAll(["/", "/manifest.webmanifest", "/icon-192.png"]))); });
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) {
    if (!DATA_OK.test(url.pathname)) return;
    e.respondWith(fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(req.url, c)); } return r; })
      .catch(() => caches.match(req.url).then(r => r || new Response(JSON.stringify({ detail: "You are offline and this data was not saved yet." }), { status: 503, headers: { "Content-Type": "application/json" } }))));
    return;
  }
  if (req.mode === "navigate") { e.respondWith(fetch(req).catch(() => caches.match("/"))); return; }
  e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { if (n.ok) { const c = n.clone(); caches.open(V).then(x => x.put(req, c)); } return n; })));
});
