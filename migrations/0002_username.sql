-- Accounts sign in with a username instead of an email. The columns are renamed in place. An account made with an email stays in the
-- table but can no longer be signed in to (a username has no "@").
ALTER TABLE accounts RENAME COLUMN email TO username;
DROP INDEX login_failures_email;
ALTER TABLE login_failures RENAME COLUMN email TO username;
CREATE INDEX login_failures_username ON login_failures (kind, username, at);
