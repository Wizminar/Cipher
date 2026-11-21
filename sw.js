// Offline support: cache the app shell so Cipher's strength meter and generator
// work without a connection. The breach API is never cached.
const VERSION = "cipher-v2.1.0";
const SHELL = [
  "./", "index.html", "css/style.css", "manifest.webmanifest", "assets/icon.svg", "assets/logo.ico",
  "assets/fonts/martian-mono.woff2", "assets/fonts/schibsted-grotesk.woff2",
  "assets/fonts/schibsted-grotesk-italic.woff2",
  "js/theme-init.js", "js/main.js", "js/breach.js", "js/generator.js",
  "js/engine/index.js", "js/engine/estimate.js", "js/engine/matchers.js",
  "js/engine/keyboard.js", "js/engine/math.js", "js/engine/crack.js",
  "js/data/passwords.js", "js/data/english.js", "js/data/names.js", "js/data/eff.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Only same-origin GETs are cached; the breach API is cross-origin and never touched.
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  // Stale-while-revalidate: answer from cache, refresh in the background.
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
