// Every database question the server asks, one named helper each. A query is a fixed piece of text with ? marks, and the values go in
// through bind(), so nothing a player sends is ever joined into the SQL. Routes never write SQL themselves.
import { MAX_PROFILES, nameKey } from "../../src/sync/profiles";
import type { ProfileKind } from "../../src/sync/profiles";
import { HttpError } from "./response";
import type { D1PreparedStatement, Env } from "./types";

export interface AccountRow {
  id: number;
  username: string;
  password_hash: string;
}

export interface SaveRow {
  revision: number;
  savedAt: number;
  data: string;
}

export const isUniqueViolation = (error: unknown): boolean => error instanceof Error && /UNIQUE constraint failed/i.test(error.message);

// ---- accounts ----

export const findAccount = (env: Env, username: string): Promise<AccountRow | null> =>
  env.DB.prepare("SELECT id, username, password_hash FROM accounts WHERE username = ?").bind(username).first<AccountRow>();

// Makes the account and its one profile together. A username that is already taken answers 409.
export async function createAccount(env: Env, username: string, passwordHash: string, now: number): Promise<number> {
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO accounts (username, password_hash, created_at) VALUES (?, ?, ?)").bind(username, passwordHash, now),
      env.DB.prepare("INSERT INTO profiles (account_id, name, name_key, created_at) VALUES (last_insert_rowid(), 'Player', 'player', ?)").bind(now),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "That username is already taken.");
    throw error;
  }
  const account = await findAccount(env, username);
  if (!account) throw new Error("the new account was not found");
  return account.id;
}

export async function firstProfileId(env: Env, accountId: number): Promise<number> {
  const row = await env.DB.prepare("SELECT id FROM profiles WHERE account_id = ? ORDER BY id LIMIT 1").bind(accountId).first<{ id: number }>();
  if (!row) throw new Error("the account has no profile");
  return row.id;
}

// ---- profiles (docs/profiles-plan.md) ----

export interface ProfileRow {
  id: number;
  name: string;
  kind: ProfileKind;
}

export const listProfiles = async (env: Env, accountId: number): Promise<ProfileRow[]> =>
  (await env.DB.prepare("SELECT id, name, kind FROM profiles WHERE account_id = ? ORDER BY id").bind(accountId).all<ProfileRow>()).results;

// The profile with this id, only if it belongs to this account: one that is another account's answers the same as one that is missing.
export async function findProfile(env: Env, accountId: number, id: number): Promise<ProfileRow> {
  const row = await env.DB.prepare("SELECT id, name, kind FROM profiles WHERE id = ? AND account_id = ?").bind(id, accountId).first<ProfileRow>();
  if (!row) throw new HttpError(404, "That player was not found.");
  return row;
}

// The profile a save request is about: the one it names, or the account's first when it names none (an old page does not).
export async function profileForSave(env: Env, accountId: number, requested: number | null): Promise<number> {
  return requested === null ? firstProfileId(env, accountId) : (await findProfile(env, accountId, requested)).id;
}

// A profile made before the name keys existed (an account signed up in the gap between running the migration and the new code going
// live) has an empty key. This fills it in. Always run together with the statement that needs the keys to be right.
const fillNameKeys = (env: Env, accountId: number): D1PreparedStatement =>
  env.DB.prepare("UPDATE profiles SET name_key = lower(name) WHERE account_id = ? AND name_key = ''").bind(accountId);

// One statement does the counting and the inserting, so two devices adding at the same moment cannot both make the last place. A name
// that is already taken answers 409, and so does a full account.
export async function createProfile(env: Env, accountId: number, name: string, kind: ProfileKind, now: number): Promise<ProfileRow> {
  const key = nameKey(name);
  let results;
  try {
    results = await env.DB.batch([
      fillNameKeys(env, accountId),
      env.DB.prepare(
        "INSERT INTO profiles (account_id, name, name_key, kind, created_at) SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM profiles WHERE account_id = ?) < ?",
      ).bind(accountId, name, key, kind, now, accountId, MAX_PROFILES),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "You already have a player with that name.");
    throw error;
  }
  const changes = results[1]?.meta.changes;
  if (changes === undefined) throw new Error("the database did not say how many profiles were added"); // never read as "full"
  if (changes === 0) throw new HttpError(409, `An account can have up to ${MAX_PROFILES} players.`);
  const row = await env.DB.prepare("SELECT id, name, kind FROM profiles WHERE account_id = ? AND name_key = ?").bind(accountId, key).first<ProfileRow>();
  if (!row) throw new Error("the new profile was not found");
  return row;
}

export async function renameProfile(env: Env, accountId: number, id: number, name: string): Promise<ProfileRow> {
  let results;
  try {
    results = await env.DB.batch([
      fillNameKeys(env, accountId),
      env.DB.prepare("UPDATE profiles SET name = ?, name_key = ? WHERE id = ? AND account_id = ?").bind(name, nameKey(name), id, accountId),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "You already have a player with that name.");
    throw error;
  }
  const changes = results[1]?.meta.changes;
  if (changes === undefined) throw new Error("the database did not say how many profiles were renamed");
  return findProfile(env, accountId, id); // (answers 404 when nothing was renamed: the profile is missing or another account's)
}

// ---- sessions ----

export async function insertSession(env: Env, tokenHash: string, accountId: number, expiresAt: number): Promise<void> {
  await env.DB.prepare("INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)").bind(tokenHash, accountId, expiresAt).run();
}

export const findSession = (env: Env, tokenHash: string, now: number): Promise<{ accountId: number; username: string } | null> =>
  env.DB.prepare("SELECT s.account_id AS accountId, a.username AS username FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?")
    .bind(tokenHash, now)
    .first<{ accountId: number; username: string }>();

export async function deleteSession(env: Env, tokenHash: string): Promise<void> {
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

// Tidying, done whenever someone signs in: expired sessions, and failures older than a day.
export async function purgeExpired(env: Env, now: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM login_failures WHERE at < ?").bind(now - 24 * 3_600_000),
  ]);
}

// ---- failed attempts (login passwords and sign up codes) ----

export async function recordFailure(env: Env, kind: "login" | "register", username: string, ip: string, now: number): Promise<void> {
  await env.DB.prepare("INSERT INTO login_failures (kind, at, username, ip) VALUES (?, ?, ?, ?)").bind(kind, now, username, ip).run();
}

export interface FailureCount {
  count: number;
  oldest: number | null;
}

// Failures newer than `since` for one username, or for one address.
export const failuresByUsername = (env: Env, kind: "login" | "register", username: string, since: number): Promise<FailureCount | null> =>
  env.DB.prepare("SELECT COUNT(*) AS count, MIN(at) AS oldest FROM login_failures WHERE kind = ? AND username = ? AND at > ?").bind(kind, username, since).first<FailureCount>();

export const failuresByIp = (env: Env, kind: "login" | "register", ip: string, since: number): Promise<FailureCount | null> =>
  env.DB.prepare("SELECT COUNT(*) AS count, MIN(at) AS oldest FROM login_failures WHERE kind = ? AND ip = ? AND at > ?").bind(kind, ip, since).first<FailureCount>();

export async function clearFailures(env: Env, kind: "login" | "register", username: string): Promise<void> {
  await env.DB.prepare("DELETE FROM login_failures WHERE kind = ? AND username = ?").bind(kind, username).run();
}

// ---- saves (the rules about which save wins are in saves.ts) ----

export const getSaveRow = (env: Env, profileId: number): Promise<SaveRow | null> =>
  env.DB.prepare("SELECT revision, saved_at AS savedAt, data FROM saves WHERE profile_id = ?").bind(profileId).first<SaveRow>();

export async function insertFirstSave(env: Env, profileId: number, savedAt: number, data: string): Promise<void> {
  await env.DB.prepare("INSERT INTO saves (profile_id, revision, saved_at, data) VALUES (?, 1, ?, ?)").bind(profileId, savedAt, data).run();
}

// Replaces the save only if the revision is still the one that was read. Returns whether it did (false: someone else saved first).
export async function replaceSaveRow(env: Env, profileId: number, expectedRevision: number, savedAt: number, data: string): Promise<boolean> {
  const result = await env.DB.prepare("UPDATE saves SET revision = revision + 1, saved_at = ?, data = ? WHERE profile_id = ? AND revision = ?")
    .bind(savedAt, data, profileId, expectedRevision)
    .run();
  return result.meta.changes === 1;
}

export async function newestBackupTime(env: Env, profileId: number): Promise<number | null> {
  const row = await env.DB.prepare("SELECT MAX(backed_up_at) AS last FROM save_backups WHERE profile_id = ?").bind(profileId).first<{ last: number | null }>();
  return row?.last ?? null;
}

// Adds a backup and keeps only the newest `keep`.
export async function addBackup(env: Env, profileId: number, revision: number, savedAt: number, data: string, now: number, keep: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO save_backups (profile_id, revision, saved_at, backed_up_at, data) VALUES (?, ?, ?, ?, ?)").bind(profileId, revision, savedAt, now, data),
    env.DB.prepare("DELETE FROM save_backups WHERE profile_id = ? AND id NOT IN (SELECT id FROM save_backups WHERE profile_id = ? ORDER BY id DESC LIMIT ?)").bind(profileId, profileId, keep),
  ]);
}
