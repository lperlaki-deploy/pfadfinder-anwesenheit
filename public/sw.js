self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("static-v1").then((cache) =>
      cache.addAll([
        "/",
        "/index.html",
        "/main.js",
        "/style.css",
      ])
    ),
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((res) => res || fetch(event.request)),
  );
});
