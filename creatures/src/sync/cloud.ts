// Talking to the server (functions/api). Every call answers with a value or a short message for the player, never a thrown error.
import { deriveKey, normalizeUsername } from "./account-rules";
import { parseProfile, parseProfileList } from "./profiles";
import type { Profile, ProfileKind } from "./profiles";

export interface CloudError {
  kind: "offline" | "signed-out" | "wait" | "again" | "refused";
  message: string;
}
export type Reply<T> = { ok: true; value: T } | { ok: false; error: CloudError };

export interface ServerSave {
  revision: number; // 0 when the account has no save yet
  savedAt: number;
  save: unknown; // null when the account has no save yet
}
export type PutReply = { status: "saved"; revision: number } | ({ status: "kept-server" } & ServerSave);
export interface SavePut {
  baseRevision: number;
  savedAt: number;
  save: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

const isUsernameReply = (data: unknown): data is { username: string } => isObject(data) && typeof data.username === "string";
const isServerSave = (data: unknown): data is ServerSave => isObject(data) && isWhole(data.revision) && isWhole(data.savedAt) && "save" in data;
const isPutReply = (data: unknown): data is PutReply =>
  isObject(data) && ((data.status === "saved" && isWhole(data.revision)) || (data.status === "kept-server" && isServerSave(data)));

const fail = (kind: CloudError["kind"], message: string): { ok: false; error: CloudError } => ({ ok: false, error: { kind, message } });

async function ask<T>(method: "GET" | "POST" | "PUT" | "PATCH", path: string, check: (data: unknown) => data is T, body?: unknown): Promise<Reply<T>> {
  const text = body === undefined ? undefined : JSON.stringify(body);
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: text === undefined ? {} : { "Content-Type": "application/json" },
      body: text,
      keepalive: text !== undefined && text.length < 60_000, // lets a request finish while the page closes (the browser allows it under 64 KB)
    });
  } catch {
    return fail("offline", "Cannot reach the server. Your game is still saved on this device.");
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // an answer that is not JSON (a server that is not there, a page from the wrong place) is handled below
  }
  if (response.ok) return check(data) ? { ok: true, value: data } : fail("refused", "The server gave an answer this game does not understand.");
  const said = isObject(data) && typeof data.error === "string" ? data.error : "Something went wrong. Please try again.";
  if (response.status === 401) return fail("signed-out", "Please sign in again.");
  if (response.status === 429) return fail("wait", "Too many tries. Please wait a few minutes.");
  if (response.status === 409) return fail("again", said);
  return fail("refused", said);
}

// The password never leaves this device: a slow, one way recipe turns it into the key that is sent (src/sync/account-rules.ts).
// (A browser without the crypto it needs, such as a page that is not on https, gets a message instead of an error.)
async function stretch(username: string, password: string): Promise<string | null> {
  try {
    return await deriveKey(username, password);
  } catch {
    return null;
  }
}
const cannotStretch = (): { ok: false; error: CloudError } => fail("refused", "This browser cannot sign in here. Try the game at its https address.");

export async function signIn(username: string, password: string): Promise<Reply<{ username: string }>> {
  const key = await stretch(username, password);
  if (key === null) return cannotStretch();
  const reply = await ask("POST", "/api/login", isUsernameReply, { username: normalizeUsername(username), key });
  return !reply.ok && reply.error.kind === "signed-out" ? fail("refused", "That username or password is not right.") : reply;
}

export async function signUp(username: string, password: string, code: string): Promise<Reply<{ username: string }>> {
  const key = await stretch(username, password);
  if (key === null) return cannotStretch();
  return ask("POST", "/api/register", isUsernameReply, { username: normalizeUsername(username), key, code });
}

export const signOut = (): Promise<Reply<unknown>> => ask("POST", "/api/logout", (data): data is unknown => true, {});

// The save of one profile of the account; no profile (null) means the account's first, which is what a page from before profiles asks.
const saveUrl = (profile: number | null): string => (profile === null ? "/api/save" : `/api/save?profile=${profile}`);

export const fetchSave = (profile: number | null = null): Promise<Reply<ServerSave>> => ask("GET", saveUrl(profile), isServerSave);

export const sendSave = (put: SavePut, profile: number | null = null): Promise<Reply<PutReply>> => ask("PUT", saveUrl(profile), isPutReply, put);

// ---- profiles (docs/profiles-plan.md) ----

const isProfile = (data: unknown): data is Profile => parseProfile(data) !== null;
const isProfileList = (data: unknown): data is { profiles: Profile[] } => isObject(data) && parseProfileList(data.profiles) !== null;

export async function fetchProfiles(): Promise<Reply<Profile[]>> {
  const reply = await ask("GET", "/api/profiles", isProfileList);
  return reply.ok ? { ok: true, value: reply.value.profiles } : reply;
}

export const addProfile = (name: string, kind: ProfileKind): Promise<Reply<Profile>> => ask("POST", "/api/profiles", isProfile, { name, kind });

export const renameProfile = (id: number, name: string): Promise<Reply<Profile>> => ask("PATCH", "/api/profiles", isProfile, { id, name });
