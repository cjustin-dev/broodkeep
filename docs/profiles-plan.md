# Profiles and adult PINs (the next slice of Phase 5)

Started 2026-11-22 on the owner's "move to the next phase", read as the next item in the order I gave them: kid profiles and PINs.
(Sound and the desktop layout, the rest of Phase 7, come later.) Branch `profiles`, off `main` b743968, worktree ~/broodkeep-profiles.
Status: **slice 1 built 2026-11-22, not committed** (the gates are in section 7, the slice 1 review at the end of section 10; slice 2 is not started). Version 3 of the plan: two cheap-model reviews found 25 problems in version 1 and 15 in version 2
(section 10 says what changed each time). On 2026-11-22 the owner said "we are good then commit and push" after asking how accounts
work; read as accepting the plan and my defaults for questions 1 to 5 of section 8. Question 6 and the proposed CLAUDE.md edits were
not answered and stay open.

Two branches are not merged yet and touch the same files. `pwa-install` changes `App.tsx`, `SettingsPanel.tsx`, `app.css`, two test
files, and it makes `Game.saveNow()` return the IndexedDB write. Switching profiles needs that awaited write (it saves, then
reloads), so either that pull request merges first or slice 1 carries the same small change; the second one to merge has a small
conflict.

## 1. Scope

In (slice 1): several profiles in one account, each an adult or a kid, each with its own creature, Creature Book, coins and sleeping
hours (all already inside one save); a "who is playing" screen; each profile's save kept on the device and in the account; anyone in
Settings can add a profile (adult or kid, chosen when it is made, with no effect yet) and rename one. Limiting that to grown-ups comes
with the lock in slice 2.

In (slice 2): an optional 4 digit PIN on adult profiles, and the lock that goes with it.

Not in, each its own later slice: removing a profile, changing a profile between adult and kid, soften mode, play limits and quiet
hours, the family wide Creature Book, the history table, password reset, a separate sign in per kid. The family signs in once, as
the account, and picks who is playing. Removal is left out on purpose: it deletes a child's saves and backups for good, and it needs
its own answers (confirmation, what a device that still has the game does). A profile made by mistake can be renamed and used.

## 2. What is there now (checked in the code on `main`)

- The server keeps one save per profile (`saves.profile_id`), but every route uses the account's first profile, the lowest id
  (`db.firstProfileId`, `ORDER BY id LIMIT 1`, called in `functions/api/save.ts`). Registering makes one profile called "Player"
  (`db.createAccount`). The `profiles` table has `id`, `account_id`, `name`, `created_at`.
- The device keeps one game under the IndexedDB key `save` and one record of the account under `cloud` (`src/sync/local.ts`; the record
  is `CloudMeta` in `src/sync/sync.ts`: username, signed in, revision, savedAt, dirty). `writeSave` always writes the key `save`,
  `readFailed` in `local.ts` is one flag for the whole module, and `src/sync/cloud.ts` hard codes `/api/save`. `src/main.tsx` builds
  one `Game` and one `CloudSync`. A `CloudSync` has its own 30 second timer and writes its own record.
- Signing out sets `signedIn: false` on the one `CloudSync`'s record (`sync.ts` `signOut`, and `failed` for an ended session).
- Settings opens for anyone, and tapping the version line 7 times opens the developer panel with no check (`SettingsPanel.tsx`).
  CLAUDE.md section 8 puts that panel behind an adult profile's PIN.

## 3. Decisions (mine unless it says owner)

1. **(owner) Profiles belong to the account, so more than one needs a sign in.** Signed out works as today: one game on the device
   (the first profile's), no picker. A family that wants kid profiles signs in once on each device.
2. **The first profile is the old "Player".** It is the lowest id on the account, an adult, and it can be renamed. It keeps the device
   keys `save` and `cloud` it has now, so nothing is moved and no old page or tab is cut off. Any other profile uses `save:<id>` and
   `cloud:<id>`. Signed out play is the first profile's game; the other profiles' games stay on the device, out of sight until the
   next sign in, so signing out never loses a game.
3. **A profile's kind (adult or kid) is chosen when it is made and does not change in this slice.** The first profile is an adult, so an
   account always has at least one.
4. **(owner) What the PIN lock does (slice 2).** An adult profile may have a 4 digit PIN; a kid never does. No PIN, no lock.
   - An adult profile that has a PIN asks for it every time that profile is opened: chosen from the picker, and also after a reload
     (the choice survives a reload, so a child cannot skip the keypad by reloading an adult's open game).
   - Settings: free in an adult profile (it was chosen already). In a kid profile Settings ask for any adult's PIN, but only if some
     adult has one.
   - Developer panel (tap the version line 7 times): only from an adult profile, and it asks that profile's own PIN if it has one. In a
     kid profile the 7 taps do nothing. This is CLAUDE.md section 8 word for word ("from an adult profile ... then enter that
     profile's PIN"); version 1 of this plan changed it by mistake.
   - Setting a first PIN is free, typed twice to catch a slip. Changing or clearing a PIN asks for the current one (the keypad
     checks it; the server does not).
   - **The lock has holes by design:** an adult profile with no PIN opens for anyone, kids included, from the picker. The lock only
     works when every adult profile has a PIN. Settings shows a warning line while a kid profile exists and an adult has no PIN. And
     a kid in an adult profile that has no PIN can set a first PIN on it and lock the grown-up out.
   - A forgotten or hijacked PIN is cleared by the owner in the D1 Console (section 9 has the statement).
5. **The PIN is a lock on the screen, not a security boundary,** and the docs say so. Anyone signed in as the account can change
   profiles through the API, and every signed in device holds the PIN hashes, so anyone with a device's storage can try all 10,000
   PINs offline; the wrong try wait below is client state and does not stop that. The PIN is stretched in the browser (PBKDF2-SHA256,
   random 16 byte salt, 200,000 rounds, a choice: fast enough for a keypad, the password uses 600,000), and the server keeps the
   resulting text and never checks a PIN (a server check needs more CPU than a free plan request has, and the lock must work offline).
   That differs from CLAUDE.md section 3 ("Adult PINs are handled the same way" as passwords, with a second salted hash on the
   server); see section 8 for the proposed wording.
   - Format: `pbkdf2$<rounds>$<salt>$<hash>`, salt 22 characters and hash 43 characters of base64url, rounds 100000 to 1000000. The
     server refuses anything else and the device refuses it when parsing, so a bad row cannot make a keypad hang.
   - Wrong tries: counted on the device in one record `pin-tries` (count and wait-until), not per profile. 5 wrong in a row make the
     keypad wait a minute, flat, with no escalation. The record survives a reload. A wait-until more than a minute ahead is treated
     as a minute (a clock set back must not lock the keypad for days). A try during the wait is refused even if right. The
     arithmetic, so nobody is surprised: 10,000 PINs at 5 tries a minute is about 33 hours to try them all, about 17 on average.
   - Changing a PIN has no compare-and-set: the last device to write wins, so a stale device can overwrite a newer PIN. Accepted
     for a household with two grown-ups.
   - The list of PIN hashes is read from the stored list, which refreshes at start, when the page comes back to the front, and when
     the picker or Settings opens. So a PIN changed on another device is used after the next of those.
6. **Names.** Trim spaces, make a run of spaces inside one space (so "Mia  B" and "Mia B" cannot both exist and look the same), and normalise to NFC; 1 to 20 code points (an emoji counts as one); only letters, marks, digits, space,
   apostrophe, hyphen and period (so no control or invisible characters, and no emoji in this slice); unique within the account
   compared as `name.toLowerCase()` after normalising. The server stores that comparison text in `name_key` (SQLite's own NOCASE only
   folds ASCII, so it cannot be the rule) and the device runs the same function to refuse early. At most 8 profiles per account.
7. **The picker** ("Who is playing?") shows at the start of a session when the account has 2 or more profiles, one big tile each
   with the creature's picture (from the game on this device; an egg if it was never opened here) and the name. It does not skip
   itself, so a shared tablet always asks. The tiles stay in the account's order (first profile first), so a tile never moves under a
   child's finger: "the last profile used is listed first" was in version 3 and was left out of slice 1. The choice is kept in
   `sessionStorage` (it survives a reload, is gone when the app is closed), read only when the device is signed in, and cleared on
   sign out and when a session ends. If `sessionStorage` cannot be written (a blocked or private window) the picker and the header
   button are not offered and the first profile plays; Settings says so (a note under the list of players). A header button opens the picker again. With one profile
   there is no picker and no button. One gap, on purpose: a signed in device that has no stored list for this account yet (the first
   start after the update, or right after signing in) opens the first profile as today, fetches the list, and shows the header button
   when it lands; the picker shows from the next start. Waiting for the list would need a timeout and a late picker.
8. **Switching = save, send, reload.** The open game is saved (awaited), `cloud.flush()` is started, the choice is stored and the
   page reloads. No second `Game` or `CloudSync` ever lives in one page, so there are no stale timers and no listener to swap. The
   send is best effort, not a guarantee: `flush` queues behind a send already running, the browser lets a request outlive the page
   only when the body is under 60,000 characters (`cloud.ts`), and a profile at revision 0 sends nothing on `flush`. Nothing is lost
   when it does not go: the profile stays marked as changed, and its `CloudSync` sends it the next time that profile is opened.
9. **Old pages keep working during the switch.** `GET` and `PUT /api/save` without a `profile` use the first profile, as now.
10. **Order of the owner's steps:** run migration 0003 in the D1 Console first (old code ignores the new columns), then merge right
    away. An account made in the gap gets a profile with an empty `name_key` (the old `createAccount`); the first `POST /api/profiles`
    on that account fills it in (section 4).
11. **One place says who is signed in: the device's `cloud` record (the first profile's).** A profile's own `cloud:<id>` record only
    contributes its `revision`, `savedAt` and `dirty`. When the shell builds a profile other than the first, it takes `username` and
    `signedIn` from `cloud` (so a stale `signedIn: false` in `cloud:<id>` cannot leave that profile unsynced), and when
    `cloud:<id>` does not exist yet (a profile opened for the first time on this device) it starts from `{ revision: 0, savedAt: 0,
    dirty: false }`. Without that, `CloudSync` gets no record at all and ignores every change. Sign in and sign out are offered only in
    the first profile (the other profiles show "Signed in as ..."). If a session ends while another profile is open, the shell writes
    `cloud` as signed out (read the record, change `signedIn`, write it back) and reloads into single player.

## 4. Server

Migration `0003_profiles.sql` (one Console paste, run once, section 9):
- `profiles.kind` text not null default `'adult'`, checked to `'adult'` or `'kid'` (every existing row becomes an adult).
- `profiles.name_key` text not null default `''`, then `UPDATE profiles SET name_key = lower(name)` for the existing rows (every
  account has exactly one profile, "Player", so no clash), then a unique index on `(account_id, name_key)`.
- `profiles.pin_hash` text, null when there is no PIN, checked `pin_hash IS NULL OR kind = 'adult'`. Present from slice 1 so the owner
  runs one migration; slice 1 never reads or writes it.
- `db.createAccount` also sets `name_key` for the new "Player" profile (`'player'`).
Checked 2026-11-22 with a scratch script on SQLite 3.51.2 (`node:sqlite`), 0001 and 0002 applied first and two accounts made: all
three `ADD COLUMN` statements, the `UPDATE` and the index are accepted; both existing "Player" rows read as adults with
`name_key = 'player'`; a kid with a PIN, a kind that is neither, and the same name key in one account are refused; the same name key
in two accounts is accepted; turning a profile with a PIN into a kid is refused. Whether D1's SQLite behaves the same is checked on the
live database in the owner's step (section 9).

Routes (a session is needed; writes are same site JSON requests with the small body cap, like the existing ones). A profile id that
is not the session account's answers 404, the same as one that does not exist.
- `GET /api/profiles` returns `{ profiles: [{ id, name, kind }] }` (slice 2 adds `pinHash`), the first profile first.
- `POST /api/profiles { name, kind }`: `kind` is required. First `UPDATE profiles SET name_key = lower(name) WHERE account_id = ?
  AND name_key = ''` (fills in a profile made in the migration gap), then one conditional statement `INSERT INTO profiles (...)
  SELECT ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM profiles WHERE account_id = ?) < 8`, in one `DB.batch`. One statement is atomic, so
  two devices cannot both make the 8th and 9th. `changes` of 0 means the limit (409 with its own message); a thrown unique error
  (`isUniqueViolation`, as `db.ts` does for usernames) means the name is taken (409); a missing `meta.changes` is a 500, never read
  as "limit". The answer is `201 { id, name, kind }`: the id comes from a `SELECT` on `(account_id, name_key)` after the insert,
  because the D1 types and the test stand-in (`functions/_lib/types.ts`, `tests/cloud-helpers.ts`) return only `changes`. The new
  profile starts with no save.
- `PATCH /api/profiles { id, name }` renames: `id` must match `^[1-9][0-9]{0,9}$`; `UPDATE ... WHERE id = ? AND account_id = ?` with 0
  rows changed answers 404 (not the account's, or missing); a name clash answers 409 (the unique error must be mapped here too, or
  `response.ts` turns it into a 500). Slice 2 also takes `{ id, pinHash }`, `null` clearing it. Unknown fields, an empty body, or a
  body that is not an object answer 400. The route's allowed methods (`wrongMethod`) are GET, POST and PATCH.
- `GET` and `PUT /api/save?profile=<id>`: `profile` must match `^[1-9][0-9]{0,9}$` and appear once, otherwise 400; without it, the
  first profile. The profile id goes through the id lookup (404 if not the account's). The ids go in the query (`/api/save`) or the body
  (`POST` and `PATCH /api/profiles`), never the path, so no dynamic route and no change to `Context` or the test helper's call.

## 5. Device

- `src/sync/local.ts`: `loadSave(key)`, `writeSave(save, key)`, `loadCloudMeta(key)`, `writeCloudMeta(meta, key)`, all defaulting to
  `save` and `cloud`. `readFailed` becomes a set of keys; an unreadable save is kept as `<key>-unreadable`. New keys: `profiles`
  (`{ username, list }`, so a list from another account is ignored) and `pin-tries`.
- `src/sync/cloud.ts`: `fetchSave(profile?)`, `sendSave(put, profile?)`, `fetchProfiles`, `addProfile`, `renameProfile`. The `Api`
  object handed to a `CloudSync` is bound to its profile's id; `CloudSync` itself does not change.
- `src/ui/game.ts`: `Game` takes the key it writes to (default `save`). The tests that mock `writeSave` change with it.
- `src/sync/profiles.ts`: the profile types, the shape check for what the server sends, the name rule, and in slice 2 the PIN
  functions (make a hash, check a PIN, the wrong try record).
- `src/main.tsx`: reads the device's account record (`cloud`) and decides in this order: not signed in, the first profile; signed in
  with a stored list for this username, the profile in `sessionStorage` if it is on the list, else the picker when there are 2 or
  more, else the first; signed in with no stored list, the first profile (decision 7). It builds the one `Game` and `CloudSync` with
  that profile's keys and the record rules of decision 11, wraps every `sessionStorage` call in try/catch, and refreshes the list in
  the background (triggers: start, the page coming back to the front, the picker or Settings opening, and a sign in). If a profile
  other than the first sees the session end, it does what decision 11 says.
- `src/ui/Picker.tsx`, and in `src/ui/PlayersSection.tsx` the "Players" part of Settings (list, add, rename) and the header button, and in
  `AccountSection.tsx` the account part of Settings: the
  sign in form, "Sign out" and the sign up form show only in the first profile; other profiles show "Signed in as ...".
- Slice 2: the PIN keypad component and the Settings and developer panel checks.

## 6. Edge cases to test (written before the code, as the working rules ask)

Profiles and saves (server)
- A profile id from another account on every route, `?profile=` and PATCH (404, and nothing written or read).
- `profile` values: missing (first profile), empty, `abc`, `1.0`, `-1`, `0`, `01`, 11 digits, repeated twice, `1e3`.
- Names: empty, spaces only, 21 code points, exactly 20, 19, a name that differs only by case, `Ślimak` against `ślimak`, a zero
  width space, a right to left override, a control character, an emoji (refused in this slice), an apostrophe and a hyphen
  (accepted), leading and trailing spaces (trimmed, then compared), the same name in two different accounts (accepted).
- The 8th profile (accepted), the 9th (refused), two creates racing at 7 (exactly one wins), two creates with the same name
  racing (one 409).
- `kind` missing, `kid`, `adult`, anything else. Unknown fields, a body that is not an object, a body over the cap.
- `POST` answers `201` with the new `id`; `PATCH` renaming to a name another profile of the account has (409, not 500), renaming to
  its own name in another case (accepted), a profile id of another account (404), `id` as a string, `0`, negative, 11 digits, missing.
- A profile made while the old `createAccount` ran (empty `name_key`): the next `POST` fills it in, and `Player` is then refused as
  a second "Player".
- `changes` missing from the database answer on the conditional insert: 500, not "limit".
- `GET` with the wrong method on `/api/profiles` answers 405 with `Allow: GET, POST, PATCH`.
- `PUT /api/save` for profile A never changes profile B. Two profiles of one account sync independently, each with its own revision.
- An account made under migrations 0001 and 0002 and then migrated with 0003: its one profile reads as an adult with name_key set
  (the test helper learns to stop at a migration number). `createAccount` after 0003 sets `name_key`.
- Old client: `GET`/`PUT /api/save` without `profile` still hit the first profile once other profiles exist.

Device (state kept in step between devices, so the passive device comes first)
- A tablet left open and idle on kid A while the phone plays kid A: the idle one must not overwrite (same rule as today, per profile).
- A tablet open on kid A while the phone renames kid A: the new name appears after the next list refresh; the game is untouched.
- A profile made on the phone appears on the tablet at the next list refresh (start, page back to the front, picker or Settings open).
- A profile that is dirty on this device but not open (a failed send before switching): it sends when it is next opened. State
  that this is the accepted behavior and test that nothing is lost in between.
- Switching with a send on its way, with a write to IndexedDB on its way, and twice in a row. After the reload the old profile's
  game and record are exactly as saved.
- A profile opened for the first time on a device when the account already has its game: the account's game is taken without asking
  (an untouched egg adopts it, as a new install does).
- The first profile: its keys stay `save` and `cloud` (no key moves), a game saved before the update is still there after it.
- Signed out: single player on `save`, no picker, no header button, and the first profile's game is the one shown even though the
  device had been playing another profile.
- Sign out in the first profile: signed out on this device (the logout route ends this browser's session only), single player, the
  `sessionStorage` choice cleared. The other profiles' local games stay under `save:<id>`.
- A profile with no `cloud:<id>` record (made on the phone, opened for the first time here; or the phone's own first open): it starts
  from revision 0 and takes `username` and `signedIn` from `cloud`, then pulls and pushes like any profile (a change by the player
  marks it dirty and arms the timer; the account's game is adopted when this device's is an untouched egg).
- A stale `signedIn: false` in `cloud:<id>` after the session ended there, then the first profile signs in again: opening that
  profile syncs (the shell takes `signedIn` from `cloud`).
- Sign in or sign out offered in another profile: not offered (the form and the button are absent).
- `sessionStorage` throws or is full: the page still loads, the first profile plays, the picker and button are not offered.
- A signed out start with a leftover `sessionStorage` choice: ignored (not signed in comes first), single player.
- A signed in device with no stored list: the first profile opens, the list is fetched, the header button appears when it lands, the
  picker shows at the next start. A stored list tagged with another username counts as no list.
- Sign in during a session in the first profile triggers a list refresh.
- A first-profile window left open from before a session ended in another profile: its next player action writes `cloud` from its own
  copy (`signedIn: true`) and it learns the session ended at its next server call. Known and accepted (the same two-window behavior
  as today); the shell's own write of `cloud` reads the current record first, so it never drops other fields.
- Switching when the open profile is at revision 0, or when its save is over 60,000 characters (no keepalive): nothing is lost, the
  profile stays dirty and sends when it is next opened.
- **Existing behavior on `main` that this plan leans on, not fixed here:** a change made while signed out is never marked dirty
  (`CloudSync.noteSave` ignores it), so signing in again as the same account while another device has saved since makes the
  account's newer game replace the signed out play, with no backup (by reading `sync.ts`, not reproduced). Signed out play is the
  first profile's game, so profiles make this slightly easier to meet. A section 8 question asks whether to fix it separately.
- Sign in as the same account again: the picker and the other profiles' games are back. Sign in as a different account: the stored
  list (tagged with the old username) is ignored, the new account's list is fetched, and the first profile follows today's "which game
  to keep" question.
- A session that ends while a profile other than the first is open: the shell signs the device out and reloads into single player.
- The device starts offline: the picker is built from the stored list; an offline start with no stored list is single player.
- The list fetch answers 500 or malformed (migration 0003 not run, or a bad row): the stored list stays, nothing breaks, Settings
  says the players could not be loaded.
- The stored list names a profile id the server does not know (404 on its sync): the game stays on this device and the error shows;
  nothing is deleted. (Removal is not in this slice, so this only happens after manual database work.)
- Two devices create the same name at once: the second gets the clear 409 message and no profile.
- One unreadable `save:<id>`: that profile starts as an egg and keeps the unreadable copy; the other profiles still write.
- A layout check by script, not by eye: every name up to 20 wide characters (`WWWWWWWWWWWWWWWWWWWW`) measured against its picker
  tile and the Settings list row at 320, 360 and 390 px, `scrollWidth <= innerWidth` on the picker, the header with the new button
  and Settings at each width, and one contact sheet of the variants looked at before the tests are written.

The PIN lock (slice 2; a gate: whatever passes it lets an action go ahead, so each case is a test)
- PIN text: exactly 4 digits accepted; 3 and 5 digits, empty, spaces, letters, `0000`, `0042` (leading zeros survive), a pasted value
  with spaces (refused), never turned into a number.
- A wrong PIN 4 times then the right one (works, count cleared); 5 wrong in a row (waits); the 6th try while waiting is refused even
  if right; right after the wait; a reload during the wait (still waiting); the clock set back (the wait is at most a minute); the
  same record serves every profile.
- An adult profile with a PIN asks again after a reload (the `sessionStorage` choice does not skip the keypad); an adult without
  a PIN does not ask. Setting a first PIN needs it typed twice (a mismatch sets nothing).
- Each rule of decision 4, both ways: an adult with a PIN is asked when opened; an adult without one is not; a kid profile's Settings
  ask when any adult has a PIN and not when none has; either of two adults' PINs opens Settings in a kid profile; Settings in an adult
  profile are free; the developer panel in an adult profile asks that profile's PIN (and not when it has none); 7 taps in a kid profile
  do nothing; a kid profile cannot be given a PIN (server refuses, database check refuses); changing or clearing a PIN asks for the
  current one; setting the first PIN is free.
- The warning line shows exactly when a kid profile exists and an adult has no PIN.
- `pinHash` shapes: valid, wrong prefix, rounds 99999 and 1000001, salt or hash too short or too long, characters outside base64url,
  an empty string, a very long string, `null` (clears it). A hash made with another rounds value still checks.
- The PIN and its hash never appear in a log line or an error message.
- A PIN cleared or changed on a second device: the first device uses the new state after its next list refresh; a keypad that is open
  while the list refreshes checks against the new hash.

## 7. Slices and gates

- **Slice 1: profiles without PINs.** Migration, routes, device keys, the shell, the picker, the header button, the "Players" part
  of Settings (list, add, rename), tests for the section 6 groups above, the layout script and contact sheet, a mutation run on every
  new guard, a cheap-model review before any test runs, and an end to end run with `wrangler pages dev` and a local D1 (two profiles,
  switching, a second window, the first profile's game surviving the update). Everyone is allowed in Settings, as today.
- **Slice 2: PINs and the lock.** Migration is already done. `pinHash` on the routes, the keypad, the hashes, the checks, the wrong
  try record, the section 6 PIN cases.
- Later, own slices: removing a profile, changing a profile's kind, soften mode (needs the soft looks decided), play limits and quiet
  hours, the family Creature Book, history.

## 8. To decide before slice 1 (owner)

1. Profiles need a sign in, and a signed out device stays single player (the first profile's game). OK?
2. The PIN lock as written in decision 4: an adult profile with a PIN asks on every open, including after a reload; Settings and the
   developer panel as listed; and the holes (an adult with no PIN opens for anyone, and a kid there can set a PIN and lock the grown-up
   out until you clear it in the Console). OK, or should Settings also be locked inside an adult profile?
3. A header button for "switch player". OK, or only through Settings?
4. Slice 1 first (no PINs), then slice 2 as a separate pull request. OK?
5. Removing a profile and changing adult or kid are left for later slices. OK?
6. Separate from profiles: play done while signed out can be overwritten when you sign in again and another device has saved since
   (section 6, "existing behavior"). The fix is small (mark signed out changes as changed, so the existing "which game to keep" rules
   decide). Fix it in its own pull request, or leave it?

Two edits to this project's CLAUDE.md for the owner to approve (not applied):
- Section 3, the sentence "Adult PINs are handled the same way." becomes: "Adult PINs are a screen lock: stretched in the browser, stored
  as text on the profile, and never checked by the server."
- Section 5, `profiles (account, name, adult or kid, optional PIN hash, soften mode, settings)`: settings stay inside the save for now
  (sleeping hours), and soften mode comes with its own slice.

## 9. What the owner does in Cloudflare (written out with the build, in the style of docs/cloud-saves.md section 6)

Numbered steps, about 5 minutes, before merging slice 1:

1. Cloudflare dashboard, Storage and Databases, D1, `broodkeep`, Console tab.
2. Paste the SQL text of `migrations/0003_profiles.sql` (open the file and copy its text: the first lines are `--` comments, then
   three `ALTER TABLE profiles ADD COLUMN ...` lines, an `UPDATE`, and a `CREATE UNIQUE INDEX`; pasting the file name does not work) and run it once.
   Old code ignores the new columns, so running it before the merge is safe.
3. Check it: run `SELECT id, name, kind, name_key, pin_hash FROM profiles;`. Every row should show `adult`, the name in lower case under
   `name_key`, and an empty `pin_hash`.
4. Merge the pull request, wait for the deploy, then open the live site: the sign in goes to the "who is playing" screen only when the
   account has more than one profile; add a second profile in Settings, Players, and switch to it.
5. If the console shows `duplicate column name` the migration already ran: do not run it again, go to step 3. If it stops partway with any other error,
   stop and tell me the exact text; do not run the pieces by hand. Never run `wrangler d1 migrations apply --remote` afterwards: Wrangler's
   tracking does not know about a Console paste.

To clear a forgotten PIN (from slice 2 on; nothing writes `pin_hash` yet): Console, `SELECT id, name, kind FROM profiles;` to find the id,
then `UPDATE profiles SET pin_hash = NULL WHERE id = <id>;`.

## 10. Review log (2026-11-22)

A cheap-model reviewer read version 1 against the code and CLAUDE.md and returned 25 findings (its section 2 check found no wrong
statement of fact). I checked the central ones in the code before acting (`writeSave` writes only `save`; `cloud.ts` hard codes
`/api/save`; the first profile is the lowest id; `CloudSync` keeps its own timer; sign out changes one record). What changed:
- No key move (findings 1, 7, 9, 10): the first profile keeps `save` and `cloud`; other profiles add keys; lists are tagged with the
  username.
- Switch by reload (6, 8): no second `Game` or `CloudSync` in a page; `Game` and `local.ts` take a key; `cloud.ts` takes a profile.
- First profile protected, removal and kind change deferred (2, 11, 12 partly): fewer races; the 8 profile limit and the name
  clash use one conditional write each (12), with a 409 mapping.
- Lock rules rewritten (3, 4, 15, 16, 24): the hole is stated, the developer panel follows CLAUDE.md section 8, changing a PIN asks
  for the current one, the wrong try record has a place and rules, the picker never skips itself.
- PIN storage stated honestly with a fixed format (13, 14); two CLAUDE.md edits proposed (13, 25).
- Names (17), route details (18), the pre-0003 test (19), the missing device cases (20), the layout script (22), the owner steps (23).
- Size (21): drop the move, switch by reload, defer removal, ship slice 1 without PINs. Kept as the owner decided: a PIN per adult
  profile, and the header button stays a question (3 above).

Second review, of version 2 (15 findings, same day). I checked these in the code before acting: a profile with no `cloud:<id>`
record gets a null record, so `CloudSync` ignores every change (`sync.ts` `noteSave`, `current()`); `keepalive` needs a body under
60,000 characters (`cloud.ts`); a change made while signed out is never marked dirty; the sign in form shows in whichever profile is
open (`AccountSection.tsx`). What changed in version 3:
- Sign in state has one authority and a missing record has a rule (decision 11, section 5); sign in and sign out only in the first
  profile (findings 1, 4, 12).
- The start rule is in a fixed order, with a rule for a missing list and for `sessionStorage` failing (3, 6).
- Wording that contradicted itself fixed: who may add and rename in slice 1, "never hides a game", "signed out everywhere" (7).
- An adult profile with a PIN asks on every open, so a reload cannot skip it; the first PIN is typed twice; the kid-locks-the-adult
  hole is stated; the guess arithmetic and last write wins are stated (8, 9, 13, 14).
- The real guarantee of a switch is written down (10).
- Server contracts written: the answer and id of `POST`, the 404 and 409 of `PATCH`, the allowed methods, the one statement for the
  limit, the backfill for the migration gap (5, 15). Not verified against D1: how it reports `changes` for `INSERT ... SELECT`, and
  its error text for the composite unique index; the owner's live check covers them.
- Finding 2 (signed out play can be overwritten) is existing behavior on `main`, not part of this slice: noted, and a question for
  the owner (section 8, question 6).
- Finding 11 (size): kept the kind choice at creation (it cannot change later in this slice and slice 2 needs it); the header button
  stays an owner question; nothing else cut.

Slice 1 review (2026-11-22, a cheap-model reviewer on the built diff, 14 findings; it ran nothing). I checked each against the code and the
browser run before acting. Fixed, each with a test that failed before the fix:
- `loadSave` marked a key as unreadable on one failed read and never cleared it, so a failed read for a picker picture could stop that
  profile's game from saving for the rest of the page (`tests/local-storage.test.ts`, with a small IndexedDB stand-in).
- `Roster.account` kept the previous account's list and open profile when another account signed in on the same page; `add` and `rename`
  with no list would have stored a one item list as the whole list. Both fixed, with tests.
- The picker could start two games on one key from a double tap (guard in `main.tsx`; the browser run counts the seed draws of a single
  and a double tap and needs them equal).
- Settings did not say why there was no chip and no picker when `sessionStorage` is blocked, and a list fetch that answered with an
  error was silent when a list was stored. Both fixed as the plan says.
- The two "exactly one wins" tests could not fail on a count-then-insert regression: the D1 stand-in finishes one request before the next
  starts. `slowReads` (tests/cloud-helpers.ts) makes each read answer late; the mutant now fails on its own assertion. PATCH now has the
  same bad-name table as POST, and a test title that claimed more than it checked was split.
Changed in the plan, not the code: the picker order, the space rule and the shape of `GET /api/profiles` above (the code was right and
the plan said otherwise or less). Not fixed, written in known-issues.md: reloads do not wait for the "changed" mark's write, and the
shell (`main.tsx`) has no unit test; the browser run covers it.

Second review, of the fixes (8 findings, all checked). Fixed with tests that failed first: the answer to an add or a rename was applied to
whatever list was current when it arrived (another account's list, a list that already had the new player, no list); the number rule
let in superscripts, fractions and numerals (`\p{N}`) where the plan says digits (now `\p{Nd}`); a test title said a list is hidden on
sign out but did not check it. Fixed in the docs: three lines of sections 4 and 5 named the wrong file, function or place for an id. Moved:
the same-name race test now sits with the names. Not done: a width check for the rename label in the repo (the browser run measures it,
and its script is not in the repo). Equivalent mutant noted: the "no list" half of the stale-answer guard cannot be told apart from the
"someone else signed in" half, because changing account always drops the list.

