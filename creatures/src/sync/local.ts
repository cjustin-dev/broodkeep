// Saving on this device, in IndexedDB (the browser's built-in database).
// If the browser blocks storage (some private windows do), the game still runs,
// but progress is lost when the page closes. Settings shows a warning in that case.

import { migrateSave } from "../game/state";
import type { Save } from "../game/state";

const DB_NAME = "broodkeep";
const STORE = "kv";

export const storage = { persistent: true };

let dbPromise: Promise<IDBDatabase> | null = null;
// The keys of the games that could not be read. Then we never write to that key, so a record we merely
// failed to read is not replaced by a new egg. (Each profile has its own key, see sync/roster.ts.)
const readFailed = new Set<string>();

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

// The saved game under this key ("save" is the first profile's game), or null if there is none yet. A save we cannot read is kept
// under another name instead of being thrown away.
export async function loadSave(key = "save"): Promise<Save | null> {
  try {
    const raw = await get(key);
    readFailed.delete(key); // a read that works lifts an earlier failure (the picker reads every profile's game for its picture)
    if (raw === undefined) return null;
    const save = migrateSave(raw);
    if (save) return save;
    await put(`${key}-unreadable`, raw);
    return null;
  } catch {
    readFailed.add(key);
    storage.persistent = false;
    return null;
  }
}

export async function writeSave(save: Save, key = "save"): Promise<void> {
  if (readFailed.has(key)) return;
  try {
    await put(key, save);
    storage.persistent = true; // a later write that works clears an earlier warning
  } catch {
    storage.persistent = false;
  }
}

// What this device knows about the cloud account (sync/sync.ts): who is signed in and which revision it last synced. Read back
// as it is; the caller checks its shape.
export async function loadCloudMeta(key = "cloud"): Promise<unknown> {
  try {
    return (await get(key)) ?? null;
  } catch {
    return null;
  }
}

export async function writeCloudMeta(meta: unknown, key = "cloud"): Promise<void> {
  try {
    await put(key, meta);
  } catch {
    // The account details are only a convenience: without them this device asks again on the next start.
  }
}

// The last list of the account's profiles, so the "who is playing" screen works offline (sync/roster.ts says what it holds).
export async function loadRoster(): Promise<unknown> {
  try {
    return (await get("profiles")) ?? null;
  } catch {
    return null;
  }
}

export async function writeRoster(record: unknown): Promise<void> {
  try {
    await put("profiles", record);
  } catch {
    // The list is only a convenience: without it the next start asks the server again.
  }
}
