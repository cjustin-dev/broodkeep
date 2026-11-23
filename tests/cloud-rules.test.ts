// The username, password and key rules the browser and the server share (src/sync/account-rules.ts).
import { pbkdf2Sync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  KDF_ITERATIONS,
  KEY_LENGTH,
  PASSWORD_MAX,
  PASSWORD_MIN,
  USERNAME_HELP,
  USERNAME_MAX,
  USERNAME_MIN,
  deriveKey,
  fromBase64Url,
  isValidKey,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
  toBase64Url,
} from "../src/sync/account-rules";

const FEW = 1_000; // far fewer rounds than the real 600,000, so the tests stay quick; the recipe is the same

describe("usernames", () => {
  it("are trimmed and lower cased before anything else", () => {
    expect(normalizeUsername("  Kid_One \n")).toBe("kid_one");
    expect(normalizeUsername("")).toBe("");
  });

  it("are accepted in their ordinary shapes", () => {
    for (const username of ["kid", "abc", "9lives", "first.last", "kid_1", "k-d", "a.b", "a--", "x__", "a..", "tiffani", "a".repeat(20)]) {
      expect(isValidUsername(username), username).toBe(true);
    }
  });

  it("are refused when empty, with a space, a symbol, an @, or a start that is not a letter or digit", () => {
    for (const username of ["", "ki d", "ki\nd", "kid!", "kid#", "kid@home", "kid@example.com", "k/d", "k'd", ".kid", "_kid", "-kid", "kid+game"]) {
      expect(isValidUsername(username), JSON.stringify(username)).toBe(false);
    }
  });

  it("are refused when not plain ASCII, so look alike letters cannot make a second account", () => {
    for (const username of ["kíd", "ｋid", "kid\u200b", "кid" /* Cyrillic к */, "kid🐣"]) expect(isValidUsername(username), username).toBe(false);
  });

  it("may be 3 to 20 characters and no more or less", () => {
    expect(isValidUsername("a".repeat(USERNAME_MIN - 1))).toBe(false);
    expect(isValidUsername("a".repeat(USERNAME_MIN))).toBe(true);
    expect(isValidUsername("a".repeat(USERNAME_MAX))).toBe(true);
    expect(isValidUsername("a".repeat(USERNAME_MAX + 1))).toBe(false);
  });

  it("treat a letter that lower cases to plain ASCII (the Kelvin sign) as that letter, the same on both sides, so it reaches the same account", () => {
    expect(normalizeUsername("\u212Aid")).toBe("kid");
    expect(isValidUsername(normalizeUsername("\u212Aid"))).toBe(true);
  });

  it("are not checked for case or spaces here: that is what normalizing is for", () => {
    expect(isValidUsername("Kid")).toBe(false);
    expect(isValidUsername(normalizeUsername(" Kid "))).toBe(true);
  });

  it("have help text that names the rule", () => {
    expect(USERNAME_HELP).toBe("Choose a username of 3 to 20 letters, numbers, dots, dashes or underscores.");
  });
});

describe("the numbers the plan names", () => {
  it("are usernames of 3 to 20 characters, passwords of 8 to 128, keys of 43, and 600,000 rounds", () => {
    expect([USERNAME_MIN, USERNAME_MAX, PASSWORD_MIN, PASSWORD_MAX, KEY_LENGTH]).toEqual([3, 20, 8, 128, 43]);
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
  const reference = (username: string, password: string, rounds: number): string =>
    toBase64Url(new Uint8Array(pbkdf2Sync(password, `broodkeep-v1:${username}`, rounds, 32, "sha256")));

  it("is PBKDF2 SHA-256 over the password, salted with the lower case username, 32 bytes", async () => {
    const key = await deriveKey("kid", "correct horse battery", FEW);
    expect(key).toBe(reference("kid", "correct horse battery", FEW));
    expect(isValidKey(key)).toBe(true);
  });

  it("is the same whatever the case or spacing of the username", async () => {
    const plain = await deriveKey("kid", "correct horse battery", FEW);
    expect(await deriveKey("  KID ", "correct horse battery", FEW)).toBe(plain);
  });

  it("differs for another username, another password, and another number of rounds", async () => {
    const base = await deriveKey("kid", "correct horse battery", FEW);
    expect(await deriveKey("sib", "correct horse battery", FEW)).not.toBe(base);
    expect(await deriveKey("kid", "correct horse batterY", FEW)).not.toBe(base);
    expect(await deriveKey("kid", "correct horse battery", FEW + 1)).not.toBe(base);
  });

  it("handles passwords with accents, emoji and spaces", async () => {
    const password = "pässwörd 🐣 with spaces";
    expect(await deriveKey("kid", password, FEW)).toBe(reference("kid", password, FEW));
  });

  it("uses 600,000 rounds unless told otherwise", async () => {
    expect(await deriveKey("kid", "correct horse battery")).toBe(reference("kid", "correct horse battery", 600_000));
  });
});
