// The email, password and key rules the browser and the server share (src/sync/account-rules.ts).
import { pbkdf2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  EMAIL_MAX,
  KDF_ITERATIONS,
  KEY_LENGTH,
  PASSWORD_MAX,
  PASSWORD_MIN,
  deriveKey,
  fromBase64Url,
  isValidEmail,
  isValidKey,
  isValidPassword,
  normalizeEmail,
  toBase64Url,
} from "../src/sync/account-rules";

const FEW = 1_000; // far fewer rounds than the real 600,000, so the tests stay quick; the recipe is the same

describe("emails", () => {
  it("are trimmed and lower cased before anything else", () => {
    expect(normalizeEmail("  Kid@Example.COM \n")).toBe("kid@example.com");
    expect(normalizeEmail("")).toBe("");
  });

  it("are accepted in their ordinary shapes", () => {
    for (const email of ["kid@example.com", "a@b.co", "first.last@mail.example.org", "kid+game@example.com", "k_d-1@sub.example.com", "x@y-z.example"]) {
      expect(isValidEmail(email), email).toBe(true);
    }
  });

  it("are refused when empty, with no or two @, with a space, or with a host that is not a name with a dot", () => {
    for (const email of ["", "kid", "kid@", "@example.com", "kid@example", "kid@@example.com", "a@b@example.com", "ki d@example.com", "kid@exa mple.com", "kid@.example.com", "kid@example..com", "kid@example.com.", "kid@-example.com", "kid@example-.com"]) {
      expect(isValidEmail(email), JSON.stringify(email)).toBe(false);
    }
  });

  it("are refused when not plain ASCII, so look alike letters cannot make a second account", () => {
    for (const email of ["kíd@example.com", "kid@exämple.com", "kid@example.com​", "ｋid@example.com"]) expect(isValidEmail(email), email).toBe(false);
  });

  it("may be 254 characters and no more", () => {
    const withLength = (length: number): string => "a".repeat(length - "@example.com".length) + "@example.com";
    expect(isValidEmail(withLength(EMAIL_MAX))).toBe(true);
    expect(isValidEmail(withLength(EMAIL_MAX + 1))).toBe(false);
  });
});

describe("the numbers the plan names", () => {
  it("are emails up to 254 characters, passwords of 8 to 128, keys of 43, and 600,000 rounds", () => {
    expect([EMAIL_MAX, PASSWORD_MIN, PASSWORD_MAX, KEY_LENGTH]).toEqual([254, 8, 128, 43]);
    expect(KDF_ITERATIONS).toBe(600_000);
  });
});

describe("passwords", () => {
  it("must be 8 to 128 characters", () => {
    expect(isValidPassword("x".repeat(PASSWORD_MIN - 1))).toBe(false);
    expect(isValidPassword("x".repeat(PASSWORD_MIN))).toBe(true);
    expect(isValidPassword("x".repeat(PASSWORD_MAX))).toBe(true);
    expect(isValidPassword("x".repeat(PASSWORD_MAX + 1))).toBe(false);
    expect(isValidPassword("")).toBe(false);
  });
});

describe("keys", () => {
  it("are exactly 43 base64url characters", () => {
    expect(KEY_LENGTH).toBe(43);
    expect(isValidKey("a".repeat(43))).toBe(true);
    expect(isValidKey("Az09_-".repeat(7) + "A")).toBe(true);
    for (const bad of ["a".repeat(42), "a".repeat(44), "", "a".repeat(42) + "+", "a".repeat(42) + "/", "a".repeat(42) + "=", "a".repeat(42) + " ", "a".repeat(42) + "\n"]) {
      expect(isValidKey(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("are refused when they are not text", () => {
    for (const bad of [undefined, null, 5, {}, [], ["a".repeat(43)], true]) expect(isValidKey(bad)).toBe(false);
  });
});

describe("base64url", () => {
  it("round trips every length of bytes, and never writes + / or =", () => {
    for (let length = 0; length <= 40; length++) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 250) % 256);
      const text = toBase64Url(bytes);
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(Array.from(fromBase64Url(text))).toEqual(Array.from(bytes));
    }
  });

  it("writes 32 bytes as 43 characters", () => {
    expect(toBase64Url(new Uint8Array(32).fill(255))).toHaveLength(KEY_LENGTH);
  });
});

describe("the key made from a password", () => {
  const reference = (email: string, password: string, rounds: number): string =>
    toBase64Url(new Uint8Array(pbkdf2Sync(password, `broodkeep-v1:${email}`, rounds, 32, "sha256")));

  it("is PBKDF2 SHA-256 over the password, salted with the lower case email, 32 bytes", async () => {
    const key = await deriveKey("kid@example.com", "correct horse battery", FEW);
    expect(key).toBe(reference("kid@example.com", "correct horse battery", FEW));
    expect(isValidKey(key)).toBe(true);
  });

  it("is the same whatever the case or spacing of the email", async () => {
    const plain = await deriveKey("kid@example.com", "correct horse battery", FEW);
    expect(await deriveKey("  KID@Example.com ", "correct horse battery", FEW)).toBe(plain);
  });

  it("differs for another email, another password, and another number of rounds", async () => {
    const base = await deriveKey("kid@example.com", "correct horse battery", FEW);
    expect(await deriveKey("sib@example.com", "correct horse battery", FEW)).not.toBe(base);
    expect(await deriveKey("kid@example.com", "correct horse batterY", FEW)).not.toBe(base);
    expect(await deriveKey("kid@example.com", "correct horse battery", FEW + 1)).not.toBe(base);
  });

  it("handles passwords with accents, emoji and spaces", async () => {
    const password = "pässwörd 🐣 with spaces";
    expect(await deriveKey("kid@example.com", password, FEW)).toBe(reference("kid@example.com", password, FEW));
  });

  it("uses 600,000 rounds unless told otherwise", async () => {
    expect(await deriveKey("kid@example.com", "correct horse battery")).toBe(reference("kid@example.com", "correct horse battery", 600_000));
  });
});
