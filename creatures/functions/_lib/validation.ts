// Checks on everything that arrives, before the database is touched. Short, generic messages: never the input, never an inside detail.
import { HttpError } from "./response";
import { isValidEmail, isValidKey, normalizeEmail } from "../../src/sync/account-rules";

export const SMALL_BODY = 2_000; // register, login, logout: a few hundred bytes at most
export const SAVE_JSON_MAX = 256_000; // the save itself, as JSON text, in bytes (D1 allows 2 MB per row)
export const SAVE_BODY_MAX = SAVE_JSON_MAX + 2_000; // the save plus the small envelope around it
export const CODE_MAX = 200;

// A write (POST, PUT) must come from this site, and say it is JSON. SameSite cookies alone do not stop a cross site form post.
export function requireSameSiteJson(request: Request): void {
  const origin = request.headers.get("Origin");
  if (origin === null || origin !== new URL(request.url).origin) throw new HttpError(403, "That request was not allowed.");
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") throw new HttpError(415, "That request was not understood.");
}

// Reads the body as text, stopping as soon as it is longer than maxBytes (so a huge upload is never held in memory).
async function readLimited(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "That is too big.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "That is too big.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "That request was not understood."); // not valid UTF-8, or the upload broke off
  }
  return text;
}

// The JSON body: an object (not an array, not null), and nothing longer than maxBytes.
export async function readJsonObject(request: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const text = await readLimited(request, maxBytes);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "That request was not understood.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new HttpError(400, "That request was not understood.");
  return body as Record<string, unknown>;
}

// Only the named fields are allowed: an extra one is a mistake or an attack, and is refused.
function onlyKeys(body: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new HttpError(400, "That request was not understood.");
}

function emailAndKey(body: Record<string, unknown>): { email: string; key: string } {
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!isValidEmail(email)) throw new HttpError(400, "Please enter a valid email address.");
  if (!isValidKey(body.key)) throw new HttpError(400, "That request was not understood.");
  return { email, key: body.key };
}

export function parseLogin(body: Record<string, unknown>): { email: string; key: string } {
  onlyKeys(body, ["email", "key"]);
  return emailAndKey(body);
}

// A route that takes no fields (logout) still has a JSON body, an empty object.
export function parseEmpty(body: Record<string, unknown>): void {
  onlyKeys(body, []);
}

export function parseRegister(body: Record<string, unknown>): { email: string; key: string; code: string } {
  onlyKeys(body, ["email", "key", "code"]);
  const { email, key } = emailAndKey(body);
  if (typeof body.code !== "string" || body.code.length > CODE_MAX) throw new HttpError(400, "That request was not understood.");
  return { email, key, code: body.code };
}

export interface SavePut {
  baseRevision: number;
  savedAt: number;
  save: Record<string, unknown>;
  data: string; // the save as JSON text, the way it is stored
}

// savedAt may not be more than a day ahead of the server clock, so a device with a wrong clock cannot make its saves win for ever.
export function parseSavePut(body: Record<string, unknown>, now: number): SavePut {
  onlyKeys(body, ["baseRevision", "savedAt", "save"]);
  const { baseRevision, savedAt, save } = body;
  if (typeof baseRevision !== "number" || !Number.isInteger(baseRevision) || baseRevision < 0) throw new HttpError(400, "That request was not understood.");
  if (typeof savedAt !== "number" || !Number.isInteger(savedAt) || savedAt < 0 || savedAt > now + 24 * 3_600_000) throw new HttpError(400, "That request was not understood.");
  if (typeof save !== "object" || save === null || Array.isArray(save)) throw new HttpError(400, "That request was not understood.");
  if ((save as Record<string, unknown>).version !== 3) throw new HttpError(400, "That save is not from a version this server knows.");
  const data = JSON.stringify(save);
  if (new TextEncoder().encode(data).length > SAVE_JSON_MAX) throw new HttpError(413, "That save is too big.");
  return { baseRevision, savedAt, save: save as Record<string, unknown>, data };
}

