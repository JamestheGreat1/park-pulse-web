const CACHE_NAME = "parkpulse-1.8.12";
const VERSION = "1.8.12";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./version.json",
  ...["app", "api", "data", "store", "push", "config", "seasonal"].map(name => `./assets/js/${name}.js?v=${VERSION}`),
  `./assets/css/app.css?v=${VERSION}`,
  ...["icon-192", "icon-512", "apple-touch-icon"].map(name => `./assets/icons/${name}.png?v=${VERSION}`)
];
self.addEventListener("install", event => event.waitUntil(
  caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: "reload" }))))
));
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("parkpulse-") && key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  const url = new URL(event.request.url);
  if (url.pathname.endsWith("/version.json")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    if (event.request.mode === "navigate") {
      try {
        const response = await fetch(event.request);
        if (response.ok) return response;
        return await cache.match("./index.html") || response;
      } catch { return await cache.match("./index.html") || Response.error(); }
    }
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type !== "opaque") await cache.put(event.request, response.clone());
    return response;
  })());
});
self.addEventListener("push", e => { let p={}; try { p=e.data?.json()||{}; } catch { p={body:e.data?.text()||"Ride update"}; } e.waitUntil(self.registration.showNotification(p.title||"ParkPulse", { body:p.body||"One of your watches changed.", icon:"./assets/icons/icon-192.png?v=1.8.12", tag:p.tag||"parkpulse", renotify:Boolean(p.renotify), data:{url:p.url||"./"} })); });
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "./", self.location.href).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = windows.find(window => window.url.startsWith(self.registration.scope));
    if (client) {
      try {
        const navigated = await client.navigate(target);
        if (navigated) return await navigated.focus();
      } catch { /* Open a fresh window when the old one can no longer navigate. */ }
    }
    return self.clients.openWindow?.(target);
  })());
});
