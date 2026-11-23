// The cloud save: sending and reading it, which save is kept when two devices disagree, the backups, and what is refused.
// The edge cases are listed in docs/cloud-saves.md section 4.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost as register } from "../functions/api/register";
import { onRequestGet as getSave, onRequestPut as putSave } from "../functions/api/save";
import { BACKUPS_KEPT, BACKUP_EVERY_MS } from "../functions/_lib/saves";
import { SAVE_JSON_MAX } from "../functions/_lib/validation";
import type { Env } from "../functions/_lib/types";
import { call, cookieOf, countRows, key, newTestDb } from "./cloud-helpers";
import type { Sent, TestDb } from "./cloud-helpers";

const T0 = Date.UTC(2026, 10, 21, 12, 0, 0);
const MINUTE = 60_000;
const DAY = 24 * 3_600_000;

let t: TestDb;
let cookie: string;

const signUp = async (username: string): Promise<string> => cookieOf(await call(register, t.env, "/api/register", { body: { username, key: key("a"), code: "family-code" } }));
const game = (marker: number | string, pad = ""): Record<string, unknown> => ({ version: 3, marker, pad });
const put = (body: unknown, options: { cookie?: string; env?: Env } = {}): Promise<Sent> =>
  call(putSave, options.env ?? t.env, "/api/save", { method: "PUT", cookie: "cookie" in options ? options.cookie : cookie, body });
const get = (c: string | null = cookie): Promise<Sent> => call(getSave, t.env, "/api/save", { method: "GET", cookie: c ?? undefined }); // null: no cookie
const send = (baseRevision: unknown, savedAt: unknown, save: unknown = game("x")): Promise<Sent> => put({ baseRevision, savedAt, save });
const serverRevision = (): number => (t.raw.prepare("SELECT revision FROM saves").get() as { revision: number }).revision;
const backups = (): { revision: number; saved_at: number; marker: unknown; backed_up_at: number }[] =>
  (t.raw.prepare("SELECT revision, saved_at, backed_up_at, data FROM save_backups ORDER BY id").all() as { revision: number; saved_at: number; backed_up_at: number; data: string }[]).map((row) => ({
    revision: row.revision,
    saved_at: row.saved_at,
    backed_up_at: row.backed_up_at,
    marker: JSON.parse(row.data).marker,
  }));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  t = newTestDb();
  cookie = await signUp("kid");
});
afterEach(() => vi.useRealTimers());

describe("reading the cloud save", () => {
  it("needs a signed in browser", async () => {
    expect((await get(null)).status).toBe(401);
    expect((await get("__Host-bk_session=" + "A".repeat(43))).status).toBe(401);
  });

  it("says there is nothing yet: revision 0 and no save", async () => {
    expect((await get()).body).toEqual({ revision: 0, savedAt: 0, save: null });
  });

  it("gives back what was sent, with the revision and the time the device saved it", async () => {
    await send(0, 1234, game("first"));
    expect((await get()).body).toEqual({ revision: 1, savedAt: 1234, save: game("first") });
  });
});

describe("sending a save", () => {
  it("needs a signed in browser, and from another site is refused", async () => {
    expect((await put({ baseRevision: 0, savedAt: 1, save: game(1) }, { cookie: undefined })).status).toBe(401);
    const foreign = await call(putSave, t.env, "/api/save", { method: "PUT", cookie, body: { baseRevision: 0, savedAt: 1, save: game(1) }, headers: { Origin: "https://evil.example" } });
    expect(foreign.status).toBe(403);
    expect(countRows(t.raw, "saves")).toBe(0);
  });

  it("takes the first save as revision 1, then each save that builds on the last as the next revision", async () => {
    expect((await send(0, 1000)).body).toEqual({ status: "saved", revision: 1 });
    expect((await send(1, 2000)).body).toEqual({ status: "saved", revision: 2 });
    expect((await send(2, 3000)).body).toEqual({ status: "saved", revision: 3 });
  });

  it("keeps words, accents and emoji as they were sent", async () => {
    const save = { version: 3, name: "Zoë 🐣 \"quoted\" <b>", nested: { list: [1, 2, { deep: true }] } };
    await send(0, 1000, save);
    expect((await get()).body.save).toEqual(save);
  });

  it("stores the save as the JSON text that was sent", async () => {
    await send(0, 1000, game("stored"));
    const row = t.raw.prepare("SELECT data FROM saves").get() as { data: string };
    expect(row.data).toBe(JSON.stringify(game("stored")));
  });
});

describe("when two devices disagree", () => {
  beforeEach(async () => {
    await send(0, 1000, game("one")); // revision 1
    await send(1, 2000, game("two")); // revision 2, from "the other device"
  });

  it("keeps a newer save from a device that was behind, and puts the replaced save in the backups", async () => {
    const sent = await send(1, 3000, game("three")); // this device last synced at revision 1
    expect(sent.body).toEqual({ status: "saved", revision: 3 });
    expect((await get()).body.save).toEqual(game("three"));
    expect(backups().map((b) => b.marker)).toEqual(["one", "two"]); // "one" is the routine backup taken when "two" replaced it; "two" is the one this send replaced
  });

  it("keeps the server's save when the device that was behind has an older one, and backs the device's save up", async () => {
    const sent = await send(1, 1500, game("older"));
    expect(sent.body).toEqual({ status: "kept-server", revision: 2, savedAt: 2000, save: game("two") });
    expect((await get()).body).toEqual({ revision: 2, savedAt: 2000, save: game("two") });
    expect(backups().map((b) => [b.marker, b.saved_at])).toContainEqual(["older", 1500]);
  });

  it("keeps the server's save when both are exactly as old as each other", async () => {
    expect((await send(1, 2000, game("same-age"))).body.status).toBe("kept-server");
    expect((await get()).body.save).toEqual(game("two"));
  });

  it("treats a device that never synced (revision 0) like any other that is behind: the older save loses", async () => {
    expect((await send(0, 500, game("fresh egg"))).body.status).toBe("kept-server");
    expect((await send(0, 9000, game("real progress"))).body.status).toBe("saved");
  });
});

describe("the backups", () => {
  it("copies the replaced save when none exists yet, then at most every 30 minutes (29 minutes: no; 30: yes)", async () => {
    await send(0, 1000, game("v1"));
    expect(backups()).toHaveLength(0);
    vi.setSystemTime(T0 + MINUTE);
    await send(1, 2000, game("v2"));
    expect(backups().map((b) => b.marker)).toEqual(["v1"]);
    vi.setSystemTime(T0 + MINUTE + BACKUP_EVERY_MS - MINUTE);
    await send(2, 3000, game("v3"));
    expect(backups()).toHaveLength(1);
    vi.setSystemTime(T0 + MINUTE + BACKUP_EVERY_MS);
    await send(3, 4000, game("v4"));
    expect(backups().map((b) => b.marker)).toEqual(["v1", "v3"]);
  });

  it("keeps the newest 10 and drops the oldest, with each conflict adding one", async () => {
    await send(0, 1000, game("v0"));
    for (let i = 1; i <= BACKUPS_KEPT + 2; i++) await send(0, 1000 + i * 1000, game(`v${i}`)); // each one builds on revision 0, so each replaces the last
    const markers = backups().map((b) => b.marker);
    expect(markers).toHaveLength(BACKUPS_KEPT);
    expect(markers.at(-1)).toBe(`v${BACKUPS_KEPT + 1}`);
    expect(markers).not.toContain("v0");
    expect(markers).not.toContain("v1");
  });

  it("keeps each account's backups to itself", async () => {
    const other = await signUp("sib");
    await send(0, 1000, game("mine"));
    await send(1, 2000, game("mine2"));
    await put({ baseRevision: 0, savedAt: 1000, save: game("theirs") }, { cookie: other });
    await put({ baseRevision: 1, savedAt: 2000, save: game("theirs2") }, { cookie: other });
    const owned = (username: string): string[] =>
      (t.raw.prepare("SELECT b.data FROM save_backups b JOIN profiles p ON p.id = b.profile_id JOIN accounts a ON a.id = p.account_id WHERE a.username = ?").all(username) as { data: string }[]).map((row) => JSON.parse(row.data).marker);
    expect(owned("kid")).toEqual(["mine"]);
    expect(owned("sib")).toEqual(["theirs"]);
  });
});

describe("the numbers the plan names", () => {
  it("are 256,000 bytes for a save, a routine backup after 30 minutes, and the newest 10 backups kept", () => {
    expect(SAVE_JSON_MAX).toBe(256_000);
    expect(BACKUP_EVERY_MS).toBe(30 * 60_000);
    expect(BACKUPS_KEPT).toBe(10);
  });
});

describe("what is refused", () => {
  it("a base revision that is not a whole number of 0 or more", async () => {
    for (const bad of ["1", -1, 1.5, null, undefined, true]) expect((await send(bad, 1000)).status, `base ${JSON.stringify(bad)}`).toBe(400);
  });

  it("a savedAt that is not a whole number, is negative, or is more than a day ahead of the server (exactly a day is fine)", async () => {
    for (const bad of ["1000", -1, 1.5, null, undefined, T0 + DAY + 1]) expect((await send(0, bad)).status, `savedAt ${JSON.stringify(bad)}`).toBe(400);
    expect((await send(0, T0 + DAY)).status).toBe(200);
  });

  it("a save that is not an object with version 3", async () => {
    for (const bad of [[], "text", 5, null, {}, { version: 2 }, { version: "3" }, { version: 4 }]) expect((await send(0, 1000, bad)).status, JSON.stringify(bad)).toBe(400);
    expect(countRows(t.raw, "saves")).toBe(0);
  });

  it("fields it does not know", async () => {
    expect((await put({ baseRevision: 0, savedAt: 1000, save: game(1), admin: true })).status).toBe(400);
  });

  it("a save of exactly the size limit is taken, one character more is 413", async () => {
    const overhead = JSON.stringify(game(1, "")).length;
    const exactly = game(1, "x".repeat(SAVE_JSON_MAX - overhead));
    expect(JSON.stringify(exactly)).toHaveLength(SAVE_JSON_MAX);
    expect((await send(0, 1000, exactly)).status).toBe(200);
    expect((await send(1, 2000, game(1, "x".repeat(SAVE_JSON_MAX - overhead + 1)))).status).toBe(413);
  });

  it("a save is measured in bytes: text of 3 byte letters over the cap is refused even when it has fewer characters than the cap", async () => {
    const overhead = new TextEncoder().encode(JSON.stringify(game(1, ""))).length;
    const fits = (letters: number): Record<string, unknown> => game(1, "€".repeat(letters)); // each € is 3 bytes
    const most = Math.floor((SAVE_JSON_MAX - overhead) / 3);
    expect(new TextEncoder().encode(JSON.stringify(fits(most))).length).toBeLessThanOrEqual(SAVE_JSON_MAX);
    expect((await send(0, 1000, fits(most))).status).toBe(200);
    expect(JSON.stringify(fits(most + 1)).length).toBeLessThan(SAVE_JSON_MAX); // fewer characters than the cap...
    expect((await send(1, 2000, fits(most + 1))).status).toBe(413); // ...but more bytes
  });

  it("a stranger's huge upload is turned away for having no session, before anything of it is read", async () => {
    const sent = await call(putSave, t.env, "/api/save", {
      method: "PUT",
      body: { baseRevision: 0, savedAt: 1000, save: game(1) },
      headers: { "Content-Length": "99999999" },
    });
    expect(sent.status).toBe(401); // (not 413: the session is looked at first)
  });

  it("a body that says it is bigger than any save can be, before reading it", async () => {
    const sent = await call(putSave, t.env, "/api/save", {
      method: "PUT",
      cookie,
      body: { baseRevision: 0, savedAt: 1000, save: game(1) },
      headers: { "Content-Length": "99999999" },
    });
    expect(sent.status).toBe(413);
  });

  it("another account's save is never reachable: each account has its own, and a stranger's send changes nothing of mine", async () => {
    await send(0, 1000, game("mine"));
    const other = await signUp("sib");
    expect((await get(other)).body).toEqual({ revision: 0, savedAt: 0, save: null });
    expect((await put({ baseRevision: 0, savedAt: 5000, save: game("theirs") }, { cookie: other })).body).toEqual({ status: "saved", revision: 1 });
    expect((await get()).body).toEqual({ revision: 1, savedAt: 1000, save: game("mine") });
  });
});

describe("two devices saving at the same moment", () => {
  it("answers 409 when the save changed between reading it and replacing it, and changes nothing more", async () => {
    await send(0, 1000, game("one"));
    const racing: Env = {
      ...t.env,
      DB: {
        ...t.env.DB,
        prepare: (sql) => {
          if (sql.startsWith("UPDATE saves")) t.raw.exec("UPDATE saves SET revision = revision + 1, data = '{\"version\":3,\"marker\":\"winner\"}'"); // the other device got in first
          return t.env.DB.prepare(sql);
        },
      },
    };
    const sent = await put({ baseRevision: 1, savedAt: 2000, save: game("late") }, { env: racing });
    expect(sent.status).toBe(409);
    expect((await get()).body.save).toEqual({ version: 3, marker: "winner" });
    expect(serverRevision()).toBe(2); // the other device's save, with nothing of the late one added
    expect(countRows(t.raw, "save_backups")).toBe(0);
  });

  it("answers 409 when two first saves arrive together", async () => {
    const racing: Env = {
      ...t.env,
      DB: {
        ...t.env.DB,
        prepare: (sql) => {
          if (sql.startsWith("INSERT INTO saves")) t.raw.exec("INSERT INTO saves (profile_id, revision, saved_at, data) VALUES (1, 1, 5, '{\"version\":3}')");
          return t.env.DB.prepare(sql);
        },
      },
    };
    expect((await put({ baseRevision: 0, savedAt: 1000, save: game("a") }, { env: racing })).status).toBe(409);
    expect(serverRevision()).toBe(1);
    expect((await get()).body.save).toEqual({ version: 3 }); // the save that got in first stays
    expect(countRows(t.raw, "save_backups")).toBe(0);
  });
});
