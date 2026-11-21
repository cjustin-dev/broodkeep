// Saving on this device, in IndexedDB (the browser's built-in database).
// If the browser blocks storage (some private windows do), the game still runs,
// but progress is lost when the page closes. Settings shows a warning in that case.

import { migrateSave } from "../game/state";
import type { Save } from "../game/state";

const DB_NAME = "broodkeep";
const STORE = "kv";

export const storage = { persistent: true };

let dbPromise: Promise<IDBDatabase> | null = null;
// Set when the saved game could not be read. Then we never write, so a record we merely
// failed to read is not replaced by a new egg.
let readFailed = false;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    dbPromise.catch(() => {
      dbPromise = null; // a failed open is not kept, so the next call tries again
    });
  }
  return dbPromise;
}

async function get(key: string): Promise<unknown> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// The saved game, or null if there is none yet. A save we cannot read is kept
// under another name instead of being thrown away.
export async function loadSave(): Promise<Save | null> {
  try {
    const raw = await get("save");
    if (raw === undefined) return null;
    const save = migrateSave(raw);
    if (save) return save;
    await put("save-unreadable", raw);
    return null;
  } catch {
    readFailed = true;
    storage.persistent = false;
    return null;
  }
}

export async function writeSave(save: Save): Promise<void> {
  if (readFailed) return;
  try {
    await put("save", save);
    storage.persistent = true; // a later write that works clears an earlier warning
  } catch {
    storage.persistent = false;
  }
}
