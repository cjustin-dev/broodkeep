// The browser side of cloud saves: when a device sends its game, brings one in, or asks the player. The browser code here is the real
// code (src/sync/cloud.ts and sync.ts) talking to the real server routes and the real SQL, with only the network and the database
// engine replaced (a fetch that calls the routes, node:sqlite for D1). Devices take turns: each test awaits one before using the next.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost as login } from "../functions/api/login";
import { onRequestPost as logout } from "../functions/api/logout";
import { onRequestPost as register } from "../functions/api/register";
import { onRequestGet as getSave, onRequestPut as putSave } from "../functions/api/save";
import type { Context } from "../functions/_lib/types";
import { newSave } from "../src/game/state";
import type { Save } from "../src/game/state";
import * as client from "../src/sync/cloud";
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
  const handler = routes[path]?.[method];
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

const apiFor = (jar: Jar): Api => ({
  signIn: (...args) => ((activeJar = jar), client.signIn(...args)),
  signUp: (...args) => ((activeJar = jar), client.signUp(...args)),
  signOut: () => ((activeJar = jar), client.signOut()),
  fetchSave: () => ((activeJar = jar), client.fetchSave()),
  sendSave: (put) => ((activeJar = jar), client.sendSave(put)),
});

const devices: Device[] = []; // every device of the test running, so its unfinished work can be waited for before the next test starts
function newDevice(save: Save = newSave(Date.now(), 1)): Device {
  const jar: Jar = { cookie: null };
  const game = fakeGame(save);
  const written: CloudMeta[] = [];
  const store = { writeMeta: async (meta: CloudMeta) => void written.push(meta) };
  const device: Device = {
    game,
    jar,
    written,
    sync: new CloudSync(game, null, apiFor(jar), store),
    restart: (lostGame = false) => {
      const meta = parseMeta(written.at(-1) ?? null);
      if (lostGame) game.save = newSave(Date.now(), 2);
      return (device.sync = new CloudSync(game, lostGame ? metaForNewGame(meta) : meta, apiFor(jar), store));
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
