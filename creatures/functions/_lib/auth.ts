// Keys, sessions, cookies and rate limits. The rules are in docs/cloud-saves.md section 2.
import { fromBase64Url, toBase64Url } from "../../src/sync/account-rules";
import * as db from "./db";
import { HttpError } from "./response";
import type { Context, Env } from "./types";

export const SESSION_COOKIE = "__Host-bk_session"; // "__Host-" makes browsers insist on Secure, Path=/ and no Domain
export const SESSION_MS = 90 * 24 * 3_600_000;

// Failed attempts that are allowed in the window before the answer becomes 429. An address gets more than a username, since a family
// can share one address.
export const LIMITS = { windowMs: 15 * 60_000, loginPerUsername: 5, loginPerIp: 20, registerPerIp: 5 };

type Bytes = Uint8Array<ArrayBuffer>;
const encode = (text: string): Bytes => new TextEncoder().encode(text);
const sha256 = async (bytes: Bytes): Promise<Bytes> => new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
const hex = (bytes: Uint8Array): string => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
const concat = (a: Uint8Array, b: Uint8Array): Bytes => Uint8Array.from([...a, ...b]);

// Compares two byte strings in the same time wherever they differ, so the time taken does not give a guess away.
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ b[i]!;
  return difference === 0;
}

// Two secrets of any length, compared by their SHA-256 so neither the length nor the content shows in the time taken.
export async function sameSecret(a: string, b: string): Promise<boolean> {
  return sameBytes(await sha256(encode(a)), await sha256(encode(b)));
}

// ---- the stored form of a key: "sha256$<salt>$<hash>" ----
// The key is already 256 bits of PBKDF2 output made in the browser, so one fast salted hash is enough here.

export async function hashKey(key: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await sha256(concat(salt, fromBase64Url(key)));
  return `sha256$${toBase64Url(salt)}$${toBase64Url(hash)}`;
}

// A well formed value that no key matches. An unknown username is checked against it, so it takes the same steps as a wrong password.
export const DUMMY_HASH = `sha256$${"A".repeat(22)}$${"A".repeat(43)}`;

export async function checkKey(key: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "sha256" || !salt || !hash) return false;
  const expected = await sha256(concat(fromBase64Url(salt), fromBase64Url(key)));
  return sameBytes(expected, fromBase64Url(hash));
}

// ---- sessions ----

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export const newToken = (): string => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
export const tokenHash = async (token: string): Promise<string> => hex(await sha256(encode(token)));

export const sessionCookie = (token: string): [string, string] => ["Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MS / 1000}`];
export const clearedCookie = (): [string, string] => ["Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`];

// The session token from the Cookie header, if it has the right shape.
export function readToken(request: Request): string | null {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) {
      const value = rest.join("=");
      return TOKEN_SHAPE.test(value) ? value : null;
    }
  }
  return null;
}

export async function startSession(env: Env, accountId: number, now: number): Promise<[string, string]> {
  const token = newToken();
  await db.insertSession(env, await tokenHash(token), accountId, now + SESSION_MS);
  return sessionCookie(token);
}

// The signed in account, or a 401.
export async function requireSession(ctx: Context, now: number): Promise<{ accountId: number; username: string }> {
  const token = readToken(ctx.request);
  const found = token ? await db.findSession(ctx.env, await tokenHash(token), now) : null;
  if (!found) throw new HttpError(401, "Please sign in.");
  return found;
}

// ---- rate limits ----

export const clientIp = (request: Request): string => request.headers.get("CF-Connecting-IP") ?? "unknown";

// Throws 429 (with Retry-After) if this username or this address has already failed too often lately. Checked before the password is
// looked at, so a correct password does not get through while blocked.
export async function assertNotLimited(env: Env, kind: "login" | "register", username: string | null, ip: string, now: number): Promise<void> {
  const since = now - LIMITS.windowMs;
  const checks: [db.FailureCount | null, number][] = [];
  if (username !== null) checks.push([await db.failuresByUsername(env, kind, username, since), LIMITS.loginPerUsername]);
  checks.push([await db.failuresByIp(env, kind, ip, since), kind === "login" ? LIMITS.loginPerIp : LIMITS.registerPerIp]);
  for (const [found, allowed] of checks) {
    if (found && found.count >= allowed && found.oldest !== null) {
      const seconds = Math.max(1, Math.ceil((found.oldest + LIMITS.windowMs - now) / 1000));
      throw new HttpError(429, "Too many tries. Please wait a little and try again.", [["Retry-After", String(seconds)]]);
    }
  }
}
