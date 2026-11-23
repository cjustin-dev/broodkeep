// The device's save store (sync/local.ts) against a small stand-in for IndexedDB, to check which keys are blocked after a failed read.
// A key whose game could not be read is never written to, so a record that was only unreadable is not replaced by a new egg
// (each profile has its own key, sync/roster.ts). The "who is playing" screen reads every profile's game for its picture.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import { loadSave, writeSave } from "../src/sync/local";
import { at } from "./helpers";

// Only what local.ts uses: open, a transaction with get and put on one store. `failReads` lists the keys whose next read fails.
function installFakeIndexedDb(): { rows: Map<string, unknown>; failReads: Set<string> } {
  const rows = new Map<string, unknown>();
  const failReads = new Set<string>();
  const request = <T>(run: () => T | Error): Record<string, unknown> => {
    const req: Record<string, unknown> = {};
    queueMicrotask(() => {
      const out = run();
      if (out instanceof Error) {
        req.error = out;
        (req.onerror as (() => void) | undefined)?.();
      } else {
        req.result = out;
        (req.onsuccess as (() => void) | undefined)?.();
      }
    });
    return req;
  };
  const db = {
    transaction: () => {
      const tx: Record<string, unknown> = {};
      tx.objectStore = () => ({
        get: (key: string) => request(() => (failReads.delete(key) ? new Error("read failed") : rows.get(key))),
        put: (value: unknown, key: string) => {
          rows.set(key, value);
          queueMicrotask(() => (tx.oncomplete as (() => void) | undefined)?.());
        },
      });
      return tx;
    },
  };
  vi.stubGlobal("indexedDB", {
    open: () => {
      const req: Record<string, unknown> = {};
      queueMicrotask(() => {
        req.result = db;
        (req.onsuccess as (() => void) | undefined)?.();
      });
      return req;
    },
  });
  return { rows, failReads };
}

describe("a game that could not be read", () => {
  // Installed once: local.ts keeps its open database for the life of the module. Each test starts with an empty store, and uses keys of its own.
  let fake: ReturnType<typeof installFakeIndexedDb>;
  const game = (seed: number): Save => newSave(at(8), seed);

  beforeAll(() => {
    fake = installFakeIndexedDb();
  });
  beforeEach(() => {
    fake.rows.clear();
    fake.failReads.clear();
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("is not written over while it stays unreadable", async () => {
    const kept = game(1);
    fake.rows.set("save:7", kept);
    fake.failReads.add("save:7");
    expect(await loadSave("save:7")).toBeNull();
    await writeSave(game(2), "save:7");
    expect(fake.rows.get("save:7")).toBe(kept);
  });

  it("does not block another profile's key", async () => {
    fake.rows.set("save:8", game(1));
    fake.failReads.add("save:8");
    expect(await loadSave("save:8")).toBeNull();
    const other = game(3);
    await writeSave(other, "save:9");
    expect(fake.rows.get("save:9")).toBe(other);
  });

  it("can be saved again once a later read of the same key works (a failed read for a picture must not stop the game from saving)", async () => {
    fake.rows.set("save:10", game(1));
    fake.failReads.add("save:10");
    expect(await loadSave("save:10")).toBeNull(); // the picture on the picker tile
    expect(await loadSave("save:10")).not.toBeNull(); // the game opened afterwards reads fine
    const played = game(4);
    await writeSave(played, "save:10");
    expect(fake.rows.get("save:10")).toBe(played);
  });
});
