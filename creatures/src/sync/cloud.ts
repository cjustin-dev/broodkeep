// Talking to the server (functions/api). Every call answers with a value or a short message for the player, never a thrown error.
import { deriveKey, normalizeEmail } from "./account-rules";

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

const isEmailReply = (data: unknown): data is { email: string } => isObject(data) && typeof data.email === "string";
const isServerSave = (data: unknown): data is ServerSave => isObject(data) && isWhole(data.revision) && isWhole(data.savedAt) && "save" in data;
const isPutReply = (data: unknown): data is PutReply =>
  isObject(data) && ((data.status === "saved" && isWhole(data.revision)) || (data.status === "kept-server" && isServerSave(data)));

const fail = (kind: CloudError["kind"], message: string): { ok: false; error: CloudError } => ({ ok: false, error: { kind, message } });

async function ask<T>(method: "GET" | "POST" | "PUT", path: string, check: (data: unknown) => data is T, body?: unknown): Promise<Reply<T>> {
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
async function stretch(email: string, password: string): Promise<string | null> {
  try {
    return await deriveKey(email, password);
  } catch {
    return null;
  }
}
const cannotStretch = (): { ok: false; error: CloudError } => fail("refused", "This browser cannot sign in here. Try the game at its https address.");

export async function signIn(email: string, password: string): Promise<Reply<{ email: string }>> {
  const key = await stretch(email, password);
  if (key === null) return cannotStretch();
  const reply = await ask("POST", "/api/login", isEmailReply, { email: normalizeEmail(email), key });
  return !reply.ok && reply.error.kind === "signed-out" ? fail("refused", "That email or password is not right.") : reply;
}

export async function signUp(email: string, password: string, code: string): Promise<Reply<{ email: string }>> {
  const key = await stretch(email, password);
  if (key === null) return cannotStretch();
  return ask("POST", "/api/register", isEmailReply, { email: normalizeEmail(email), key, code });
}

export const signOut = (): Promise<Reply<unknown>> => ask("POST", "/api/logout", (data): data is unknown => true, {});

export const fetchSave = (): Promise<Reply<ServerSave>> => ask("GET", "/api/save", isServerSave);

export const sendSave = (put: SavePut): Promise<Reply<PutReply>> => ask("PUT", "/api/save", isPutReply, put);
