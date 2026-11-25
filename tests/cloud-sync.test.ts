// The browser side of cloud saves: when a device sends its game, brings one in, or asks the player. The browser code here is the real
// code (src/sync/cloud.ts and sync.ts) talking to the real server routes and the real SQL, with only the network and the database
// engine replaced (a fetch that calls the routes, node:sqlite for D1). Devices take turns: each test awaits one before using the next.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost as login } from "../functions/api/login";
import { onRequestPost as logout } from "../functions/api/logout";
import { onRequestGet as listProfilesRoute, onRequestPatch as renameProfileRoute, onRequestPost as addProfileRoute } from "../functions/api/profiles";
import { onRequestPost as register } from "../functions/api/register";
import { onRequestGet as getSave, onRequestPut as putSave } from "../functions/api/save";
import type { Context } from "../functions/_lib/types";
import { newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import * as client from "../src/sync/cloud";
import { Roster, metaForProfile } from "../src/sync/roster";
import { CloudSync, RETRY_MS, SYNC_DELAY_MS, WAIT_MS, isUntouched, metaForNewGame, parseMeta, planAfterPull } from "../src/sync/sync";
import type { Api, CloudMeta, GameLike } from "../src/sync/sync";
import { aliveSave, at } from "./helpers";
import { SITE, countRows, newTestDb } from "./cloud-helpers";
import type { TestDb } from "./cloud-helpers";

// Stretching a password 600,000 times takes a moment each time: these tests use 1,000 (the recipe is tested in cloud-rules.test.ts).
vi.mock("../src/sync/account-rules", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/sync/account-rules")>();
  return { ...real, deriveKey: (username: string, password: string) => real.deriveKey(username, password, 1_000) };
});

const T0 = Date.UTC(2026, 10, 21, 12, 0, 0);
const USERNAME = "kid";
const PASSWORD = "correct horse battery";

// ---- the network: fetch answered by the real routes ----

interface Jar {
  cookie: string | null;
}
const routes: Record<string, Record<string, (ctx: Context) => Promise<Response>>> = {
  "/api/register": { POST: register },
  "/api/login": { POST: login },
  "/api/logout": { POST: logout },
  "/api/save": { GET: getSave, PUT: putSave },
  "/api/profiles": { GET: listProfilesRoute, POST: addProfileRoute, PATCH: renameProfileRoute },
};

let t: TestDb;
let activeJar: Jar;
let offline: boolean;
let override: ((method: string) => Response | null) | null; // answers a request with this instead of the server (null: the server answers)
let duringPut: (() => void) | null; // runs once, right after a save has been sent (the game is played while it is on its way)
let holdPut: Promise<void> | null; // holds back the answer to the next save until it settles (a slow connection)
let requests: string[];

async function fakeFetch(input: string | URL | Request, init: RequestInit = {}): Promise<Response> {
  const path = String(input);
  const method = init.method ?? "GET";
  requests.push(`${method} ${path}`);
  if (offline) throw new TypeError("Failed to fetch");
  const instead = override?.(method);
  if (instead) return instead;
  const handler = routes[path.split("?")[0]!]?.[method]; // (the query, ?profile=, goes on to the route in the request)
  if (!handler) return new Response("<html>not found</html>", { status: 404 });
  const headers = new Headers(init.headers);
  headers.set("Origin", SITE);
  headers.set("CF-Connecting-IP", "1.2.3.4");
  if (activeJar.cookie) headers.set("Cookie", activeJar.cookie);
  const pending = handler({ request: new Request(SITE + path, { method, headers, body: init.body as string | undefined }), env: t.env });
  if (method === "PUT") {
    duringPut?.();
    duringPut = null;
    await holdPut;
    holdPut = null;
  }
  const response = await pending;
  const set = response.headers.getSetCookie()[0];
  if (set) {
    const [pair, ...attributes] = set.split("; ");
    activeJar.cookie = attributes.includes("Max-Age=0") ? null : pair!;
  }
  return response;
}

// ---- devices ----

interface FakeGame extends GameLike {
  replaced: Save[];
  pending: boolean; // the player did something since the last save, as in the real game (ui/game.ts): a save with nothing pending is the clock moving on
}
function fakeGame(save: Save): FakeGame {
  const game: FakeGame = {
    save,
    onSave: null,
    replaced: [],
    pending: false,
    replaceSave(next) {
      game.save = next;
      game.replaced.push(next);
    },
    saveNow() {
      const byPlayer = game.pending;
      game.pending = false;
      game.onSave?.(byPlayer);
    },
  };
  return game;
}

interface Device {
  game: FakeGame;
  sync: CloudSync;
  jar: Jar;
  written: CloudMeta[]; // every account record this device stored
  restart(lostGame?: boolean): CloudSync; // the page is closed and opened again: same cookie, what was stored is read back; lostGame: the saved game could not be loaded, so a new egg starts
}

const apiFor = (jar: Jar, profile: number | null = null): Api => ({
  signIn: (...args) => ((activeJar = jar), client.signIn(...args)),
  signUp: (...args) => ((activeJar = jar), client.signUp(...args)),
  signOut: () => ((activeJar = jar), client.signOut()),
  fetchSave: () => ((activeJar = jar), client.fetchSave(profile)),
  sendSave: (put) => ((activeJar = jar), client.sendSave(put, profile)),
});

const devices: Device[] = []; // every device of the test running, so its unfinished work can be waited for before the next test starts
// A profile other than the first, in the browser of `account` (the first profile's device, whose record says who is signed in, and whose
// cookie it shares). The record it starts from is made the way the page makes it (metaForProfile).
interface Profiled {
  profile: number;
  account: Device;
}
function newDevice(save: Save = newSave(Date.now(), 1), profiled: Profiled | null = null): Device {
  const jar: Jar = profiled ? profiled.account.jar : { cookie: null };
  const game = fakeGame(save);
  const written: CloudMeta[] = [];
  const store = { writeMeta: async (meta: CloudMeta) => void written.push(meta) };
  const recordFor = (own: CloudMeta | null): CloudMeta | null => {
    if (!profiled) return own;
    const account = parseMeta(profiled.account.written.at(-1) ?? null);
    return account ? metaForProfile(account, own) : null;
  };
  const api = (): Api => apiFor(jar, profiled ? profiled.profile : null);
  const device: Device = {
    game,
    jar,
    written,
    sync: new CloudSync(game, recordFor(null), api(), store),
    restart: (lostGame = false) => {
      const meta = recordFor(parseMeta(written.at(-1) ?? null));
      if (lostGame) game.save = newSave(Date.now(), 2);
      return (device.sync = new CloudSync(game, lostGame ? metaForNewGame(meta) : meta, api(), store));
    },
  };
  devices.push(device);
  return device;
}

// A game that is under way, told apart from another by its coins.
const gameWith = (coins: number): Save => ({ ...aliveSave("blip", at(10)), coins });
const play = (device: Device, coins: number): void => {
  device.game.save.coins = coins;
  device.game.pending = true;
  device.game.saveNow();
};

// The account's own record of the game.
const serverRow = (): { revision: number; saved_at: number; data: string } | undefined =>
  t.raw.prepare("SELECT revision, saved_at, data FROM saves").get() as { revision: number; saved_at: number; data: string } | undefined;
const serverCoins = (): number => JSON.parse(serverRow()!.data).coins;
const coinsOf = (username: string): number =>
  JSON.parse((t.raw.prepare("SELECT s.data FROM saves s JOIN profiles p ON p.id = s.profile_id JOIN accounts a ON a.id = p.account_id WHERE a.username = ?").get(username) as { data: string }).data).coins;
const backupCoins = (): number[] => (t.raw.prepare("SELECT data FROM save_backups ORDER BY id").all() as { data: string }[]).map((row) => JSON.parse(row.data).coins);
const puts = (): number => requests.filter((request) => request.startsWith("PUT")).length;

// Waits for everything a device has queued.
const settle = (device: Device): Promise<void> => device.sync.sync();
async function signUp(device: Device, username = USERNAME): Promise<void> {
  expect(await device.sync.signUp(username, PASSWORD, "family-code")).toBeNull();
  await settle(device);
}
async function signIn(device: Device, username = USERNAME): Promise<void> {
  expect(await device.sync.signIn(username, PASSWORD)).toBeNull();
  await settle(device);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(T0);
  t = newTestDb();
  offline = false;
  override = null;
  duringPut = null;
  holdPut = null;
  requests = [];
  vi.stubGlobal("fetch", fakeFetch);
});
afterEach(async () => {
  await Promise.all(devices.splice(0).map((device) => device.sync.sync())); // (work still on its way would otherwise run into the next test)
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("the times the plan names", () => {
  it("are 30 seconds to send after a change, 1 minute to retry, 5 minutes after too many tries", () => {
    expect([SYNC_DELAY_MS, RETRY_MS, WAIT_MS]).toEqual([30_000, 60_000, 300_000]);
  });
});

// ---- the decisions on their own ----

describe("what to do once the account's save has been looked at", () => {
  const meta = (revision: number, dirty: boolean): CloudMeta => ({ username: USERNAME, signedIn: true, revision, savedAt: 5, dirty });
  const saved = { revision: 3, savedAt: 9, save: { version: 3 } };
  const empty = { revision: 0, savedAt: 0, save: null };

  it("sends the game to an account that has none, unless it is an untouched egg", () => {
    expect(planAfterPull(meta(0, false), false, empty)).toBe("push");
    expect(planAfterPull(meta(0, true), false, empty)).toBe("push");
    expect(planAfterPull(meta(2, false), false, empty)).toBe("push"); // an account whose save was lost
    expect(planAfterPull(meta(0, false), true, empty)).toBe("nothing");
  });

  it("never decides for the player when this device never synced: an untouched egg takes the account's game, any other game is asked about", () => {
    expect(planAfterPull(meta(0, false), true, saved)).toBe("adopt");
    expect(planAfterPull(meta(0, false), false, saved)).toBe("ask");
    expect(planAfterPull(meta(0, true), false, saved)).toBe("ask");
  });

  it("does nothing when it matches and nothing changed, and sends when it matches and the game changed", () => {
    expect(planAfterPull(meta(3, false), false, saved)).toBe("nothing");
    expect(planAfterPull(meta(3, true), false, saved)).toBe("push");
  });

  it("brings in a newer account game when nothing changed here, and lets the server pick the newer when both changed", () => {
    expect(planAfterPull(meta(2, false), false, saved)).toBe("adopt");
    expect(planAfterPull(meta(4, false), false, saved)).toBe("adopt");
    expect(planAfterPull(meta(2, true), false, saved)).toBe("push");
  });
});

describe("an untouched egg", () => {
  it("is a new egg that nothing has happened to: not tapped, no coins, no materials, no news, no earlier creature", () => {
    expect(isUntouched(newSave(T0, 1))).toBe(true);
    const touched = (change: (save: Save) => void): boolean => {
      const save = newSave(T0, 1);
      change(save);
      return isUntouched(save);
    };
    expect(touched((s) => (s.egg!.shavedMinutes = 1))).toBe(false);
    expect(touched((s) => (s.coins = 1))).toBe(false);
    expect(touched((s) => ((s.inventory as Record<string, number>).wood = 1))).toBe(false);
    expect(touched((s) => (s.log = [...s.log, { at: T0, text: "more" }]))).toBe(false);
    expect(touched((s) => s.hauls.push({} as Save["hauls"][number]))).toBe(false);
    expect(touched((s) => (s.home = { pieces: { sofa: { col: 13, row: 2 } } }))).toBe(false); // furniture the player moved is theirs
    expect(isUntouched(aliveSave("blip", at(10)))).toBe(false);
  });
});

describe("the account details a device remembers", () => {
  const good: CloudMeta = { username: USERNAME, signedIn: true, revision: 3, savedAt: 99, dirty: false };

  it("are read back as they were written", () => {
    expect(parseMeta(JSON.parse(JSON.stringify(good)))).toEqual(good);
  });

  it("are dropped when anything is missing or the wrong kind, never guessed", () => {
    for (const bad of [null, undefined, "text", 5, [], {}, { ...good, username: 5 }, { ...good, signedIn: "yes" }, { ...good, dirty: 1 }, { ...good, revision: -1 }, { ...good, revision: 1.5 }, { ...good, savedAt: "5" }, { ...good, revision: undefined }]) {
      expect(parseMeta(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("are dropped (parseMeta answers null) when the record is from the days of email sign in", () => {
    const { username: _kept, ...rest } = good;
    expect(parseMeta({ ...rest, email: "kid@example.com" })).toBeNull();
  });
});

// ---- the flows ----

describe("signed out", () => {
  it("never calls the server, however the game is played or the page is left", async () => {
    const d = newDevice(gameWith(5));
    d.sync.start();
    play(d, 6);
    play(d, 7);
    d.sync.flush();
    await settle(d);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(requests).toEqual([]);
    expect(d.sync.username).toBeNull();
  });

  it("stores nothing about an account the device has never met", () => {
    const d = newDevice(gameWith(5));
    d.sync.start();
    play(d, 6);
    expect(d.written).toEqual([]);
  });
});

// Play done while signed out is marked as changed, so the next sign in sends it and the server's newest-save-wins rule decides
// (the older game goes to the account's backups). Before, nothing marked it, and an account game saved by another device in the
// meantime replaced it without a trace.
describe("play done while signed out", () => {
  // The tablet is signed in and matches the account (revision 1, coins 1), then signs out. The phone is another device of the account.
  async function signedOutTablet(): Promise<{ tablet: Device; phone: Device }> {
    const phone = newDevice(gameWith(1));
    await signUp(phone);
    const tablet = newDevice();
    await signIn(tablet);
    expect(tablet.game.save.coins).toBe(1);
    await tablet.sync.signOut();
    requests.length = 0;
    return { tablet, phone };
  }
  const later = async (ms: number): Promise<void> => {
    await vi.advanceTimersByTimeAsync(ms);
  };

  it("is marked as changed, without calling the server or setting a timer", async () => {
    const { tablet } = await signedOutTablet();
    let woken = 0;
    tablet.sync.subscribe(() => (woken += 1)); // the screen is told whenever a send starts or ends
    const timers = vi.getTimerCount();
    play(tablet, 7);
    expect(vi.getTimerCount()).toBe(timers); // nothing was set to send it later
    expect(tablet.written.at(-1)).toMatchObject({ signedIn: false, dirty: true, revision: 1 });
    await later(10 * 60_000);
    expect(requests).toEqual([]);
    expect(woken).toBe(0); // no timer ran a send that finds nobody signed in
  });

  it("is sent at the next sign in when the account has not changed since", async () => {
    const { tablet } = await signedOutTablet();
    play(tablet, 7);
    await signIn(tablet);
    expect(serverCoins()).toBe(7);
    expect(serverRow()!.revision).toBe(2);
    expect(tablet.written.at(-1)).toMatchObject({ signedIn: true, revision: 2, dirty: false });
  });

  it("is kept in the account's backups, not lost, when another device saved a newer game in the meantime", async () => {
    const { tablet, phone } = await signedOutTablet();
    play(tablet, 7); // the tablet, signed out
    await later(60_000);
    play(phone, 3); // a minute later the phone plays on and sends
    phone.sync.flush();
    await settle(phone);
    expect(serverCoins()).toBe(3);
    await signIn(tablet);
    expect(serverCoins()).toBe(3); // the phone's game is newer and stays
    expect(tablet.game.save.coins).toBe(3);
    expect(backupCoins()).toContain(7); // the tablet's play is kept
  });

  it("wins when it is newer than the account's game, and the account's game goes to the backups", async () => {
    const { tablet, phone } = await signedOutTablet();
    play(phone, 3);
    phone.sync.flush();
    await settle(phone);
    await later(60_000);
    play(tablet, 7); // a minute after the phone's last save
    await signIn(tablet);
    expect(serverCoins()).toBe(7);
    expect(tablet.game.save.coins).toBe(7);
    expect(backupCoins()).toContain(3);
  });

  it("is not marked when only the clock moved on (a save the player did not cause)", async () => {
    const { tablet } = await signedOutTablet();
    tablet.game.saveNow(); // nothing pending: the game moved on by itself
    tablet.game.saveNow();
    expect(tablet.written.at(-1)).toMatchObject({ signedIn: false, dirty: false });
    await signIn(tablet);
    expect(puts()).toBe(0);
  });

  it("is marked after the account ended this browser's session too, and sent at the next sign in", async () => {
    const { tablet } = await signedOutTablet();
    await signIn(tablet);
    t.raw.exec("DELETE FROM sessions");
    await settle(tablet); // the look at the account finds the session gone, with nothing waiting to be sent
    expect(tablet.sync.username).toBeNull();
    expect(tablet.written.at(-1)).toMatchObject({ signedIn: false, dirty: false });
    play(tablet, 9); // keeps playing signed out
    expect(tablet.written.at(-1)).toMatchObject({ signedIn: false, dirty: true });
    await signIn(tablet);
    expect(serverCoins()).toBe(9);
  });

  it("is still marked after the page is opened again, and sent at the next sign in", async () => {
    const { tablet } = await signedOutTablet();
    play(tablet, 7);
    const reopened = tablet.restart();
    reopened.start();
    expect(reopened.username).toBeNull();
    await later(10 * 60_000);
    expect(requests).toEqual([]);
    expect(await reopened.signIn(USERNAME, PASSWORD)).toBeNull();
    await settle(tablet);
    expect(serverCoins()).toBe(7);
  });

  // (A guard of what already held, kept next to the new ones: the mark must not turn an "ask" into a decision.)
  it("does not decide for the player when the next sign in is another account: the player is asked", async () => {
    const { tablet } = await signedOutTablet();
    await signUp(newDevice(gameWith(50)), "sib"); // another account with a game of its own
    play(tablet, 7);
    await signIn(tablet, "sib");
    expect(tablet.sync.choosing).not.toBeNull();
    expect(tablet.game.save.coins).toBe(7);
    expect(coinsOf(USERNAME)).toBe(1); // the first account's game is untouched
    expect(coinsOf("sib")).toBe(50); // and so is the other's, until the player has chosen
  });
});

// ---- profiles: each profile of the account has its own game, its own record on the device, and its own revision on the server ----

describe("profiles of one account", () => {
  const rowOf = (profile: number): { revision: number; data: string } | undefined => t.raw.prepare("SELECT revision, data FROM saves WHERE profile_id = ?").get(profile) as { revision: number; data: string } | undefined;
  const coinsOfProfile = (profile: number): number | undefined => (rowOf(profile) ? JSON.parse(rowOf(profile)!.data).coins : undefined);
  const as = (device: Device): void => void (activeJar = device.jar);

  // The phone is signed in and matches the account's first profile (coins 1); the account also has a kid, profile 2.
  async function accountWithKid(): Promise<{ phone: Device; kidPhone: Device }> {
    const phone = newDevice(gameWith(1));
    await signUp(phone);
    as(phone);
    expect(await client.addProfile("Mia", "kid")).toMatchObject({ ok: true, value: { id: 2, kind: "kid" } });
    return { phone, kidPhone: newDevice(gameWith(10), { profile: 2, account: phone }) };
  }

  it("send a profile that has no record of its own yet: its first change is sent like any other", async () => {
    const { kidPhone } = await accountWithKid();
    kidPhone.sync.start();
    await settle(kidPhone);
    expect(coinsOfProfile(2)).toBe(10); // the game it started with goes to an account that has none for this profile
    play(kidPhone, 11);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    await settle(kidPhone);
    expect(coinsOfProfile(2)).toBe(11);
    expect(kidPhone.written.at(-1)).toMatchObject({ username: USERNAME, signedIn: true, revision: 2, dirty: false });
  });

  it("keep each profile's game and revision apart, and talk to the profile they are for", async () => {
    const { phone, kidPhone } = await accountWithKid();
    kidPhone.sync.start();
    await settle(kidPhone);
    play(phone, 3);
    phone.sync.flush();
    await settle(phone);
    expect(coinsOfProfile(1)).toBe(3);
    expect(coinsOfProfile(2)).toBe(10);
    expect(rowOf(1)!.revision).toBe(2);
    expect(rowOf(2)!.revision).toBe(1);
    expect(requests.filter((request) => request.includes("profile=2")).length).toBeGreaterThan(0);
    expect(requests.filter((request) => request === "PUT /api/save").length).toBeGreaterThan(0); // the first profile is asked for without a profile
  });

  it("leave the first profile to a page from before profiles, which asks for no profile", async () => {
    const { kidPhone } = await accountWithKid();
    kidPhone.sync.start();
    await settle(kidPhone);
    const oldPage = newDevice(gameWith(5));
    await signIn(oldPage); // asked: its game against the account's first game
    expect(oldPage.sync.choosing).not.toBeNull();
    await oldPage.sync.choose("device");
    expect(coinsOfProfile(1)).toBe(5);
    expect(coinsOfProfile(2)).toBe(10); // the kid's game is not touched
  });

  it("do not let a profile left open and idle beat the one in use", async () => {
    const { kidPhone } = await accountWithKid();
    kidPhone.sync.start();
    await settle(kidPhone);
    const tablet = newDevice(gameWith(1));
    await signIn(tablet);
    await tablet.sync.choose("account");
    const kidTablet = newDevice(undefined, { profile: 2, account: tablet }); // a new egg: it takes the account's game for this profile
    kidTablet.sync.start();
    await settle(kidTablet);
    expect(kidTablet.game.save.coins).toBe(10); // matches the account (revision 1)
    play(kidPhone, 20);
    kidPhone.sync.flush();
    await settle(kidPhone);
    expect(coinsOfProfile(2)).toBe(20);
    vi.setSystemTime(Date.now() + 120_000);
    kidTablet.game.saveNow(); // the idle tablet's clock saves its game a minute later: not the player's doing
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS * 2);
    await settle(kidTablet);
    expect(coinsOfProfile(2)).toBe(20);
    expect(kidTablet.game.save.coins).toBe(20); // it took the game in use
  });

  it("send a profile that was changed and not sent when it is next opened", async () => {
    const { kidPhone } = await accountWithKid();
    kidPhone.sync.start();
    await settle(kidPhone);
    offline = true;
    play(kidPhone, 15);
    kidPhone.sync.flush(); // the page is left with the account out of reach
    await settle(kidPhone);
    expect(kidPhone.written.at(-1)).toMatchObject({ dirty: true });
    offline = false;
    const reopened = kidPhone.restart();
    reopened.start();
    await settle(kidPhone);
    expect(coinsOfProfile(2)).toBe(15);
  });

  it("sync again after the session ended there and the first profile signed in again (a stale 'signed out' in the profile's own record)", async () => {
    const { kidPhone, phone } = await accountWithKid();
    kidPhone.sync.start();
    await settle(kidPhone);
    t.raw.exec("DELETE FROM sessions");
    play(kidPhone, 12);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    await settle(kidPhone);
    expect(kidPhone.written.at(-1)).toMatchObject({ signedIn: false, dirty: true });
    await signIn(phone); // the first profile signs in again: only the device's record changes
    requests.length = 0;
    const reopened = kidPhone.restart();
    reopened.start();
    await settle(kidPhone);
    expect(requests).toContain("GET /api/save?profile=2");
    expect(coinsOfProfile(2)).toBe(12);
    expect(reopened.username).toBe(USERNAME);
  });

  it("show a name changed on another device at the next look at the list", async () => {
    const { phone } = await accountWithKid();
    const tablet = newDevice();
    await signIn(tablet);
    const rosterApi = { list: () => ((activeJar = tablet.jar), client.fetchProfiles()), add: client.addProfile, rename: client.renameProfile };
    const roster = new Roster(USERNAME, null, null, true, rosterApi, { write: async () => undefined });
    await roster.refresh();
    expect(roster.list!.map((profile) => profile.name)).toEqual(["Player", "Mia"]);
    as(phone);
    expect(await client.renameProfile(2, "Mimi")).toMatchObject({ ok: true });
    await roster.refresh();
    expect(roster.list!.map((profile) => profile.name)).toEqual(["Player", "Mimi"]);
  });

  it("add and rename through the list the way Settings does, against the real routes", async () => {
    const { phone } = await accountWithKid();
    as(phone);
    const roster = new Roster(USERNAME, null, null, true, { list: client.fetchProfiles, add: client.addProfile, rename: client.renameProfile }, { write: async () => undefined });
    await roster.refresh();
    expect(await roster.add("Leo", "kid")).toBeNull();
    expect(await roster.rename(3, "Leonie")).toBeNull();
    expect(roster.list!.map((profile) => [profile.id, profile.name, profile.kind])).toEqual([[1, "Player", "adult"], [2, "Mia", "kid"], [3, "Leonie", "kid"]]);
    await roster.refresh();
    expect(roster.list!.map((profile) => profile.name)).toEqual(["Player", "Mia", "Leonie"]);
  });
});

describe("signing in and out", () => {
  it("creates an account with the family code, and says what is wrong when the code is not right", async () => {
    const d = newDevice();
    const refused = await d.sync.signUp(USERNAME, PASSWORD, "wrong code");
    expect(refused).toBe("That family code is not right.");
    expect(d.sync.username).toBeNull();
    expect(countRows(t.raw, "accounts")).toBe(0);
    await signUp(d);
    expect(d.sync.username).toBe(USERNAME);
    expect(d.written.at(-1)).toMatchObject({ username: USERNAME, signedIn: true });
  });

  it("signs in with the same password from another device, and says the same thing for a wrong password and an unknown username", async () => {
    await signUp(newDevice());
    const d = newDevice();
    expect(await d.sync.signIn(USERNAME, "wrong password!")).toBe("That username or password is not right.");
    expect(await d.sync.signIn("nobody", PASSWORD)).toBe("That username or password is not right.");
    expect(d.sync.username).toBeNull();
    await signIn(d);
    expect(d.sync.username).toBe(USERNAME);
  });

  it("signs out here and at the server, sends what was waiting first, and then stays quiet", async () => {
    const d = newDevice(gameWith(1));
    await signUp(d);
    play(d, 2);
    await d.sync.signOut();
    expect(serverCoins()).toBe(2);
    expect(countRows(t.raw, "sessions")).toBe(0);
    expect(d.jar.cookie).toBeNull();
    expect(d.sync.username).toBeNull();
    expect(d.written.at(-1)!.signedIn).toBe(false);
    requests.length = 0;
    play(d, 3);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(requests).toEqual([]);
  });

  it("signs out here even when the server cannot be reached, and says so", async () => {
    const d = newDevice(gameWith(1));
    await signUp(d);
    offline = true;
    await d.sync.signOut();
    expect(d.sync.username).toBeNull();
    expect(d.sync.message).toContain("Signed out on this device");
  });

  it("remembers the account for the same username, so signing in again asks nothing; another username starts as a new device", async () => {
    const d = newDevice(gameWith(1));
    await signUp(d);
    await d.sync.signOut();
    await signIn(d);
    expect(d.sync.choosing).toBeNull();
    expect(d.written.at(-1)).toMatchObject({ revision: 1, dirty: false });

    await signUp(newDevice(gameWith(50)), "sib"); // another account with a game of its own
    await d.sync.signOut();
    await signIn(d, "sib");
    expect(d.sync.choosing).not.toBeNull(); // this device's game against that account's game: the player decides
  });

  it("is signed in again after the page is opened again", async () => {
    const d = newDevice(gameWith(1));
    await signUp(d);
    const reopened = d.restart();
    expect(reopened.username).toBe(USERNAME);
    reopened.start();
    await reopened.sync();
    expect(requests.at(-1)).toBe("GET /api/save");
  });
});

describe("the first time a device meets an account", () => {
  it("leaves an untouched egg and an empty account alone", async () => {
    const d = newDevice();
    await signUp(d);
    expect(serverRow()).toBeUndefined();
    expect(puts()).toBe(0);
  });

  it("sends a game under way to an account that has none", async () => {
    const d = newDevice(gameWith(111));
    await signUp(d);
    expect(serverRow()!.revision).toBe(1);
    expect(serverCoins()).toBe(111);
    expect(d.written.at(-1)).toMatchObject({ revision: 1, dirty: false });
    expect(d.sync.choosing).toBeNull();
  });

  it("gives an untouched egg the account's game", async () => {
    await signUp(newDevice(gameWith(111)));
    const d = newDevice();
    await signIn(d);
    expect(d.game.replaced).toHaveLength(1);
    expect(d.game.save.coins).toBe(111);
    expect(d.written.at(-1)).toMatchObject({ revision: 1, dirty: false });
    requests.length = 0;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(puts()).toBe(0); // the adopted game is not sent straight back
  });

  describe("when both have a game", () => {
    let d: Device;
    beforeEach(async () => {
      await signUp(newDevice(gameWith(111)));
      d = newDevice(gameWith(222));
      await signIn(d);
      requests.length = 0;
    });

    it("asks, and until the player answers neither game is touched, however long it takes or how much is played", async () => {
      expect(d.sync.choosing).not.toBeNull();
      expect(d.game.replaced).toEqual([]);
      play(d, 223);
      d.sync.flush();
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(puts()).toBe(0);
      expect(serverCoins()).toBe(111);
      expect(serverRow()!.revision).toBe(1);
    });

    it("keeps the account's game when the player says so, and this device's game becomes a backup in the account", async () => {
      await d.sync.choose("account");
      expect(d.game.save.coins).toBe(111);
      expect(d.sync.choosing).toBeNull();
      expect(serverCoins()).toBe(111);
      expect(serverRow()!.revision).toBe(1);
      expect(backupCoins()).toEqual([222]);
      expect(d.written.at(-1)).toMatchObject({ revision: 1, dirty: false });
    });

    it("keeps this device's game when the player says so, and the account's game becomes a backup there", async () => {
      await d.sync.choose("device");
      expect(serverCoins()).toBe(222);
      expect(serverRow()!.revision).toBe(2);
      expect(backupCoins()).toEqual([111]);
      expect(d.game.replaced).toEqual([]);
      expect(d.sync.choosing).toBeNull();
      expect(d.written.at(-1)).toMatchObject({ revision: 2, dirty: false });
    });

    it("keeps asking when the answer could not be sent, changes nothing, and takes the answer once it can be sent", async () => {
      for (const which of ["device", "account"] as const) {
        offline = true;
        await d.sync.choose(which);
        expect(d.sync.choosing, which).not.toBeNull();
        expect(d.sync.message, which).toContain("Cannot reach the server");
        expect(d.game.replaced, which).toEqual([]); // the account's game is not taken before this device's game is safe
        expect(serverCoins(), which).toBe(111);
        offline = false;
        await vi.advanceTimersByTimeAsync(RETRY_MS);
        await settle(d);
        expect(d.sync.choosing, which).not.toBeNull(); // the retry asks the question again
      }
      await d.sync.choose("device");
      expect(serverCoins()).toBe(222);
    });

    it("asks again, and sends nothing, when the account's game changed while the question was open", async () => {
      const other = newDevice();
      await signIn(other); // (an untouched egg takes the account's game)
      expect(other.game.save.coins).toBe(111);
      play(other, 333);
      other.sync.flush();
      await settle(other);
      requests.length = 0;
      await d.sync.choose("device");
      expect(puts()).toBe(0);
      expect(d.sync.choosing).not.toBeNull();
      expect(d.sync.message).toBe("Your account's game changed while you were deciding. Please choose again.");
      expect(serverCoins()).toBe(333);
      await d.sync.choose("account"); // and the new answer is about the new game
      expect(d.game.save.coins).toBe(333);
      expect(backupCoins()).toContain(222);
    });

    it("asks again after the page is closed and opened, and still has sent nothing", async () => {
      const reopened = d.restart();
      reopened.start();
      await reopened.sync();
      expect(reopened.choosing).not.toBeNull();
      expect(puts()).toBe(0);
      expect(serverCoins()).toBe(111);
    });
  });

  it("treats a game that could not be loaded (a new egg started) as a device that never synced, so the account's game is not overwritten", async () => {
    const d = newDevice(gameWith(111));
    await signUp(d);
    const reopened = d.restart(true);
    expect(isUntouched(d.game.save)).toBe(true);
    reopened.start();
    await reopened.sync();
    expect(d.game.save.coins).toBe(111); // the account's game came back
    expect(puts()).toBe(1); // (only the first send, when it was signed up)

    const second = newDevice(gameWith(222)); // another device that has matched the account
    await signIn(second);
    await second.sync.choose("account");
    requests.length = 0;
    const again = second.restart(true);
    second.game.save.egg!.shavedMinutes = 3; // the new egg is tapped before the account is looked at
    again.start();
    await again.sync();
    expect(again.choosing).not.toBeNull(); // asked, not overwritten
    expect(puts()).toBe(0);
    expect(serverCoins()).toBe(111);
  });
});

describe("while signed in", () => {
  let d: Device;
  beforeEach(async () => {
    d = newDevice(gameWith(1));
    await signUp(d);
    requests.length = 0;
  });

  it("does nothing when nothing changed since the last sync", async () => {
    await settle(d);
    await settle(d);
    expect(puts()).toBe(0);
  });

  it("sends a changed game 30 seconds after the first save that was not sent, and later saves do not push that back", async () => {
    play(d, 2);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS - 10_000);
    play(d, 3);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(requests).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests.slice(0, 1)).toEqual(["GET /api/save"]); // the timer itself started it, before settle() could (settle looks at the account too); the send after it may already follow, the server answers on a real clock
    await settle(d);
    expect(puts()).toBe(1);
    expect(serverCoins()).toBe(3);
    expect(serverRow()!.revision).toBe(2);
    expect(d.written.at(-1)).toMatchObject({ revision: 2, dirty: false });
  });

  it("sends at once when the page is left", async () => {
    play(d, 2);
    d.sync.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toEqual(["PUT /api/save"]); // straight away, without looking first (and before settle() could send it)
    await settle(d);
    expect(serverCoins()).toBe(2);
    expect(puts()).toBe(1);
  });

  it("keeps a save made while a send was on its way, to send next", async () => {
    play(d, 2);
    duringPut = () => play(d, 3);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    await settle(d);
    expect(serverCoins()).toBe(3); // the second send carried it
    expect(serverRow()!.revision).toBe(3);
    expect(puts()).toBe(2);
  });

  it("ignores the answer to a send when the player has signed in as someone else meanwhile, and leaves that account's game alone", async () => {
    const other = newDevice(gameWith(50));
    await signUp(other, "sib"); // another account, with a game of its own
    requests.length = 0;
    play(d, 2);
    let release!: () => void;
    holdPut = new Promise<void>((resolve) => (release = resolve));
    try {
      d.sync.flush(); // sends straight away, without looking first, so the send is on its way at once
      await vi.advanceTimersByTimeAsync(0);
      expect(requests).toEqual(["PUT /api/save"]); // d's game is on its way, and the answer is held back
      expect(await d.sync.signIn("sib", PASSWORD)).toBeNull(); // meanwhile the player signs in as sib on this device
    } finally {
      release();
    }
    await settle(d);
    expect(d.sync.username).toBe("sib");
    expect(d.sync.choosing).not.toBeNull(); // this device's game against sib's game: the player decides, nothing is sent for them
    const sibCoins = (t.raw.prepare("SELECT s.data FROM saves s JOIN profiles p ON p.id = s.profile_id JOIN accounts a ON a.id = p.account_id WHERE a.username = 'sib'").get() as { data: string }).data;
    expect(JSON.parse(sibCoins).coins).toBe(50);
  });

  it("does not count a save that only carries the clock forward as a change: nothing is sent for it", async () => {
    d.game.saveNow(); // nothing pending: only the clock moved on
    d.sync.flush();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(requests).toEqual([]);
    expect(d.written.at(-1)).toMatchObject({ dirty: false });
  });

  it("never lets a device left open and idle beat the device in use, however much later its clock saves", async () => {
    const idle = newDevice();
    await signIn(idle);
    expect(idle.game.save.coins).toBe(1);
    vi.setSystemTime(T0 + 60_000);
    play(d, 10); // the player plays on d
    d.sync.flush();
    await settle(d);
    vi.setSystemTime(T0 + 120_000);
    idle.game.saveNow(); // a minute later the idle device's clock saves its game too
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS * 2);
    await settle(idle);
    expect(serverCoins()).toBe(10);
    expect(serverRow()!.revision).toBe(2);
    expect(idle.game.save.coins).toBe(10); // it took the game in use
    expect(idle.written.at(-1)).toMatchObject({ revision: 2, dirty: false });
  });

  it("signs out even when the changes waiting cannot be sent, and the game stays on this device", async () => {
    play(d, 2);
    offline = true;
    await d.sync.signOut();
    expect(d.sync.username).toBeNull();
    expect(d.game.save.coins).toBe(2);
    expect(d.written.at(-1)).toMatchObject({ signedIn: false, dirty: true });
  });

  it("brings in a newer game from another device when this one has not changed", async () => {
    const other = newDevice();
    await signIn(other);
    play(other, 77);
    other.sync.flush();
    await settle(other);
    await settle(d);
    expect(d.game.save.coins).toBe(77);
    expect(d.written.at(-1)).toMatchObject({ revision: 2, dirty: false });
  });

  describe("when two devices both played since they last met", () => {
    let other: Device;
    beforeEach(async () => {
      other = newDevice();
      await signIn(other);
      expect(other.game.save.coins).toBe(1);
    });

    it("keeps the one saved later, and puts the other in the backups", async () => {
      vi.setSystemTime(T0 + 60_000);
      play(d, 10);
      vi.setSystemTime(T0 + 120_000);
      play(other, 20);
      other.sync.flush();
      await settle(other);
      await settle(d); // d saved earlier than other: the account keeps other's game, and d takes it
      expect(serverCoins()).toBe(20);
      expect(d.game.save.coins).toBe(20);
      expect(backupCoins()).toContain(10);
      expect(d.written.at(-1)).toMatchObject({ revision: 2, dirty: false });
    });

    it("keeps this device's game when it was saved later", async () => {
      vi.setSystemTime(T0 + 60_000);
      play(other, 20);
      other.sync.flush();
      await settle(other);
      vi.setSystemTime(T0 + 120_000);
      play(d, 10);
      await settle(d);
      expect(serverCoins()).toBe(10);
      expect(d.game.replaced).toEqual([]);
      expect(backupCoins()).toContain(20);
    });
  });
});

describe("when the server does not answer well", () => {
  let d: Device;
  beforeEach(async () => {
    d = newDevice(gameWith(1));
    await signUp(d);
    requests.length = 0;
  });

  it("keeps playing offline, says so, and sends the game when the connection is back", async () => {
    offline = true;
    play(d, 2);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(d.sync.message).toContain("Cannot reach the server");
    expect(d.written.at(-1)).toMatchObject({ dirty: true });
    offline = false;
    await vi.advanceTimersByTimeAsync(RETRY_MS - 1);
    expect(requests.filter((request) => request.startsWith("GET")).length).toBe(1); // not yet
    await vi.advanceTimersByTimeAsync(1);
    expect(requests.filter((request) => request.startsWith("GET")).length).toBe(2); // the retry itself, before settle() could do it
    await settle(d);
    expect(serverCoins()).toBe(2);
    expect(d.sync.message).toBe("");
  });

  it("waits 5 minutes, not 1, after 'too many tries'", async () => {
    override = () => new Response(JSON.stringify({ error: "x" }), { status: 429 });
    play(d, 2);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(d.sync.message).toBe("Too many tries. Please wait a few minutes.");
    requests.length = 0;
    await vi.advanceTimersByTimeAsync(WAIT_MS - 1);
    expect(requests).toEqual([]);
    override = null;
    await vi.advanceTimersByTimeAsync(1);
    await settle(d);
    expect(serverCoins()).toBe(2);
  });

  it("tries again in a minute after a clash with another device's save (409)", async () => {
    override = (method) => (method === "PUT" ? new Response(JSON.stringify({ error: "Please try again." }), { status: 409 }) : null); // (only a save can clash)
    play(d, 2);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    await settle(d); // (the server's answer to the first look comes on a real clock)
    expect(d.sync.message).toBe("Please try again.");
    override = null;
    requests.length = 0;
    await vi.advanceTimersByTimeAsync(RETRY_MS - 1);
    expect(requests).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests.slice(0, 1)).toEqual(["GET /api/save"]); // the retry itself, before settle() could do it; the send after it may already follow, the server answers on a real clock
    await settle(d);
    expect(serverCoins()).toBe(2);
  });

  it("signs out when the account no longer knows this browser, and does not keep trying", async () => {
    t.raw.exec("DELETE FROM sessions");
    play(d, 2);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    await settle(d);
    expect(d.sync.username).toBeNull();
    expect(d.sync.message).toBe("Please sign in again.");
    expect(d.written.at(-1)).toMatchObject({ signedIn: false, dirty: true });
    requests.length = 0;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(requests).toEqual([]);
    await signIn(d); // and signing in again picks up where it was
    expect(serverCoins()).toBe(2);
  });

  it("does not try again by itself after a refusal, but sends with the next save", async () => {
    override = () => new Response(JSON.stringify({ error: "That save is too big." }), { status: 413 });
    play(d, 2);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    expect(d.sync.message).toBe("That save is too big.");
    requests.length = 0;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(requests).toEqual([]);
    override = null;
    play(d, 3);
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS);
    await settle(d);
    expect(serverCoins()).toBe(3);
  });

  it("keeps its own game when the account's game cannot be read", async () => {
    t.raw.exec("UPDATE saves SET revision = revision + 1, data = '{\"version\":3}'"); // something this game cannot load
    await settle(d);
    expect(d.game.replaced).toEqual([]);
    expect(d.sync.message).toContain("could not be read");
  });

  it("is not fooled by an answer that is not from the server (a page where the server should be)", async () => {
    override = () => new Response("<html>hello</html>", { status: 200 });
    expect(await client.fetchSave()).toEqual({ ok: false, error: { kind: "refused", message: "The server gave an answer this game does not understand." } });
    override = () => new Response("<html>missing</html>", { status: 404 });
    expect(await client.fetchSave()).toEqual({ ok: false, error: { kind: "refused", message: "Something went wrong. Please try again." } });
  });
});
