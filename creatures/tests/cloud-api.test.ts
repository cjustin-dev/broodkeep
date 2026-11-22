// Accounts: signing up, signing in and out, sessions, rate limits, and what a bad or broken request gets back.
// The edge cases are listed in docs/cloud-saves.md section 4, and each one has a test here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest as loginAnyMethod, onRequestPost as login } from "../functions/api/login";
import { onRequest as logoutAnyMethod, onRequestPost as logout } from "../functions/api/logout";
import { onRequest as meAnyMethod, onRequestGet as me } from "../functions/api/me";
import { onRequest as registerAnyMethod, onRequestPost as register } from "../functions/api/register";
import { onRequest as saveAnyMethod } from "../functions/api/save";
import { DUMMY_HASH, LIMITS, SESSION_MS, checkKey, hashKey, sameBytes, sameSecret, tokenHash } from "../functions/_lib/auth";
import { SMALL_BODY } from "../functions/_lib/validation";
import type { Env } from "../functions/_lib/types";
import { SITE, call, cookieOf, countRows, key, newTestDb } from "./cloud-helpers";
import type { Sent, TestDb } from "./cloud-helpers";

// checkKey is watched (and still does its real work), to see that an unknown username goes through it too.
vi.mock("../functions/_lib/auth", async (importOriginal) => {
  const real = await importOriginal<typeof import("../functions/_lib/auth")>();
  return { ...real, checkKey: vi.fn(real.checkKey), sameSecret: vi.fn(real.sameSecret) };
});

const T0 = Date.UTC(2026, 10, 21, 12, 0, 0);
const MINUTE = 60_000;

let t: TestDb;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); // only the clock: the database and the crypto run for real
  vi.setSystemTime(T0);
  t = newTestDb();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const signUp = (overrides: Record<string, unknown> = {}, env: Env = t.env): Promise<Sent> =>
  call(register, env, "/api/register", { body: { username: "kid", key: key("a"), code: "family-code", ...overrides } });
const signIn = (overrides: Record<string, unknown> = {}, ip = "1.2.3.4"): Promise<Sent> =>
  call(login, t.env, "/api/login", { ip, body: { username: "kid", key: key("a"), ...overrides } });
const addFailures = (n: number, at: number, username = "kid", ip = "1.2.3.4", kind = "login"): void => {
  for (let i = 0; i < n; i++) t.raw.prepare("INSERT INTO login_failures (kind, at, username, ip) VALUES (?, ?, ?, ?)").run(kind, at, username, ip);
};
const failureCount = (username = "kid"): number => countRows(t.raw, `login_failures WHERE username = '${username}'`);

describe("the numbers the plan names", () => {
  it("are 5 wrong logins per username, 20 per address, 5 wrong codes per address, in 15 minutes, and sessions last 90 days", () => {
    expect(LIMITS).toEqual({ windowMs: 15 * 60_000, loginPerUsername: 5, loginPerIp: 20, registerPerIp: 5 });
    expect(SESSION_MS).toBe(90 * 24 * 3_600_000);
  });
});

describe("signing up", () => {
  it("makes the account and its one profile, and signs the browser in", async () => {
    const sent = await signUp();
    expect(sent.status).toBe(201);
    expect(sent.body).toEqual({ username: "kid" });
    expect(sent.cookies).toHaveLength(1);
    expect([countRows(t.raw, "accounts"), countRows(t.raw, "profiles"), countRows(t.raw, "sessions")]).toEqual([1, 1, 1]);
    expect(t.raw.prepare("SELECT name FROM profiles").get()).toEqual(expect.objectContaining({ name: "Player" }));
    expect((await call(me, t.env, "/api/me", { method: "GET", cookie: cookieOf(sent) })).body).toEqual({ username: "kid" });
  });

  it("keeps neither the key nor the session token: only a salted hash of each", async () => {
    const sent = await signUp();
    const stored = (t.raw.prepare("SELECT password_hash FROM accounts").get() as { password_hash: string }).password_hash;
    expect(stored.startsWith("sha256$")).toBe(true);
    expect(stored).not.toContain(key("a"));
    const token = cookieOf(sent).split("=")[1]!;
    const row = t.raw.prepare("SELECT token_hash FROM sessions").get() as { token_hash: string };
    expect(row.token_hash).toBe(await tokenHash(token));
    expect(row.token_hash).toHaveLength(64);
  });

  it("sets the session cookie with every protective flag", async () => {
    const cookie = (await signUp()).cookies[0]!;
    expect(cookie.startsWith("__Host-bk_session=")).toBe(true);
    for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=7776000"]) expect(cookie).toContain(flag); // 90 days
    expect(cookie).not.toContain("Domain");
  });

  it("lower cases and trims the username, so the same name in another case is taken", async () => {
    expect((await signUp({ username: "  Kid " })).body).toEqual({ username: "kid" });
    const again = await signUp({ username: "KID" });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("That username is already taken.");
    expect(countRows(t.raw, "accounts")).toBe(1);
  });

  it("asks for the family code: a wrong one, an empty one, one in another case and a missing one are all refused", async () => {
    for (const code of ["nope", "", "FAMILY-CODE"]) expect((await signUp({ code })).status, `code ${JSON.stringify(code)}`).toBe(403);
    expect((await call(register, t.env, "/api/register", { body: { username: "kid", key: key("a") } })).status).toBe(400);
    expect(countRows(t.raw, "accounts")).toBe(0);
  });

  it("stays closed when the server has no family code, even for a request that sends an empty one", async () => {
    for (const env of [newTestDb({ SIGNUP_CODE: undefined }).env, newTestDb({ SIGNUP_CODE: "" }).env]) {
      const sent = await signUp({ code: "" }, env);
      expect(sent.status).toBe(403);
      expect(sent.body.error).toBe("Signing up is closed.");
    }
  });

  it("accepts the shapes of username that are fine", async () => {
    for (const username of ["abc", "9lives", "first.last", "kid_1", "k-d", "a.b", "a".repeat(20)]) {
      expect((await signUp({ username }, newTestDb().env)).status, username).toBe(201);
    }
  });

  it("refuses a username that is empty, spaces, too short, or has a space, a symbol, an @, an accent or a look alike letter", async () => {
    for (const username of ["", "   ", "ab", " ab ", "ki d", "ki\nd", "kid!", "kid@home", "kid@example.com", "kíd", "ｋid", "kid\u200b", ".kid", "_kid", "-kid", 5, null]) {
      const sent = await signUp({ username });
      expect(sent.status, `username ${JSON.stringify(username)}`).toBe(400);
      expect(sent.body.error).toBe("Choose a username of 3 to 20 letters, numbers, dots, dashes or underscores.");
    }
  });

  it("allows a username of 3 and of 20 characters, and refuses 2 and 21", async () => {
    expect((await signUp({ username: "a".repeat(3) })).status).toBe(201);
    expect((await signUp({ username: "a".repeat(20) }, newTestDb().env)).status).toBe(201);
    expect((await signUp({ username: "a".repeat(2) }, newTestDb().env)).status).toBe(400);
    expect((await signUp({ username: "a".repeat(21) }, newTestDb().env)).status).toBe(400);
  });

  it("takes a letter that lower cases to plain ASCII (the Kelvin sign) as that letter, so it is the same account and not a second one", async () => {
    expect((await signUp({ username: "kid" })).status).toBe(201);
    const again = await signUp({ username: "\u212Aid" });
    expect(again.status).toBe(409);
    expect(countRows(t.raw, "accounts")).toBe(1);
  });

  it("no longer takes an email: the old field is refused next to a good username, on sign up and on sign in", async () => {
    expect((await call(register, t.env, "/api/register", { body: { username: "kid", email: "kid@example.com", key: key("a"), code: "family-code" } })).status).toBe(400);
    expect((await call(login, t.env, "/api/login", { body: { username: "kid", email: "kid@example.com", key: key("a") } })).status).toBe(400);
    expect(countRows(t.raw, "accounts")).toBe(0);
  });

  it("refuses a key that is not exactly 43 base64url characters", async () => {
    for (const bad of ["a".repeat(42), "a".repeat(44), "a".repeat(42) + "+", "a".repeat(42) + "/", "a".repeat(42) + "=", " " + "a".repeat(42), 12345, null, ["a"]]) {
      expect((await signUp({ key: bad })).status, `key ${JSON.stringify(bad)}`).toBe(400);
    }
    expect((await signUp({ key: "A-_".repeat(14) + "A" })).status).toBe(201); // 43 characters from the whole base64url alphabet
  });

  it("refuses fields it does not know, and bodies that are not a JSON object", async () => {
    expect((await signUp({ extra: 1 })).status).toBe(400);
    for (const raw of ["", "not json", "[]", "null", '"text"', "5", "{"]) {
      expect((await call(register, t.env, "/api/register", { raw })).status, `body ${JSON.stringify(raw)}`).toBe(400);
    }
  });

  it("takes a body of exactly the size limit and refuses one a byte over", async () => {
    const body = JSON.stringify({ username: "kid", key: key("a"), code: "family-code" });
    const padded = (size: number): string => body + " ".repeat(size - body.length);
    expect((await call(register, t.env, "/api/register", { raw: padded(SMALL_BODY) })).status).toBe(201);
    expect((await call(register, newTestDb().env, "/api/register", { raw: padded(SMALL_BODY + 1) })).status).toBe(413);
  });

  it("refuses a body over the limit even when it does not say how long it is", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{" + " ".repeat(SMALL_BODY)));
        controller.close();
      },
    });
    const request = new Request(SITE + "/api/register", { method: "POST", headers: { Origin: SITE, "Content-Type": "application/json" }, body: stream, duplex: "half" } as RequestInit);
    expect((await register({ request, env: t.env })).status).toBe(413);
  });

  it("wants JSON: text, a form or no type at all is refused, a charset after it is fine", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", null]) {
      expect((await call(register, t.env, "/api/register", { body: {}, headers: { "Content-Type": type } })).status, `type ${type}`).toBe(415);
    }
    const body = { username: "kid", key: key("a"), code: "family-code" };
    expect((await call(register, t.env, "/api/register", { body, headers: { "Content-Type": "Application/JSON; charset=utf-8" } })).status).toBe(201);
  });

  it("wants the request to come from this site: a missing, foreign, null or other scheme Origin is refused", async () => {
    for (const origin of [null, "https://evil.example", "null", "http://broodkeep.test", "https://broodkeep.test.evil.example", "https://broodkeep.test:8443"]) {
      expect((await call(register, t.env, "/api/register", { body: {}, headers: { Origin: origin } })).status, `origin ${origin}`).toBe(403);
    }
    expect(countRows(t.raw, "accounts")).toBe(0);
  });

  it("answers any other method, on every route, with 405 and says which one is allowed", () => {
    const routes: [string, () => Response, string][] = [
      ["register", registerAnyMethod, "POST"],
      ["login", loginAnyMethod, "POST"],
      ["logout", logoutAnyMethod, "POST"],
      ["me", meAnyMethod, "GET"],
      ["save", saveAnyMethod, "GET, PUT"],
    ];
    for (const [name, handler, allowed] of routes) {
      const response = handler();
      expect(response.status, name).toBe(405);
      expect(response.headers.get("Allow"), name).toBe(allowed);
    }
  });

  it("compares the family code with the same time-safe comparison whatever is sent", async () => {
    const watched = vi.mocked(sameSecret);
    watched.mockClear();
    await signUp({ code: "wrong" });
    await signUp({ username: "other" });
    expect(watched.mock.calls).toEqual([
      ["wrong", "family-code"],
      ["family-code", "family-code"],
    ]);
  });

  it("slows a guesser of the family code down: after 5 wrong codes even the right one waits, until the window is over", async () => {
    for (let i = 0; i < LIMITS.registerPerIp; i++) expect((await signUp({ code: "wrong" })).status).toBe(403);
    const blocked = await signUp();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBe(LIMITS.windowMs / 1000);
    expect((await call(register, t.env, "/api/register", { ip: "5.6.7.8", body: { username: "kid", key: key("a"), code: "family-code" } })).status).toBe(201); // another address
    vi.setSystemTime(T0 + LIMITS.windowMs + 1000);
    expect((await signUp({ username: "other" })).status).toBe(201);
  });

  it("counts each wrong code (the 5th is still a plain refusal) and does not count logins against sign ups", async () => {
    addFailures(LIMITS.registerPerIp - 1, T0, "", "1.2.3.4", "register");
    expect((await signUp({ code: "wrong" })).status).toBe(403);
    expect(countRows(t.raw, "login_failures WHERE kind = 'register'")).toBe(LIMITS.registerPerIp);
    addFailures(20, T0, "xxx", "4.4.4.4", "login");
    expect((await call(register, t.env, "/api/register", { ip: "4.4.4.4", body: { username: "kid", key: key("a"), code: "family-code" } })).status).toBe(201);
  });
});

describe("signing in", () => {
  beforeEach(async () => {
    await signUp();
    t.raw.exec("DELETE FROM sessions"); // start each test signed out
  });

  it("signs in with the right username and key, in any case of username", async () => {
    const sent = await signIn({ username: " KID " });
    expect(sent.status).toBe(200);
    expect(sent.body).toEqual({ username: "kid" });
    expect(sent.cookies[0]).toContain("HttpOnly");
    expect(countRows(t.raw, "sessions")).toBe(1);
  });

  it("gives a wrong key and an unknown username exactly the same answer, and counts both as failures", async () => {
    const wrongKey = await signIn({ key: key("b") });
    const unknown = await signIn({ username: "nobody" });
    expect(wrongKey.status).toBe(401);
    expect({ status: unknown.status, body: unknown.body, cookies: unknown.cookies }).toEqual({ status: wrongKey.status, body: wrongKey.body, cookies: wrongKey.cookies });
    expect(countRows(t.raw, "login_failures")).toBe(2);
    expect(countRows(t.raw, "sessions")).toBe(0);
  });

  it("runs the key check for an unknown username too, against a value that is well formed but matches nothing", async () => {
    const watched = vi.mocked(checkKey);
    watched.mockClear();
    expect((await signIn({ username: "nobody" })).status).toBe(401);
    expect(watched).toHaveBeenCalledTimes(1);
    expect(watched.mock.calls[0]![1]).toBe(DUMMY_HASH);
    expect(await checkKey(key("a"), DUMMY_HASH)).toBe(false);
    expect(await checkKey("A".repeat(43), DUMMY_HASH)).toBe(false);
    for (const stored of ["", "x", "sha256$$", "sha256$AAAA", "md5$AAAA$AAAA"]) expect(await checkKey(key("a"), stored), stored).toBe(false);
  });

  it("allows 4 wrong tries and the 5th, then blocks the 6th even with the right key", async () => {
    for (let i = 0; i < LIMITS.loginPerUsername; i++) expect((await signIn({ key: key("b") })).status).toBe(401);
    const blocked = await signIn();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe(String(LIMITS.windowMs / 1000));
    expect(countRows(t.raw, "sessions")).toBe(0);
  });

  it("still lets the right key in after 4 wrong ones, and then forgets those 4", async () => {
    addFailures(LIMITS.loginPerUsername - 1, T0);
    expect((await signIn()).status).toBe(200);
    expect(failureCount()).toBe(0);
  });

  it("forgets a failure exactly 15 minutes old, and still counts one a second newer", async () => {
    addFailures(LIMITS.loginPerUsername, T0 - LIMITS.windowMs);
    expect((await signIn()).status).toBe(200);
    t.raw.exec("DELETE FROM login_failures");
    addFailures(LIMITS.loginPerUsername, T0 - LIMITS.windowMs + 1000);
    const blocked = await signIn();
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("1");
  });

  it("blocks a username that fails from many addresses, but not other usernames", async () => {
    for (let i = 0; i < LIMITS.loginPerUsername; i++) addFailures(1, T0, "kid", `10.0.0.${i}`);
    expect((await signIn({}, "10.9.9.9")).status).toBe(429);
    await signUp({ username: "sib" });
    expect((await signIn({ username: "sib" }, "10.9.9.9")).status).toBe(200);
  });

  it("blocks an address that fails 20 times over many usernames (19 is fine), and not other addresses", async () => {
    for (let i = 0; i < LIMITS.loginPerIp - 1; i++) addFailures(1, T0, `x${i}`, "9.9.9.9");
    expect((await signIn({}, "9.9.9.9")).status).toBe(200);
    addFailures(1, T0, "yyy", "9.9.9.9");
    addFailures(1, T0, "zzz", "9.9.9.9");
    expect((await signIn({}, "9.9.9.9")).status).toBe(429);
    expect((await signIn({}, "8.8.8.8")).status).toBe(200);
  });

  it("tidies expired sessions and day old failures when someone signs in", async () => {
    t.raw.prepare("INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ('old', 1, ?)").run(T0);
    addFailures(1, T0 - 24 * 3_600_000 - 1, "olduser");
    addFailures(1, T0 - 3_600_000, "recent");
    await signIn();
    expect(countRows(t.raw, "sessions WHERE token_hash = 'old'")).toBe(0);
    expect(failureCount("olduser")).toBe(0);
    expect(failureCount("recent")).toBe(1);
  });

  it("refuses unknown fields, a bad username or a bad key before looking anything up", async () => {
    expect((await signIn({ code: "family-code" })).status).toBe(400);
    expect((await signIn({ username: "no" })).status).toBe(400);
    expect((await signIn({ key: "short" })).status).toBe(400);
    expect(countRows(t.raw, "login_failures")).toBe(0);
  });

  it("refuses a request from another site", async () => {
    const sent = await call(login, t.env, "/api/login", { body: { username: "kid", key: key("a") }, headers: { Origin: "https://evil.example" } });
    expect(sent.status).toBe(403);
    expect(countRows(t.raw, "sessions")).toBe(0);
  });
});

describe("hashing and comparing", () => {
  it("gives the same key a different salted hash each time, and each one checks out", async () => {
    const [one, two] = [await hashKey(key("a")), await hashKey(key("a"))];
    expect(one).not.toBe(two);
    expect(await checkKey(key("a"), one)).toBe(true);
    expect(await checkKey(key("a"), two)).toBe(true);
    expect(await checkKey(key("b"), one)).toBe(false);
  });

  it("compares bytes and secrets of different lengths without an error", async () => {
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1]))).toBe(false);
    expect(await sameSecret("family-code", "family-code")).toBe(true);
    expect(await sameSecret("family-code", "family-cod")).toBe(false);
    expect(await sameSecret("", "family-code")).toBe(false);
  });
});

describe("sessions", () => {
  let cookie: string;
  beforeEach(async () => {
    cookie = cookieOf(await signUp());
  });
  const whoAmI = (c: string | undefined): Promise<Sent> => call(me, t.env, "/api/me", { method: "GET", cookie: c });

  it("knows the signed in account, and 401s without a cookie", async () => {
    expect((await whoAmI(cookie)).body).toEqual({ username: "kid" });
    expect((await whoAmI(undefined)).status).toBe(401);
  });

  it("does not take a tampered, wrong sized or foreign cookie", async () => {
    const value = cookie.split("=")[1]!;
    const flipped = value.slice(0, -1) + (value.endsWith("A") ? "B" : "A");
    for (const bad of [`__Host-bk_session=${flipped}`, "__Host-bk_session=abc", "__Host-bk_session=", `other=${value}`, `bk_session=${value}`]) {
      expect((await whoAmI(bad)).status, bad).toBe(401);
    }
  });

  it("stops at the moment of expiry, and not a millisecond before", async () => {
    const expires = T0 + SESSION_MS;
    vi.setSystemTime(expires - 1);
    expect((await whoAmI(cookie)).status).toBe(200);
    vi.setSystemTime(expires);
    expect((await whoAmI(cookie)).status).toBe(401);
  });

  it("signing out deletes the session and clears the cookie", async () => {
    const sent = await call(logout, t.env, "/api/logout", { body: {}, cookie });
    expect(sent.status).toBe(200);
    expect(sent.cookies[0]).toContain("Max-Age=0");
    expect(countRows(t.raw, "sessions")).toBe(0);
    expect((await whoAmI(cookie)).status).toBe(401);
  });

  it("signing out with no session is fine, and with an unknown field or from another site is refused and keeps the session", async () => {
    expect((await call(logout, t.env, "/api/logout", { body: {} })).status).toBe(200);
    expect((await call(logout, t.env, "/api/logout", { body: { all: true }, cookie })).status).toBe(400);
    expect((await call(logout, t.env, "/api/logout", { body: {}, cookie, headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect((await whoAmI(cookie)).status).toBe(200);
  });

  it("only signs out the browser that asked: another session of the same account stays", async () => {
    const second = cookieOf(await signIn());
    await call(logout, t.env, "/api/logout", { body: {}, cookie });
    expect((await whoAmI(second)).status).toBe(200);
  });
});

describe("what a broken or bad request gets back", () => {
  it("answers a database failure with a plain 500, logs the real error, and never logs or sends the key, the username, the code, the cookie, the body or a stack", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const broken: Env = {
      SIGNUP_CODE: "family-code",
      DB: {
        prepare: () => {
          throw new Error("disk exploded");
        },
        batch: async () => {
          throw new Error("disk exploded");
        },
      },
    };
    const secrets = { username: "kid", key: key("a"), code: "the-secret-family-code" };
    const token = "T".repeat(43);
    const bodies = [JSON.stringify({ username: secrets.username, key: secrets.key }), JSON.stringify(secrets)];
    for (const [handler, path, raw] of [[login, "/api/login", bodies[0]!], [register, "/api/register", bodies[1]!]] as const) {
      const sent = await call(handler, broken, path, { raw, cookie: `__Host-bk_session=${token}` });
      expect(sent.status, path).toBe(500);
      expect(JSON.stringify(sent.body), path).not.toMatch(/disk|exploded|Error/);
    }
    expect(log.mock.calls.flat().every((part) => typeof part === "string")).toBe(true); // text only: an error object would carry its stack
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("disk exploded");
    for (const secret of [secrets.key, secrets.username, secrets.code, token, ...bodies]) expect(logged).not.toContain(secret);
    expect(logged).not.toMatch(/\n\s+at /);
  });

  it("puts the protective headers on every answer, good or bad", async () => {
    const answers = [
      await signUp(),
      await signUp({ code: "nope" }),
      await call(register, t.env, "/api/register", { raw: "{" }),
      await call(me, t.env, "/api/me", { method: "GET" }),
      await signIn(),
    ];
    for (const sent of answers) {
      expect(sent.headers.get("Cache-Control"), String(sent.status)).toBe("no-store");
      expect(sent.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(sent.headers.get("X-Frame-Options")).toBe("DENY");
      expect(sent.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(sent.headers.get("Permissions-Policy")).toContain("camera=()");
      expect(sent.headers.get("Content-Type")).toContain("application/json");
    }
  });

  it("does not repeat what was sent in an error", async () => {
    const sent = await signUp({ username: "<script>alert(1)</script>", key: key("a") });
    expect(sent.status).toBe(400);
    expect(JSON.stringify(sent.body)).not.toContain("script");
  });
});

describe("the database after both migrations", () => {
  const names = (query: string): string[] => (newTestDb().raw.prepare(query).all() as { name: string }[]).map((row) => row.name);

  it("has username columns and no email columns on accounts and login_failures", () => {
    expect(names("SELECT name FROM pragma_table_info('accounts')")).toEqual(["id", "username", "password_hash", "created_at"]);
    expect(names("SELECT name FROM pragma_table_info('login_failures')")).toEqual(["id", "kind", "at", "username", "ip"]);
  });

  it("looks failures up by username through an index of its own, and the old email index is gone", () => {
    const indexes = names("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'login_failures' ORDER BY name");
    expect(indexes).toEqual(["login_failures_ip", "login_failures_username"]);
  });
});
