// Profiles on the device: which profile opens at start, where each profile's game is kept, the list of players and how it is kept in
// step with the account, the choice kept for the session, and the paths the browser asks. The edge cases are in docs/profiles-plan.md
// section 6; the server side is in cloud-profiles.test.ts and two profiles syncing through the real routes is in cloud-sync.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canRemember, readChoice, writeChoice } from "../src/sync/choice";
import * as client from "../src/sync/cloud";
import type { Profile } from "../src/sync/profiles";
import { FIRST_KEYS, Roster, decideStart, keysFor, metaForProfile, parseStoredRoster } from "../src/sync/roster";
import type { RosterApi, StoredRoster } from "../src/sync/roster";
import type { CloudMeta } from "../src/sync/sync";
import { Game } from "../src/ui/game";
import { aliveSave, at } from "./helpers";

const writeSave = vi.hoisted(() => vi.fn());
vi.mock("../src/sync/local", () => ({ writeSave }));

const player: Profile = { id: 4, name: "Player", kind: "adult" };
const mia: Profile = { id: 7, name: "Mia", kind: "kid" };
const leo: Profile = { id: 9, name: "Leo", kind: "kid" };
const LIST = [player, mia, leo];
const roster = (list: Profile[] = LIST, username = "ann"): StoredRoster => ({ username, list });

describe("where each profile keeps its game on the device", () => {
  it("is the old keys for the first profile (so nothing is moved) and numbered keys for the others", () => {
    expect(keysFor(4, 4)).toEqual({ save: "save", cloud: "cloud" });
    expect(FIRST_KEYS).toEqual({ save: "save", cloud: "cloud" });
    expect(keysFor(7, 4)).toEqual({ save: "save:7", cloud: "cloud:7" });
    expect(keysFor(9, 4)).toEqual({ save: "save:9", cloud: "cloud:9" });
  });

  it("gives a different key to every profile of a list", () => {
    const keys = LIST.flatMap((profile) => [keysFor(profile.id, 4).save, keysFor(profile.id, 4).cloud]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("the list kept for the picker", () => {
  it("is read back as it was written", () => {
    expect(parseStoredRoster(JSON.parse(JSON.stringify(roster())))).toEqual(roster());
  });

  it("is dropped when anything is missing or the wrong kind, never guessed", () => {
    const eight = Array.from({ length: 9 }, (_, n) => ({ id: n + 1, name: `P${n}`, kind: "kid" }));
    for (const bad of [
      null,
      undefined,
      "text",
      5,
      [],
      {},
      { username: "ann" },
      { list: LIST },
      { username: 5, list: LIST },
      { username: "ann", list: [] },
      { username: "ann", list: "x" },
      { username: "ann", list: [player, player] },
      { username: "ann", list: [{ ...player, kind: "teen" }] },
      { username: "ann", list: [{ ...player, id: 0 }] },
      { username: "ann", list: [{ ...player, name: "" }] },
      { username: "ann", list: [{ ...player, name: "x".repeat(21) }] },
      { username: "ann", list: eight },
    ]) {
      expect(parseStoredRoster(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("what opens at start", () => {
  const input = (over: Partial<Parameters<typeof decideStart>[0]> = {}): Parameters<typeof decideStart>[0] => ({ username: "ann", roster: roster(), chosen: null, canRemember: true, ...over });

  it("is the first profile, with no list, when nobody is signed in (a choice left over from a signed in session is ignored)", () => {
    expect(decideStart(input({ username: null, chosen: 7 }))).toEqual({ kind: "open", profile: null, list: null });
    expect(decideStart(input({ username: null }))).toEqual({ kind: "open", profile: null, list: null });
  });

  it("is the first profile when signed in with no list yet, or with a list that belongs to another account", () => {
    expect(decideStart(input({ roster: null, chosen: 7 }))).toEqual({ kind: "open", profile: null, list: null });
    expect(decideStart(input({ roster: roster(LIST, "bob"), chosen: 7 }))).toEqual({ kind: "open", profile: null, list: null });
  });

  it("is the one profile when the account has only one, with no picker", () => {
    expect(decideStart(input({ roster: roster([player]) }))).toEqual({ kind: "open", profile: player, list: [player] });
  });

  it("asks who is playing when the account has several and nobody was picked in this session", () => {
    expect(decideStart(input())).toEqual({ kind: "pick", list: LIST });
  });

  it("opens the profile picked in this session, the first one included", () => {
    expect(decideStart(input({ chosen: 7 }))).toEqual({ kind: "open", profile: mia, list: LIST });
    expect(decideStart(input({ chosen: 4 }))).toEqual({ kind: "open", profile: player, list: LIST });
  });

  it("asks again when the picked profile is not on the list", () => {
    expect(decideStart(input({ chosen: 99 }))).toEqual({ kind: "pick", list: LIST });
  });

  it("plays the first profile, with no picker, when a choice cannot be kept in this window", () => {
    expect(decideStart(input({ canRemember: false }))).toEqual({ kind: "open", profile: player, list: LIST });
    expect(decideStart(input({ canRemember: false, chosen: 7 }))).toEqual({ kind: "open", profile: player, list: LIST });
  });
});

describe("the account record of a profile other than the first", () => {
  const device: CloudMeta = { username: "ann", signedIn: true, revision: 5, savedAt: 500, dirty: true };
  const own = (over: Partial<CloudMeta> = {}): CloudMeta => ({ username: "ann", signedIn: true, revision: 2, savedAt: 200, dirty: false, ...over });

  it("starts as one that never synced when it has no record of its own, and takes who is signed in from the device", () => {
    expect(metaForProfile(device, null)).toEqual({ username: "ann", signedIn: true, revision: 0, savedAt: 0, dirty: false });
  });

  it("keeps its own revision, time and changed mark, never the device's", () => {
    expect(metaForProfile(device, own({ dirty: true, savedAt: 250 }))).toEqual({ username: "ann", signedIn: true, revision: 2, savedAt: 250, dirty: true });
  });

  it("takes signed in from the device, so a stale 'signed out' left by an ended session does not leave the profile unsynced", () => {
    expect(metaForProfile(device, own({ signedIn: false })).signedIn).toBe(true);
  });

  it("starts again when its own record is from another account", () => {
    expect(metaForProfile(device, own({ username: "bob", revision: 9, dirty: true }))).toEqual({ username: "ann", signedIn: true, revision: 0, savedAt: 0, dirty: false });
  });
});

describe("the choice kept for the session", () => {
  let store: Map<string, string>;
  let broken: boolean;
  beforeEach(() => {
    store = new Map();
    broken = false;
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => {
        if (broken) throw new Error("blocked");
        return store.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (broken) throw new Error("blocked");
        store.set(key, value);
      },
      removeItem: (key: string) => {
        if (broken) throw new Error("blocked");
        store.delete(key);
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is kept, read back, and forgotten", () => {
    expect(readChoice()).toBeNull();
    expect(writeChoice(7)).toBe(true);
    expect(readChoice()).toBe(7);
    expect(writeChoice(null)).toBe(true);
    expect(readChoice()).toBeNull();
  });

  it("is not trusted when what is stored is not a profile id", () => {
    for (const text of ["", "abc", "0", "01", "-1", "1.5", "12345678901", "7 "]) {
      store.set("bk-profile", text);
      expect(readChoice(), JSON.stringify(text)).toBeNull();
    }
  });

  it("leaves nothing behind when it checks whether a choice can be kept", () => {
    expect(canRemember()).toBe(true);
    expect([...store.keys()]).toEqual([]);
  });

  it("says so, and does not throw, when the browser blocks it", () => {
    broken = true;
    expect(canRemember()).toBe(false);
    expect(readChoice()).toBeNull();
    expect(writeChoice(7)).toBe(false);
    expect(writeChoice(null)).toBe(false);
  });
});

describe("the list of players, kept in step with the account", () => {
  const ok = <T>(value: T): Promise<{ ok: true; value: T }> => Promise.resolve({ ok: true, value });
  const bad = (message: string, kind: "offline" | "again" | "refused" = "refused"): Promise<{ ok: false; error: { kind: typeof kind; message: string } }> => Promise.resolve({ ok: false, error: { kind, message } });
  let api: { [K in keyof RosterApi]: ReturnType<typeof vi.fn> };
  let written: StoredRoster[];
  let woken: number;

  const make = (username: string | null, list: Profile[] | null, openId: number | null = null, remember = true): Roster => {
    const made = new Roster(username, list, openId, remember, api as unknown as RosterApi, { write: async (record) => void written.push(record) });
    woken = 0;
    made.subscribe(() => (woken += 1));
    return made;
  };
  beforeEach(() => {
    api = { list: vi.fn(() => ok(LIST)), add: vi.fn(), rename: vi.fn() };
    written = [];
  });

  describe("looking at the account", () => {
    it("takes the list, keeps it for the picker tagged with the username, and tells the screen", async () => {
      const r = make("ann", null);
      await r.refresh();
      expect(r.list).toEqual(LIST);
      expect(written).toEqual([{ username: "ann", list: LIST }]);
      expect(woken).toBeGreaterThan(0);
    });

    it("does not look when nobody is signed in", async () => {
      const r = make(null, null);
      await r.refresh();
      expect(api.list).not.toHaveBeenCalled();
      expect(r.list).toBeNull();
    });

    it("keeps what it knew, and says nothing, when the account cannot be reached", async () => {
      api.list.mockReturnValue(bad("Cannot reach the server.", "offline"));
      const r = make("ann", LIST);
      await r.refresh();
      expect(r.list).toEqual(LIST);
      expect(r.message).toBe("");
      expect(written).toEqual([]);
    });

    it("says the players could not be loaded when it knows none and the account cannot be reached", async () => {
      api.list.mockReturnValue(bad("Cannot reach the server.", "offline"));
      const r = make("ann", null);
      await r.refresh();
      expect(r.list).toBeNull();
      expect(r.message).toBe("The players could not be loaded.");
    });

    it("throws away an answer that arrives after the player signed out", async () => {
      let answer!: (value: Awaited<ReturnType<RosterApi["list"]>>) => void;
      api.list.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      const r = make("ann", null);
      const looking = r.refresh();
      void r.account(null);
      answer({ ok: true, value: LIST });
      await looking;
      expect(r.list).toBeNull();
      expect(written).toEqual([]);
    });

    it("throws away an answer that arrives after the player signed in as someone else", async () => {
      const bobs = [{ id: 31, name: "Bob", kind: "adult" as const }];
      let late!: (value: Awaited<ReturnType<RosterApi["list"]>>) => void;
      api.list.mockReturnValueOnce(new Promise((resolve) => (late = resolve))).mockReturnValue(ok(bobs));
      const r = make("ann", null);
      const looking = r.refresh(); // ann's list, still on its way
      await r.account("bob"); // bob signs in on this page and his own list arrives
      late({ ok: true, value: LIST });
      await looking;
      expect(r.list).toEqual(bobs);
      expect(written).toEqual([{ username: "bob", list: bobs }]);
    });

    it("forgets the list and the open profile of the account that was here, until the new account's list arrives", async () => {
      const bobs = [{ id: 31, name: "Bob", kind: "adult" as const }];
      let answer!: (value: Awaited<ReturnType<RosterApi["list"]>>) => void;
      api.list.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      const r = make("ann", LIST, 4);
      const signing = r.account("bob");
      expect(r.list).toBeNull();
      expect(r.canSwitch).toBe(false);
      expect(r.openId).toBeNull();
      answer({ ok: true, value: bobs });
      await signing;
      expect(r.list).toEqual(bobs);
      expect(r.openIsFirst).toBe(true); // bob's first profile is the one that is open, not the id that was ann's
      expect(r.firstId).toBe(31);
    });

    it("shows none of the old account's players when the new account's list cannot be loaded", async () => {
      api.list.mockReturnValue(bad("Something went wrong.", "refused"));
      const r = make("ann", LIST, 4);
      await r.account("bob");
      expect(r.list).toBeNull();
      expect(r.message).toBe("The players could not be loaded.");
    });

    it("picks up a player added on another device the next time it looks", async () => {
      const zoe: Profile = { id: 12, name: "Zoe", kind: "kid" };
      api.list.mockReturnValue(ok([...LIST, zoe]));
      const r = make("ann", LIST);
      await r.refresh();
      expect(r.list).toEqual([...LIST, zoe]);
      expect(written).toEqual([{ username: "ann", list: [...LIST, zoe] }]);
    });

    it("says the players could not be loaded when the account answers with an error, keeps the list it had, and stops saying it once a look works", async () => {
      api.list.mockReturnValueOnce(bad("Something went wrong.", "refused"));
      const r = make("ann", LIST);
      await r.refresh();
      expect(r.list).toEqual(LIST);
      expect(r.message).toBe("The players could not be loaded.");
      expect(written).toEqual([]);
      await r.refresh(); // the default answer is the list
      expect(r.message).toBe("");
    });

    it("looks again when the player signs in, and hides the list when they sign out", async () => {
      const r = make(null, null);
      expect(r.signedIn).toBe(false);
      await r.account("ann");
      expect(api.list).toHaveBeenCalledTimes(1);
      expect(r.signedIn).toBe(true);
      expect(r.list).toEqual(LIST);
      await r.account("ann"); // nothing changed
      expect(api.list).toHaveBeenCalledTimes(1);
      await r.account(null);
      expect(r.signedIn).toBe(false);
      expect(r.canSwitch).toBe(false);
      expect(r.list).toBeNull();
    });
  });

  describe("what the screen may offer", () => {
    it("shows the switch chip only when signed in, with 2 or more players, and a choice can be kept", () => {
      expect(make("ann", LIST).canSwitch).toBe(true);
      expect(make("ann", [player]).canSwitch).toBe(false);
      expect(make("ann", null).canSwitch).toBe(false);
      expect(make(null, LIST).canSwitch).toBe(false);
      expect(make("ann", LIST, null, false).canSwitch).toBe(false);
    });

    it("says when the switch is not offered because a choice cannot be kept: signed in, 2 or more players, a blocked or private window", () => {
      expect(make("ann", LIST, null, false).switchBlocked).toBe(true);
      expect(make("ann", LIST, null, true).switchBlocked).toBe(false);
      expect(make("ann", [player], null, false).switchBlocked).toBe(false); // nothing to switch to, nothing to explain
      expect(make("ann", null, null, false).switchBlocked).toBe(false);
      expect(make(null, LIST, null, false).switchBlocked).toBe(false);
    });

    it("knows the first profile, and whether the open one is it (no list yet: it is)", () => {
      expect(make("ann", LIST).firstId).toBe(4);
      expect(make("ann", LIST, 4).openIsFirst).toBe(true);
      expect(make("ann", LIST, 7).openIsFirst).toBe(false);
      expect(make("ann", null, null).openIsFirst).toBe(true);
    });

    it("offers adding until the account has 8 players", () => {
      const seven = Array.from({ length: 7 }, (_, n) => ({ id: n + 1, name: `P${n}`, kind: "kid" as const }));
      expect(make("ann", seven).canAdd).toBe(true);
      expect(make("ann", [...seven, { id: 8, name: "P8", kind: "kid" }]).canAdd).toBe(false);
      expect(make(null, seven).canAdd).toBe(false);
    });
  });

  describe("adding a player", () => {
    it("sends the name as the server will keep it, and adds the answer to the list and the stored copy", async () => {
      api.add.mockReturnValue(ok({ id: 11, name: "Mia Lee", kind: "kid" }));
      const r = make("ann", [player]);
      expect(await r.add("  Mia   Lee ", "kid")).toBeNull();
      expect(api.add).toHaveBeenCalledWith("Mia Lee", "kid");
      expect(r.list).toEqual([player, { id: 11, name: "Mia Lee", kind: "kid" }]);
      expect(written.at(-1)).toEqual({ username: "ann", list: r.list });
    });

    it("says what is wrong with a name without asking the server: empty, too long, a character that is not allowed, a name that is taken in any case, a full account", async () => {
      const r = make("ann", LIST);
      expect(await r.add("", "kid")).toMatch(/Choose a name/);
      expect(await r.add("x".repeat(21), "kid")).toMatch(/Choose a name/);
      expect(await r.add("Mia 😀", "kid")).toMatch(/Choose a name/);
      expect(await r.add("mIA", "kid")).toBe("You already have a player with that name.");
      expect(await r.add("player", "kid")).toBe("You already have a player with that name.");
      const full = make("ann", Array.from({ length: 8 }, (_, n) => ({ id: n + 1, name: `P${n}`, kind: "kid" as const })));
      expect(await full.add("Another", "kid")).toBe("An account can have up to 8 players.");
      expect(api.add).not.toHaveBeenCalled();
    });

    it("drops the answer to an add that arrives after the player signed in as someone else", async () => {
      const bobs = [{ id: 31, name: "Bob", kind: "adult" as const }];
      let answer!: (value: Awaited<ReturnType<RosterApi["add"]>>) => void;
      api.add.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      api.list.mockReturnValue(ok(bobs));
      const r = make("ann", LIST);
      const adding = r.add("Zoe", "kid");
      await r.account("bob"); // bob's own list arrives first
      answer({ ok: true, value: { id: 12, name: "Zoe", kind: "kid" } });
      expect(await adding).toBeNull();
      expect(r.list).toEqual(bobs);
      expect(written).toEqual([{ username: "bob", list: bobs }]);
    });

    it("does not list a player twice when a look at the account saw the new one before the answer to the add came", async () => {
      const zoe: Profile = { id: 12, name: "Zoe", kind: "kid" };
      let answer!: (value: Awaited<ReturnType<RosterApi["add"]>>) => void;
      api.add.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      api.list.mockReturnValue(ok([...LIST, zoe]));
      const r = make("ann", LIST);
      const adding = r.add("Zoe", "kid");
      await r.refresh();
      answer({ ok: true, value: zoe });
      await adding;
      expect(r.list).toEqual([...LIST, zoe]);
    });

    it("does nothing, and says so, when the list is not known (it would be stored as the whole list)", async () => {
      const r = make("ann", null);
      expect(await r.add("Zoe", "kid")).toBe("The players are not loaded yet.");
      expect(await r.rename(4, "Anna")).toBe("The players are not loaded yet.");
      expect(api.add).not.toHaveBeenCalled();
      expect(api.rename).not.toHaveBeenCalled();
      expect(written).toEqual([]);
    });

    it("passes on what the server says when it refuses, and changes nothing", async () => {
      api.add.mockReturnValue(bad("You already have a player with that name.", "again"));
      const r = make("ann", [player]);
      expect(await r.add("Mia", "kid")).toBe("You already have a player with that name.");
      expect(r.list).toEqual([player]);
      expect(written).toEqual([]);
    });

    it("answers one change at a time", async () => {
      let answer!: (value: Awaited<ReturnType<RosterApi["add"]>>) => void;
      api.add.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      const r = make("ann", [player]);
      const first = r.add("Mia", "kid");
      expect(await r.add("Leo", "kid")).toBe("One moment, the last change is still being saved.");
      answer({ ok: true, value: mia });
      expect(await first).toBeNull();
      expect(api.add).toHaveBeenCalledTimes(1);
      expect(r.busy).toBe(false);
    });
  });

  describe("renaming a player", () => {
    it("drops the answer to a rename that arrives after the player signed out (no list is made of it)", async () => {
      let answer!: (value: Awaited<ReturnType<RosterApi["rename"]>>) => void;
      api.rename.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      const r = make("ann", LIST);
      const renaming = r.rename(7, "Mimi");
      await r.account(null);
      answer({ ok: true, value: { ...mia, name: "Mimi" } });
      expect(await renaming).toBeNull();
      expect(r.list).toBeNull();
      expect(written).toEqual([]);
    });

    it("stores nothing more when the answer to a rename arrives after someone else signed in and their list landed", async () => {
      const bobs = [{ id: 31, name: "Bob", kind: "adult" as const }];
      let answer!: (value: Awaited<ReturnType<RosterApi["rename"]>>) => void;
      api.rename.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      api.list.mockReturnValue(ok(bobs));
      const r = make("ann", LIST);
      const renaming = r.rename(7, "Mimi");
      await r.account("bob");
      answer({ ok: true, value: { ...mia, name: "Mimi" } });
      expect(await renaming).toBeNull();
      expect(written).toEqual([{ username: "bob", list: bobs }]); // bob's own look, and nothing from ann's rename
    });

    it("sends the new name and puts the answer in the list in the same place", async () => {
      api.rename.mockReturnValue(ok({ id: 7, name: "Mimi", kind: "kid" }));
      const r = make("ann", LIST);
      expect(await r.rename(7, "Mimi")).toBeNull();
      expect(api.rename).toHaveBeenCalledWith(7, "Mimi");
      expect(r.list!.map((profile) => profile.name)).toEqual(["Player", "Mimi", "Leo"]);
      expect(written.at(-1)!.list.map((profile) => profile.name)).toEqual(["Player", "Mimi", "Leo"]);
    });

    it("lets a player take their own name in another case, and refuses another player's name", async () => {
      api.rename.mockReturnValue(ok({ id: 7, name: "MIA", kind: "kid" }));
      const r = make("ann", LIST);
      expect(await r.rename(7, "MIA")).toBeNull();
      expect(await r.rename(7, "leo")).toBe("You already have a player with that name.");
      expect(api.rename).toHaveBeenCalledTimes(1);
    });

    it("passes on what the server says when it refuses, and changes nothing", async () => {
      api.rename.mockReturnValue(bad("That player was not found."));
      const r = make("ann", LIST);
      expect(await r.rename(7, "Mimi")).toBe("That player was not found.");
      expect(r.list).toEqual(LIST);
    });
  });
});

describe("the paths the browser asks", () => {
  let calls: { method: string; url: string; body: string | undefined }[];
  let answer: () => Response;
  beforeEach(() => {
    calls = [];
    answer = () => new Response(JSON.stringify({ revision: 0, savedAt: 0, save: null }), { status: 200 });
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? "GET", url, body: init.body as string | undefined });
      return answer();
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("asks for the account's first game without a profile, and for another profile's game with its id", async () => {
    await client.fetchSave();
    await client.fetchSave(null);
    await client.fetchSave(7);
    expect(calls.map((call) => call.url)).toEqual(["/api/save", "/api/save", "/api/save?profile=7"]);
  });

  it("sends a game to the same place it asks for it", async () => {
    answer = () => new Response(JSON.stringify({ status: "saved", revision: 1 }), { status: 200 });
    await client.sendSave({ baseRevision: 0, savedAt: 1, save: {} });
    await client.sendSave({ baseRevision: 0, savedAt: 1, save: {} }, 7);
    expect(calls.map((call) => [call.method, call.url])).toEqual([["PUT", "/api/save"], ["PUT", "/api/save?profile=7"]]);
  });

  it("reads the list, adds a player and renames one", async () => {
    answer = () => new Response(JSON.stringify({ profiles: LIST }), { status: 200 });
    expect(await client.fetchProfiles()).toEqual({ ok: true, value: LIST });
    answer = () => new Response(JSON.stringify(mia), { status: 201 });
    expect(await client.addProfile("Mia", "kid")).toEqual({ ok: true, value: mia });
    answer = () => new Response(JSON.stringify({ ...mia, name: "Mimi" }), { status: 200 });
    expect(await client.renameProfile(7, "Mimi")).toEqual({ ok: true, value: { ...mia, name: "Mimi" } });
    expect(calls.map((call) => [call.method, call.url, call.body])).toEqual([
      ["GET", "/api/profiles", undefined],
      ["POST", "/api/profiles", JSON.stringify({ name: "Mia", kind: "kid" })],
      ["PATCH", "/api/profiles", JSON.stringify({ id: 7, name: "Mimi" })],
    ]);
  });

  it("does not trust a list that is the wrong shape", async () => {
    for (const body of [{ profiles: [] }, { profiles: "x" }, { profiles: [{ id: 0, name: "A", kind: "kid" }] }, { profiles: [{ id: 1, name: "A", kind: "teen" }] }, [], null]) {
      answer = () => new Response(JSON.stringify(body), { status: 200 });
      const reply = await client.fetchProfiles();
      expect(reply.ok, JSON.stringify(body)).toBe(false);
    }
  });

  it("does not trust a profile that is the wrong shape in the answer to adding or renaming one", async () => {
    for (const body of [{}, null, { id: 7, name: "Mia" }, { id: 7, name: "Mia", kind: "teen" }, { id: 0, name: "Mia", kind: "kid" }, { id: 7, name: "", kind: "kid" }, [mia]]) {
      answer = () => new Response(JSON.stringify(body), { status: 200 });
      expect((await client.addProfile("Mia", "kid")).ok, JSON.stringify(body)).toBe(false);
      expect((await client.renameProfile(7, "Mia")).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it("passes on the server's own words when a name is refused", async () => {
    answer = () => new Response(JSON.stringify({ error: "You already have a player with that name." }), { status: 409 });
    expect(await client.addProfile("Mia", "kid")).toEqual({ ok: false, error: { kind: "again", message: "You already have a player with that name." } });
    answer = () => new Response(JSON.stringify({ error: "That player was not found." }), { status: 404 });
    expect(await client.renameProfile(99, "Mimi")).toEqual({ ok: false, error: { kind: "refused", message: "That player was not found." } });
  });
});

describe("the key a game is written to", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at(10));
    vi.stubGlobal("window", globalThis);
    writeSave.mockReset();
    writeSave.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("is the first profile's key unless the game is made for another", () => {
    new Game(aliveSave("blip", at(10))).saveNow();
    new Game(aliveSave("blip", at(10)), "save:7").saveNow();
    expect(writeSave.mock.calls.map((call) => call[1])).toEqual(["save", "save:7"]);
  });

  it("answers when the game is on the device, for a page about to reload", async () => {
    let finish!: () => void;
    writeSave.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const game = new Game(aliveSave("blip", at(10)), "save:7");
    let done = false;
    void game.saveNow().then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(true);
  });
});
