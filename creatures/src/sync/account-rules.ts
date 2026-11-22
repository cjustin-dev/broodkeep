// The rules for emails and passwords, shared by the browser (src/sync) and the server (functions/), so both agree on them.
//
// The password never leaves the browser. The browser stretches it with PBKDF2 (a deliberately slow recipe, so guessing a password
// is expensive) into a 32 byte "key", and sends that key. The server keeps only a salted hash of the key. Why in the browser:
// the free Cloudflare plan gives a server 10 ms of CPU per request, and a safe amount of PBKDF2 takes several times that.
// (docs/cloud-saves.md section 2.)

export const EMAIL_MAX = 254;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const KEY_LENGTH = 43; // 32 bytes written as base64url, without the "=" padding
export const KDF_ITERATIONS = 600_000;

// What the browser and the server both do to an email before using it.
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

// A plain, ASCII only shape check on an email that is already normalized: something@host.tld, no spaces, at most 254 characters.
const EMAIL_SHAPE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
export const isValidEmail = (email: string): boolean => email.length <= EMAIL_MAX && EMAIL_SHAPE.test(email);

export const isValidKey = (key: unknown): key is string => typeof key === "string" && /^[A-Za-z0-9_-]{43}$/.test(key);

export const isValidPassword = (password: string): boolean => password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;

// ---- base64url (letters, digits, "-" and "_": safe in a URL and a cookie) ----

export function toBase64Url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
}

// The key the browser sends in place of the password. The salt holds the email, so two accounts never share a key for the same password.
export async function deriveKey(email: string, password: string, iterations = KDF_ITERATIONS): Promise<string> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new TextEncoder().encode(`broodkeep-v1:${normalizeEmail(email)}`);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, 256);
  return toBase64Url(new Uint8Array(bits));
}
