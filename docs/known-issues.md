# Broodkeep known issues and gotchas

> 2026-11-21: sections below that talk about the 20 forms, the old evolution tree, the old 16 to 32 pixel sizes or the 96 pixel
> room are history. The Paradise growth design (docs/paradise-plan.md, milestone 3) replaced them; the live list is
> "Paradise growth, game side" at the end of this file.

## Cloudflare Pages

- **`_headers` does not apply to Functions responses.** Only static files get them. `functions/_lib/response.ts` must set
  `Cache-Control: no-store`, nosniff and the other security headers itself.
- **Unknown paths return `index.html` with status 200.** Seen live: `/api/anything` returns the placeholder page. Once
  Functions exist, unknown API routes should return a JSON 404.
- **"Retry deployment" rebuilds the OLD commit.** After merging a fix, look for the new deployment for the merge commit.
  Retrying the failed row fails the same way (seen 2026-11-20: `Cannot find cwd: /opt/buildhome/repo/creatures`).
- **Two setup flows.** The Workers flow shows a "Deploy command" box (`npx wrangler deploy`). The Pages flow does not.
  This project is Pages. If you see a deploy command, you are in the wrong flow.
- **The project builds from `main`.** (At the first build the game sat in `creatures/`, which had to be on `main` before the build could pass; since 2026-11-22 the game is at the repo root.)
- **Renaming the GitHub repo does not rename the Cloudflare label.** The old project kept showing `kharbranth`. Cloudflare's
  docs do not cover renames. Moot now, the old project was deleted.

## Phase 1 game (accepted for now)

- **Dev mode has no PIN.** Settings, then tap the version line 7 times opens it. The plan wants an adult PIN, but accounts
  and PINs arrive in Phase 5. Until then a child can open it.
- **Food and medicine are unlimited.** There is no inventory until the habitat and crafting phases.
- **Bedtime uses the device clock** (`hourOf` uses local time). Travelling or changing timezone moves bedtime. Revisit
  with profiles in Phase 5.
- **Off-grid `bornAt` on a tap hatch.** `tapEgg` calls `hatchIfReady` with the tap's exact time, so a hatch by tap can
  stamp `bornAt` between simulated minutes. Under a minute, harmless, but it is the one place "identical save however
  time is split" is not strictly true.
- **The egg has no visible "tap me" hint.** Only the screen reader label says it. Easy to add if testers do not find it.
- **Desktop shows the phone column** (480 px max). Real desktop layout is Phase 7 in the plan.
- **The call bubble blinks** (hidden half a second in every two). Intended. Ask testers whether it feels nagging.
- **Not usable without touch or a mouse (accessibility, reported by the review, not built).** In the egg phase the only
  way to help it hatch is a pointer on the canvas. Petting and tickling also need a pointer. The food tray comes before
  the Feed button in tab order and focus does not move into it. Settings and Dev panels have no Escape key, no focus
  return to the gear and do not block the page behind them. Fine for a phone game, worth doing in Phase 7.
- **Dev "Hatch this form now" and "New egg" replace a living creature without asking.** Dev only.

## Emotes (accepted for now)

- **"Squash" is really a one pixel shift.** `drawSprite`'s `height` option drops whole rows, and these sprites have an
  empty bottom row, so the awake breathing bob and the chewing bob are just the sprite moving down one pixel. Real squash
  frames would need hand-drawn pictures, which Phase 2 did not add (the emotes stay derived from one picture per form). The lying-down picture is separate and is a true flat shape.
- **One meal at a time.** Feeding again during a meal replaces the food on the floor and restarts the eating.
- **The mouth only changes for a yawn.** A sad creature has the same small mouth as a happy one, the sadness is in the
  heavy eyelids, the slump and the tears. Eyes only look up (at falling food) or stay as drawn, there is no looking around.
- **The slumped yawn mouth is a wide red oval** (the mouth grows with the widened body), and reads as a small plus sign at
  a glance. Hand-drawn frames would fix it.
- **Sick shows as droop, green tint and sway.** There is no separate "sick" face, and a sad and sick creature look alike
  apart from the tears.
- **The feelings use fixed cut-offs** (hungry under 25, sleepy under 25, sad under 30), the same idea as the red part of the
  stat bars. They are in `moodOf` in `scene.ts`.
- **The blanket sits on top of the bed,** it is a pink rectangle, not a drawing that follows the creature's shape.
- **Happy eyes last only as long as the happy hop (0.8 s).** That is when the look shows, so after a meal, a pet, a
  clean, a cure, a hatch or an evolve it is a short flash of joy, not a lasting mood. The hatch and evolve scenes draw
  their own open-eyed picture, so the arches show after the pop, not during it. On a sad creature the happy look is
  slumped and has no tears while it lasts (that is drawing code in `scene.ts`, so no test covers it). Checked as stills (all 20 forms, standing and slumped) and in a headless phone
  browser after a meal, not on a real phone.

## Phase 2: forms, tree and scenes (accepted for now)

- **Most Champion and Ultimate paths cannot fire in normal play yet.** Their rules use training, battles, jobs and trained
  stats (strength, defense, spirit) and discipline, which do not exist until Phase 3 and later, so those numbers read 0.
  Today a creature takes the rules that use care mistakes, feeding and happiness, and otherwise the fallback path. Dev mode
  can set the missing numbers (Dev panel, "Numbers for later systems"). The tree viewer marks every such rule "not in the
  game yet".
- **A fully attentive player gets the same few forms.** With care alone: Blip or Drip, Pip, then Fennix or Mothlet,
  then Lumiwing, then Aurelith. The other branches need Phase 3 or neglect.
- **All numbers in the tree are first guesses** (thresholds, and 6, 24, 72, 120 hours per stage from the plan). Example: a
  baby can only eat about 3 to 4 foods in 6 hours without candy, so "lots of feeding" (5 foods) needs a little candy.
  Tune them in the form files after real play.
- **Discipline has no way to rise.** The stat exists and the tree reads it (Citadrake), but nothing changes it, so it sits
  at 50 unless dev mode moves it.
- **Some pictures are plain.** Thornback's spikes are small, Smudge reads as a grumpy blob more than smoke, and Bastion and
  Citadrake have blocky towers. Checked as stills only. All 20 were also checked standing, sad and asleep in the room.
- **The hatch and evolve scenes have no automated drawing tests.** The timing and state are tested, the drawing was checked
  by eye on frames from a headless phone browser, not on a real phone. They do not stop for `prefers-reduced-motion`, like
  the rest of the canvas motion. The flash is one fade at 80% white, and the old form flickers 2 to 5 times a second.
- **An evolution while the app was closed plays its scene when the app opens,** from the form on screen when it was last
  open to the form it is now. If it grew through two stages while away, the scene shows the first form turning into the last.
- **A creature that evolves in its sleep gets no scene,** it simply is the new form when it wakes. Dev "Hatch this form
  now" and "Evolve to it" play the scenes (handy for looking at them), except "Hatch" on a dead creature.
- **Drip reaches Nubbin only through training** (the plan's line for Drip), so until Phase 3 a Drip becomes Pip or Smudge.
  Blip can also reach Nubbin by lots of feeding.

## Creature redesign (accepted for now)

- **Big creatures look small in bed.** The bed is 32 wide and a lying Champion or Ultimate fills it. The pink blanket starts
  at the mouth row, so on the tall designs it covers most of the body and only the head, ears, horns or wings show. Fine for
  a sleeping monster, but a bigger bed or a blanket that follows the body would look better (Phase 4 redecorates the room).
- **Big creatures have less floor.** A 32 pixel creature walks over 38 pixels of the 96 wide room and often stands in front
  of the bed. Food is still an 8 pixel icon on the floor beside it, which reads small next to an Ultimate.
- **Lying and slumped are squashed copies.** `lieDown` drops rows and doubles columns at even spacing, so detailed designs
  (Citadrake's towers, Aurelith's wings, Hollowking's staff) get flatter and a little distorted. All 20 were checked on a
  contact sheet in every look. Hand-drawn lying pictures would fix it.
- **Shut eyes can be hard to see.** Only the happy arch has a contrast rule. By a rough measure (the dark shut-eye line
  against the pixel above it) seven forms are under 3 to 1: Shellby, Mothlet, Pyrefang, Thornback, Citadrake, Dreadmaw and
  Hollowking. On Shellby, Mothlet and Hollowking that pixel is outline, so the shut eye merges into it. Not looked at in
  the room beyond the contact sheet.
- **Dreadmaw and Hollowking yawn into a dark oval,** because their `M` pixels are colored like the surface they sit on. It
  showed as a dark oval on the contact sheet (not looked at in the room).
- **No automated test covers the drawing.** `scene.ts` and the drawing parts of `moment.ts` were checked by eye in a
  headless phone browser (all 20 forms standing, sad, asleep, plus hungry, eating, petting, sick and dead for five), not on
  a real phone. The motion itself (two drawings swapping every half second, a step each quarter second) is untested as
  motion: the owner should judge whether the pace feels right.
- **A sleeping creature's tap area is the standing square** at the bed spot, bigger than the lying body. A tap above the
  lying creature still counts.
- **The two babies have no second drawing,** so they only bob. They were not redrawn.

## Phase 3 slice 1: the habitat (accepted for now)

- **Coins and materials have no use yet.** Coins first buy habitat upgrades in slice 3; materials are used by crafting in
  Phase 4. They are only collected and shown in the bag.
- **A job pays up to a minute after its bar fills,** because the simulation moves in whole game minutes and a job can start
  between two of them.
- **A creature out at night looks awake and working** in the habitat even though care has put it to sleep, and it pays when
  it gets home. A creature at home at night is not drawn outside: a bubble says it is in bed.
- **A job already out is not stopped** by night or sickness (the checks are made at set-off, and a job is at most 8 minutes).
  A creature that dies on the way pays nothing and the job stays on the dead creature.
- **A welcome-back card that was never dismissed** can show later on an egg or after a death. The coins are already banked.
- **The habitat's night tint follows the clock** (night is 8 pm to 5 am, like the room window), not the sleeping hours in
  Settings.
- **A big creature covers the spot it works at** (a 32 pixel creature is a third of the picture). The progress bar sits on top.
- **Tapping the habitat picture does nothing;** the spots are the buttons under it. The picture has a text description for
  screen readers, but not per spot.
- **The creature's calls are not shown in the habitat,** and while it is out a hungry or dirty creature cannot be cared for
  (call it back). A job is at most 8 minutes against a call patience of 60.
- **The drawing code is only tested for placement** (`tests/habitat-art.test.ts`: boxes inside the picture, no overlaps, no
  spot covered at home, the lock). How it looks was checked in a headless phone browser, not on a real phone.
- **Dev mode cannot set chores below the real count** (it stores the difference above it).

## Phase 3 slice 2: combat and the arena (accepted for now)

- **A fight is not saved.** Closing the app, reloading or tapping Run away in the middle of one forgets it. The energy spent to
  start it stays spent and nothing else changes (no coins, no HP lost, no `battles` count).
- **The checks are made once, when the fight starts.** A creature that falls asleep or sick in the middle of a fight keeps
  fighting. Only a death or an evolution ends it.
- **The boss is close to out of reach untrained, and trained to the cap everything is easy.** Simulated win rate by rung for an
  untrained creature at full HP is 97 to 100%, 79 to 91%, 52 to 68%, 13 to 21% and 1 to 5% for the boss; with the three stats at
  the stage cap it is 98 to 100% at every rung (see decisions.md). All numbers are first guesses.
- **The only way to train a stat is to win fights** (1 point a win, 2 for the boss, in the stat of the action used most). There is
  no Train action, so the `training` evolution metric still reads 0 and the paths that need it (Blip and Drip to Nubbin, Smudge
  to Gruntle) are not reachable without dev mode.
- **Discipline never rises,** so the sulk rule (a creature ignoring a command) is dormant at the starting 50, and the paths that
  need discipline 60 (Thornback and Bastion to Citadrake) are not reachable without dev mode.
- **The wild creature can be the same form as the player's** (a mirror match). Its picture is the same, flipped, with a red tint
  on the boss.
- **A material from a fight is always 1 of a kind** the creature's stage can gather. Like coins, nothing uses it yet.
- **The picture says HP and the meter with bars and pips only,** no numbers, and the screen-reader text gives each side's HP
  percent when the screen next redraws (after a round, not during its blows).
- **An evolve scene is not drawn on the arena or habitat screen,** so a creature that evolves while the player is there changes
  form without the scene.
- **The result is paid when the last round is played,** a moment before the picture finishes showing the last blow. Closing the
  app in that moment keeps the result.
- **The drawing code is only tested for the timeline and the placement** (`tests/arena.test.ts`: the order and timing of a round,
  the HP replay, the fighters inside the picture and never overlapping). How it looks and moves was checked in a headless phone
  browser as still frames, not on a real phone, and the pace has not been judged as motion.

## Backend (Phase 5)

- **PBKDF2 iteration cap.** Workers is reported to cap PBKDF2 at 100,000, below the OWASP figure of 600,000 for SHA-256.
  Not confirmed in a primary source. Check before choosing the number.
- **Safari and Secure cookies on http://localhost** may be refused. Test login in Chrome or Firefox locally.
- **The newest touch wins, even a touch that changes nothing** (found 2026-11-22 by a review of the signed out fix). `Game.act` marks a
  player change for any tap, so petting a sleeping creature or cleaning a clean one makes that device's game "newer", signed in or
  (since 2026-11-22) signed out. If another device played later but this one is touched after, this device's older game wins at the
  next sync and the other game goes to the account's backups, which no screen can restore yet. Fix when it matters: have `act` count a
  change only when the save actually changed, and show the backups to restore from.

## Tooling

- **`npm audit`: 4 moderate warnings** (2026-11-20), a `minimatch` denial-of-service advisory in dev tooling. Not in the
  shipped bundle. Re-check before Phase 5.
- **The dev server has no security headers.** Running `npm run dev` does not apply `public/_headers`. Use `npm run build` then
  `npx wrangler pages dev dist` to see the real headers.
- **Phone screenshots with Playwright.** Playwright 1.65.1 wants a chromium revision that is not installed here, so pass
  `executablePath` for a cached one. `page.clock` fakes JS timers and `Date` but not CSS animations, so wait in real time
  (about 450 ms) after opening a panel or a half faded screenshot results. `clock.fastForward` rejects `72:00:00`, pass
  milliseconds.
- **Pixel drawings end in two outline layers.** In `tools/art/bk.py`, `put(ring=True)` rings each part and `outline()` rings the
  whole drawing, so a part ends up with a 2 pixel dark edge and a drawing that fills its canvas has outline pixels on the
  canvas edge. That is fine. A part is cut off only if a non-outline letter sits on the edge. The Python sample scripts
  (session scratch folder) draw an unknown palette letter as magenta without complaint, so check that every letter used is in
  the palette before looking at a sheet. Odd-width faces or mouths on an even-width canvas sit half a pixel off centre.
  `tools/art/paradise/lib.py` now enforces these: a missing palette letter, a cut-off edge, a detached piece of any size (not
  joined up, down, left or right to the biggest piece), a face piece that lands off the picture (`Canvas.px` drops those
  silently, so `put_face` raises), and a mouth that is not centered, custom `x` included. A custom mouth gives its own `x` and
  must still have equal margins, so draw a jaw or beak symmetric about the picture's middle line: teeth must stay on columns the
  cavity has (Murkfang's first jaw had one tooth column too many and sat half a pixel right).
- **Art library gaps left on purpose** (2026-11-21, cheap-model review): a custom mouth with no `rows` key, or a face-patterns
  look with no `eyes` key, can still crash the checks with a `KeyError` instead of a report, and custom mouths are not checked
  for face letters (their other letters are caught by the palette check). Only the Paradise art scripts write these, so a
  traceback is acceptable. Fix them if a second person ever writes creature files.
- **Land art, seen in the blind reviews (2026-11-21).** (1) The sad look reads mainly through the 2 pixel blue tear, and on
  grey or blue-grey bodies (Moonlop, Gutterfang, Tuskmole) it is faint; a body-specific `tear` color through `with_face` fixes
  one creature without touching the face system. (2) Frame two of every drawing is a small accent (an ear, a tail, a claw), on
  purpose: `idle.ts` already bobs and squashes every sprite. (3) The nine creatures drawn before milestone 2 (Gravelhorn and the
  Water and Sky creatures) place feet claws with `int(x + cx - 1)` from a left-side formula, so the right foot's claws are a
  shifted copy of the left one's, up to 3 px off a true mirror. The new files use `sym()` for them. The nine are not changed
  because the owner has seen them. (4) Mossheap's fringe and Needlecap's needles were off by one from a mirror before the
  review; both now mirror about the middle.

## Paradise growth, game side (accepted for now)

- **A creature in a field walks only the left part of the picture.** The walking limit is shared with the room (`walkRight` 84, so
  food never lands on the bed), so the right side of the Land field (the arch and the bog) is never reached.
- **The field is always dusk.** The room follows the clock, the field picture does not.
- **A tap on a locked field only makes the creature shake its head.** The habitat's spots show a small icon saying why; the
  picker does not. The lock badge on the button is the only explanation.
- **The wall rule for food cannot be reached any more.** `startEating` turns the creature away from a wall closer than 8 pixels,
  but the walking area now stops at 8, where the food just fits. The test uses x = 4 to check the rule itself.
- **The new screen code has no automated test.** The places tray, the field drawing and the Stage hookup were checked with
  Playwright screenshots of the running game (a script in the session scratch folder, not in the repo). The placement numbers, the
  field data, `goTo` and the face stamping are tested.
- **Icons are placeholders.** The signpost, Land, Water and Sky icons and the redrawn pellet and treat are 8 x 8 and crude.
- **`emit_ts.py` needs Pillow** (the field is drawn with it). `selftest.py` skips its field cases without it.
- **A job does not send a creature home from a field.** `startJob` and `callBack` leave `place` alone, so after the job the
  creature is back in the field it left and its field minutes count again. Bedtime and naps do send it home. The owner chose to
  leave it this way (2026-11-21), so it is a decision, not a gap.
- **The dev tree's option lists have no `key`s.** No visible effect in Preact for these short, fixed lists.
- **A field with no picture would show the room.** `drawField` returns false for a field without a picture and the room is drawn. All
  three fields have one now, so nothing tests that fallback (the old test of it checked nothing once Sky opened and was rewritten).

## Paradise Water slice (accepted for now)

- **The Water names and animals are my choice** (plan section 4); the owner has not been asked. A redraw or rename is cheap until
  Sky starts.
- **A creature in the Water field walks only the left part of the picture**, like the Land one (the shared `walkRight` 84), so the
  ruined arch and the glowing anemones on the right are never reached. The Water picture is always the same light (no clock).
- **The JavaScript grew from 205.6 KB to 319 KB** with the 21 Water forms (64.6 KB gzipped). All three fields will be about 430 KB
  (an estimate). See plan section 7.
- **A face mirrors about the picture's centre column.** The anchor gives the left eye and the right eye is the mirror, so a head
  that is not centred on x = 24 gets a right eye outside the body (`lib.problems` reports it). Wilteel's head is centred and its
  body trails to one side for that reason.
- **The three new food icons are 8 x 8 placeholders.** The shrimp (a curled red body with orange stripes) is the weakest; at that
  size it is close to a bird.
- **Some Water drawings read ambiguously on a blind look** (cheap-model check): Limpseal as a seal sitting up (medium), Droopstar
  as a slumped starfish (medium), Wilteel's dim lure stalk as stray dots. Left as they are; the owner can ask for redraws.
- **The `assert`s in `land_all.py` and `water_all.py` vanish under `python3 -O`**, so a drawn creature left out of `ORDER` would be
  dropped without a message. Run the tools without `-O`.

## Paradise Sky slice (accepted for now)

- **The Sky names and animals are my choice** (plan section 4); the owner has not been asked. "Cinderling" (Sky kid) and "Cindermane"
  (Land adult, live) share a prefix; left alone because Cindermane is live.
- **Cinderling and Scorchlet have no mouth** (`mouth: null`, the beak is part of the body), so their beak never opens or lowers. The
  other beaked forms (Ashwing and the 8 new ones) draw the beak as a mouth pattern and do open and lower. Scorchlet could get
  `beak_mouths` like Chirplet: a scope suggestion; the owner moved on without asking for it (2026-11-21), so it stays as it is.
- **A beak and the claws are the creature's tooth colour.** They are drawn with the letter T, which `lib.with_face()` sets from
  `tooth=` after the palette, so a palette entry "T" is overwritten without a message (8 such entries were removed). A bird with an
  orange beak needs a different letter.
- **A sleeping beaked form has no M pixel** (a closed beak is drawn in the beak's colours), so `blanketBox` falls back to starting
  the blanket about 55 percent of the way down. Eyes still show above it (seen on Cinderling, Chirplet, Peckjack and Downwren in the running game); the per-form test now
  checks "below the eyes" and "at the mouth when there is one".
- **Weaker readings on a blind look** (cheap-model check, left as drawn): Cinderling's orange belly patch under the beak reads as a
  second mouth; Ashwing and Sootsnarl have close silhouettes (the same line, tiers 1 and 3); Wisplet and Softnimbus are both pale
  clouds; Gildcrest's teal wings read as arms; Paleveil's blue spots can read as headphones; Smogrump's smoke wisp as a chimney;
  Fogsag as a ghost or tadpole (the hook reads like a question mark). On the field, the far islands read as downward triangles
  and the fallen column as a fence.
- **Smogrump's two feet are 1 px off a mirrored pair** and Wisplet's side lobes differ in size: smoke and cloud are meant to be lumpy.
- **The chicken icon is close to the meat icon** (cream bone ends on a brown-orange roast). A Sky tray never shows meat, so they
  are never side by side. 8 x 8 placeholders, like the rest.
- **The Sky picture looks muted while a creature sleeps.** The "lights off" overlay (40 percent dark blue) is the same for every place.
- **The JavaScript is 436.7 KB (77.9 KB gzipped)** with all three fields (64 forms), up from 319 KB. See plan section 7.

## Cloud saves (accepted for now)

- **No password reset.** Usernames are only login names and nothing is sent. A forgotten password means the owner resets the account by
  hand in the D1 console (delete the account row, or replace `password_hash` with a hash made from a new key).
- **A username is easy to guess, and anyone can use it to block that account for 15 minutes.** Names like `kid` are not secret (an
  email at least looked private), and five wrong tries for a name from any address fill its 15 minute allowance. Signing up still needs
  the family code, and a wrong password is slowed by the per username and per address limits, so guessing gets nowhere fast; the cost is
  that someone who knows a name can keep that account locked out. Accepted for a family game.
- **Accounts made with an email before 2026-11-22 cannot be signed in to.** They stay in the table. Rename or delete them in the D1
  console if one ever mattered (as far as I know the owner had not signed up for real by then).
- **Password strength is only checked in the browser** (8 to 128 characters). The server sees a 43 character key, never the password,
  so it cannot tell a weak password from a strong one. Anyone can also send the server a key made some other way.
- **Signing in stretches the password 600,000 times in the browser.** That took about 64 ms in headless Chromium on this machine; on a
  phone it is not measured (expect a fraction of a second to a second or two on an old one). The button says "One moment...".
- **The free plan's 10 ms CPU limit is not tested live.** Per request the server only does a SHA-256, a few SQL statements and JSON
  work; the local `wrangler pages dev` run does not enforce the limit. Check the first days of real use in the Cloudflare dashboard.
- **The rate limit checks and records in two steps**, so a burst of requests sent at the same moment can get past the limit (a few
  dozen at once instead of 5). Each guess also costs the guesser 600,000 rounds of PBKDF2, so it was left. An atomic "reserve a
  slot first" version is a scope suggestion.
- **Restoring a backup is by hand.** The account keeps the 10 newest older saves (`save_backups`), but nothing in the game lists or
  restores them. The `revision` of a backup that lost a conflict is the revision that device last synced, not the save's own.
- **The server cannot check that a save is a valid game**, only that it is JSON with `version: 3` under 256,000 bytes. The game
  checks it again when it takes one in; one it cannot read is not taken (a message says so) and the device keeps its own.
- **Changes made while a send is on its way can be lost.** If the answer is "kept-server" (another device's game was newer), this
  device takes that game, and anything the player did in those few hundred milliseconds goes with the old one. The game that was sent
  is in the account's backups.
- **A "which game do you keep?" question is only shown in Settings.** If the page is reopened before answering, the question comes
  back there, and nothing is sent until it is answered. There is no marker on the gear button.
- **A device whose clock is more than a day ahead cannot send saves** (the server refuses a `savedAt` that far ahead, so a wrong
  clock cannot make its saves win for ever). The player sees "That request was not understood."
- **Signing out while offline ends the session only on this device.** The session at the server (and its cookie, which the game
  cannot see because it is HttpOnly) stays valid for up to 90 days. The message says so.
- **An unsent change from one account is sent to the next account that signs in on the same device** if that account has no
  game yet (the game belongs to the device; signing out first tries to send it to the first account).
- **An untouched egg whose sleep hours were changed** still counts as untouched, so signing in replaces it with the account's game
  (the account's game has its own sleep hours).
- **No end to end test in CI.** The browser run (three devices, real Chromium, `wrangler pages dev`, local D1) is a script kept
  outside the repository; the unit tests use a `node:sqlite` stand in for D1 (see decisions.md).
## Creature Book (accepted for now)

- **The book belongs to one save, not to the family.** CLAUDE.md section 7.8 says "family-wide": that waits for accounts and profiles
  (Phase 5). Until then a new save starts with an empty book.
- **Hints point at the next step of the tree.** A player can read "Feed it lots of fish" off a missing young once its kid is raised.
  That is the intent. The care hints are in words, so a tier boundary change in `tuning.ts` does not update them: the hint strings are
  in `data/book.ts`.
- **A form made with the dev tools skips its ancestors.** `forceHatch` adds only the form it names, so a book can hold an adult whose
  kid and young are still dark. Dev mode only.
- **The UI has no unit test.** The tests cover the data, the record and the save; the panel was checked with screenshots only.
- **The book icon is an 8 x 8 placeholder**, like the other icons.
- **Names are small: at most 0.72rem (about 11 pixels), and about 9 pixels on a 320 pixel wide screen,** under the app's 0.8rem floor,
  so each of the 64 fits one line (measured at 390, 360 and 320 wide). A new name longer than Hollowbloom (10 letters) can break
  mid-word; the layout is four equal columns because a tier row is one column per young.
- **Old saves get a guess.** A save from before the book is credited with the forms its living creature went through, and nothing
  else: a creature that died earlier left no record, so its forms are not in the book.

## The special form (accepted for now)

- **Cleaning or giving medicine while it sleeps counts as care**, so a player can stop the 4 hour clock overnight with the Clean up button
  (Feed is disabled and a pet is refused while it sleeps). It is real care and the buttons allow it, but the owner's words were "feed,
  clean or play". The fix, if wanted, is one `c.sleep` check in `clean` and `giveMedicine`.
- **The Book hint is vague on purpose:** "Leave a baby or kid alone for hours". It does not say "awake" or "4".
- **There is one special for all three fields,** so a neglected baby never shows which field it would have chosen. It is a leftover
  that grows no further (a 24 px creature for the rest of its life). It can still do jobs and fights like any kid.
- **Dustpuff's name and look are my choice.** It is a pale grey-lilac blob and sits quietly against the Land field and the Sky field
  (looked at); a brighter or scarier special is a redraw.
- **A save made before the counter** starts counting from the moment the game loads (a missing counter reads as 0), so a baby already
  neglected for hours gets a fresh 4 hours.
- **The dev panel can show the count but not set it.** Skip ahead and the time multiplier are the way to reach the special.
- **Three existing tests changed to keep a baby or kid looked after** (a pet an hour, `petUntil`). A new test that leaves a baby alone for
  more than 4 awake hours will find the special, not the safety net.
- **The JavaScript is 441.9 KB (79.1 KB gzipped)**, up from 436.7 KB before the Book and the special (439.5 KB with the Book). See plan section 7.

## Installable app (accepted for now)

- **An update reaches a phone only when the player taps "Update now" in Settings, or after the app has been closed completely and opened
  again.** Until then it keeps running the version it has. A later change to the save format would make the server refuse that old copy's
  saves ("That save is not from a version this server knows.") until it updates.
- **No install button in the game.** The player installs from the browser: Android Chrome menu, "Install app"; iPhone Safari, Share,
  "Add to Home Screen". Chrome may also offer it by itself.
- **Not tried on a real phone:** how the installed icon is cropped (the round and rounded masks), the start screen, the status bar colour
  on iPhone (`black`), and whether an iPhone home screen app keeps its own storage apart from Safari (it may start with a new egg; signing in
  to the account brings the game over, and the "which game to keep" question protects an existing one). The checks so far are a headless
  desktop Chromium and the files themselves.
- **The first visit is not controlled by the worker.** It starts working from the next load or visit. Starting offline needs one visit with a
  connection first.
- **No "ready offline" message.** The player cannot tell that the files were kept.
- **Sign in and saving to the account still need a connection**, as before: offline they say so and the game stays saved on the device.
- **`tools/pwa-icons.py --check` is not part of `npm test`** (it needs Python and Pillow, like the other art tools). `tests/pwa.test.ts`
  checks the icon files' sizes, not their pictures.
- **The JavaScript is 456.7 KB (84.6 KB gzipped, the figures `vite build` prints)** plus a 5.7 KB piece for the update helper, up from 453.0 KB (83.1 KB gzipped).
- **Two windows of the game open at once** (the installed app next to a browser tab): tapping "Update now" in one reloads only that one. The other
  keeps running the old version, still showing its own notice, until its player taps too (that tap reloads it at once, checked in a browser) or
  reloads; the new worker already serves the new files.
  Two windows also each hold their own copy of the game and both write the one saved game (the later write wins); that was so before the app.
- **When saving is blocked in the browser (the red "Saving is blocked" warning), "Update now" still reloads** and the progress since the last
  good save is lost, as it would be on closing the page. The notice then leaves out "Your game is saved first." `writeSave` reports no failure
  to its caller, so `saveNow()` answers when the write was tried, not when it worked.
- **On "Update now" the game is saved on the device before the reload, but the upload to the account is only started** (a keepalive request,
  which the browser lets finish after the page goes; it is skipped for a save over 60 KB). If it does not arrive, the next visit sends it.
- **The header has a narrow-screen rule under 360 px (`@media (max-width: 359px)` in `src/ui/app.css`), checked by hand only.** Before it, the page
  scrolled sideways by 24 px at 320 px (the header needs 360 px at its normal sizes; found 2026-11-22, there since the Creature Book's second gear
  button). Measured at 300 to 390 px with a script that is not in the repo; nothing under 300 px was looked at. A change to the header, the gear
  buttons or the stat cells needs the same measurement at 320, 360 and 390 px (scrollWidth not above the width).
- **The update notice reuses the red `.notice` look**, made for warnings, for good news.
- **Empty stat bars hide their fill (`.stat[aria-valuenow="0"] .fill` in `src/ui/app.css`), checked by hand only.** Before, a one pixel reddish sliver could
  show at the left edge of an empty bar where it sat at a fraction of a pixel (found 2026-11-22, there before the app; worst at 390 px and at
  300 or 320 px on 2x and 3x screens). A script that reads screenshot pixels (not in the repo) measured 300 to 412 px at pixel ratios 1, 2 and 3:
  worst deviation 88 before, 14 after (edge anti-aliasing alone reaches about 16). A change to the stat bars needs the same measurement.

## Profiles slice 1 (2026-11-22)

- **The header is 24 px too wide at 320 px on `main`**, with or without profiles (the gear button ends at 344 px). The fix is in the
  `pwa-install` pull request. The profile screens are measured as no wider than the same screen signed out, and nothing inside the
  Settings dialog may reach past the screen (the browser run checks both at 320, 360 and 390 px).
- **At 320 x 568 the switch chip makes the page 16 px taller than the screen** (584 px against 568 px). The buttons still end at 566 px,
  so only the space under them scrolls. Not fixed: that size is rare, and the chip keeps a 40 px touch height.
- **A reload does not wait for the "changed" mark to be written.** Switching profile (and a session that ends in another profile) saves
  the game and starts the send, then reloads. If the mark written a moment earlier had not landed and the send also failed, the profile
  reopens as unchanged and its last change stays on this device until the profile changes again. Rare (a tap in the last few
  milliseconds before a switch, then no network).
- **The shell has no unit test.** `src/main.tsx` (key wiring, the switch, the end of a session, the double tap guard) is covered by the
  browser run only; that script is not in the repo (it lives in the session scratchpad and needs `wrangler pages dev` with a local D1).
- **A blocked or private window plays the first profile every time**, with no picker (a choice cannot be kept); Settings says so.
- **Real D1 is not checked.** The migration and the conditional insert ran on SQLite 3.51.2 and on wrangler's local D1; the live
  database's report of `changes` for `INSERT ... SELECT` and its text for the unique index are the owner's live check (plan section 9).


## Adult Mode header (A1.1, 2026-11-22)

- **On `main`, every living creature's room scrolls 28 px sideways at 320 px wide** (the page is 348 px wide). The egg, the dead creature,
  the habitat and the arena do not. Cause (read, not fixed): `.care` is `grid-template-columns: repeat(5, 1fr)`, whose columns will not shrink
  below their content, and five buttons need about 312 px against 288 px of room. Found by the Kid Mode comparison (the same on `main` and the
  branch; Adult Mode adds nothing to it). Likely fix, one line, a Kid Mode change and so the owner's call: `repeat(5, minmax(0, 1fr))`.
  A1.3 rebuilds the care row anyway.
- **The adult header is tall:** 177 to 221 px, so at 320 x 568 and 360 x 640 the care buttons are below the fold and the page scrolls
  (643 to 687 px against 568 and 640). It fits from 360 x 780 up. See decisions.md (A1.1) for the numbers.
  **Those page heights were measured at pixel ratio 1; real phones are worse** (measured 2026-11-22 for the A1.3 plan): the Adult Mode room page at 360 x 640 is 723 px at ratio 2 (83 px below the window) and 702 px at
  ratio 3 (62 below), against 659 (19 below) at ratio 1; at 320 x 568 it is 674 px (106 below) at every ratio. The room is bigger on a real phone (decisions.md, "Space and size").
- **The Adult Mode setting can come back after being switched off or on** if a second device that was playing an older copy saves later
  (newest save wins, like every field in the save).
- **The "!" mark can stay up to a minute after the need is met:** it follows `creature.call`, which the simulation updates once per game minute.
- **Time to empty ignores that night is coming** (the rate is slower asleep) and that a nap ends by itself; the card says "at this rate".
- **A device clock set back leaves `stageStartedAt` in the future.** The countdown never reads more than the stage's length or less than zero; the stored value is unchanged (old gap).
- **CLAUDE.md section 7.1 says discipline "drops over time".** In the code nothing lowers it, and only the dev panel writes it. The owner's file to fix.
- **Names:** the Switch button's player name ends in an ellipsis when it is too long for its column (checked with 20 of the widest letter at 320, 360, 390 and 480 px).
- **Tooling for the browser runs (not in the repo):** two `wrangler pages dev` servers started at the same moment clash on workerd's internal socket ("Address already in
  use (socket direct:1:default)"): start them one after the other and give each its own `--port` and `--inspector-port`. And do not seed a page's storage by opening an image or a
  text file of the site: the browser's own viewer for those puts an inline style on the page, the site's security policy blocks it and logs a "Content Security Policy" error (152 of
  them in one run, the same on `main`): open a stub page served by the test script instead.

## Growth Forecast (A1.2, 2026-11-22)

Found while planning and reviewing A1.2, in the game as it is (none are new, none are fixed here):

- **A tie in a baby's cells goes to the egg pattern's field even when that field is behind.** `netField` (`growth.ts`): Land 2 cells, Water 2
  cells, Sky 0 and a swirled egg grows into Sky's kid. The code's comment says so and the forecast states it ("a tie goes to the field of its egg
  pattern: Sky"); it may feel odd in play. A change is the owner's call.
- **Away on a job, a creature's calls still count and cannot be answered.** `updateCalls` has no job check and `alive()` refuses feed, clean,
  medicine and touch while a job is set, so an unanswered call goes on toward a mistake. Jobs last 3 to 8 minutes against 60 for a mistake, so
  it needs a call that was already running. The care clock for the special does not count job time (`countNeglectMinute`); the panel says so.
- **A job started before bedtime goes on while the creature sleeps.** `updateSleep` moves it home but does not clear `c.job`.
- **A device clock set back leaves `stageStartedAt` in the future.** The stage then runs until real time catches up with it (the same gap
  as the header's, A1.1). The forecast shows the real, longer time and says the clock was set back; the header still clamps its own countdown.
- **"Locked" is rare on purpose.** A kid can only be locked when the rivals cannot get the meals in time (hunger full and an hour or two left), a
  young one only at tier 4 or in the last minutes. "Still open" claims nothing.
- **The forecast is as live as the game's catch-up** (about once a second, on whole minutes): the bounds count from the creature's
  `lastSimulatedAt`, so a page that is a little behind never says Locked too early.
- **Not checked:** a real phone, browsers other than Chromium, a screen reader reading the panel.

## Honest buttons (A1.3, 2026-11-22)

- **Dimmed words are at 0.55 opacity**, which measures 4.56:1 against the dimmed button (over the 4.5:1 line; the first build at 0.4 gave 3.1:1). The dimmed look is weaker than Kid Mode's
  `:disabled` look (0.4), which is unchanged. One line (`.btn[aria-disabled="true"]` in `app.css`) sets it.
- **The note is a status region, 6 s, three lines at most.** It was not read with a screen reader. It is replaced by the next note, not queued.
- **Tap, then game state.** A tap on a care button first catches the game up to the clock (the same step the one-second timer takes), so a button that
  was lit a moment ago can answer "night" at once. That catch-up can change the saved game (time that was due is simulated); it never marks the player as having played.
- **No Room dot and no Arena dot, and no notes for poke, pet and tickle** (the owner dropped them). The header's "!" still shows a waiting call in Adult Mode.
- **The page is still taller than the window on a 320x568 and 360x640 phone** (674 and 723 px at pixel ratio 2): A1.3 adds no height (words are inside the buttons), but it does not remove any either (A1.1 question 1).
- **Kid Mode's care row changed** (owner's word): `minmax(0, 1fr)` columns, so it no longer runs 28 px past a 320 px window. At 320 wide the five Kid buttons are 51 px wide instead of 60, with the 48 px icon inside.
- **The egg's progress fill** reports a negative left edge (`span.fill`, -10 px at 320 wide). It is clipped by its bar (`overflow: hidden`), so nothing shows and nothing scrolls; it is the same on `main`.


## Retire (A1.4, 2026-11-23)

- **An older device can undo a retire.** Cloud saves keep the newest save per profile (the older one goes to the backups). A device that was idle with the old game, adult still at home, and is played after the retire on another device saves a newer game and brings the creature back; the retire stays only in the backup. The card promises only what the game does on the device it is used on. Nothing is merged across devices on purpose (not in A1.4).
- **The list is per profile, and the Book it sits in is too**, while CLAUDE.md section 7.8 calls the Book "family-wide". The mismatch was there before; the owner decides which is meant.
- **Kid Mode players read a card.** CLAUDE.md section 7.10 says no reading is needed outside settings and adult menus; the owner's answer 2 asked for Retire in both modes. The Book panel is not part of the room or header, but the question card is text. An owner question, not a defect.
- **No cap on completed lives.** A record is 73 characters; beside a full 300-entry log the 60,000-character keepalive line is reached near 550 lives and the server's 256,000-byte limit near 3,200 (computed). A life takes days of real play, so this is not reachable now; a cap or a trim would be a decision for the owner.
- **A retired creature's unseen haul cards stay** and show for the next creature (nothing in the card says so). Harmless: the coins and materials were earned.
- **The card's buttons once looked like plain text (found on the contact sheet, fixed 2026-11-23 on the owner's "not lazy text").** `.btn.small` has no edge and the card has the same fill, and `fit-tap` measures height only, so no check saw it. Every button of the section now has its own fill and a light edge, and the `btn-look` check (with a control button that must be flagged) and two mutants guard it. Kept here as a reminder that a check has to measure what the owner sees: look at the contact sheet before trusting the gates.
- **Opening the card scrolls the panel up a little at 320 wide** (focus goes to "Keep playing", the safe answer, so the card's title can scroll out of view). The confirm label no longer leaves a lone "on": it wraps balanced ("Retire, complete, / pass on"). The scroll is cosmetic and was left on purpose: moving focus elsewhere would make the dangerous answer the first one a keyboard or screen reader user lands on.
- **The A1.4 verification scripts are in the repo now** (`tools/verify/`, README inside, owner answer 5, 2026-11-23). What they make (saved games, screenshots, builds, copies, logs) goes to `$VERIFY_OUT` (the system temp folder by default) and is not kept: run the scripts again for a result. They need Playwright from outside the game (`~/homelab-dashboard` or `PLAYWRIGHT_FROM`) and Pillow for the contact sheet.

## Spot cards, the job card and an honest call back (A2.1, 2026-11-23)

- **An older device can undo a call back.** Cloud saves keep the newest save per profile, so a device left open on the old game (the job still running, no call back coins) that saves after the device in use brings the job back and the early haul is replaced by the full one that device's own clock pays when the job ends. There is no double pay: each save holds only its own haul (tests/callback.test.ts, "the passive device"). The same rule as the Retire entry above; nothing is merged across devices.
- **The button's words can only be a moment old.** The words are drawn once a second and the haul only grows with time, so a tap a moment after the draw pays the same or more, never less (a test sweeps this).
- **A call back that pays a coin and no material, or a material and no coin, shows one row on the "Welcome back" card.** A call back that earned nothing leaves no card. Kid Mode gets the card too when a call back pays (the owner's answer to Q1).
- **The energy a trip took does not come back,** and the job card says so before the tap. A call back does not count as a chore (the growth counter keeps counting finished jobs only).
- **The habitat page scrolls on a small phone, with or without a card.** On `main` the Adult habitat page is already taller than a 320x568 or 360x640 window (698 and 747 px); a card makes it 117 to 194 px taller, and the job card 124 to 143 px. The cards scroll themselves into view, so the player sees them, but the page is not made to fit (A1.1 question 1, the owner's).
- **A tap on a shut spot no longer shows the note over the picture** (A1.3's behaviour): the card carries the reason. The note still appears when a Send reaches a spot that has become shut since the card was drawn.
- **A Feed tray open while the creature goes away has no check in A2.1;** the code is not part of this slice (Retire's `tray-reset` covers it).
- **Not checked:** a real phone, a screen reader reading the cards, browsers other than Chromium.
- **Prettier has no config file in this repo, and the code is written at `--print-width 150`.** `npx prettier --write` at its default width (80) reflows whole files into a huge diff (A2.1 hit it and had to redo it). Run `npx prettier --print-width 150 --check <files>` on the files you changed, never on the tree.
- **A script that clicks a shut spot must use `click({ force: true })`.** The spots are `aria-disabled` buttons, not `disabled` ones (A1.3), so a Playwright click waits for them to become "enabled" and hangs. The real tap reaches the handler, which is what the card relies on.

## The shop (A2.2a, 2026-11-23)

- **The Shop opens from the nav, which shows only for a living creature.** During the egg and dead phases there is no way to open it (the buy rules themselves work in any phase). The owner may want it reachable from the Book or the egg screen.
- **An older device can undo a purchase.** Cloud saves keep the newest save per profile, so a device left open on the old game (nothing bought) that saves after the device in use brings the old wallet back and the purchase is gone. Same newest-save-wins rule as Retire and the call back.
- **An older app version drops item ids it does not know.** `migrateSave` keeps only the ids it has; a save written by a build with more items, opened by an older build, loses the extra items on its next save.
- **Fish has no use until A2.2b** (it is earned and shown, but nothing costs it).
- **The Close button's style is the old panel button;** the shop's `btn-look` check leaves it out on purpose (it is not one of the shop's own buttons).
- **No Escape key closes the panel,** like every other panel in the game; the plan's first draft said it would.
- **Two player types earn nothing useful from the habitat (measured, not changed):** looking in once a day in the morning loses the creature on day 3, once a day in the evening earns 0 coins because the energy has run down by 19:00. See the A2.2a section of decisions.md.
- **Not checked:** a real phone, a screen reader reading the shop, browsers other than Chromium.

## The shop's foods (A2.2b, 2026-11-23)

- **A Kid Mode profile that owns a dish sees the dish row in its Feed tray.** What a player owns works in both modes (the A2.2a rule); only the shop that sells dishes is Adult Mode only. A profile that owns nothing sees no change.
- **The dish row adds one button row (76 px) to the open Feed tray.** The Adult habitat page already scrolls at 320x568 and 360x640 on `main`, so a kid with dishes scrolls a little further there.
- **A dish is offered only to a kid with a field.** A young, an adult, a baby, the special form and an egg show no dish row (their servings are not counted), so a dish bought for a creature that has already grown up waits for the next egg's kid stage.
- **In Adult Mode a full creature cannot open the Feed tray at all** (the Feed button says "Not hungry: ..."), so a dish tap at full cannot be made there. Kid Mode opens the tray and the action refuses the tap.
- **A recipe card names the two kinds ("the light food"), not the six foods;** the tray button's label names both foods of the creature's own field.
- **An older device can take a dish back, and an older app version drops the five ids it does not know,** the same two limits as the A2.2a items (newest save wins; `migrateSave` keeps only the ids it has).
- **No dish for the pellet or the treat, no craving, no stock or count of dishes:** a dish is bought once and is there at every meal (the spec's craving food is A3).
- **Seven older run scripts that start a server have no `trap` for it** (`run-browser.sh`, `run-habitat.sh`, `run-kid.sh`, `run-shop.sh`, `run-sheet.sh`, `run-sheet-habitat.sh`, `run-sheet-shop.sh`: checked with `grep -L trap`); an interrupted run leaves its server on its port and the next run refuses to start until it is stopped. The two A2.2b scripts have the trap.
- **Not checked:** a dead or retired creature closing the tray (unchanged behaviour, not touched by this slice), a real phone, a screen reader reading the dish buttons, browsers other than Chromium.

## The request board (A2.3, 2026-11-24)

- **An older device takes `board` away, and the newest save wins whole.** An older app version ignores the field, and a save from another device replaces this one as a document, with its coins and its board together, so a request is never paid twice; the coins paid on the device that lost are lost with it (the same rule as every field since A2.2a).
- **Nothing expires, so a request type the player never does holds its slot for good.** A player who never fights keeps a fight request open (and the oldest one past 3 days pays +25%, which is the only push). The board is three slots, never more.
- **A hand-edited save with a request id of 9007199254740991 (the largest whole number the game reads) makes the draw count stop rising:** the next id would be 2^53, and 2^53 + 1 is 2^53 again, so later requests would share an id. Not fixed: only a hand-edited save can hold such an id (a played game draws one request per few minutes), and `migrateBoard` already drops a later duplicate id.
- **The repo has no Prettier config:** the files follow `--print-width 160` (found by trying widths against main's files), so a plain `prettier --check` reports most old files. `state.ts` and `ShopPanel.tsx` already differ from it on main, and so do the older tests and `tools/verify` scripts. Check only the files you add or change, at width 160, and compare a file already on main with its own `origin/main` copy before calling a difference yours.
- **The Shop panel's list scroll position is read once (shop-scroll check):** the check reads the page's scroll about 200 ms after the tab click and requires the wheel not to move it further; a smooth scroll started by that click and still moving would fail a correct build. It has not flaked in any run.
- **`26dvh` is not tested:** the room picture in the Shop is at most 26dvh high (26vh where dvh is unknown). Headless Chromium has no toolbar, so dvh and vh are the same there; on a phone with the browser toolbar showing, the picture is meant to follow the visible window. A real phone is the check.
- **A short phone shows a small room picture in the Shop:** at 320 x 568 the picture is 148 px, was 256 px, to leave a card of the list in view; with the Undo bar showing (10 seconds after a purchase) the list is 113 px high.
- **The panels' touch behaviour is checked in Chromium only:** `shop-touch` and `panel-touch` use a mobile window with touch events sent through the browser's protocol. iOS Safari (its rubber band, and whether `overflow: hidden` on the body and `overscroll-behavior` stop a touch scroll there: not looked up, not tested), pull-to-refresh on Android and a real finger's momentum are not covered; a real phone is the check. `body:has()` needs Chrome 105, Safari 15.4 or Firefox 121; an older browser keeps the page behind scrollable.
- **On a phone on its side, a 320 px high window with the Undo bar scrolls the Shop's left column:** at 640 x 320 the column is 54 px taller than the window and at 568 x 320 69 px (at 740 x 360 and 844 x 390 it fits); a drag on it scrolls it to its end (54 of 54 and 69 of 69) and the Undo bar then ends at the window's bottom. Checked once by hand with a throwaway script (scratch-only, not kept), not by `shop-touch`, whose landscape windows are 740 x 360 and 844 x 390. Windows between 320 and 360 px high were not measured.
- **The haul card does not lock the page behind it:** the page-lock rule is `body:has(.panel)`, and `.panel` and `.haul` are the only two `position: fixed` boxes in `app.css` (grep). The haul card is a small card and was not tested with a finger; it is not a panel.
- **A pellet request is cheap:** hunger limits it to about one meal in 3 awake hours, and it pays 2 coins (the measured day counts it).
- **A field minute rounds as the baby's field count does:** up to 59 seconds at a change of place are credited to the place the creature was in when the minute was simulated, so 20 minutes can come from 19 minutes and a bit.
- **A clock set 3 days forward gives the oldest request its +25% at once** (game time is the player's clock; accepted).
- **The requests drawn depend on how the game was played** (the draw reads the simulation's state, which the care actions change): the same save and time give the same board, two different play histories do not.
- **After a catch-up longer than 15 minutes the note over the room says that a request was paid and not how much** (the slot that said it is gone). Saving the totals in the board would make it exact (an offer).
- **A request the creature cannot do is dropped at the next minute and its progress is lost** (a new baby after a retire, the special form, a purchase it cannot pay for); the other requests keep theirs.
- **Two run scripts more that start a server:** `run-board.sh` and `run-sheet-board.sh` have the `trap`, but a TERM sent to the script's own PID waits until its foreground `node` ends before the trap stops the server (Ctrl-C and a normal end are fine); the older run scripts have the same wait, and seven of them have no `trap` at all (see the A2.2b entry).
- **Not checked:** a real phone, a screen reader reading the board, browsers other than Chromium, a request finished by a won fight or a finished job in the browser (the unit tests count both; the browser checks finish a request with two meals).

## The home, H1 (2026-11-25)

- **The picture takes every finger that lands on it (`touch-action: none`), so the page cannot be scrolled from the picture.** On a phone where the Adult page is taller than the window (723 px at 360 x 640) the player must start a scroll off the picture (the header, the buttons). The checks prove the page behind stays put under a finger dragged on the picture (and that a finger above it does scroll the page). If this feels wrong on a real phone, the choice is `touch-action: pan-y` (a vertical drag scrolls the page and the home can then only be panned sideways) or a pan handle; I took `none` because the owner asked to move the camera with a finger anywhere on the picture.
- **The camera does not follow a sleeping creature** (the owner's answer, by design): while it walks to the bed in another room the picture stays where it was and the Find button shows.
- **Only the Room screen at home is the home.** The fields, the habitat and the arena keep the old side view and the one-line walk; the creature does not appear in the home while it is on a job (a bubble over the middle of the living room says it is away) or in the fields.
- **Left from the source review (11 findings, 9 fixed):** (5) what an evolve while asleep in the home does to the creature's place is unverified: growth does not run asleep, so only the developer's force-evolve can reach it (not tried in a browser); (11) `roomOf` gives the first partition column to the bedroom and the second to the kitchen (a creature standing in a doorway column is named for the room it just left): a judgement, no one asked.
- **The Shop's wallpaper, mat and bed pictures are crops of the home** at fixed corners (`drawHomePreview`); an item whose spot is changed in Decorate mode (H2) will need its crop looked at again.
- **Run scripts:** `run-home.sh` has the `trap`, but a TERM sent to the script's own PID waits until its foreground `node` ends before the trap stops the server (Ctrl-C and a normal end are fine), as `run-board.sh` does. `lib.sh`'s busy-port check cannot tell a leftover server of an earlier run from someone else's.
- **`.fc-confidence` has a side-border style that a design hook flags** (`src/ui/app.css`; older than this slice, left).
- **The older Shop and dishes checks read the home through the camera** (`liveRoom` pans with the arrow keys and `worldPixelOf` computes the device pixel): they rely on `canvas.room` taking the keyboard focus (asserted) and on the default-zoom rule, which is written again in the page. If the zoom rule changes, change `worldPixelOf` in `shop-browser.mjs` and `dishes-browser.mjs`. They no longer read the Dusk preview's bed or a wall under the Feeding Mat card (the living-room and kitchen pictures do not contain them), and `mutate-shop-ui.py`'s room mutants now break the home's drawing: the old one-line room's own look, shown while the creature is away on a job, is read by none of these checks. The creature wanders in real time in those suites; `liveRoom` pins `Math.random` so it stops starting walks, which holds because the pin lands inside its first 2 second idle pose.
- **Not checked:** a real phone and real fingers (the touch is CDP's), a screen reader reading the room name, iOS Safari and browsers other than Chromium, a mouse wheel or trackpad pinch (the picture has no wheel zoom), and a window resized while the picture is open (the checks open each window at its size).

## The home layout in the save, H2a (2026-11-25)

- **Nothing in the game writes `save.home` yet:** H2a only reads it, so a player sees no change until H2b (the Decorate screen). A hand-edited or cloud-synced `home` is the only way to see it.
- **`foodTile` checks only the left tile below a two-wide creature** (H1 behaviour, finding 27 of the plan's review): when both sides are walls the food goes on the tile below the creature's left tile only, whatever the right tile has below it. The starter layout has three such places for a one-tile kid ((0, 2), (22, 2) and (29, 2), the last between the counter and the fridge, which the `idle-home` test pins) and three for a two-wide creature ((4, 2), (8, 2) and (11, 2)), computed from `isFloor` and `fits` on 2026-11-25, and every one has floor below both of its tiles, so the starter is safe; a moved layout can make a place whose right tile has no floor below it, and the food could then land under a piece (not tried). Left for H2b, where the player can make that layout.
- **A moved layout counts as "touched" for cloud sync:** `isUntouched` returns false for a save with a `home`, so an egg whose furniture was moved is not silently replaced by the account's game (it asks). Moving a sofa and nothing else therefore makes a new game "worth keeping"; the alternative (a layout alone does not count) would lose the furniture of a player who decorated before hatching.
- **A layout that breaks a rule is dropped whole, silently:** `layoutOf` gives the starter layout and the save keeps the bad `home` as it is (it is not rewritten), so if a later rule change makes it valid again it comes back. No message tells the player.
- **The browser checks' clock is not paused** (found 2026-11-25): `setFixedTime` fixes `Date.now`, but timers and frames run in real time between a check's steps and `runFor` jumps them forward on top. The H1 checks and the older suites passed because they have tolerances; a check that needs exact timing (a hold of 450 ms, a count of frames) should pause the clock first. `home-layout` avoids it by reading both pictures it compares from one page. Not changed in the older scripts.
- **Not checked in a browser:** a layout that changes while the page is open (the Stage's `useLayout` + `reseat` are unit-tested, and H2b is the first slice that can change one) and a layout that covers the tile the creature first stands on (`startAnchor` and `reseat` are unit-tested).
- **The unit mutation list does not mutate** the cache's `known.clear()` at 32 entries, the early return of `useLayout`, or the `fits(start)` check of rule 5 (equivalent or invisible to any test; the reasons are in the comment above `MUTANTS` in `mutate-home-unit.py`).
- **The habitat check `card-lines` has a race (found 2026-11-25, not caused by H2a, not fixed here):** it taps each spot and then waits for "a card is visible", but the previous spot's card is still on screen, so the wait returns at once and the title is sometimes read before the new card renders (`Herb patch: title: expected ["Herb patch: Herbs"], got ["Bug meadow: Fiber"]`). Evidence: the full habitat suite failed this one check in both of my full runs on the H2a build (360 x 640@1, then 320 x 568@2: 107 of 108 passed each time); on H1's pushed tip (260e295) it failed once in 36 isolated runs of the check and passed one full run; on the H2a build it passed 39 of 39 isolated runs, and a scratch copy of the script that waits for THIS spot's title (`card(page).locator("h4").filter({ hasText: lines.title }).waitFor(...)` in place of `card(page).waitFor(...)`) passed the full suite, 108 of 108. I cannot rule out that H2a shifts the odds (two full runs failed against one passed on H1). Suggested scope improvement, one line in `habitat-browser.mjs`; left alone because the habitat script is not part of this slice.

## Decorate mode, H2b (2026-11-25)

- **Opening Decorate mode ends a meal picture** (found in H2a's `reseat`, which `startDecor` calls): a creature that was eating stands still and the snack picture goes. The stats and the food are not touched. Left as it is.
- **With six to eight pieces in the tray the dock grows a row and, on a tall phone, the picture moves up** (measured by `decorate-fit` on 2026-11-25: the dock grows 62 CSS px; the picture moves up 31 at 390 x 844@3 in both modes; in Kid Mode 21 at 320 x 568@2, 25 at 360 x 640@2 and 31 at 360 x 640@1; in Adult Mode 0 at those three windows, where the page scrolls instead). It also happens in the middle of a session when the sixth piece goes into the tray, or comes out. With five or fewer pieces the dock is 150 px as before and the picture does not move. The CSS comment first claimed the picture never moved: that was written from the CSS and never measured on a tall window, and the cheap-model review's reading was right. Listed under Open for the owner in progress.md.
- **A tap on a tray icon does nothing, and says nothing, when no spot is allowed** (`bringOut` returns false when `nearestSpot` finds none): a home so full that the piece has nowhere to go. Not tried in a browser or a unit test; with the starter home's floor it is hard to reach.
- **The rules are tested on the shared function, not through the browser, for three cases:** a piece on a protected tile (the egg, poop or the grave's block), a piece that closes a doorway or hems the bed in, and the bed with its front off the floor. The browser checks drive a refusal by the wall's top row (a drag and an arrow key) and by an overlap with the table; the contact sheet shows the partition column's red outline but asserts nothing about it. `tests/home-edit.test.ts` pins each of the other cases (a doorway test first expected a creature two tiles tall and was corrected: a creature's footprint is one tile tall, the feet line).
- **A refused drop gives no spoken reason** (pick 1): only the red outline and the piece going back.
- **`foodTile` (the H2a note "left for H2b") was re-read:** it returns only a tile where `isFloor` is true under the layout in force, or the creature's own tile, so food is never put under a solid piece. How it looks beside a piece drawn in front of it was not tried in a browser.
- **Two redundant guards are not mutated:** the `endHold()` the Stage calls each frame while decorating and the early `return` in `onPointerDown`'s Decorate branch each keep the 450 ms pet hold from starting, so removing one alone changes nothing (the mutant `creature-is-petted-in-decorate-mode` removes both).
- **The browser script's geometry for an unlisted window** (1024 x 768@1, the mouse check) derives the zoom from the canvas width instead of a measured table; the other four windows are listed with measured values.
- **The fourth cheap-model review's fixes were not reviewed again** (they were its own suggestions: label checks and a tile-middle point in the contact sheet, an exact assertion at the tall window in `decorate-fit`, one more mutant).
- **Design hook:** `.fc-confidence`'s `border-left` in `app.css` (the Growth Forecast, A1.2) is flagged by the design hook; it is older code outside this slice and was left as it is. Offered as scope: restyle it.
- **The habitat check race** (H2a section above) is still there; not touched.
