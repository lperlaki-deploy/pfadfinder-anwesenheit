self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open("static-v1").then((cache) =>
      cache.addAll([
        "/",
        "/index.html",
        "/main.js",
        "/attendance.js",
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

self.addEventListener("sync", (event) => {
  if (event.tag === "attendance-sync") {
    event.waitUntil(syncAttendance());
  }
});

async function syncAttendance() {
  const db = await openDB("attendance-db", 1);
  const tx = db.transaction("records", "readwrite");
  const store = tx.store;
  const all = await store.getAll();
  const unsynced = all.filter((r) => !r.synced);

  if (unsynced.length > 0) {
    await fetch("/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(unsynced),
    });
  }

  const res = await fetch("/sync");
  const serverData = await res.json();

  await store.clear();
  for (const rec of serverData) {
    await store.add({ ...rec, synced: true });
  }
  await tx.done;
}

// Minimal IndexedDB helper for SW
function openDB(name, version) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains("records")) {
        db.createObjectStore("records", { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
