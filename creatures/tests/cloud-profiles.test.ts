// Profiles on the server: the list, adding one, renaming one, and the save of one profile. The edge cases are listed in
// docs/profiles-plan.md section 6, and each one has a test here (the device side is in profiles-device.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest as profilesAnyMethod, onRequestGet as listProfiles, onRequestPatch as renameProfile, onRequestPost as addProfile } from "../functions/api/profiles";
import { onRequestPost as register } from "../functions/api/register";
import { onRequestGet as getSave, onRequestPut as putSave } from "../functions/api/save";
import { SMALL_BODY } from "../functions/_lib/validation";
import { MAX_PROFILES, NAME_MAX, NAME_MIN } from "../src/sync/profiles";
import { call, cookieOf, countRows, key, migrationSql, newTestDb, slowReads } from "./cloud-helpers";
import type { Sent, TestDb } from "./cloud-helpers";
import { aliveSave, at } from "./helpers";

const T0 = Date.UTC(2026, 10, 22, 12, 0, 0);
let t: TestDb;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  t = newTestDb();
});
afterEach(() => vi.useRealTimers());

async function signUp(username: string): Promise<string> {
  return cookieOf(await call(register, t.env, "/api/register", { body: { username, key: key("a"), code: "family-code" } }));
}
const list = (cookie?: string): Promise<Sent> => call(listProfiles, t.env, "/api/profiles", { method: "GET", cookie });
const add = (cookie: string | undefined, body: unknown): Promise<Sent> => call(addProfile, t.env, "/api/profiles", { method: "POST", cookie, body });
// Two adds that overlap in time (see slowReads): the plain `add` finishes one request before the next one starts.
const addTogether = (cookie: string, bodies: unknown[]): Promise<Sent[]> => {
  const env = { ...t.env, DB: slowReads(t.env.DB) };
  return Promise.all(bodies.map((body) => call(addProfile, env, "/api/profiles", { method: "POST", cookie, body })));
};
const rename = (cookie: string | undefined, body: unknown): Promise<Sent> => call(renameProfile, t.env, "/api/profiles", { method: "PATCH", cookie, body });
const names = (): string[] => (t.raw.prepare("SELECT name FROM profiles ORDER BY id").all() as { name: string }[]).map((row) => row.name);
const profileCount = (): number => countRows(t.raw, "profiles");

const put = (cookie: string | undefined, profile: string | null, baseRevision: number, coins: number): Promise<Sent> =>
  call(putSave, t.env, "/api/save" + (profile === null ? "" : `?profile=${profile}`), {
    method: "PUT",
    cookie,
    body: { baseRevision, savedAt: T0, save: { ...aliveSave("blip", at(10)), coins } },
  });
const get = (cookie: string | undefined, query = ""): Promise<Sent> => call(getSave, t.env, "/api/save" + query, { method: "GET", cookie });

// Names the server refuses, for adding a profile and for renaming one (the same rule: functions/_lib/validation.ts profileName).
const BAD_NAMES: [string, unknown][] = [
  ["empty", ""],
  ["spaces only", "     "],
  ["21 characters", "A".repeat(21)],
  ["21 characters that are each two UTF-16 units", "𝒜".repeat(21)], // one letter, two UTF-16 units
  ["a zero width space inside", "Mi​a"],
  ["only a zero width space", "​"],
  ["a right to left override", "Mi‮a"],
  ["a control character", "Mi\u0007a"],
  ["a newline", "Mi\na"],
  ["a no break space", "Mi a"],
  ["an emoji", "Mia 😀"],
  ["markup", "<b>Mia</b>"],
  ["an underscore", "Mi_a"],
  ["a superscript digit (a number, not a digit)", "Mia²"],
  ["a fraction", "Mia½"],
  ["a roman numeral character", "Mia Ⅳ"],
  ["a number, not text", 5],
  ["null", null],
  ["a list", ["Mia"]],
];

describe("the numbers the plan names", () => {
  it("are 8 profiles per account and names of 1 to 20 characters (written out, so changing the constants is seen)", () => {
    expect([MAX_PROFILES, NAME_MIN, NAME_MAX]).toEqual([8, 1, 20]);
  });
});

describe("the profiles table after migration 0003", () => {
  it("turns the profile of an account made before it into an adult with its name key filled in", () => {
    const old = newTestDb({}, 2); // the database as it was under migrations 0001 and 0002
    old.raw.exec("INSERT INTO accounts (username, password_hash, created_at) VALUES ('ann', 'x', 1)");
    old.raw.exec("INSERT INTO profiles (account_id, name, created_at) VALUES (1, 'Player', 1)");
    old.raw.exec(migrationSql(3));
    expect(old.raw.prepare("SELECT name, kind, name_key, pin_hash FROM profiles").get()).toEqual(
      expect.objectContaining({ name: "Player", kind: "adult", name_key: "player", pin_hash: null }),
    );
  });

  it("is set up by sign up with the name key already filled in", async () => {
    await signUp("ann");
    expect(t.raw.prepare("SELECT kind, name_key FROM profiles").get()).toEqual(expect.objectContaining({ kind: "adult", name_key: "player" }));
  });

  it("refuses by itself a kid with a PIN, a kind that is neither, a PIN given to a kid later, and one name twice in an account", async () => {
    await signUp("ann");
    await signUp("bob");
    const insert = (account: number, name: string, kind: string, pin: string | null): void =>
      void t.raw.prepare("INSERT INTO profiles (account_id, name, name_key, kind, pin_hash, created_at) VALUES (?, ?, ?, ?, ?, 1)").run(account, name, name.toLowerCase(), kind, pin);
    expect(() => insert(1, "Kid", "kid", "pbkdf2$x")).toThrow(/CHECK/);
    expect(() => insert(1, "Teen", "teen", null)).toThrow(/CHECK/);
    expect(() => insert(1, "PLAYER", "kid", null)).toThrow(/UNIQUE/);
    insert(2, "Mum", "adult", "pbkdf2$x"); // an adult may have one
    insert(1, "Mum", "adult", null); // and the same name in another account is fine
    expect(() => t.raw.exec("UPDATE profiles SET kind = 'kid' WHERE name = 'Mum' AND pin_hash IS NOT NULL")).toThrow(/CHECK/);
  });
});

describe("listing", () => {
  it("needs a session", async () => {
    expect((await list()).status).toBe(401);
  });

  it("gives the account's profiles, the first one first, and nothing else about them", async () => {
    const ann = await signUp("ann");
    await signUp("bob");
    expect((await add(ann, { name: "Mia", kind: "kid" })).status).toBe(201);
    const sent = await list(ann);
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({ profiles: [{ id: 1, name: "Player", kind: "adult" }, { id: 3, name: "Mia", kind: "kid" }] });
    await add(ann, { name: "Zoe", kind: "kid" }); // a name that sorts after the first profile's
    await add(ann, { name: "Aaron", kind: "adult" }); // and one that sorts before it
    expect((await list(ann)).body.profiles.map((p: { id: number }) => p.id)).toEqual([1, 3, 4, 5]); // always in the order they were made
  });
});

describe("adding a profile", () => {
  it("answers 201 with the new profile's id, and the profile starts with no save", async () => {
    const ann = await signUp("ann");
    const sent = await add(ann, { name: "Mia", kind: "kid" });
    expect(sent.status).toBe(201);
    expect(sent.body).toEqual({ id: 2, name: "Mia", kind: "kid" });
    expect(names()).toEqual(["Player", "Mia"]);
    expect((await get(ann, "?profile=2")).body).toEqual({ revision: 0, savedAt: 0, save: null });
  });

  it("is refused without a session, from another site, and without a JSON body, and writes nothing", async () => {
    const ann = await signUp("ann");
    const body = { name: "Mia", kind: "kid" };
    expect((await add(undefined, body)).status).toBe(401);
    expect((await call(addProfile, t.env, "/api/profiles", { cookie: ann, body, headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect((await call(addProfile, t.env, "/api/profiles", { cookie: ann, body, headers: { "Content-Type": "text/plain" } })).status).toBe(415);
    expect(profileCount()).toBe(1);
  });

  it("refuses a kind that is missing or not adult or kid, a field it does not know, and a body that is not an object", async () => {
    const ann = await signUp("ann");
    for (const body of [{ name: "Mia" }, { name: "Mia", kind: "teen" }, { name: "Mia", kind: 1 }, { name: "Mia", kind: null }, { name: "Mia", kind: "kid", pin: "1234" }, { name: "Mia", kind: "kid", pinHash: "x" }]) {
      expect((await add(ann, body)).status, JSON.stringify(body)).toBe(400);
    }
    for (const raw of ["[]", "null", "5", '"text"', "{not json"]) {
      expect((await call(addProfile, t.env, "/api/profiles", { cookie: ann, raw })).status, raw).toBe(400);
    }
    expect(profileCount()).toBe(1);
  });

  it("refuses a body over the cap", async () => {
    const ann = await signUp("ann");
    const sent = await call(addProfile, t.env, "/api/profiles", { cookie: ann, raw: JSON.stringify({ name: "Mia", kind: "kid", pad: "x".repeat(SMALL_BODY) }) });
    expect(sent.status).toBe(413);
    expect(profileCount()).toBe(1);
  });

  describe("names", () => {
    const wide = "𝒜"; // one letter, two UTF-16 units
    it.each([
      ["a plain name", "Mia", "Mia"],
      ["one character", "A", "A"],
      ["19 characters", "A".repeat(19), "A".repeat(19)],
      ["exactly 20 characters", "A".repeat(20), "A".repeat(20)],
      ["20 characters that are each two UTF-16 units", wide.repeat(20), wide.repeat(20)],
      ["accents", "José", "José"],
      ["letters of another script", "小明", "小明"],
      ["an apostrophe, a hyphen and a period", "Mary-Jane O'Neil Jr.", "Mary-Jane O'Neil Jr."],
      ["digits", "Kid 2", "Kid 2"],
      ["digits of another script", "Kid ٣", "Kid ٣"],
      ["spaces at the ends (trimmed)", "  Mia  ", "Mia"],
      ["a run of spaces inside (counted as one)", "Mia   Lee", "Mia Lee"],
    ])("accepts %s", async (_label, given, stored) => {
      const ann = await signUp("ann");
      const sent = await add(ann, { name: given, kind: "kid" });
      expect(sent.status).toBe(201);
      expect(sent.body.name).toBe(stored);
      expect(names()).toContain(stored);
    });

    it.each(BAD_NAMES)("refuses %s", async (_label, given) => {
      const ann = await signUp("ann");
      expect((await add(ann, { name: given, kind: "kid" })).status).toBe(400);
      expect(profileCount()).toBe(1);
    });

    it.each([
      ["the same case", "Mia", "Mia"],
      ["another case", "Mia", "mIA"],
      ["another case of a letter that is not ASCII", "Ślimak", "ślimak"],
      ["a letter typed in two ways", "José", "José"],
      ["the first profile's name", "Player", "PLAYER"],
      ["spaces at the ends", "Mia", "  Mia "],
    ])("refuses a second profile with the same name (%s)", async (_label, first, second) => {
      const ann = await signUp("ann");
      expect((await add(ann, { name: first, kind: "kid" })).status).toBe(first === "Player" ? 409 : 201);
      const again = await add(ann, { name: second, kind: "kid" });
      expect(again.status).toBe(409);
      expect(again.body).toEqual({ error: "You already have a player with that name." });
      expect(profileCount()).toBe(first === "Player" ? 1 : 2);
    });

    it("lets two accounts have the same name", async () => {
      const ann = await signUp("ann");
      const bob = await signUp("bob");
      expect((await add(ann, { name: "Mia", kind: "kid" })).status).toBe(201);
      expect((await add(bob, { name: "Mia", kind: "kid" })).status).toBe(201);
    });

    it("lets exactly one of two adds with the same name that overlap in time win", async () => {
      const ann = await signUp("ann");
      const sent = await addTogether(ann, [{ name: "Mia", kind: "kid" }, { name: "mia", kind: "adult" }]);
      expect(sent.map((one) => one.status).sort()).toEqual([201, 409]);
      expect(profileCount()).toBe(2);
    });
  });

  describe("the limit", () => {
    it("accepts the 8th profile and refuses the 9th with its own message", async () => {
      const ann = await signUp("ann");
      for (let n = 2; n <= 8; n++) expect((await add(ann, { name: `Kid ${n}`, kind: "kid" })).status, `profile ${n}`).toBe(201);
      expect(profileCount()).toBe(8);
      const over = await add(ann, { name: "One more", kind: "kid" });
      expect(over.status).toBe(409);
      expect(over.body).toEqual({ error: "An account can have up to 8 players." });
      expect(profileCount()).toBe(8);
      // another account's players are not counted against this one
      expect((await add(await signUp("bob"), { name: "Kid", kind: "kid" })).status).toBe(201);
    });

    it("lets exactly one of two adds that overlap in time make the last place", async () => {
      const ann = await signUp("ann");
      for (let n = 2; n < 8; n++) await add(ann, { name: `Kid ${n}`, kind: "kid" });
      expect(profileCount()).toBe(7);
      const sent = await addTogether(ann, [{ name: "Left", kind: "kid" }, { name: "Right", kind: "kid" }]);
      expect(sent.map((one) => one.status).sort()).toEqual([201, 409]);
      expect(profileCount()).toBe(8);
    });

    it("never reads a database answer that does not say how many rows changed as 'full'", async () => {
      const ann = await signUp("ann");
      const blind = { ...t.env, DB: { ...t.env.DB, batch: async (statements: Parameters<typeof t.env.DB.batch>[0]) => (await t.env.DB.batch(statements)).map((result) => ({ ...result, meta: {} })) } };
      const sent = await call(addProfile, blind, "/api/profiles", { cookie: ann, body: { name: "Mia", kind: "kid" } });
      expect(sent.status).toBe(500);
      expect(sent.body).toEqual({ error: "Something went wrong. Please try again." });
    });
  });

  it("answers with the profile that was asked for, even when another profile is added between the insert and the answer", async () => {
    const ann = await signUp("ann");
    const raced = {
      ...t.env,
      DB: {
        ...t.env.DB,
        batch: async (statements: Parameters<typeof t.env.DB.batch>[0]) => {
          const results = await t.env.DB.batch(statements);
          t.raw.exec("INSERT INTO profiles (account_id, name, name_key, kind, created_at) VALUES (1, 'Racer', 'racer', 'kid', 1)"); // another device, just now
          return results;
        },
      },
    };
    const sent = await call(addProfile, raced, "/api/profiles", { cookie: ann, body: { name: "Mia", kind: "kid" } });
    expect(sent.status).toBe(201);
    expect(sent.body).toMatchObject({ name: "Mia", kind: "kid" });
  });

  it("fills in the name key of a profile made while the old sign up code was still running, before checking names", async () => {
    const ann = await signUp("ann");
    t.raw.exec("UPDATE profiles SET name_key = ''"); // what the old code left behind
    expect((await add(ann, { name: "PLAYER", kind: "kid" })).status).toBe(409); // checked against the filled in key (the refused batch is rolled back whole)
    expect((await add(ann, { name: "Mia", kind: "kid" })).status).toBe(201);
    expect(t.raw.prepare("SELECT name_key FROM profiles WHERE id = 1").get()).toEqual({ name_key: "player" }); // and a batch that goes through keeps it
  });
});

describe("renaming a profile", () => {
  it("renames, answers with the profile, and keeps the kind and the id", async () => {
    const ann = await signUp("ann");
    await add(ann, { name: "Mia", kind: "kid" });
    const sent = await rename(ann, { id: 2, name: "  Mia  Lee " });
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({ id: 2, name: "Mia Lee", kind: "kid" });
    expect(names()).toEqual(["Player", "Mia Lee"]);
  });

  it("renames the first profile, which stays first", async () => {
    const ann = await signUp("ann");
    await add(ann, { name: "Aaron", kind: "kid" });
    expect((await rename(ann, { id: 1, name: "Zed" })).status).toBe(200);
    expect((await list(ann)).body.profiles.map((p: { id: number }) => p.id)).toEqual([1, 2]);
  });

  it("accepts the same name in another case (it is the profile's own), and refuses another profile's name with 409, not 500", async () => {
    const ann = await signUp("ann");
    await add(ann, { name: "Mia", kind: "kid" });
    expect((await rename(ann, { id: 2, name: "MIA" })).status).toBe(200);
    expect(names()).toEqual(["Player", "MIA"]);
    const clash = await rename(ann, { id: 2, name: "player" });
    expect(clash.status).toBe(409);
    expect(clash.body).toEqual({ error: "You already have a player with that name." });
    expect(names()).toEqual(["Player", "MIA"]);
  });

  it.each(BAD_NAMES)("refuses %s as a new name, and keeps the old one", async (_label, given) => {
    const ann = await signUp("ann");
    expect((await rename(ann, { id: 1, name: given })).status).toBe(400);
    expect(names()).toEqual(["Player"]);
  });

  it("answers 404 for another account's profile and for one that does not exist, and changes nothing", async () => {
    const ann = await signUp("ann");
    const bob = await signUp("bob");
    expect((await rename(ann, { id: 2, name: "Hijacked" })).status).toBe(404); // bob's first profile
    expect((await rename(ann, { id: 99, name: "Nobody" })).status).toBe(404);
    expect(names()).toEqual(["Player", "Player"]);
    expect((await rename(bob, { id: 2, name: "Bobby" })).status).toBe(200);
  });

  it("refuses an id that is missing, text, zero, negative, fractional or too long, a kind (it cannot change), a PIN, and an empty body", async () => {
    const ann = await signUp("ann");
    for (const body of [{ name: "Mia" }, { id: "1", name: "Mia" }, { id: 0, name: "Mia" }, { id: -1, name: "Mia" }, { id: 1.5, name: "Mia" }, { id: 10_000_000_000, name: "Mia" }, { id: 1 }, { id: 1, name: "" }, { id: 1, name: "Mia", kind: "kid" }, { id: 1, name: "Mia", pinHash: null }, {}]) {
      expect((await rename(ann, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(names()).toEqual(["Player"]);
  });

  it("needs a session and a same site JSON request", async () => {
    const ann = await signUp("ann");
    expect((await rename(undefined, { id: 1, name: "Mia" })).status).toBe(401);
    expect((await call(renameProfile, t.env, "/api/profiles", { method: "PATCH", cookie: ann, body: { id: 1, name: "Mia" }, headers: { Origin: null } })).status).toBe(403);
    expect(names()).toEqual(["Player"]);
  });

  it("fills in the name key of an older profile first, so the new name is checked against it", async () => {
    const ann = await signUp("ann");
    await add(ann, { name: "Mia", kind: "kid" });
    t.raw.exec("UPDATE profiles SET name_key = '' WHERE id = 1");
    expect((await rename(ann, { id: 2, name: "PLAYER" })).status).toBe(409);
  });
});

describe("the other methods", () => {
  it("answer 405 and say which are allowed", async () => {
    for (const method of ["PUT", "DELETE"]) {
      const sent = await call(profilesAnyMethod as never, t.env, "/api/profiles", { method });
      expect(sent.status, method).toBe(405);
      expect(sent.headers.get("Allow")).toBe("GET, POST, PATCH");
    }
  });
});

describe("the save of one profile", () => {
  it("is kept apart from the others: each profile has its own save and revision", async () => {
    const ann = await signUp("ann");
    await add(ann, { name: "Mia", kind: "kid" });
    expect((await put(ann, "1", 0, 11)).body).toMatchObject({ revision: 1 });
    expect((await put(ann, "1", 1, 12)).body).toMatchObject({ revision: 2 });
    expect((await put(ann, "2", 0, 21)).body).toMatchObject({ revision: 1 });
    expect((await get(ann, "?profile=1")).body).toMatchObject({ revision: 2, save: { coins: 12 } });
    expect((await get(ann, "?profile=2")).body).toMatchObject({ revision: 1, save: { coins: 21 } });
  });

  it("is the first profile's when no profile is named, even after other profiles exist (a page from before profiles)", async () => {
    const ann = await signUp("ann");
    await add(ann, { name: "Mia", kind: "kid" });
    await put(ann, "2", 0, 21);
    await put(ann, null, 0, 11);
    expect((await get(ann)).body).toMatchObject({ revision: 1, save: { coins: 11 } });
    expect((await get(ann, "?profile=2")).body).toMatchObject({ save: { coins: 21 } });
    expect(t.raw.prepare("SELECT profile_id FROM saves ORDER BY profile_id").all()).toEqual([{ profile_id: 1 }, { profile_id: 2 }]);
  });

  it("answers 404 for another account's profile on both routes and reads and writes nothing", async () => {
    const ann = await signUp("ann");
    const bob = await signUp("bob");
    await put(bob, null, 0, 99); // bob's first profile is id 2
    expect((await get(ann, "?profile=2")).status).toBe(404);
    expect((await put(ann, "2", 1, 5)).status).toBe(404);
    expect((await get(ann, "?profile=99")).status).toBe(404);
    expect((await put(ann, "99", 0, 5)).status).toBe(404);
    expect(countRows(t.raw, "saves")).toBe(1);
    expect((await get(bob)).body).toMatchObject({ revision: 1, save: { coins: 99 } });
    expect(countRows(t.raw, "save_backups")).toBe(0);
  });

  it.each(["", "abc", "1.0", "-1", "0", "01", "12345678901", "1e3", " 1", "1 ", "0x1"])("refuses the profile value %j", async (value) => {
    const ann = await signUp("ann");
    expect((await get(ann, `?profile=${encodeURIComponent(value)}`)).status).toBe(400);
    expect((await put(ann, encodeURIComponent(value), 0, 5)).status).toBe(400);
    expect(countRows(t.raw, "saves")).toBe(0);
  });

  it("refuses a profile named twice, and asks for the session before looking at the value", async () => {
    const ann = await signUp("ann");
    expect((await get(ann, "?profile=1&profile=1")).status).toBe(400);
    expect((await get(ann, "?profile=1&profile=2")).status).toBe(400);
    expect((await get(undefined, "?profile=abc")).status).toBe(401);
  });

  it("keeps the backup of a profile with that profile when it is overwritten by a newer save from another device", async () => {
    const ann = await signUp("ann");
    await add(ann, { name: "Mia", kind: "kid" });
    await put(ann, "2", 0, 1);
    vi.setSystemTime(T0 + 60_000);
    await call(putSave, t.env, "/api/save?profile=2", { method: "PUT", cookie: ann, body: { baseRevision: 0, savedAt: T0 + 60_000, save: { ...aliveSave("blip", at(10)), coins: 2 } } });
    expect(t.raw.prepare("SELECT profile_id FROM save_backups").all()).toEqual([{ profile_id: 2 }]);
    expect(countRows(t.raw, "save_backups WHERE profile_id = 1")).toBe(0);
  });
});
