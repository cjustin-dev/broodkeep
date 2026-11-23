-- Accounts and cloud saves (docs/cloud-saves.md). Run once on a new database.
-- Times are milliseconds since 1970 (Date.now()). Never put real data or secrets in this file.

-- One row per person who signs in. The email is lower case. password_hash is "sha256$<salt>$<hash>": a salted SHA-256 of the key
-- the browser made from the password (the password itself never reaches the server).
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- A player inside an account. Every account gets one called "Player" for now; kid profiles come later.
CREATE TABLE profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX profiles_account ON profiles (account_id);

-- A signed in browser. token_hash is the SHA-256 (hex) of the cookie's random token, never the token itself.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_account ON sessions (account_id);

-- The current cloud save of a profile. revision counts the saves the server accepted. saved_at is the device clock when that
-- device wrote the save, which decides which of two competing saves is newer. data is the save as JSON.
CREATE TABLE saves (
  profile_id INTEGER PRIMARY KEY REFERENCES profiles (id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  saved_at INTEGER NOT NULL,
  data TEXT NOT NULL
);

-- Older saves kept for safety: the loser of a conflict, and a copy of the replaced save every 30 minutes or so (the newest 10 stay).
-- revision: a replaced save's own revision; for a device's save that lost a conflict, the revision that device last synced.
CREATE TABLE save_backups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  saved_at INTEGER NOT NULL,
  backed_up_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX save_backups_profile ON save_backups (profile_id, id);

-- Wrong passwords and wrong sign up codes, to slow guessing down. kind is 'login' or 'register'. Old rows are deleted as they expire.
CREATE TABLE login_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL,
  email TEXT NOT NULL,
  ip TEXT NOT NULL
);
CREATE INDEX login_failures_email ON login_failures (kind, email, at);
CREATE INDEX login_failures_ip ON login_failures (kind, ip, at);
