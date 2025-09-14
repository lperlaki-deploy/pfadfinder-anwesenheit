import { openDB } from "https://esm.sh/idb@8.0.0";

const DB_NAME = "attendance-db";
const STORE_NAME = "records";

export async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    },
  });
}

export async function addRecord(name, synced = false) {
  const db = await initDB();
  await db.add(STORE_NAME, { name, date: new Date().toISOString(), synced });
}

export async function getAllRecords() {
  const db = await initDB();
  return db.getAll(STORE_NAME);
}

export async function getUnsyncedRecords() {
  const db = await initDB();
  return db.getAllFromIndex(STORE_NAME, "synced", false);
}

export async function markAllSynced() {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.store;
  let cursor = await store.openCursor();
  while (cursor) {
    cursor.update({ ...cursor.value, synced: true });
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function replaceAllRecords(newRecords) {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  await tx.store.clear();
  for (const rec of newRecords) {
    await tx.store.add({ ...rec, synced: true });
  }
  await tx.done;
}
