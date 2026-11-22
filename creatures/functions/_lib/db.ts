// Every database question the server asks, one named helper each. A query is a fixed piece of text with ? marks, and the values go in
// through bind(), so nothing a player sends is ever joined into the SQL. Routes never write SQL themselves.
import { HttpError } from "./response";
import type { Env } from "./types";

export interface AccountRow {
  id: number;
  email: string;
  password_hash: string;
}

export interface SaveRow {
  revision: number;
  savedAt: number;
  data: string;
}

export const isUniqueViolation = (error: unknown): boolean => error instanceof Error && /UNIQUE constraint failed/i.test(error.message);

// ---- accounts ----

export const findAccount = (env: Env, email: string): Promise<AccountRow | null> =>
  env.DB.prepare("SELECT id, email, password_hash FROM accounts WHERE email = ?").bind(email).first<AccountRow>();

// Makes the account and its one profile together. An email that is already taken answers 409.
export async function createAccount(env: Env, email: string, passwordHash: string, now: number): Promise<number> {
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO accounts (email, password_hash, created_at) VALUES (?, ?, ?)").bind(email, passwordHash, now),
      env.DB.prepare("INSERT INTO profiles (account_id, name, created_at) VALUES (last_insert_rowid(), 'Player', ?)").bind(now),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "That email is already signed up.");
    throw error;
  }
  const account = await findAccount(env, email);
  if (!account) throw new Error("the new account was not found");
  return account.id;
}

export async function firstProfileId(env: Env, accountId: number): Promise<number> {
  const row = await env.DB.prepare("SELECT id FROM profiles WHERE account_id = ? ORDER BY id LIMIT 1").bind(accountId).first<{ id: number }>();
  if (!row) throw new Error("the account has no profile");
  return row.id;
}

// ---- sessions ----

export async function insertSession(env: Env, tokenHash: string, accountId: number, expiresAt: number): Promise<void> {
  await env.DB.prepare("INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)").bind(tokenHash, accountId, expiresAt).run();
}

export const findSession = (env: Env, tokenHash: string, now: number): Promise<{ accountId: number; email: string } | null> =>
  env.DB.prepare("SELECT s.account_id AS accountId, a.email AS email FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?")
    .bind(tokenHash, now)
    .first<{ accountId: number; email: string }>();

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

export async function recordFailure(env: Env, kind: "login" | "register", email: string, ip: string, now: number): Promise<void> {
  await env.DB.prepare("INSERT INTO login_failures (kind, at, email, ip) VALUES (?, ?, ?, ?)").bind(kind, now, email, ip).run();
}

export interface FailureCount {
  count: number;
  oldest: number | null;
}

// Failures newer than `since` for one email, or for one address.
export const failuresByEmail = (env: Env, kind: "login" | "register", email: string, since: number): Promise<FailureCount | null> =>
  env.DB.prepare("SELECT COUNT(*) AS count, MIN(at) AS oldest FROM login_failures WHERE kind = ? AND email = ? AND at > ?").bind(kind, email, since).first<FailureCount>();

export const failuresByIp = (env: Env, kind: "login" | "register", ip: string, since: number): Promise<FailureCount | null> =>
  env.DB.prepare("SELECT COUNT(*) AS count, MIN(at) AS oldest FROM login_failures WHERE kind = ? AND ip = ? AND at > ?").bind(kind, ip, since).first<FailureCount>();

export async function clearFailures(env: Env, kind: "login" | "register", email: string): Promise<void> {
  await env.DB.prepare("DELETE FROM login_failures WHERE kind = ? AND email = ?").bind(kind, email).run();
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
