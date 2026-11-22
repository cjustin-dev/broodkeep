# Cloud saves: accounts and a server copy of the save (a first slice of Phase 5)

Started 2026-11-21 on the owner's "lets do it" (they asked whether the database was active at server level; it was not, saves were
on the device only). Branch `cloud-saves`, off `main` 91a529f, worktree ~/broodkeep-cloud. The owner opens and merges the pull request.

## 1. Scope

In: sign up, sign in, sign out with an email and a password; one save per account kept on the server (Cloudflare D1); the game
still works fully offline and signed out; the device syncs automatically when signed in; a safety net of older saves on the server.

Not in (they stay in Phase 5): profiles for kids, adult PINs, soften mode, play limits and quiet hours, a family-wide Creature
Book, the history table, password reset, email checks. The schema already has a `profiles` table with one default profile per
account, so those can be added without moving data.

## 2. Decisions (mine unless it says owner)

- **The password is stretched in the browser, not on the server.** The plan (CLAUDE.md section 3) says "PBKDF2 on the server". Measured
  in the Workers runtime on this machine: 100,000 iterations take about 19 ms and 600,000 about 68 ms, and the free plan gives a
  Worker 10 ms of CPU per request. The plan also says "no paid plans". So the browser runs PBKDF2-SHA256 (600,000 iterations, salt
  `broodkeep-v1:` plus the lowercase email) and sends the 32 byte result, 43 characters of base64url, as `key`. The server never
  sees the password. It stores `sha256$<salt>$<SHA-256(salt + key)>` with a random salt, which costs microseconds. Someone who steals
  the database still has to run 600,000 iterations for every password guess. Cost: the server cannot check password strength, so
  the browser enforces 8 to 128 characters. CLAUDE.md section 3 needs a one line edit (owner approval, proposed in progress.md).
- **Email is only a name to sign in with.** No emails are sent, so there is no password reset yet. A forgotten password means the
  owner resets it by hand in the D1 console. Listed in known-issues.md.
- **Sign up needs a family code.** `SIGNUP_CODE` is a secret set in the Cloudflare dashboard. If it is not set, registration is
  closed (fail closed), so a forgotten step never opens the door to the internet.
- **Sessions:** a random 32 byte token in an HttpOnly cookie `__Host-bk_session` (Secure, SameSite=Lax, Path=/, 90 days). The
  database holds only its SHA-256. Logging out deletes the row.
- **CSRF:** every POST and PUT must have an `Origin` equal to the site and `Content-Type: application/json`.
- **Rate limits** (D1 table, 15 minute window): 5 failed logins per email, 20 per IP; 5 wrong sign up codes per IP. Over the limit
  gives 429 with `Retry-After`, even for a correct password. A success clears that email's failures. An unknown email gets the
  same answer as a wrong password and runs the same code path.
- **The save on the server** is the same JSON as the local save (size cap 256,000 bytes, `version` must be 3). `PUT /api/save` sends
  `baseRevision` (the revision this device last synced), `savedAt` (when the device wrote it) and the save. If `baseRevision` is
  the server's revision it is accepted. If not (another device saved), the newer `savedAt` wins and the older save goes to
  `save_backups`; the answer says which one the server kept. A backup of the replaced save is also taken when the newest backup
  is 30 minutes old or more, and the last 10 are kept.
- **A device that has never synced does not overwrite.** On the first sign in, if the server already has a save and this device has
  a game in progress (not an untouched egg), the player chooses which one to keep. The game that is not kept is stored as a backup
  in the account: this device's game is sent as a save from a device that never synced (base revision 0), dated after the account's
  game (keep this device's) or dated 0 (keep the account's: the server keeps its own game, stores this one as a backup and answers
  with its own). So no game is only on a device when it is replaced. The question stays until the answer has been sent; the
  account is looked at again first, and if it changed meanwhile the player is asked again. A device that could not load its own
  saved game (it starts a new egg) counts as never synced, so that egg cannot overwrite the account's game.
- **Only the player's actions count as changes** (`Game.changed(byPlayer)`). A save that only carries the clock forward does not
  make the game "changed" or newer. The game moves on by itself in the same way on every device, so a device left open and idle must
  not win over the device in use. An idle device takes the account's game when it looks again.
- **Sync timing:** 30 seconds after the first unsent change by the player (later saves do not push it back), when the page is
  hidden, and after sign in. Offline or failing syncs just try again later (1 minute; 5 minutes after "too many tries"); nothing
  is lost because the local save is always written first.
- **Tests run on node:sqlite.** `miniflare` in the installed wrangler (5.x beta) has an unstable options format, so the tests use a
  small adapter that gives `node:sqlite` the D1 methods the code uses. The real D1 runtime is exercised by an end to end run with
  `wrangler pages dev` and a local D1.

## 3. API

All responses are JSON with `Cache-Control: no-store` and the security headers (set in `functions/_lib/response.ts`, because Pages
does not apply `public/_headers` to Functions).

| Route | Body in | Answers |
|---|---|---|
| `POST /api/register` | `{ email, key, code }` | 201 `{ email }` and the session cookie. 400 bad input, 403 wrong code or closed, 409 email taken, 429 too many wrong codes |
| `POST /api/login` | `{ email, key }` | 200 `{ email }` and the cookie. 401 wrong email or key (one answer for both), 429 too many failures |
| `POST /api/logout` | `{}` | 200 and the cookie cleared |
| `GET /api/me` | none | 200 `{ email }` or 401 |
| `GET /api/save` | none | 200 `{ revision, savedAt, save }` (`revision` 0 and `save` null if none) or 401 |
| `PUT /api/save` | `{ baseRevision, savedAt, save }` | 200 `{ status: "saved", revision }` or `{ status: "kept-server", revision, savedAt, save }`; 401, 409 (raced, retry), 413 too big, 400 |

## 4. Edge cases, written before the code (a test for each)

Input: email empty, spaces only, padded, upper case, 254 and 255 characters, no `@`, two `@`, an inner space, a plus sign (fine);
key 42, 43 and 44 characters, with `+`, `/` or `=` (bad); unknown extra fields; body not JSON, an array, `null`, a number; body just
under and just over the size cap; `Content-Type` text/plain, missing, and `application/json; charset=utf-8` (fine); `Origin` missing,
another host, `null`, another scheme, and the right one; the wrong method on each route.

Auth: the same email in another case; unknown email and wrong key look the same and take the same path; the 4th, 5th and 6th failure;
a correct login while blocked; a failure exactly 15 minutes old and one a second newer; per IP versus per email; the success that
clears; a wrong sign up code counted per IP; registration with `SIGNUP_CODE` unset.

Sessions: missing, tampered, expired (and exactly at expiry), logout deletes the row, logout with no session, the cookie flags
(HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age, `__Host-` prefix, no Domain), the database never holds the raw token.

Save: no session; first save; base equal; stale base with the newer incoming; stale base with the older incoming; `baseRevision`
and `savedAt` as text, negative, fractional; `save` as an array; wrong `version`; exactly at and over 256 KB; another account's save
is never reachable; backups at 29 and 30 minutes; the 11th backup removes the oldest; a raced update (no row changed) answers 409.

Never in a log or an answer: the key, the code, the cookie, the raw body, a stack trace, a database message. A thrown error
gives a generic 500.

Client: a never synced device with an untouched egg adopts the server save; with a game in progress it asks; with no server save it
pushes; a synced and unchanged device does nothing; a synced and changed one pushes; "kept-server" replaces the local game; offline
changes nothing and retries; signed out never calls the server; a clock-only save sends nothing and an idle device never beats the
device in use; the question is not dropped when the answer fails, is asked again when the account changed meanwhile and after a
restart; a new egg started after a failed load does not overwrite; signing out with unsent changes that cannot be sent still signs
out and keeps the game.

## 5. Build order

1. `migrations/0001_init.sql`. 2. `functions/_lib` (response, validation, auth, db). 3. `functions/api/*`. 4. shared email and key rules
(`src/sync/account-rules.ts`, used by the browser and the Functions). 5. browser side (`src/sync/cloud.ts`, `sync.ts`, the Account
section in Settings). 6. tests. 7. cheap-model review before any test runs. 8. mutation checks. 9. end to end run with a local D1.
10. the owner's Cloudflare steps below, then a live check.

## 6. What the owner does in Cloudflare (numbered, about 10 minutes, after the pull request is ready)

1. Cloudflare dashboard, Storage and Databases, D1, Create database. Name it `broodkeep`. Copy its Database ID (it is not a secret)
   and tell me; I put it in `wrangler.toml`.
2. Open that database, the Console tab, paste the whole of `migrations/0001_init.sql` and run it.
3. Workers and Pages, the `broodkeep` project, Settings, Variables and Secrets: add a secret named `SIGNUP_CODE` (a word or phrase
   you choose, which your family uses once to sign up), for Production.
4. Merge the pull request. After the deploy, sign up on the live site and sign in on a second device to check.
