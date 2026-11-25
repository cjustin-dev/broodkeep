# Broodkeep decisions

## 2026-11-20: one Pages project, old Cloudflare project deleted

The plan (section 2) called for a second Pages project so the old root site kept working. The owner then said the old
Cloudflare project was just made and nothing depends on it. Decision: delete it and run ONE Pages project, `broodkeep`,
with root directory `creatures`. This made a root `_redirects` rule, build watch paths and a connection test unnecessary.
The old site files were then removed from the repo root (2026-11-20, owner approved, branch `remove-old-site`, 37 files
including the template README). Kept: `LICENSE` (the template author's MIT notice) and the generic root `.gitignore`.

## 2026-11-20: no `_redirects` rule

Considered `/creatures/* /404 404` to hide game source on the old site. Cloudflare Pages `_redirects` does not support a
404 status; tested on a scratch copy, the rule is silently ignored. `/creatures/* / 302` worked but was dropped when the
old project was deleted.

## 2026-11-20: scaffold choices

- `vite-plugin-pwa` and `preact` are installed as devDependencies (the brief asked for them) but the PWA plugin is not
  wired in until Phase 7.
- `npm test` is `vitest run --passWithNoTests`, because plain `vitest run` exits 1 when there are no test files.
- `vite.config.ts` imports `defineConfig` from `vitest/config` so one file serves both Vite and Vitest.
- The D1 binding in `wrangler.toml` keeps an all-zero placeholder id (as the brief asked). The first Pages deploy
  succeeded with it. Replace it in Phase 5.
- Progress notes live in `creatures/docs/`, not a root `docs/`, because the repo root was the old site's public folder.
- `SESSION_SECRET` in `.dev.vars.example` is only a name example. The planned session design needs no signing key.

## 2026-11-20: Phase 1 design choices

- **One deterministic simulation for live play and catch-up.** `simulateTo(save, nowMs)` runs whole 1-minute steps with a
  seeded RNG whose state lives in the save (`rngState`). Splitting a stretch of time into pieces gives an identical save,
  so reopening after a day is the same code path as watching it. Tests cover this.
- **Game time is real time plus `save.clockOffsetMs`.** Dev mode skips ahead and speeds time up through that offset, so
  nothing else in the code knows dev mode exists.
- **Clock rewinds.** A rewind of up to 60 minutes (`clockRewindToleranceMinutes`) is ignored. A bigger one re-baselines the
  save to the new time and logs it. No catch-up cap: the loop simply stops when the creature is dead.
- **Calls reset while asleep, they do not pause.** An unanswered call counts as one care mistake after 60 awake minutes.
  Resetting means bedtime can never be neglect, even if the call started just before it.
- **Death is tuned to the plan's "roughly two days".** Wellness at 0 for 480 minutes kills; `starvingDrain` 0.07 was
  calibrated with a probe grid. A fully ignored creature dies 43 to 51 hours after hatching (hatch at 08:00, 14:00, 21:00).
  The test checks three hatch hours against a 40 to 56 hour window. Death cause order: hunger, then sickness, then neglect.
- **Placeholder forms.** Blip, Pip, Fennix. All three egg patterns hatch Blip. Blip becomes Pip at 6 hours, Pip becomes
  Fennix at 24 hours, Fennix is the end. The evolution code is already data driven (`evolvesTo` with `need`), Phase 2 fills
  in the real tree.
- **Canvas is scaled by whole DEVICE pixels.** Scaling by whole CSS pixels left blank margins on phones. The room is
  96 x 96 game pixels and each is exactly `k` device pixels, so it fills the width and stays sharp.
- **UI rules.** Plain CSS and a strict CSP (no inline script or style attributes; Preact `style` objects are fine).
  Icon only buttons, 76 px touch targets. The care buttons sit at the bottom of the screen, the room takes the spare
  space. Stat bars slide with `transform`, not `width`, so they animate without relayout.
- **Icons must not repeat.** The Feed button is a bowl and Clean is a broom. In the first draft Feed, Meat and the hunger
  stat were all the same drumstick, and Clean looked like a shovel. Seen in the first phone screenshots.
- **Saves are local only** (IndexedDB `broodkeep`/`kv`). A save that cannot be read is kept under `save-unreadable`
  instead of being overwritten.
- **A failed read never overwrites a save.** If the saved game cannot be read (not just "none exists"), `local.ts` skips
  every later write for that session and Settings shows the "Saving is blocked" warning. Found by the fresh-eyes review:
  before, a read error looked the same as "no save" and the first write replaced a real creature with a new egg.
  A failed open is also retried next time instead of being cached, and a later good write clears the warning.
- **One finger at a time on the room.** A second finger replaces the first hold, and only the finger that started a hold
  can end it. Before, a second finger left the first finger's petting timer running forever.

## 2026-11-20: creature emotes (owner feedback after the first playtest)

The owner asked for more visible emotion for small children: a food picture that appears and gets eaten, closed eyes and
a lying-down look when asleep, and a gentle "no" (eyes shut, slow head shake) instead of a rattle. Built exactly those
three. More emotes are listed as suggestions in the owner message, not built.

- **Eyes follow one rule: a 2 x 2 block, `WW` over `WK`.** `src/art/face.ts` finds the blocks and derives the closed-eye
  picture (top half takes the body color above, bottom half a dark line) and the lying picture from the one standing grid.
  A test requires two such eyes on every form, so Phase 2's real art must follow the rule or bring its own frames.
- **Lying down is a derived picture.** About a third fewer rows and a third more columns, removed and doubled at even
  spacing. The face rows and the top and bottom outline are never removed, the bottom edge stays on the same floor line,
  and the canvas is 24 wide because it is wider. Asleep it alternates two heights every 1.4 s (breathing). A dead
  creature uses the same picture with its eyes shut, kept flat (no breathing).
- **A meal takes 2.2 s and is only a picture.** The food drops in (0.35 s), four bites 0.4 s apart with the eyes shut
  while chewing, a short swallow, then a heart and a happy hop. The food loses a quarter per bite from the side the
  creature is on. It goes on the side the creature faces, unless the wall or the bed is in the way, then it turns around.
  The real effect (stats, poop) still happens at the tap, nothing about the meal is saved.
- **"No" is slow.** Eyes shut for 1.3 s and a sway of at most 2 pixels at about 2 swings a second, easing in and out. It
  is used for food when full, medicine when not sick, and lights when not tired. The old quick rattle is kept only for a
  tapped egg, as its own pose (`wobble`).

## 2026-11-20: feelings (the rest of the emotes, built on owner approval)

After the first three emotes the owner said to build the others suggested: blinking, sad droop, hungry tummy, sick wobble,
yawning, a blanket, and eyes that follow food. All visual only, never saved, driven by the creature's stats.

- **Mood comes from stats with fixed cut-offs.** Hungry under 25, sleepy (energy) under 25, sad under 30, sick from the
  sickness flag. `moodOf` in `scene.ts` makes it and `updateView` copies it into the view each frame.
- **One function picks the picture:** `pickFace` in `face.ts`. Order: lying (asleep or dead) beats a yawn, a yawn beats
  closed eyes (chewing, no), then eyes up for falling food, then slumped (sad or sick), then a blink, then heavy eyelids
  (sleepy), then open. A slumped creature never blinks, because the blink picture is the standing one and the body would
  pop upright. For the same reason a slumped creature has its own versions of the yawn, chewing and "no" pictures
  (`droopYawn`, `droopClosed`), so it never stands up straight for them. Only the eyes-up look at falling food is skipped
  while slumped.
- **New derived pictures** (all from the one standing grid, see the eye rule above): heavy eyelids (a dark lid line over
  the top of each eye), looking up (pupil moves to the top row), a wide mouth (a small mouth grows into an oval) and a
  slump (the lying-down squash at 15% instead of 33%, with both rows of each eye kept).
- **Eye columns are never doubled when widening.** Doubling a column inside an eye made the two eyes different widths,
  because both pupils sit on the right. Face rows and eye columns are both protected now.
- **Sad: slumped, heavy lids, a tear from each eye every 2.6 s, slow sighing.** Sick: the same slump with a one pixel sway
  and no tears, plus the green tint that already existed. Both sit still and rarely walk.
- **Hungry: now and then a "rumble"** (the body trembles a pixel for 0.9 s, with little marks beside it). **Sleepy: heavy
  eyelids and now and then a "yawn"** (1.7 s, eyes shut, oval mouth open for the middle, stretches up a pixel). Each is
  25% of the creature's idle decisions, so about one every 10 seconds. After the growl and yawn chances are taken off the
  dice roll, what is left is stretched back over 0 to 1 (`rest`), so a hungry or tired creature still wanders as often
  as a sad one instead of almost never.
- **Blink: 0.16 s every 2.5 to 5.5 s** while awake.
- **The blanket** covers a sleeping creature from the mouth down and a pixel wider each side, so the eyes show. A dead
  creature has none.

## 2026-11-21: happy eyes (owner request: "a happy eye emote for when positive things happen")

- **One look, tied to the existing happy hop.** `triggerPose(view, "happy")` already fires for a meal's end, petting,
  tickling, cleaning, curing, and the hatch and evolve pop, so happy eyes show while that 0.8 s pose lasts and nothing
  else needed a hook. `pickFace` returns `happy` (or `droopHappy` for a sad or sick creature, so it never stands up
  straight). Order: lying and the yawn and shut eyes (chewing, "no") still win, happy beats a blink, heavy lids and
  hunger.
- **The shape is a small arch,** `^ ^` as drawn on a smiling face: the eye's top row becomes two pixels, the row under
  it body color, and a one pixel foot goes on each side of that row (on body pixels only). It is derived from the one
  standing picture like every other look, so all 20 forms have it with no new art.
- **The arch is dark, except on dark bodies.** A dark arch on Dreadmaw, Hollowking and Gloomtoad was close to invisible
  (contrast 1.4 to 2.5 to 1 against the body). Below 3 to 1 the arch (and its feet) takes the creature's own eye color
  (`W`): yellow on Dreadmaw, pale green on Hollowking, white on Gloomtoad. The other 17 keep the dark arch.
  `MIN_ARCH_CONTRAST` is 3. A test requires every form's arch to show at 3 to 1 or better. A white arch counts as eye
  for the tear spot finder, which is harmless because tears are only drawn for the plain slumped picture (`kind ===
  "droop"` in `scene.ts`), and that gating is drawing code with no test.
- **The fill under the arch comes from the body beside the eye,** not from the pixel above it, because Shellby and Bastion
  have their eyes right under the outline and the arch would have filled black.
- **The closed eyes (sleep, blink, chewing) are unchanged,** and are still dark lines that are hard to see on those same
  dark bodies. Left alone on purpose: shut eyes being quiet is fine, a happy look being invisible was not.

## 2026-11-21: Phase 2, all 20 forms, the tree and the scenes

The owner chose three things when asked: build the full tree now with later rules waiting, keep every picture 16 x 16, and
add hatch and evolve scenes on top of the derived emotes (no hand-drawn extra frames).

- **The whole tree is data, in the form files.** Each form lists `evolvesTo` paths in the order they are tried, with a
  rule (`need`) each, and ends with one path that has no rule (the fallback). Several forms have a ruled path and the
  fallback to the same form. That is deliberate: the rule documents the plan, the fallback guarantees the creature always
  grows. A test requires exactly one fallback, listed last.
- **Rules are `<metric>Min` and `<metric>Max` keys** (`Need` in `types.ts`), for 16 metrics. `metrics.ts` says how each is
  read from a creature. Seven of them (training, battles, wins, chores, strength, defense, spirit) belong to systems that
  do not exist yet, and discipline has no way to rise yet. They read 0 from `counters.later`, which only dev mode writes.
  `later` is optional, so a save from before this change still loads (a test covers a creature with no `later`). Like every
  counter it resets at each evolution, which is a stand-in until Phase 3 makes strength, defense and spirit real
  creature stats that carry over.
- **A test checks that no path is dead.** For every ruled path it builds a creature sitting exactly on the rule and checks
  that this path wins, so an earlier, looser rule cannot hide a later one. It found nothing wrong in the first tree, and
  catches the mistake when a rule is loosened to `{}`.
- **Stage lengths from the plan, per path:** 6 hours (baby), 24 (training), 72 (rookie), 120 (champion). The numbers in
  the rules are first guesses and are meant to be tuned. The `need` for the fallback is empty on purpose.
- **Eggs:** speckled hatches Blip, striped hatches Drip, swirled hatches either (random from the seed).
- **Dev tree viewer** (`DevTree.tsx`): for the living creature, every path with its rules as pass or fail, which path would
  win if the time were up, and hours so far. Rules that need a system not in the game yet say so. Under it, number inputs
  for those systems, so every path can be tested. `describePaths`, `describeNeed` and `ruleText` do the work, in
  `evolution.ts`, so they are unit tested without the screen.
- **Pictures:** 17 new creatures, each drawn as the left half of a 16 x 16 grid and mirrored (a script in the work area, not
  in the repo; the grids in the form files are the source of truth). The eye rule from the emotes still holds and a test
  enforces it on all 20: exactly two 2 x 2 eyes, and the letter `W` used for nothing but eyes. A palette letter can be any
  color, so Dreadmaw's `W` is yellow and Hollowking's is pale green (hollow glowing eyes). Teeth, horns and highlights use
  other letters. Row 15 stays empty on every form (the bob moves the picture down one pixel).
- **Scenes are looks only** (`moment.ts`, state in `View`, never saved). The screen notices the save changed (egg to
  creature, or one form to another) and plays: hatch, 2.6 s: the egg shakes harder with every crack showing, one flash,
  the shell halves fly apart and the baby hops out with sparkles. Evolve, 3.0 s: the old form flickers white (2 to 5
  times a second) with sparkles circling in, one flash, the new form fades in from white in four steps and hops. One flash
  per scene at 80% white, which stays well below the usual limit of three flashes a second. `Game`'s constructor records
  what was on screen before the catch-up, so an evolution that happened while the app was closed still plays.

## 2026-11-21: license removed, plan sections 1 and 2 rewritten

- **`LICENSE` removed.** It was the template author's MIT notice (copyright 2023, a bot imported it with the template), so
  it named someone else as the holder for this game. With no license file the code is all rights reserved, which is the
  safe default for a family game. If the owner ever wants others to reuse the code, add a license then with the owner's own
  name. The earlier "Kept: `LICENSE`" line above is history.
- **Plan sections 1 and 2 and the handoff hosting note now describe what exists:** one Pages project from `creatures/`,
  and a repo root with only `.gitignore` and `creatures/`. The folder layout in section 4 and two lines in `README.md`
  that still said "second project" and "old website" were fixed in the same change. The old Cloudflare project
  (`kharbranth`) was confirmed deleted by the owner on 2026-11-21.


## 2026-11-21: creature redesign (owner: "looks so dopey and have no real character, I want real changes like in Digimon")

The owner approved a concept sheet (a private page of all 20 creatures) before any code, answering three questions with the
recommended options: full bodies that grow by stage, two drawings per creature, concept sheet first. This supersedes
"keep every picture 16 x 16" from the Phase 2 decision. Drawing rules and per-creature notes are in
[art-direction.md](art-direction.md).

- **Sizes by stage:** baby 16, in training 16, rookie 22, champion 28, ultimate 32. The two babies were not redrawn. The
  evolution tree and its numbers did not change.
- **Two drawings per form:** `Form.idle` plus optional `Form.idle2` (every form but the two babies). The game swaps them
  every 0.5 s while standing, hopping or happy, every 0.25 s while walking (`frameOf` in `idle.ts`), and uses the first
  for every other pose. Shut eyes, lids, happy arches, looking up and a yawn are made from whichever drawing is showing,
  so the face never jumps. The slumped and lying looks are made from the first drawing only. This keeps the art cost at
  two grids per creature.
- **Size is data, not a constant.** `layout.ts` has `standY`, `walkMaxX`, `bedSpot`, `deadX`, `stoneX` and `wideWidth`
  taking the size. `ROOM.walkY`, `ROOM.walkMaxX`, `ROOM.bedX`, `ROOM.deadX` and `WIDE_WIDTH` are gone. A creature's feet
  stand on the same floor line at every size (picture top at `72 - size`), so a 16 pixel creature stands exactly where it
  did. `View.size` is set by `updateView`, whose caller passes `sizeOf(save)` (an optional fifth parameter, default the
  last size). It is not a field of `Mood`, which is about feelings.
- **Walking area:** the left edge goes from 6 to `76 - size`, so a bigger creature has less floor to walk on and often
  stands in front of the bed (a 16 pixel one already did).
- **Lying and slumped pictures are `min(size + 8, 32)` wide,** never wider than the 32 pixel bed, so the two biggest
  stages only get flatter. The bed's middle moved from x 76 to x 78 (the bed spans 62 to 94), so a 28 or 32 pixel creature
  lies exactly on it. A sleeping 16 pixel creature moved two pixels right.
- **Scaled with the size:** the thought bubble (top right of the head), the sleeping "z", the tummy marks, the heart (left of
  the middle, above the head), sparkles (over the whole body), the food on the floor (its near edge at the creature's
  side, on the floor line), the tap hit box (a square of the creature's size plus 6 pixels of slack), the tombstone
  (anchored to the floor, overlapping the lying creature by two pixels) and the evolve scene.
- **The evolve scene keeps the creature's middle** when the form is a different size (clamped into the new walking area),
  draws the old form centered on the same spot, and spreads the sparkle burst and ring to the new size.
- **Every drawing keeps the eye rule,** and now also has a mouth letter `M` and an empty last row, enforced by
  `tests/data.test.ts` on both drawings of all 20 forms. Dreadmaw and Hollowking had no `M`. They got two `M` pixels each,
  colored like the pixels they replaced (the dark red of the jaw, the dark of the nose slit), so they look as drawn and
  only a yawn opens a dark mouth.
- **Happy arches fill from the inner side.** `happyEyes` took the body color under the arch from the first body pixel
  beside the eye, left side first. On a face with cream cheeks outside the eyes (Thornback) the left eye filled cream and
  the right eye green. It now looks at the side toward the middle of the picture first, so both eyes agree, and a test
  checks that every form's two arches match. With the new colors four forms get the white arch: Dreadmaw, Hollowking,
  Gloomtoad and Thornback (its green body is 2.8 to 1 against the outline).
- **Gate added on purpose:** a test requires every drawing to follow the face rules, so a redrawn creature cannot break
  an emote silently. The first version of the sleeping picture still needed a look: sizes that passed the tests had a
  blanket slab hanging 5 pixels past the bed, found only by viewing the room, which is why the cap at the bed width exists.
- **The drawing toolkit stays out of the repo** (a Python script set in the hub session's work area). The grids in the
  form files are the source of truth. Offered to the owner to add under `creatures/tools/art/`. *Superseded the same day,
  see "the drawing toolkit moved into the repo" below.*

## 2026-11-21: the drawing toolkit moved into the repo

The owner said to move it (it had stayed out of the repo until the redesign was approved). It lives in `creatures/tools/art/`:
the canvas toolkit, the three stage files that draw the 18 creatures, `emit.py` (writes the drawings into the form files,
with `--check` to compare without writing) and `preview.py` (contact sheet, needs Pillow). It is plain Python that the game,
the build and the tests never run, so a Python file cannot break a deploy. The generators were first brought in line with the
form files (Dreadmaw's and Hollowking's `M` mouth pixels had only been patched into the grids), so `emit.py --check` reports
no differences. This replaces the "stays out of the repo" bullet in the redesign section above. `__pycache__` is ignored.

## 2026-11-21: Phase 3 in four slices, and slice 1: the habitat (jobs, coins, bag)

Phase 3 (habitat, jobs, coins, HP, combat, Creature Book, legacy shelf) is too big for one pull request. The owner chose
the order, and that food stays unlimited:

1. **Habitat jobs, coins, the bag and the new save format** (this slice).
2. Turn-based combat: HP and recovery, wild creature ladders, stat gains (these feed `battles`, `wins`, `strength`,
   `defense` and `spirit`).
3. Garden plots, standing chores and habitat upgrades (the first thing coins buy).
4. The Creature Book and the legacy shelf.

- **Food stays unlimited.** The habitat does not supply food (plan section 7.2 says crops and catches become foods). A busy
  day cannot starve a creature, and the kitchen in Phase 4 can turn gathered materials into hot meals.
- **A job is a timer on the creature** (`creature.job`: spot, start, end). It pays out inside `stepMinute`, so it also
  finishes while the app is closed, and splitting time into pieces gives the same save (tested). Randomness is only used at
  the payout, so a game with no jobs behaves exactly as before.
- **Checks are made when it sets off** (`jobRefusal`): not busy, not asleep, not sick, old enough for the spot, and energy
  left over the floor afterwards. A creature that is already out still finishes if night falls or it falls sick on the way
  (a job is 3 to 8 minutes). The refused tap shows a picture of the reason (zzz, sick, low energy, lock).
- **Away means away.** One creature cannot be in two places, so while it works the room is empty with a bubble that says it
  went out, and feeding, cleaning, lights, medicine and petting are unavailable (`alive()` returns null for it). "Call back"
  brings it home at once with nothing and no energy refunded, as the way out if it needs care. Considered: leaving the
  creature in the room while it "works", which breaks the picture the moment the screens are switched.
- **Stage gates** (plan 7.3: light jobs for the young, heavier spots as it grows): baby and in training use the meadow and
  the herb patch, rookies add trees and the pond, champions add the rock pile. A locked spot shows a lock.
- **The numbers** (first guesses, in `src/data/habitat.ts`, written from the data):

| Spot | Gives | From stage | Minutes | Energy | Coins | Amount |
|---|---|---|---|---|---|---|
| Bug meadow | Fiber | baby | 3 | 5 | 1 to 2 | 1 to 2 |
| Herb patch | Herbs | baby | 3 | 5 | 1 to 2 | 1 to 2 |
| Trees | Wood | rookie | 5 | 10 | 2 to 3 | 1 to 2 |
| Pond | Fish | rookie | 6 | 10 | 2 to 4 | 1 to 2 |
| Rock pile | Stone | champion | 8 | 15 | 3 to 5 | 1 to 3 |

  A creature sets off only if it keeps at least 20 energy afterwards. The welcome-back cards keep at most 5 unseen jobs
  (the oldest card is forgotten, never the coins).
- **Save version 2.** `coins`, `inventory` (materials) and `hauls` (finished jobs not yet seen) were added; `creature.job` and
  `counters.chores` are optional, so no creature needs converting. `migrateSave` upgrades a version 1 save (empty purse, empty
  bag, no cards) and refuses anything else, and `loadSave` uses it. A refused save is still kept under `save-unreadable`.
- **`chores` is now a counted evolution metric** (jobs finished this stage, reset at each evolution; it feeds Pip to Shellby
  and Shellby to Bastion). Dev mode's number is the TOTAL the tree reads: it stores only the difference above the real count,
  so it cannot be set below what was really done. A job that finishes in the very minute an evolution opens counts toward it
  (`stepJob` runs before `evolveIfReady`; tested).
- **Spots are buttons under the picture,** not taps on it: big, keyboard reachable, and the same pattern as the care buttons.
  Each shows the picture of what it gives (the fish icon is the food one). While the creature is out, the row is replaced by
  one "Call back" button of the same height so the picture does not jump.
- **Two big switch buttons** (house and tree) sit above the care buttons for a living creature. The screen shown is not saved:
  a new visit starts in the room, and a death or a new game goes back to it.
- **In the habitat** a working creature stands in front of its spot, hops, and a progress bar fills over the spot (drawn on
  top, because a 32 pixel creature covers a whole spot). At home it stands on the path. A sleeping creature is not drawn
  outside: a bubble with a house says it is in bed (found by looking, the first version had it lying on the path).
- **A job is never more than its own length away.** `stepJob` pulls a finishing time that is further ahead than the job's
  length back to that length. Without it, setting the device clock back by more than an hour (the case where the game starts
  again from the new time) would keep the creature out, and care locked, until the old finishing time (found by the review).
- **The screen goes back to the room** whenever the creature is not alive (`Game.changed()`), so a new egg and its hatch open
  in the room even if the player died on the habitat screen (found by the review).
- **Tests and checks:** 39 deliberate code mutations of the job, save, metric and placement code were all caught (25 on the
  first pass, 7 on the placement tests, 7 on the review fixes; one test measured the purse against itself and was rewritten
  after a mutation survived). The screen reset has no unit test: a headless phone browser run (die on the habitat, new egg,
  hatch) opens in the room, and fails the same run with the reset removed. The habitat was driven in a headless phone browser
  (baby, rookie, champion and ultimate sizes, night, a refused tap, a job, the room while away, the welcome-back card,
  calling back) with no console problems. A cheap-model review found 9 points: 6 fixed, 2 written down (below), and 1 left
  alone on purpose (two result types exported but unused, like the other action result types).

## 2026-11-21: Phase 3 slice 2: turn-based combat and the arena

Built after the owner merged slice 1 ("merged, start slice 2"). Plan section 7.6. All numbers are first guesses, in
`src/data/combat.ts`, and the figures below were written from that file and a simulation, not from memory.

- **Who may fight** (`fightRefusal`, checked when the fight starts, nothing is checked again after): not away working
  ("busy"), not asleep, not sick, from the in-training stage up (a baby is "too-young"), and it must keep at least 20 energy
  after the fight's cost of 10 ("tired"). A refused tap shows the reason as a picture, like the habitat does (zzz, sick,
  energy, lock, tree for away).
- **Stats and HP.** Each form already had base `vit, str, def, spi, spd`. A creature's stat is its base plus trained points
  (`creature.trained`, optional, so no migration; the save version stays 2). Max HP is vitality times 3. The trained points a
  creature can hold per stat are capped by stage: baby 0, in training 12, rookie 20, champion 32, ultimate 50, and half of them
  (rounded down) carry over when it evolves (plan 7.1). `creature.hp` is optional: missing means full, and it is deleted again
  when resting brings it back to full, so a creature that never fought has exactly the same save as before.
- **One round** (`playRound`, pure, no UI): the player picks Attack, Guard or Special, the wild creature picks its own
  (special 70% of the time when its meter is full, else guard 20%, else attack), guards go up first, then the blows land in
  speed order (a tie goes to the player) and a knock-out stops the other blow. Damage is the attacker's strength (spirit for a
  special) times 1.5 (2.4 for a special), times a random 0.85 to 1.15, minus the target's defense times 0.5 (0.25 for a
  special), at least 1, halved by a guard. Speed also gives a critical hit chance of 1% a point up to 25% (times 1.5). The
  special meter holds 3: guarding fills it by 1 and every hit taken fills it by 1; a special needs it full and empties it
  (the button is disabled until then; if one is played anyway it is an attack, tested). A creature with discipline under 50
  sulks, ignoring the command, (50 minus discipline) percent of the time up to 30% (dormant at the starting 50, and nothing
  raises discipline yet).
- **The wild creature** is a random form of the same stage with its base stats times the rung: 0.7, 0.85, 1.0, 1.15, 1.4. The
  last rung is the boss. A win moves the creature up a rung, a boss win starts again at rung 1, a loss keeps the rung, and
  evolving resets it. The fight is seeded from the save's `rngState`, so it is repeatable and each fight differs.
- **What a fight pays** (`finishFight`): a win gives rung to rung + 2 coins (double for the boss), half the time one material
  from the spots its stage can use, and 1 trained point (2 for the boss) in the stat of the action it used most (Attack
  strength, Guard defense, Special spirit; a tie goes to attack, then guard, then special), up to the cap. It keeps the HP it
  has left. A loss leaves it at a quarter of its max HP and takes 10 more energy. Both count in `battles`, a win in `wins`.
- **Resting** happens in `stepMinute`, so it also happens with the app closed: empty to full takes 30 awake minutes, twice as
  fast asleep, half as fast while hunger or hygiene is under 25. Because a win keeps the HP left, a run up the ladder is a
  matter of how much it can take before it needs a rest.
- **The evolution numbers now read real stats.** `battles`, `wins`, `strength`, `defense` and `spirit` are counted metrics. The
  three stats read the form's own number plus trained points (so they start above 0), and dev mode stores only the part above
  that. Only `training` is still not counted (there is no Train action).
- **A fight is never saved.** It lives in `game.arena`, and the save changes only when the fight ends (`endFight`), at the
  moment its last round is played. Closing the app or tapping Run away forgets it and costs only the energy already spent.
  Considered: saving a fight in progress. It would need the whole battle and its random state in the save for a thing that lasts
  one to two minutes. A death or an evolution in the middle of a fight ends it; falling asleep or sick does not.
- **The arena** is a third big button next to the room and the habitat. The nav is held (the other two buttons wait) while a fight
  is on, and "Run away" is the way out. The picture has a stone ring with banners, both creatures face each other (the foe
  flipped), HP bars on top, the special meter as three pips under the player's bar and the ladder as five pips under the foe's
  (cleared green, this one yellow, the boss red). No numbers are drawn. Each round is played back in time (`playback`): guards and
  sulks first together, then each blow in turn (0.5 s each): the attacker lunges, the target flashes white and is pushed back, a
  special sends a spark, a guard shows a shield, a hit wince and a special shout use the creature's own eye and mouth pictures, the
  winner shows happy eyes and the loser slumps in grey. The HP bars replay the round from `Battle.hpBefore`, so a bar drops when
  the blow lands. The buttons wait until the round has finished playing. The result is a strip in the dock (not over the picture,
  so the last blow stays in view): coins, material and the stat that grew, or a cloud and zzz for a loss. The dock keeps the same
  height in every state so the picture does not jump.
- **Dev panel:** battle HP percent and fight rung sliders (so the boss and a hurt creature can be tested without playing up to
  them), and the "Numbers for later systems" text now says only training is missing.
- **What the numbers do** (simulated with the real combat code, 300 fights for every form of the stage and every rung, an
  untrained creature at full HP that plays a special whenever the meter is full and attacks otherwise): the win rate by rung 1
  to 5 is 97 to 100%, 79 to 91%, 52 to 68%, 13 to 21% and 1 to 5% (the boss) across the four fighting stages, about 4 rounds a
  fight. With all of attack, defense and spirit trained to the stage cap it is 98 to 100% at every rung. So the ladder expects
  training, and the caps may be too generous: each is about twice the base stats of its stage or more (in training the cap is 12 against
  a base strength of 4 to 7). Tune after real play.
- **Tests and checks:** 97 deliberate code mutations of the combat, arena and `Game` code were all caught (63 of 64 on the first
  pass of the rules, 28 of 31 on the arena and screen code, the 4 survivors were test gaps and were fixed and re-run, and 2 more
  for the review fixes). One survivor showed a guard's meter cap was hidden by the cap on the hit line, which only a fight where
  both sides guard can see. Four older tests that assumed strength reads 0 were rewritten to the new truth (strength, defense and
  spirit start at the form's own numbers; only training is still "not in the game yet"). The look found the picture jumping when a
  fight started because the dock got shorter, so every arena state now keeps the same dock height. A cheap-model review found 3
  points, all tests whose titles promised more than they checked, all fixed.

## 2026-11-21: the Land art (milestone 2 of the Paradise plan)

- **One file per growth line** (`land_cragpup.py`, `land_dugling.py`, `land_frillet.py`, `land_sporeling.py`), a list file
  `land_all.py` and `baby.py`, instead of one 800 line `land.py`. Why: each young and its four adults share a palette family
  and are reviewed together.
- **Palette family per line, silhouette by tier.** Tier 1 is the biggest and most striking (horns, a sun frill), tier 2 round and
  friendly, tier 3 scrappy and grumpy, tier 4 thin or limp and sad. Dugling is a tan halfway between Pebblin and Barrowbun, then
  made warmer so it is not mistaken for Pebblin.
- **The field is a straight port.** `land_field.py` is the approved gritty-sheet code with one change: the creature paste became
  an optional argument. The game side decides how the picture reaches the game (milestone 3).
- **Blind review before the owner sees anything.** A cheap model gets the unlabeled sheets with no intent and describes each
  row; the differences from the intent became the redraws above. A second cheap model reviews the code.


## 2026-11-21: the game side of the Paradise growth (milestone 3)

- **The engine stamps the face; drawings are body only.** Each form has a `face: { x, y, mouth, mouths? }` anchor (the left eye's top
  left pixel and the mouth's top row). `src/art/face.ts` stamps eyes, brows, tear, blush and mouth from `src/data/face-patterns.json`,
  the same file the Python tools read, and a test hashes 308 stamped pictures (22 forms x 7 looks x 2 drawings) against a Python
  fixture (`tests/fixtures/face-hashes.json`, written by `face_hashes.py`), so a contact sheet shows what the game shows. The right
  eye is the left one moved over; brows, tear and blush are mirrored; mouths are centered with even widths. Why: 64 creatures
  with hand-drawn faces in seven looks each would be 448 pictures to keep in step.
- **Face letters are reserved.** A body may not use I, W, A, P, U or M (K and T are fine), so the stamp never has to guess what it
  may overwrite. `lib.problems` reports a body that does; the two drawings of a form must also share one face.
- **Tears are static.** The old animated tear and `eyeSpots` went with the old art; the stamped tear is part of the sad look.
- **The creature data is generated.** `tools/art/paradise/emit_ts.py` writes `src/data/forms/baby.ts` and `land.ts` from the Python
  drawings and refuses (exit 3) on any art problem; `--check` finds a hand edit. Stats come from the stage and a role (fighter,
  tank, caster, quick) in `forms/stats.ts`: stage budgets baby 20, kid 29, young 44, adult 93, worked out from the old forms.
- **Sizes and the 128 pixel room.** Egg 16, baby 20, kid 24, young 36, adult 48. The room, the fields, the habitat and the arena
  are 128 x 128. The bed is 56 wide (an adult plus 8, `BED_WIDTH`); a lying or slumped picture is `min(size + 8, 56)` wide.
- **The walking limit keeps food off the bed.** `walkRight` is 84, which is `bedLeft + 16` (16 is the smallest picture, the egg), so
  a walking creature's left edge is never past the bed's left edge, and food put on its left side can never land on the bed. A
  first version used 120 and the eating test caught it. A creature in a field walks the same left part of the picture.
- **The Land field reaches the game as a sprite.** `emit_ts.py` also writes `src/art/field-land.ts`: the 128 x 128 picture as
  palette letters (41 colors of the 62 letters it may use), like every other sprite, drawn once into a cached canvas. Not a PNG:
  the art stays text, the CSP needs nothing new, and the test can check it. A field that is not 128 x 128, not RGB or needs more
  than 62 colors stops the emitter. Why not draw it at runtime: the gritty sheet is Python code with dithering.
- **When the field shows.** Only for a living creature that is not away on a job and whose place is a field with a picture.
  Anything else (home, an egg, a dead creature, Water and Sky until their slices) shows the room. The field is always dusk.
- **The place picker is a tray.** A fifth care button ("Go somewhere", a signpost) opens a tray of Home, Land, Water and Sky above
  the buttons, like the food tray. The current place is pressed. A locked field shows the lock badge and, when tapped, the creature
  shakes its head. Both trays fit on one row whatever the count (a creature of the kid stage or older has five foods).
- **The habitat shows where a field creature is.** A creature out in a field is not drawn at home in the habitat: the habitat is
  empty with a bubble of that field's icon (like the house bubble while it sleeps), and the screen reader sentence says "out in the
  Land field". One `placeIcon` map in `art/sprites.ts` serves both the picker and the habitat. Found by the layer B review.
- **Working in the habitat moves a big creature in.** `workingPlace(spot, size)` clamps the middle so a 48 pixel creature at the
  meadow, which is near the left edge, does not hang off the picture.
- **The first poop spot moved right** (26 to 30) because the poop icon covered the last two columns of the food bowl; a test now
  keeps every spot off the bowl.
- **Icons.** The pellet was a brown mound like the poop icon; it is now a pile of yellow kibble. The treat is a wrapped candy. The
  signpost, Land, Water and Sky icons are new 8 x 8 placeholders.
- **Old saves are not read** (owner, 2026-11-21). Save version 3 starts a new egg; an unreadable save is kept as `save-unreadable`.
  Tell the owner at pull request 1 time that existing saves reset.

## 2026-11-21: the Water slice (milestone 5 of the Paradise plan)

- **The Water roster is in the plan** (section 4, "The Water roster"): four lines, one animal family each (fish, sea herbivores,
  crustaceans, soft sea life), four tiers each. Names and animals are my choice. Kid Drizzle, young Lanternfin and adult Murkfang
  were already drawn; this slice draws 3 young (Kelpet, Scuttlet, Bellet) and 15 adults. Water now has 1 kid, 4 young and 16 adults
  (21 forms), the game 43.
- **Roles.** Tier 4 is always quick. Tier 1 to 3 vary: Murkfang, Rustgill, Brinetusk, Rampclaw, Chipclaw and Spinewad fight;
  Puffglow, Coralback, Shellsnug and Inkpot tank; Bubblebelly and Stormbell cast. The young are Lanternfin caster, Kelpet tank,
  Scuttlet quick and Bellet caster.
- **The foods copy the Land numbers in the same slot** (seafood = meat 35/3/0, seaweed = carrot 20/2/3, shrimp = worm 25/5/0, with the
  same digest times), so the two fields are balanced the same way. Foods stay unlimited.
- **The Water field** is a sunken ruin: light shafts, a far haze of columns, a toppled column, a broken arch with coral, kelp, an urn,
  glowing anemones, and a pearl shell where the Land one has the rune slab (same centre, feet on the same row, so every size sits
  the same way). 43 colors of the 62 allowed. `water_field.py` draws it, `emit_ts.py` writes `src/art/field-water.ts`.
- **Generated files.** `emit_ts.py` now writes `forms/water.ts` (21 forms) and `field-water.ts` too. `water_all.py` lists the 21 in
  order and fails on an id used twice or a drawn creature left out. `face_hashes.py` now covers Land and Water (602 pictures, 43
  forms x 7 looks x 2 drawings); `selftest.py` gates every Water creature (102 cases).
- **Water opens in the picker** because its plan is no longer null. The food tray for a Water creature shows pellets, seafood,
  seaweed, shrimp and the treat on one row.
- **The playthrough test covers both fields** (32 cases: 2 fields x 4 young x 4 tiers), each reaching the planned adult at the
  planned hours. The same care numbers reach every Water tier, so no tuning changed.
- **Review.** A cheap-model fresh-eyes review of the new Python (read-only, the new files by path and a diff of the three edited
  tools) found 6 real code defects, all fixed (a "chip" line that painted outline pixels into Brinetusk's belly, a `water_all.py`
  check that could never print, two `* 0` leftovers, an unused import, a `28 - 6 + 6`). Its blind look at four unlabeled sheets
  named 13 of 20 rows with high confidence and led to three picture changes: Softshell (read as a grub, now has antennae outside
  the shell), Inkpot (the ink blot read as a stain, removed) and the young Bellet's frame-1 tentacles (zigzag, now a gentle lean).
- **Mutation checks.** Five breaks were made on purpose and each failed the new tests: two Water adults swapped, Water locked again,
  Water showing the Land picture, a Water adult id that does not exist, and a Water food moved to another field. Each file was then
  restored and compared with its saved copy.

## 2026-11-21: the Sky slice (milestone 6 of the Paradise plan)

- **The Sky roster is in the plan** (section 4, "The Sky roster"): four lines (drakes, songbirds, moths and bees, clouds), four tiers
  each. Names and animals are my choice. Kid Cinderling, young Scorchlet and adult Ashwing were already drawn; this slice draws 3
  young (Chirplet, Nectlet, Wisplet) and 15 adults. Sky has 1 kid, 4 young and 16 adults (21 forms), the game 64.
- **Roles.** Tier 4 is always quick. Tiers 1 to 3: Sootsnarl, Peckjack, Spitewing and Galecrown fight; Hearthwing, Downwren,
  Honeyfuzz and Smogrump tank; Ashwing, Paleveil and Softnimbus cast; Gildcrest is quick. The young are Scorchlet quick,
  Chirplet quick, Nectlet caster and Wisplet tank.
- **The foods copy the Land numbers in the same slot** again (chicken = meat, corn = carrot, syrup = worm), with the same digest times.
- **Beaks are mouth patterns.** `sky_parts.beak_mouths` gives the five looks (calm, flat, smile, frown, yawn) so a beak opens when the
  creature is happy and lowers when it is sad, without an engine change. Cinderling and Scorchlet keep `mouth: null`.
- **The sleeping blanket was left to its fallback, and the test changed.** After wiring, 11 forms failed "the blanket starts at the
  mouth": Cinderling, Scorchlet and the 9 beaked adults have no M pixel on a closed face. I did not change the engine (placing the
  blanket from the anchor row would be a code change for a fallback that already works and has its own test). The per-form test now
  asserts the blanket starts below the lowest closed-eye row for every form (and at the mouth when there is one). The five
  forms looked at in the running game show their eyes above the blanket.
- **The Sky field** is a floating island ruin in a bright morning sky: dithered sky bands, a sun with a glow, far floating islands, birds,
  a cloud sea, a grassy dome, drifting stones, a broken sun temple, a fallen column, and a pale stone sun disc with a gold inlay where
  the Land one has the rune slab (same centre and feet row). 40 colors of the 62 allowed. `sky_field.py` draws it and `emit_ts.py`
  writes `src/art/field-sky.ts`.
- **Generated files.** `emit_ts.py` now writes `forms/sky.ts` (21 forms) and `field-sky.ts` too. `sky_all.py` lists the 21 in order and fails
  on an id used twice, a creature left out, or a sad beak that does not start lower than a calm one. `face_hashes.py` covers all three
  fields (896 pictures, 64 forms x 7 looks x 2 drawings); `selftest.py` gates every Sky creature (120 cases).
- **All three fields are open**, so no test can use Sky as "the locked field". `tests/helpers.ts` has `withLockedField(id, check)`, which
  takes a plan away for one check and puts it back in a `finally`; the four tests that need a locked field use it: going to one (in
  `actions.test.ts` and in `growth.test.ts`), dev mode going there anyway (`dev.test.ts`), and `planOf` refusing it with the plan back
  afterwards (`data.test.ts`).
- **The playthrough test covers all three fields** (48 cases: 3 fields x 4 young x 4 tiers), each reaching the planned adult at the
  planned hours. No tuning changed.
- **Review.** A cheap-model fresh-eyes review (the new Python by path, a diff of the 19 tracked files, 7 unlabeled sheets) made 13
  findings. 7 were fixed: the sad beak did not lower (the frown's one-row shift was cancelled when the pattern was placed, 8 forms;
  now fixed and guarded by an assert in `sky_all.py`), dead palette entries "T" (removed), a `* 0.0` leftover, a duplicate list in
  `beak`, an over-claiming docstring, three second drawings that barely differed (Tatterwing 8 cells, Slumpfinch 10, Wisplet 11,
  below the lowest Land 20 and Water 14; now 94, 143 and 69) and a test that could never fail (rewritten). 6 were left: Smogrump's
  feet and Wisplet's lobes (deliberately lumpy), Scorchlet's missing mouth (a scope suggestion), the combat test being Land only (not
  a gap: the foe is any form of the stage, from every field), the chicken icon near the meat icon, and the far islands and
  fallen column reading as triangles and a fence. Its blind reads are in known-issues.md.
- **Mutation checks.** Nine breaks were made on purpose and each failed the test that guards it: the blanket fallback moved near the top,
  the lock check removed, the lock helper not restoring the plan, two Sky adults swapped, a Sky face anchor moved, the Sky picture
  dropped, a Sky food number zeroed, a bogus field picture added, and the sad-beak fix undone. Each file was restored and compared with
  its saved copy.

## Cloud saves (2026-11-21, branch `cloud-saves`; the plan and edge cases are in [cloud-saves.md](cloud-saves.md))

- **The password is stretched in the browser** (PBKDF2-SHA256, 600,000 rounds, salt `broodkeep-v1:` plus the lower case username; it was the email until 2026-11-22) and the
  server stores only a salted SHA-256 of the 32 byte result. Measured in `workerd`: 100,000 rounds took 19 ms and 600,000 took 68 ms
  against the free plan's 10 ms CPU limit, and the plan says no paid plans. CLAUDE.md section 3 says "PBKDF2 on the server": its edit
  is proposed, not applied.
- **Sign up needs a family code** (`SIGNUP_CODE`, a dashboard secret; closed when unset). The account name is a login name only.
- **A username, not an email, signs in (2026-11-22, the owner asked "can we just do user id instead of email?"; read as a name the
  family picks).** 3 to 20 characters of `a-z 0-9 . _ -`, starting with a letter or digit, lower cased and trimmed; the PBKDF2 salt, the
  API field, the two database columns and the stored device record all say `username`. Nothing was ever emailed, so nothing is lost.
  Old email accounts are left inert in the table (not deleted); the migration is `migrations/0002_username.sql`. Plan section 7.
- **Sessions** are a random token in an HttpOnly `__Host-` cookie, 90 days, stored as a SHA-256. **CSRF**: every write needs the
  site's own `Origin` and `application/json`.
- **Which save wins:** the same base revision is accepted; otherwise the strictly newer `savedAt` wins, ties keep the server's, and
  the loser is stored in `save_backups` (every conflict, plus at most one routine backup per 30 minutes, newest 10 kept).
- **Only the player's actions count as changes.** The first review found that a device left open and idle saves every game minute
  and would win every conflict, undoing what was done on the device in use. `Game.changed(byPlayer)` is false for the clock and for a
  game put in from the account, and only a player's change marks the game as changed for the sync.
- **No local "aside" copy.** The first version kept the game a player replaced in one IndexedDB slot (overwritten by the next
  replacement, errors swallowed). The review showed the on-screen "kept as a backup" was not true for it. Now the game that is not
  kept is stored in the account's backups through the same save route (base revision 0, dated 0 or after the account's game).
- **A new egg started because the saved game could not be loaded counts as a device that never synced** (`metaForNewGame`), so its
  first tap cannot send the egg over the account's game.
- **Tests run on `node:sqlite`.** The `miniflare` in the installed wrangler (5.x beta) has an unstable options format, so a small
  adapter gives `node:sqlite` the D1 methods the code uses, with the real migration file; the real D1 runtime is exercised by an end to end
  run with `wrangler pages dev` and a local D1 (a script outside the repository).
- **Save size is counted in bytes** (256,000), the same unit as the request body cap, after a review found the two disagreed on
  non-ASCII text.
- **Left as they are (review):** the rate limit race (known-issues), the server not validating a save beyond `version: 3`, sleep hours
  not counting as "touched" for an egg, the routine backup revision label.
## 2026-11-21: the Creature Book (owner chose it as the next item)

- **What it is.** CLAUDE.md section 7.8's collection page, in a small form: a header button opens a panel listing all 64 creatures.
  A form nobody has raised is a flat dark shape and "???". It fills in (picture and name) the first time a creature of that form is
  raised. It is per save: the family-wide book waits for accounts (Phase 5). Not built: the legacy shelf, soften mode wording.
- **The record is `Save.book`**, a list of form ids in the order they were first met, kept when a creature dies and a new egg
  hatches. `discover()` (`game/book.ts`) adds a form once and writes one log line ("New in the Creature Book: Name (n of 64)"). It is
  called in `hatchIfReady` (the baby), `evolveTo` (every growth, and so the dev tool `forceEvolve`) and `forceHatch`.
- **No save version bump.** Version 3 stays. `migrateSave` gives a save with no `book` (or one that is not a list) the forms its living
  creature must have been through (`lineageOf`: baby, kid, young, adult, cut at itself), or an empty book when there is no creature.
  So a creature already grown does not make the player raise it again.
- **`forceHatch` adds only the form it names.** The kid and young it would have grown from were not raised, so the dev tool does not
  claim them.
- **The pages are laid out so a column is one line of the family tree.** "Baby", then one page per open field with six rows: the kid, the
  four young (the order of the field's foods, then the fourth "other" young), then four rows of adults, tier 1 at the top, where
  column n holds the adults of young n. Rows of one picture (baby, kid) are centred.
- **The layout is built on first use, not at import.** `state.ts` imports `data/book.ts` (for `lineageOf`), and
  `growth-fields.test.ts` mocks `data/fields`; a layout computed when the file loaded read the mock and the test file failed to
  load. `bookPages()`, `bookIds()` and `bookTotal()` are functions that build once. Rule: a module the save code imports must not
  read the growth tree at load.
- **Hints are words, and only for the next step.** A missing form shows a hint only when the form it grows from has been raised, so the
  book guides without giving the whole tree away. Kid: "Take a baby to the Land" (or Water, Sky). Young: "Feed it lots of
  {food}", and for the fourth young "Pellets only, or an even mix" (what `pickYoung` does when no field food leads, or two tie). Adult
  by tier: "Perfect care", "Good care", "A few care mistakes", "Neglect it". No numbers: those are in `tuning.ts`.
- **The dark shape** is the real picture with every palette letter set to one colour, `#6a58a8` (`art/silhouette.ts`). The first colour
  was about 1.1 to 1 against the page background and the review caught it; this one is about 3.2 to 1.
- **Pictures are drawn at 1.5 times their own size** (rounded), so the five sizes keep their order against each other in a four column
  grid. Names are bold and use `min(0.72rem, 2.85vw)`, a little under the app's 0.8rem floor and smaller on a narrow screen: the
  widest name (Hollowbloom, 84 pixels at 0.72rem) has to fit a cell a quarter of the page wide. At a fixed 0.72rem it fit at 390 pixels wide
  but Hollowbloom and Cindermane broke mid-word at 360, and 15 names at 320. With the width-based size a script measured every name
  with all 64 raised: one line each at 390, 360 and 320 (`overflow-wrap: anywhere` stays as a last resort).
- **The header button reuses the `.gear` square** and a new 8 x 8 book icon (red cover, cream pages), a placeholder like the other icons.
- **Tests.** `tests/book.test.ts` has 18 tests: every creature listed once, the page structure, `lineageOf` for every form, each place
  a form is discovered, older saves, the hints and the silhouette. `playthrough.test.ts` also checks that the book of a raised
  creature equals the forms it went through, in order. The UI has no unit tests (Vitest runs in node); it was looked at in a headless
  phone browser.
- **Review and mutation checks.** A cheap-model fresh-eyes review (run before the tests, as the home rule says) made 9 findings, all
  checked and fixed: the dark colour, the "pellets or a mix" hint wording, columns stretched by long names, hint text under the size
  floor, single-picture rows left-aligned, a wrong row count in a test, an unasserted `hatchIfReady`, an impossible save ("alive with no
  creature") in a test, and a comment for the dev path. Ten mutation checks each failed a test and the file was restored and compared:
  no check for a repeat, evolve without `discover`, hatch without it, dev hatch without it, migrate without the lineage, a wrong young in
  the lineage, a tier hint off by one, hints without the parent rule, a silhouette in two colours, the tier rows in the wrong order.

## 2026-11-21: the special form (owner's answers; the name and look are my choice)

- **The owner's answers** (a question with three options each; all recommended options): "no care" is 4 hours awake with no feed, clean or
  play (sleeping hours do not count); it applies to a baby or a kid; the special wins over the 6 hour baby safety net; the special is one
  creature that grows no further.
- **The counter is `Creature.counters.neglectMinutes`**, optional like `chores` (a save from before it reads as 0), set to 0 by every new
  stage (`freshCounters`) and by every piece of care. `countNeglectMinute` (called from `stepMinute`) adds a minute for a baby or kid that is
  awake and not away on a job; at `tuning.growth.neglectHours` (4) times 60 minutes `nextForm` returns the special. No save version bump.
- **A minute is named by its end.** The minute that ends at 20:00 is already night, so a baby hatched at 18:00 has 119 awake minutes at
  night, not 120. The first test of that expected 120 and the reviewer caught it by reading `sim.ts`.
- **What is care.** A meal it ate (a refused one is not), a clean-up that did something, medicine that cured, a pet or a tickle. A poke
  is not. A pet counts even when the hourly happiness limit gives nothing more. My extension: medicine counts (the owner said "feed, clean
  or play"). **A clean-up or medicine counts while it sleeps**, because the Clean up and Give medicine buttons are not disabled then
  (Feed is, and a pet is refused). That means a player can stop the clock at night by cleaning; I kept it, since it is real care and the
  buttons allow it, and put it in known-issues.md.
- **The special is a form of stage "kid" in no field's plan.** That gives it the kid size (24 px) and the kid face style with no new art
  rules. `canBecomeSpecial` is true only for a baby or a kid that is not the special itself, so it never turns into itself and counts
  nothing; `stageHours`, `leadingForm` and `nextForm` give it nothing further (the dev tree says "Fully grown"). Tests that said "every kid
  belongs to a field" now name the special as the exception (`data.test.ts`, `book.test.ts`).
- **Precedence.** `pickSpecial` comes first in `nextForm` and `leadingForm` for a baby and a kid, so it beats the safety net and the kid's
  growing up. A baby with 4 field cells and 4 hours of neglect cannot happen in play (the cells come after an hour), so no rule is needed
  for that pair.
- **Wild opponents.** `beginFight` picks a wild creature from every form of the player's stage. With the special in the kid pool, one kid
  fight in four would meet a Dustpuff, so the special is left out of that pool (`fight.ts`). A test checks that two kinds of kid never meet it.
- **Dustpuff** (`tools/art/paradise/special.py`): a grey-lilac lint clump with two strands of lint on top, 1 px tufts and specks of grit,
  role quick. Two drawings differ by 100 cells (a squash, the lint flicking, shifting tufts). I looked at it twice and redrew once: the strands
  were drawn over the forehead (dark lines above the eyes), so they are now drawn first and the head covers where they start.
  `emit_ts.py` writes `forms/special.ts`; `face_hashes.py` and `selftest.py` include it (910 pictures, 121 cases).
- **The Creature Book** has a "Special" page after the three fields; `lineageOf(special)` is [baby, special] (it can come from a baby or a
  kid, and every route starts at the baby), so an older save with a living special is credited with both; the hint is
  "Leave a baby or kid alone for hours" (words, no numbers), shown once a baby has been raised. The book now totals 65.
- **Existing tests that left a baby or kid alone** now keep it looked after with `petUntil` (`tests/helpers.ts`: a pet an hour): the 6 hour
  net (`growth.test.ts`, `sim.test.ts`) and the kid's 24 hours (`growth.test.ts`). The dev skip-ahead test (`dev.test.ts`) now expects the special, since
  six hours of no care is the case. My own first "care starts the count again" tests failed for a design reason, not a bug: caring at
  minute 230 and simulating 239 more minutes runs a baby past its 6 hour net, so they use a kid.
- **Review and mutation checks.** The cheap-model review (before any test ran) made 6 findings: the 119 versus 120 expectation, a test title
  that claimed more than it checked (it now asserts a kid), the sleeping-care rule above (a comment said the player could not care while it
  sleeps; fixed, tested), the wild-opponent pool, a list of existing tests it expected to fail (it named 4 of the 5 that did; the
  other failures were found by running), and an incomplete mouth-row list in a comment. 19 TypeScript mutations (the limit, sleep, the job, each
  care action and the poke, precedence over the safety net and over the kid's growing up, the special counting itself, a young counting,
  the sim hook, the opponent pool, `stageHours`, an old save, the fresh counter, the Book lineage and hint) and 2 drawing mutations (a face
  anchor off the picture, a moved speck) each failed. A first drawing mutation (a lump drawn off the canvas) changed nothing, so it
  proved nothing and was redone.

## 2026-11-22: the installable app (Phase 7, first slice)

The owner asked "how do i install game as app?", I said there was no real install yet (no manifest, icons or service worker), and offered to
build it now instead of in Phase 7; the owner answered "go ahead with phase 7". I read that as this first slice. Sound and the desktop
layout are the next slices; visitor befriending waits for soften mode (Phase 5, not built).

- **A new version waits for a tap.** `registerType: "prompt"`: the new service worker installs in the background, Settings shows "A new
  version of Broodkeep is ready. Your game is saved first." and "Update now" saves the game on the device, starts the upload to the account
  (`cloud.flush()`) and reloads onto the new version. `autoUpdate` would reload the page by itself in the middle of play. The app also asks
  for a new version every hour while it stays open. The notice is only in Settings; a dot on the gear would be a small later addition.
  With two windows open, only the one whose player tapped reloads (a flag in `App.tsx`; without it the library reloads every window). A tap in
  a window that still shows the notice after the other one applied the update finds no waiting worker and reloads straight away: the worker
  already serves the new files (found by a second review, reproduced and fixed in a browser run). When saving is blocked
  (`storage.persistent` false, the red warning below) the notice leaves out "Your game is saved first."
- **The worker is registered from the game's own script**, not from the page (`injectRegister: false`, `virtual:pwa-register/preact` in
  `src/ui/App.tsx`): the default inline script would break the policy in `public/_headers` (`default-src 'self'`, no inline script). No
  header had to be loosened: a worker and a manifest fall back to `default-src 'self'`.
- **The worker never touches the server's routes.** It has no runtime caching, and a typed-in path gets `index.html` except under `/api/`
  (`navigateFallbackDenylist`), so sign in and saves always reach the server. It keeps only the game's own files (10 files, listed once
  each; `cleanupOutdatedCaches` removes older versions).
- **The icon is Blip** (the baby every egg hatches into), the happy look, drawn by `tools/pwa-icons.py` from the same code that makes the
  game's pictures, on the game's dusk colour (`--bg`, `#231a38`, also the manifest's theme and splash colour and the page's `theme-color`;
  `tests/pwa.test.ts` checks they agree). Sizes: 192 and 512 (any), 512 maskable (Blip smaller, inside the middle 80% that a round or
  rounded mask keeps), 180 for iPhones, 48 see through for the tab. Looked at on one sheet (light and dark ground) before anything was
  written. `python3 tools/pwa-icons.py --check` compares the files with what the script draws.
- **`display: standalone`, no orientation lock** (the desktop layout is a later slice). `start_url` and `scope` are `/`.
- **`/sw.js` is sent with `Cache-Control: no-cache`** so the browser looks for a new worker on every visit.
- **Small things changed on the way:** the version label is now "0.5 (Phase 7a)" (it is how to tell which build a phone is running, which
  matters once files are cached), and the text in `index.html` that showed before the game loaded said "Broodkeep scaffold is live. The
  game is not built yet." and now says "Loading Broodkeep…" (an installed app shows it while it starts).
- **A narrow-screen rule for the header** (the owner: "can apply fix one in this branch"): under 360 px wide the gear buttons are 40 px (the width the old layout already squeezed them to at 360 px; they are 46 px only from about 372 px up), the
  gaps 6 and 5 px, and the stat columns can shrink (`minmax(0, 1fr)`), so a 320 px phone no longer scrolls sideways. It is the first width
  breakpoint in `app.css`; 360 px and wider are unchanged. Chosen over shrinking the icons because the pixel art stays at whole-pixel size (28 px).
- **An empty stat bar hides its fill** (the owner: "fix it", about the one pixel sliver): at 0 the fill is hidden once its slide out ends (`visibility`, with a 0.6 s delay
  on the way to hidden and none on the way back), so the layout and the markup are unchanged.
- **Not built, on purpose:** an "ready to use offline" message, a dot on the gear for an update, loading each field's art only when needed
  (still a suggestion), sound, the desktop layout.

## Adult expansion (adopted 2026-11-22)

The owner added [adult-expansion-spec.md](adult-expansion-spec.md) to `main` and asked for a review against the code. The review found it
buildable with the corrections and decisions below. **Where this section and the spec differ, this section wins.** The spec's five phases
are called A1 to A5 in the repo (CLAUDE.md section 9).

### The owner's answers (2026-11-22; all closed)

1. **Food and medicine stay unlimited.** The spec's counts of owned food and medicine (a disabled button that says where to get more) and the food count on the Feed
   button are dropped. Shop foods are optional boosters of the existing food types: each counts as servings of one of a field's three foods
   (or of the pellet or treat), and none is a new food type. `pickYoung` only counts a field's three foods, so a new type would decide
   nothing and would need new creatures. The bowl has no Empty / Half / Full state for the same reason (feeding is instant): tapping it
   shows the hunger number and the Feed button.
2. **Retire comes early.** A new egg only starts after a death (`startNewEgg` needs `phase === "dead"`), so until an adult can leave, the
   Book chase and the Forecast lead nowhere. A minimal Retire is part of A1 (it may slip to A2): adults only, in both modes, explained in
   full before it is confirmed, worded "retire, complete, pass on". The Book already keeps a form the moment a creature becomes it. The
   inheritance choice (tint, +3 to one stat, favourite toy) stays in A4.
3. **New creatures will start with discipline 30** (the code still starts them at 50, `data/tuning.ts`; A1 changes it). The sulk chance is (50 - discipline) in a hundred, at most 30, so a new creature
   sulks 20% of the time until training, tuck-ins and requests raise it. Saves keep the value they have, so existing creatures at 50 never
   sulk, which is harmless. Without this, discipline could only rise above the 50 threshold, where nothing happens.
4. **A stricter perfect run.** The spec's 5 hunger cells, 5 happy cells and 0 mistakes is exactly tier 1, so the badge would add nothing.
   Perfect is now: a tier 1 adult that also made no care mistake in the baby and kid stages, so none in its whole life. It needs a lifetime
   mistake count that is not reset at each evolution (the stage counters are). It is a badge on the Book entry and the creature's card,
   never a requirement.
5. **The 65th entry stays as built.** Dustpuff is already in the Book with its hint, earned by 4 awake hours of no care. The spec's
   "??? 64 / 65" secret slot with riddle hints from Found Gifts is dropped. If Found Gifts give Book clues, they point at ordinary missing
   entries only.
6. **The guardrail "no energy timers that block play" means no real-time lockout.** The owner was unsure, then said "energy wording, yours
   is fine" (2026-11-22), so my reading stands, and it can still be changed: no real-time lockout (a wait before you may play, a lives system). The creature's own Energy stat keeps gating jobs and fights, as it does
   today, and the training minigames cost no energy.

### Corrections to the spec (checked in the code, 2026-11-22)

- **Habitat spots** (`data/habitat.ts`): Bug meadow (fiber, baby), Herb patch (herbs, baby), Trees (wood, young), Pond (fish, young), Rock
  pile (stone, adult). They unlock by stage, not by coins. A job takes 3 to 8 minutes and pays 1 to 5 coins and 1 to 3 materials. The spec's
  Berry / Leaf / Nest / Cave, Forest and "Costs 40 coins + 2 Wood" are format examples, not real (Pond is the one name that matches).
- **Fields** are Land, Water and Sky: the pictures behind the creature, where a baby's field minutes count. They are not the habitat spots.
  Spec 6's pickups (shell, acorn, crystal) need names of their own per field.
- **Care row:** Feed, Clean up, Lights off (the moon, which is sleep), Give medicine, Go somewhere (the places tray). The fifth is not "Lights".
  `clean` already clears every poop in one tap, so "Clean All" is a label and a count badge, not a new action. A refused feeding already
  shows a refusing pose; the text is what is missing.
- **The fifth bar is wellness.** Battle HP is separate (CLAUDE.md 7.1): the bar is never labelled HP.
- **Growth, as it really counts.** The baby becomes the kid of the first field to reach 4 cells (15 awake minutes each, so about an hour in
  one field), or after 6 hours the field with the most cells. The kid becomes the young by the food eaten most in whole cells (2 servings
  each; a tie gives the fourth young). The young becomes the adult by hunger cells and happy cells (each up to 5) and care mistakes. Field minutes,
  food servings and care cells only count in their own stage; care mistakes are counted in every stage but reset at each evolution (so the
  perfect run in answer 4 needs a lifetime count). So the Forecast card shows the rows of the current stage, "leads by N cells" only fits the kid's food
  cells, and the baby's is "first to 4". "Locked" needs a bounded count of what can still be added in the stage. The what-if previews run
  the same functions on a copy of the creature (`leadingForm`, `nextForm`, `stageHours`, `fieldCells`, `foodCells`, `tierOf` in
  `game/growth.ts`; the dev tree already uses all of them except `nextForm`), never a second copy of the rules.
- **The Care Log** needs a small list on the creature (when, and which call went unanswered). Today there is a counter and a line in the
  dev log, which keeps only 300 lines.
- **Garden:** the spec's passive Garden Plot (a shop item, spec 2, with a growth timer on the habitat garden, spec 6) takes the place of Phase 3's
  plant, water and harvest plots, and initiatives (spec 3) take the place of standing chores. This is my reading; settle it when A2 is planned.
- **Materials:** all five are dropped today. The spec's rule that every material has two uses means ten uses in the catalogue, or dropping
  fewer materials, which would change the habitat. Decide when A2 is planned.
- **"In-game clock"** is the device clock (game time only differs in dev mode). Wake time is the Settings wake hour; a nap ends by energy.
- **Stats:** the combat stats are vitality, strength, defense, spirit and speed. The spec's three games train speed, spirit and strength;
  arena wins train strength, defense or spirit (by the move used most), one point each and two for a boss win (caps 12, 20 and 40 by stage),
  so defense keeps that source. Vitality has no source today and the spec adds none: decide in A4. "No Train action" is right: points come
  from fights today.

### Space and size (measured 2026-11-22)

- **Correction (2026-11-22, measured for the A1.3 plan):** the figures in this section were taken at device pixel ratio 1, which no real phone has. The room's size is
  `floor(width x ratio / 128)` game pixels of `128 / ratio` CSS px (`ui/Stage.tsx`): 256 px at 320 wide for every ratio, but at 360 wide 256 (ratio 1), 320 (ratio 2) and 298.7 (ratio 3), and at 390 wide 256, 320
  and 341.3. So on a real phone the room is bigger and the free space smaller: the Adult Mode room page at 360 x 640 runs 83 px below the window at ratio 2 and 62 px at ratio 3 (19 px at ratio 1), and at 320 x 568 it
  runs 106 px below at every ratio. 360 x 780 and 390 x 844 still fit at every ratio. The A1.1 question "is the header too tall" is therefore worse on a real phone than it was reported (plan section 3c has the table).
- The scene is 256 px at pixel ratio 1 (see the correction above). Free vertical space on today's layout (at ratio 1) is 56 px at 320 x 568, 128 at 360 x 640, 268 at
  360 x 780, 332 at 390 x 844 and 403 at 412 x 915. The spec's added zones need about 150 to 170 px: they fit from about 360 x 780 up (268 px
  free). At 360 x 640 (128 px), at 320 x 568 (and while the header is 24 px too wide at 320 on `main`) the cards collapse behind a tap. The "switch player" row
  of profiles (+40 px) is folded into the status strip in Adult Mode. Every screen is measured at 320, 360 and 390.
- A save is about 1 KB, and about 27 KB with a full dev log. The close-time upload only goes under 60,000 characters and the server stops
  at 256 KB, so new state stays compact: retired lives as short records, and initiatives never written to the dev log.
## Profiles slice 1 (2026-11-22)

- **The picker keeps the account's order.** Version 3 of the plan said the last profile used on the device is listed first. Not built:
  a tile that moves between visits is a poor thing for a child who knows where their tile is, and it needs one more thing stored. The
  first profile is always first.
- **Names collapse runs of inner spaces** ("Mia   Lee" is kept as "Mia Lee"), so two names that look the same cannot both exist. The
  plan only said trim and NFC; the owner can say if inner spaces should stay as typed.
- **The first save from a profile that is still an untouched egg is not sent** (existing rule, [known-issues.md](known-issues.md)), so a
  new profile that only had its sleep hours changed has no game in the account until it is played.
- **Sign in and sign out are offered only in the first profile**, and a session that ends in another profile signs the device out and
  reloads into single player (plan decision 11).


## Adult track A1.1: the Adult Mode header (2026-11-22, branch `adult-a1`)

The plan and edge cases are in [adult-a1-plan.md](adult-a1-plan.md). Decisions made while building, beyond the ones listed there:

- **The header is the only thing Adult Mode changes in A1.1.** With `settings.adultMode` not exactly `true`, `App.tsx` renders the old header
  (`.top`, the five bars, the two gear buttons, the switch chip) unchanged. Checked in a browser: 38 pages (every saved state on its room,
  habitat and arena screens, at 320 and 390 px wide) compared between `main` and the branch, 1,808 elements and 893,152 computed styles, 0
  differences. The room canvas pixels are not compared (the idle animation uses random numbers). Settings is the one Kid screen that changes
  (it gains a "Display" part with the Adult Mode checkbox).
- **The care row is not touched.** It still reads "feed, clean, lights, medicine, go somewhere" as icons. Labels and reasons on the buttons are slice A1.3.
- **Numbers are floored** (a hunger of 94.6 shows 94 and food is accepted), so the number agrees with every whole-number rule. Kid Mode's bars still round.
- **Time left is counted, not divided.** `minutesUntil` in `game/hud.ts` steps the value down with the simulation's own arithmetic (one rate per
  minute, held between 0 and 100). Dividing gave one minute too many at hunger 100, because 42 steps of 0.1190476 take it to
  94.99999999999994, under the line, while the division said 43. A test compares it with `feed` and `simulateTo` for hungers 0 to 100, awake and asleep.
- **The words under a cell** are `9h left`, `full in 2h` (energy while asleep), or for wellness one word from the same conditions as
  `updateWellness`: sick, falling, rising, steady. The first draft of the plan had only sick and steady. A tap opens a card with the rates per hour
  (awake and asleep), the time to empty at this rate, where food is refused and when it eats again, the level where it calls, and the discipline with what it costs in a fight.
- **The cell's spoken name starts with its visible word** ("FOOD: Hunger 22 of 100, 3h left, needs attention"), so voice control by the
  word on screen works. The bag chips have `role="img"` so the labels are read.
- **The strip is two rows** (name, stage and clock with the Book and Settings buttons; then coins and materials with the Switch button when
  there is another player). The stage and clock line wraps instead of ending in an ellipsis: "Passed away · 12:05 pm" is wider than its box at 320 px.
  Every strip button is 44 px or more each way (the Kid header's switch chip was 40 px high).
- **Discipline 30 for newborns touches Kid fights too** (owner's answer 3): a fresh creature now ignores a command in about 1 round in 5 (the
  sulk rule: 50 minus discipline, in percent). Nothing raises discipline yet. The detail card says so in numbers.
- **The clock reads game time** (`game.now()`), not the device clock: dev mode's skips move one and not the other. A browser check has a
  state with game time 3 hours ahead of the device and fails if the strip reads the device.
- **How much space it takes (measured):** the adult header is 177 to 221 px high (Kid: 60 px). The Kid page just fits at 320 x 568 and every
  larger size tried; the adult page is 643 to 687 px tall at 320 x 568 and 360 x 640 (scrolls 3 to 119 px) and fits from 360 x 780 up.
  The plan said "about 60 px net"; it was low. Whether to make it more compact is for the owner (known-issues.md).

## Adult track A1.2: the Growth Forecast (2026-11-22, branch `adult-a1`)

The plan and edge cases are in [adult-a1-plan.md](adult-a1-plan.md), section 3b. Decisions made while building, beyond the ones listed there:

- **A panel, not a card on the page.** Measured on the real Adult Mode header (2026-11-22): the page is 659 px tall for an adult, 674 px for a baby, and
  703 (at 320 x 568) or 687 (at 360 x 640) for a young one with needs, in windows 568 and 640 px high, so an inline card would push the care buttons off the screen. The
  Forecast is a full-screen panel of the same kind as the Creature Book.
- **The way in is the strip's name and stage text** (a button, with a "›"). Measured: row 1 is 44 px high and that text block 34.5 px, so
  it costs no height; making the context line a 44 px button would have added 14 px at 320 x 568 and 360 x 640 for a young one and an adult.
- **It reads the real checkpoint.** `forecast.ts` counts to `stageStartedAt + hours`, as `nextForm` does, not to the header's clamped
  countdown (A1.1 clamps to the stage's length). After a device clock is set back the stage waits for real time to catch up (known-issues.md); a
  "Locked" built on the clamped time would be too small, so the panel shows the real time and says the clock was set back.
- **"Locked" is a promise, so it is conservative.** It is said only when a bound proves nothing the player can still do changes the leader:
  the baby's most possible cells per field, the kid's most possible meals (room in hunger divided by the least a meal adds, 5), the young
  one's best and worst tier (mistakes at most one per 60 unanswered awake minutes), and no neglect long enough for the special. The bounds
  count `ceil(minutes left) + 1` steps from where the creature was last simulated, because the game steps on whole minutes and the step that
  ends the stage still runs the care first. Tests play the real simulation against every claim: baby in each field, kid feeding each food as
  often as the game lets it in one instant, young letting every call go and caring at every chance, and a random sweep (240 creatures) in which
  each stage must produce locked cases. "Still open" claims nothing.
- **The spec's "Avoid mistakes" stepper became a "slip" stepper.** The count of mistakes never goes down, so the preview adds mistakes (the
  risk), and the count now is the best case already shown. The young one's steppers are hunger cells, happy cells and mistakes.
- **A what-if with two fields at the 4 cells that end the baby stage** shows no leader: in the game one gets there first and the stage ends,
  the code would pick the first in the list. The panel says so.
- **The rival numbers are found by asking the game.** For each row that is not leading, the amount that changes the leader is the least
  amount (minutes, servings, mistakes) that `leadingForm` on a copy of the creature gives a different answer for. A kid's tie is shown
  (the fourth young) with the amount that makes the food lead on its own. Both are checked against `leadingForm` one step either side.
- **The Care Log is on the stage's counters** (`counters.mistakeLog`, the last 8, `tuning.calls.mistakeLogMax`), so it is cleared with the
  other counters at each evolution. 36 to 44 characters an entry; a full log adds a few hundred characters to the save (a test holds it under 600).
- **Names and portraits of forms not yet in the Book are shown** (the spec's choice). One line to change if the owner prefers "???" until found.
- **Kid Mode:** no markup changes. The save gains one optional field; `growth.ts` gains the word `export` on `canBecomeSpecial`.

## Repo flattened (2026-11-22, branch `flatten`; merged as PR #28, main e10c6e3, and deployed the same day)

The owner asked whether `broodkeep/creatures/...` was normal and whether there was a better structure ("The github main seems to be under creatures"), then queued the move
("let's queue for after a1.1 merging"). A1 merged as PR #27 (1ee3674), so the move was built on a branch off that commit.

- **The game now lives at the repo root.** The `creatures/` folder was a leftover of the old template site, whose files sat beside it until they were removed on 2026-11-20; since then nothing else has been beside it.
  201 files moved with `git mv` as pure renames (7 of them were then edited for paths, so git shows 194 as 100% renames and those 7 as 90 to 99% similar; history and blame follow either way). The project's `.gitignore` replaced the root one, which held only `.DS_Store`
  (the project one lists it too).
- **Nothing in the code named the folder.** The tools, tests, `package.json`, `vite.config.ts` and `wrangler.toml` use relative paths only. After the move the type check, the 1,598 tests and the
  build pass unchanged, and the build writes the same bundle names and byte sizes as before the move.
- **Older lines in this file and in progress.md that say `creatures/` are left as history** (for example the note that progress notes live in `creatures/docs/`: they now live in `docs/`).
  Present-tense text (CLAUDE.md sections 1, 2, 4 and 10, `README.md`, `migrations/README.md`, `tools/art/README.md`) was updated.
- **Cloudflare Pages needs one dashboard change:** the "Root directory" setting goes from `creatures` to blank. The order that never produces a failed build is: set it blank first (a settings change
  starts no build), then merge the flatten pull request. The reverse order gives one failed build, because the old setting points at a folder that no longer exists. This is how Pages is expected to behave
  and was not tested against Cloudflare; the check is the deployment list and the live bundle's file name.
- **Open branches:** every remote branch is already merged, so no branch needs a rebase. `pokemon-look` exists only locally (~/broodkeep, never pushed, its look was dropped) and keeps the old layout.
- **Merged and deployed (checked 2026-11-22):** the owner cleared the Root directory first and then merged. The Cloudflare Pages check run on e10c6e3 completed with success (deployment a41e7247), the live site answers 200 with the same bundle (`index-BUPkyQdo.js`), and `/api/me` answers its JSON 401. The Pages behaviour described above is now observed, not only expected.


## Adult track A1.3: honest buttons (2026-11-22, branch `adult-a1-3`)

The plan, its 22 edge cases and the log of its 28 review findings are in [adult-a1-plan.md](adult-a1-plan.md), section 3c. Decisions made while building, beyond the ones listed there:

- **One rule, asked in two places.** `game/availability.ts` holds each action's refusals in the order the action checks them; `actions.ts` calls it and keeps its old result words through a
  map, and the screen calls the same functions to dim a button and to say why. A test sweeps every state against the real action, so the two cannot drift apart.
- **A tap asks the live state.** In Adult Mode a tap calls `game.whyNot(refusal, reason)`: it catches the game up to the clock first (`tick()`), asks again, shows the sentence and returns the
  code. Only when the code is null does the button do what it does today. The note is a statement made at that moment: it is built once and not recomputed while it shows.
- **The note is screen state, not game state.** `Game.note` is set by `say()`, which only tells the listeners. It never goes through `changed()`, so it cannot mark the player as having played, schedule a
  save or ask for an upload. It is cleared by one 6 s timer, by leaving the screen, by `replaceSave`, by a death (a tap or the clock) and by switching Adult Mode off.
- **The note is drawn at the TOP of the room picture.** It was tried at the bottom first and covered the creature on the floor. It is a second item in the picture's grid cell, sized to the picture, with
  `pointer-events: none` so the creature under it can still be petted.
- **`grid-area` is scoped to `.stage.adult > *`.** Putting it on `.room` changed Kid Mode's computed styles; the scoped rule leaves Kid Mode's stage and canvas exactly as they were (the Kid comparison
  with `main` covers markup, boxes and every computed style).
- **A refused Feed or Go tap does not open its tray**, and a refusal that had a head-shake pose before (full, not sick, not tired, locked field) still plays it.
- **The sentences quote the rule's own numbers**: the thresholds come from `data/tuning.ts`, `data/habitat.ts` and `data/combat.ts`, and Clean's 99 is the one literal the old action had, now the exported
  constant `cleanAtHygiene`. Values are floored like the header (94.99 shows 94).
- **No new saved state.** Nothing in the save changes: no migration, no sync change.
- **Owner's answers (2026-11-22):** Clean, Meds, the spots and Fight dim in Adult Mode (today only Feed, Lights and Go dim): "can dim". The note stays 6 s at the top of the picture: "i dont knwo you choose", so my choice stands.
- **Dropped on the owner's word (2026-11-22, "do your suggestions", "you can drop those notes"):** the poke, pet and tickle notes and the Room dot. Touch behaves as on `main`
  again (`Stage.tsx` keeps only the Adult class and the note box). The words under the dock icons stay.
- **Dimmed buttons are at 0.55 opacity** (Adult Mode's `aria-disabled` only; Kid Mode's `:disabled` is still 0.4): the dimmed word then has 4.56:1 against its dimmed button, over the 4.5:1
  line (0.4 gave 3.1:1; 0.5 gives 4.03).
- **Kid Mode's care row changed on the owner's word ("i dont want overflow if it affects things visually").** The base `.care` rule is now `repeat(5, minmax(0, 1fr))` (it was `repeat(5, 1fr)`,
  which will not shrink below its icon). Before: at 320 wide the Go button ended 28 px past the window on every room view, and tapping it scrolled the page 27 px sideways. After: no Kid or Adult
  screen runs past the window at 320, 360 or 390 (6 saved games, room, both trays, habitat, arena). It is the only Kid Mode CSS change, it changes nothing at 390, and the Adult-only `care adult`
  class and its CSS went away because the base rule does the job. The `.spots` row is untouched in Kid Mode (it did not overflow); Adult Mode's spot row keeps its own `minmax` rule.


## Adult track A1.4: Retire (2026-11-23, branch `adult-a1-4`)

The plan, its 22 edge cases and the log of its 15 plan-review findings are in [adult-a1-plan.md](adult-a1-plan.md), section 3d. Decisions made while building, beyond the ones listed there:

- **One rule, asked in two places.** `game/retire.ts` holds who may retire (`retireRefusal`: no living creature, not grown up, away, in that order) and the section's states (`retireStatus`); `retireCreature` in `actions.ts` calls the rule after the catch-up and the Book panel calls it to decide what to show. The action reads the creature itself rather than through `alive()`, which hides an away creature and could only ever have said "unavailable".
- **The new egg comes from the same helper as after a death.** `putInNewEgg` (egg draw, random-number step, `creature` and `death` cleared, "A new egg appeared") is shared by `startNewEgg` and `retireCreature`, so the two cannot draw differently; a test builds both from one saved game and compares the egg and the random state.
- **`save.retired` is a flat list on the save, not the spec's nested `LegacyState.retired`.** The version stays 3: an old save gets `[]` in `migrateSave`, which keeps only records of the right shape (a string form id, finite times), moves a record's end up to its start when it runs backwards (a life is not dropped for that), and never throws, because it runs for every profile at the picker. A4's pending inheritance gets its own field beside it.
- **A completed life is `{ formId, bornAt, retiredAt }`, 73 characters** (computed, an 11-letter id and 13-digit times). There is no cap: the spec says "viewable forever". Beside a full 300-entry log the 60,000-character keepalive line is reached near 550 lives and the server's 256,000-byte limit near 3,200 (computed from a saved game plus 300 log entries of 61 characters); a life takes days of real play, so neither is reachable.
- **The list is per profile**, like the Book. CLAUDE.md section 7.8 says the Book is "family-wide", which the code never was (a mismatch that was there before this slice; recorded as an owner question).
- **The words are one pure module** (`retireText` in `game/retire.ts`), the same in Kid and Adult Mode, and a test refuses the whole words sacrifice, release, lose, lost, delete, die, death, forever and gone in every string for every adult's name and every spot. A word list cannot judge the framing, so the owner's sign-off on the card's copy stays a question.
- **An id the form table has only by inheritance ("constructor", "toString") is an unknown form.** `formOf` checks the table's own keys; a stored record with such an id shows as "A creature" with no face instead of a function's name (found in review).
- **The card and the status line are panel-local state.** Nothing about them is saved. The status line is set only when the action says "retired": a tap that finds nothing to retire (the creature starved a moment before) closes the card and says nothing. Only the player's tap marks the save changed (`game.act`), so an idle device never undoes a retire by itself.
- **`ActionBar` clears its Feed or Go tray when the creature is gone.** It stays mounted for the egg that follows a retire (a death unmounts it behind the DeathCard), so the old creature's open tray would have shown over the newborn when it hatched.
- **Where it lives:** the Creature Book panel only, in both modes (a "This creature" section on top, "Completed lives" at the bottom). The room, the header and the care row are not touched by this slice.
- **Not in A1.4:** a cap on lives, the inheritance choice and the favourite toy (A4), the Perfect run flag (A4), a gallery with larger portraits, merging lives across devices, a dev-panel Retire button, a Retire offer in the Forecast panel.
- **How A1.4 was verified (2026-11-23), and two choices in it.** (1) The mutant `death-not-cleared` (the `save.death = null` line of the shared `putInNewEgg`) is counted as caught by `tests/actions.test.ts` "starts a new egg, and only when dead", not by a retire test: on the retire path a living creature's death is already null, so no retire test could see it, and adding a contrived one was not worth it. (2) Every browser check id has at least one screen mutant that must fail it (seven had none until a review: sec-teaser, card-reset, fit-clip, confirm-room, stale-confirm, confirm-record, double-tap; the screen runner now refuses to start when one has none), and a check's positive control is part of the check (confirm-room asserts the care row and no egg BEFORE retiring). The Kid Mode comparison with main dumps text, box, every attribute but class and every computed style per element, pauses CSS animations, requires each save with a creature to show its creature, and proves itself by injecting a Kid-visible change into the new build only (it must show on every non-egg page).
- **The Retire card's look (2026-11-23, owner: "i want a well designed ui. not lazy text"; words unchanged).** The game's `.btn.small` is flat (the panel's own fill, no edge), which melts into the card. The section's buttons take a second class (`.btn.retire-btn`, to outrank `.btn.small`) with a lighter fill and a solid 2 px inset edge (`--retire-edge`, 3.4:1 against the card), and the one that goes ahead is the game's yellow `--accent` with dark text; the other answer is the safe one and gets focus first. The creature's face sits beside what is said about it (the same `Face` as under Completed lives), in a 72 px slot, the width of the biggest face. No new colour tokens beyond one local custom property, no gradients or glow: it reuses the game's own lift and highlight so it looks like the other buttons, only edged. A green tint marks the status line after a retire.
- **`build.chunkSizeWarningLimit` is 600 (2026-11-23), a choice not asked for.** The A1.4 JavaScript is 500,217 bytes, past Vite's 500 kB default warning (main's was 495,970). A change must not add a build warning, trimming 218 bytes of the approved words and markup would only postpone it, and splitting the bundle is a design change (the installed app caches everything, so a split would not make a visit lighter). One line in `vite.config.ts` with its reason; the owner can revert it or ask for code splitting.
- **The verification scripts live in `tools/verify/` (owner answer 5, 2026-11-23).** They are not part of the build, `tsconfig` or `npm test`. Paths are relative to the script or set by `VERIFY_OUT` (outputs; default the system temp folder) and `PLAYWRIGHT_FROM` (Playwright is not a dependency of the game). The wrappers rebuild the saved games every run and refuse a `dist/` older than the source, and the screen mutation runner compares every build input (not only `src/`) between its copy and the repo. They are named for the Retire feature; a later slice that needs the same machinery copies the pattern rather than generalising it now.

## Adult track A2.1: spot cards, the job card and an honest call back (2026-11-23, branch `adult-a2`)

The plan, its 20 edge cases and the owner's answers ("all your picks", Q1 to Q6, 2026-11-23) are in [adult-a2-plan.md](adult-a2-plan.md). Decisions made while building, beyond the ones listed there:

- **One haul rule, asked in three places.** `callBackHaul(job, nowMs)` in `game/habitat/jobs.ts` is read by the action (`endJobEarly`), by the button's words (`cardText.callBack` in `game/habitat/cards.ts`) and by nothing else; `jobProgress` (the bar) shares its clamp (`jobTime`). A finished job and a call back both bank through one helper (`bringHome`), so the haul list limit and the bag are written in one place.
- **Whole numbers all the way:** `floor((low + high) x done / (2 x total))` in milliseconds. The middle of each range times the share of the job done, rounded down, never up (a coin the creature has not earned is not paid). A job with no length (a hand-made save) pays nothing and shows 0, never NaN.
- **The button's words can be up to a second old, and a tap can pay more than they say, never less.** The card redraws once a second and the haul only grows with time (a test sweeps every whole second of every job; the first sweep sampled every 5 percent, landed on the pay boundaries themselves and let a label that ran a second ahead survive its mutant). Paying exactly what the words said would mean pricing a tap at a moment other than the tap.
- **A call back is not a chore:** `counters.chores` counts finished jobs only (it feeds growth), and the energy a trip took stays spent, which the job card says before the tap ("Spent 10 energy, which does not come back.").
- **A shut spot's reason moved from the note over the picture to the card.** In Adult Mode a tap on a spot used to say why it was shut as a note (A1.3); now the first tap opens the card and the reason is part of it. The note is kept for one case, a Send that reaches a spot that has become shut since the card was drawn (`whyNot` in the send path). The reason sentences are the same `spotReason` strings.
- **A second tap on a shut spot does nothing**, and a shut card has no Send button. The spots stay `aria-disabled` and clickable (A1.3), so the card can open for them.
- **The cards scroll themselves into view** (`scrollIntoView({ block: "nearest" })`, no animation): on `main` the Adult habitat page is already taller than a 320x568 or 360x640 window, so a card opened under the spots landed below the fold. Measured with the habitat page's heights on the sheet; an open spot card adds 117 to 132 px at 320 and 360 wide, a shut card 181 to 194 px, a job card 124 to 143 px.
- **The job bar has no transition** (the design hook flagged a width animation): the fill moves by under a pixel a second.
- **The card buttons have their own CSS** (`.btn.card-btn`), written like `.btn.retire-btn` (own fill and a light edge, the primary in yellow) instead of sharing its rule, so the Retire mutants' exact texts did not change.
- **The cards are Adult Mode only; Kid Mode keeps one tap and the house icon.** A Kid Mode call back that pays now shows the same welcome-back card as a finished job (the owner's answer to Q1). `HaulCard` draws no row of 0: a call back can pay a coin and no material.
- **The cost and the haul line come from the data:** `cardText` reads `data/habitat.ts` (a test checks that every number in the haul line is the data's own), with "1 coin" and "1 Herb" in the singular.
- **Not in A2.1:** the shop, the request board, hats (A2.2 to A2.4); a Habitat nav badge and a haul pile in the scene (the welcome-back card already stops the player); a coin cost on a spot; a second job slot. The plan's edge case 19, a Feed tray open while the creature goes away, has no check of its own here: `ActionBar.tsx` is not in this slice's diff and the Retire check `tray-reset` (same code) covers it.
- **How A2.1 was verified (2026-11-23):** typecheck 0; 1,719 tests (36 new, `tests/callback.test.ts`), only the 4 known SQLite notices as warnings; build 0 warnings (JavaScript 503.27 kB against 500.21 kB on `main`, CSS 20.03 against 18.55); the contact sheet (21 states at 320, 360 and 390 wide) looked at before any check; 108 browser checks (18 ids at 6 sizes, both modes) 0 failed; 25 of 25 unit mutants and 26 of 26 screen mutants caught by their named check (the failure text of the screen mutants read, not only the id); Kid Mode against `origin/main` (60ce6f2): 0 differences on 36 pages at pixel ratio 1 and 2, with the self-test seeing 2,672 injected differences. Two fresh-eyes reviews before the runs: the code (10 findings) and the scripts (11 findings), every one answered in progress.md. The first unit mutation run left one mutant alive (`label-one-second-ahead`), which led to the every-second sweep.
- **Not checked:** a real phone, a screen reader reading the cards, browsers other than Chromium, the Feed tray case above.

## Adult track A2.2a: the shop, items 1 to 4 (2026-11-23, branch `adult-a2-2`, off `adult-a2`)

The plan and its 17 edge cases are in [adult-a2-plan.md](adult-a2-plan.md) section 9 (with a "Built differently" note at its end). A2.2 is built as two pull requests: A2.2a (the spend loop and items 1 to 4) and A2.2b (the five foods, items 5 to 9). The split is Claude's own organisation, not an owner answer; the owner has not been asked about it yet. Decisions made while building:

- **The Shop is the fourth button of the nav (Adult Mode only), not in the header.** A "Shop" text button in the bag row grew the header at 360 and 390 and squeezed the chips beside a Switch button; an icon in the strip's first row squeezed the name block at 320 (the stage line wrapped, "Hollowbloom" was cut). Both found on the contact sheet. The nav has room (the four buttons are about 66 px each at 320) and the header is unchanged. The nav shows only for a living creature, so the Shop cannot be opened during the egg and dead phases; the buy rules work in any phase.
- **Rules in `game/shop.ts`, the list and prices in `data/shop.ts`, what an item does in `game/perks.ts` (`bedFactor`, `hungerGrace`).** The care rules (`care.ts`, `growth.ts`, `actions.ts`), the adult HUD (`hud.ts`) and the Growth Forecast (`forecast.ts`) all ask `perks.ts` through an `owned` list, so what the screen says is what the simulation does. `stepCare` passes `save.owned` to `decayStats`; the first version did not, and the Comfy Bed would have shown in the HUD and never acted in play (found in the plan review).
- **`buy` and `undoBuy` catch the save up first (`simulateTo`), so a refusal leaves the CAUGHT-UP save**, not the save as it was before the tap. A refused Buy tap does not call `game.act` at all, so it does not mark the game changed. Refusal order: unknown, owned, poor.
- **Saved state is three fields, each with a default in `migrateSave`:** `owned` (known ids only, no duplicates), `wall` (an owned wallpaper, else null) and `lastBuy` (`{ item, at, wall }`: it must name an owned item, and its `wall` must be owned or null). A save the shop never touched (`isUntouched`) must have `owned` empty and `lastBuy` null, or cloud sync would adopt it over a bought one.
- **Undo is 10 seconds of game time** (`tuning.shop.undoSeconds`), `0 <= now - at <= 10000`; a clock set back (a negative gap) counts as late. It refunds the price exactly, removes the item and puts the wall back only when the wall still shows that item. A late tap clears `lastBuy`.
- **Comfy Bed:** happiness falls at 0.5 of the asleep rate while the creature sleeps AND is not away on a job (`!c.job`): `updateSleep` sets `sleep` to night even for a creature out working, and that creature is not in its bed.
- **Feeding Mat:** a meal counts as a hunger cell when hunger was under 95 before it, ROSE, and ended at 90 or more (`growth.ts` `countCareCells`, `grace` 5 from `perks.ts`). The "rose" part is needed because `touch` calls the same function with unchanged hunger (a pet at hunger 92 must not count). The refusal line stays at 95: the grace never reaches `availability.ts`.
- **The prices are `[tune]` and come from a measured day of play** (`tools/verify/run-income.sh`: 14 simulated days of an adult, jobs only, days 2 to 14). Measured now: a player who looks in every 5 minutes earns 20.4 coins and 21.8 materials a day at the best spot alone (all Fiber) and 18.9 coins and 13.9 materials going round the five spots; three 15-minute visits a day (08:00, 12:30, 19:00) earn 12.2 coins and 8.2 materials (1.5 to 1.9 of each material); two visits earn 7.7 and 5.4. A "day" for the prices is the three-visit player's 12.2 coins: the Comfy Bed (35 coins, 3 Fiber, 2 Wood) is about 2.9 days of coins and 2 days of Fiber, the Feeding Mat (25 coins, 3 Fiber, 2 Herbs) about 2.0 days, each wallpaper (12 coins and 2 Herbs or 2 Stone) about 1 day.
- **Two findings from the same measurement, not fixed (outside A2.2a):** a player who looks in once a day at 08:00 loses the creature on day 3; one who looks in once a day at 19:00 keeps it and earns nothing, because the Adult habitat's energy has run down by then. Both are for the owner to weigh as economy design.
- **The preview** draws the real room (`drawRoom` with a `look`) with the chosen item added; looking buys nothing. A wallpaper is bought and put on the wall at once; an owned wallpaper has a Use / Stop using toggle.
- **A refused Buy button is `aria-disabled`, not `disabled`** (the panel still says why in words under the price), the same choice as the shut spots of A1.3. Buy is yellow only when it can be bought.
- **Fish has no use yet;** A2.2b gives it its uses.
- **Not in A2.2a:** the five foods (A2.2b), the request board (A2.3), hats (A2.4), more than one undo, selling an item back after the 10 seconds, an Escape key for the panel (no panel in the game has one).

## Adult track A2.2b: the shop's foods, items 5 to 9 (2026-11-23, branch `adult-a2-2b`, off main 2f4bc0b)

The plan and its 20 edge cases are in [adult-a2-plan.md](adult-a2-plan.md) section 10. Decisions made while building:

- **A shop food is a "dish": an item (`kind: "food"`) with a `dish` field, `{ food: 0 | 1 | 2, also?: 0 | 1 | 2 }`.** `food` is which of the field's three foods the meal is of, by its place in `plan.foods` (0 filling: Meat, Seafood, Chicken; 1 light: Carrot, Seaweed, Corn; 2 sweet: Worm, Shrimp, Syrup); `also` is the second food a recipe counts. No new `FoodId` and no new saved state: the only thing saved is the item id in `owned`, which `migrateSave` already keeps by `isItemId`.
- **A dish meal is a meal of the creature's own field food** (the same hunger, happiness, wellness, digest time and random numbers, which `tests/dishes.test.ts` compares against a plain meal), **counted differently toward the kid's food cells.** A booster (Hearty, Green, Sweet Bowl) counts `tuning.growth.servingsPerFoodCell` servings of that food, which is 2, one whole cell (pinned by a test, so changing the tuning must change the words with it). A recipe (Stew: filling + light, Garden Mix: light + sweet) counts 1 serving of the food it is a meal of and 1 of the second kind. Only the kid stage counts servings (`countServing` ignores any other stage and any count under 1), so dishes are offered only to a kid with a field: not an egg, a baby, a young, an adult, the special form, or a dead creature.
- **A dish is a choice at each meal, not a passive perk like the bed.** A recipe that adds a second serving would turn "feed only meat" into a tie (the fourth young, `sporeling`), and the player could not avoid it. So the Feed tray gets a second row, one button per owned dish, and a plain meal still counts 1: owning a dish never makes anything worse. No dishes for the pellet or the treat: the spec's row "Food and recipes" asks for three new foods, "each strong on a different food-cell type", and two recipes, and growth counts only a field's three foods, so the three boosters are one per kind of those three (plan section 10, "Not built").
- **The rules ask one place (`game/dishes.ts`): `dishesOf` (what is offered), `dishMeal` (what a meal eats and counts), `servingsPerMeal` (the most one meal of a food can add) and `dishLabel` (the words of a button).** `feedRefusal(c, food, dish?, owned = [])` refuses a dish that is not offered, or whose food is not the one tapped, as "off-menu" inside the existing menu step, so the refusal order is unchanged (away, off-menu, asleep, full) and a dish never eats past the full line at 95. `owned` defaults to `[]` so a call that names a dish and no list is refused, never allowed. The Adult Mode pre-check in the tray passes the dish and the owned list, so a stale dish tap (the kid grew up while the tray was open) says "That food is not on its menu."; in Kid Mode, which has no pre-check, it does nothing, as a stale food tap does today.
- **The Growth Forecast follows the dishes in three places** (`forecast.ts`: `isLocked`, the `enough` test of `tieAndRivals` and its `take.n <= room`): each used `meals` as the number of servings one more meal can add, which is false once a doubled meal exists, so each now uses `meals * servingsPerMeal(owned, field, food)`. Without it "Locked" could be shown while a Hearty Bowl meal could still change the leader. A brute-force test walks every run of meals (a plain food or an owned dish) from every Locked state, for all 32 sets of owned dishes at hunger 95 and 90, and the leader never changes.
- **The tray's second row is its own grid, `.tray.dishes`: five fixed columns**, so one dish is as big as a food button and sits under the first food instead of stretching across the row (found on the contact sheet). It is not drawn when `dishesOf` is empty, so a profile that owns nothing has the tray it had. A button shows the food's picture; a booster has a "×2" corner mark, a recipe the second food's picture in a corner badge. The `aria-label` names the dish, the food and the count ("Hearty Bowl: Meat, counts 2 servings", "Stew: Meat and Carrot, 1 serving of each").
- **What a player owns works in both modes (the A2.2a rule), so a Kid Mode profile that owns a dish sees the row**; the shop that sells it is Adult Mode only. A profile that owns nothing sees no change: the Kid comparison with `origin/main` (progress.md, A2.2b status) has 0 differences on 48 pages, now including a Land kid that owns nothing.
- **Prices are `[tune]` from the same measured day (12.2 coins and 8.2 materials for three 15-minute visits):** the three bowls 25 coins + 3 of one material (Fish, Herbs, Fiber), Stew 35 + 2 Wood + 2 Stone, Garden Mix 35 + 2 Fish + 2 Stone, so every price is at most 3 days of coins and every material has at least two uses (Fiber 3, Herbs 3, Wood 2, Fish 2, Stone 3: Fish no longer has none).
- **The dish row adds 76 px to the open tray area** (a 64 px button and the 12 px gap), asserted at all six window sizes with the care row reachable (scrolled into view, nothing covers it). **At 320 the plain food row, which is existing code, already ends 4 px past its own box** (its `1fr` columns cannot shrink below the 52 px button: 292 px in a 288 px box; the care row has the same comment and the fix `minmax(0, 1fr)`); the dish row fits its box exactly. That is recorded in `dishes-browser.mjs` as a literal baseline, not fixed here (a Kid Mode change of 4 px at 320, which the Kid comparison would show).
- **Card lines are getters (`effect`).** `tests/growth-fields.test.ts` mocks `data/fields` as `{}`, so a line built from the field data at load time threw when `data/shop.ts` was imported there. A booster's line names its three foods ("The filling food (Meat, Seafood, Chicken) counts 2 servings (kid stage)."); a recipe's names the two kinds only ("A filling meal that also counts 1 serving of the light food (kid stage)."), because a long list of six foods would not fit a card at 320; the tray button's label names both foods. This is built differently from the plan's edge 13, which wanted the food names on every card (noted at the end of plan section 10).
- **In Adult Mode a full creature cannot open the Feed tray** (the Feed button is refused with "Not hungry: food is 100 of 100. It refuses food at 95 or more."), so a dish tap at full is reachable only in Kid Mode; the words a dish tap would get at full are the plain meal's, covered by the unit tests.
- **Not in A2.2b:** the request board (A2.3), hats (A2.4), dishes for the pellet or the treat, a dish that changes hunger or happiness, selling a dish back after the 10 seconds, more than one dish per meal.

## Adult track A2.3: the request board (2026-11-24, branch `adult-a2-3`, off main a359e04)

The plan and its 25 edge cases are in [adult-a2-plan.md](adult-a2-plan.md) section 11. Decisions made while building (the numbers below were read from `src/data/requests.ts` when written):

- **The board is a second tab of the Shop panel ("Requests"), Adult Mode only, not a fifth nav button.** The five-button row was measured with the real `app.css` (`tools/verify/nav-mock.mjs`): the word "Habitat" is 46.2 px wide in a 47.0 px button at 320, 0.8 px to spare at pixel ratio 1 and 2, with "Board" (36.7 px) as the fifth word; "Requests" (57.5 px) would not fit. The tabs are two buttons with `aria-pressed` in a `role="group"` (not `role="tab"`: there is no tab panel to name). The shop always opens on Items, as before; the Undo bar of a purchase is on both tabs (a review found that a purchase can be a request's, so the player must be able to undo it from the board).
- **Where things live.** `src/data/requests.ts`: the five types, the needs (feed 2 meals, field 20 minutes, job 1, fight 1, buy 1), the coins (2, 3, 3, 4, 5), 3 slots, 15 minutes to refill, +25% after 3 days, an item on every 4th draw, all `[tune]` and none saved. `src/game/board.ts`: the saved shape and `migrateBoard` (it imports no game rule, so `state.ts` can use it; the plan's table put these in `state.ts`). `src/game/requests.ts`: the rules.
- **Only the simulation draws; the actions only count.** `stepRequests` runs once for each simulated minute, from `stepMinute` after `evolveIfReady`, so a request finishes and a slot refills the same way with the app open or closed. The actions (`feed`, a finished job in `stepJob`, a won fight in `finishFight`) call `noteRequest` once each. A draw has a generator of its own, seeded from the simulation's state (read, never advanced) and the number of draws so far, so a profile with Adult Mode off plays as it always did (a test gives the day with the board on and off the same save apart from the board) and the same save and time give the same board however the minutes were split (a test splits them three ways, one of them through a JSON round trip of the save every 7 minutes).
- **A request the creature cannot do is dropped at the next minute and another is drawn in that same minute** (the plan said "the minute after"; the code redraws at once, and edge 18's test says so). A dropped request's progress is lost (owner question Q6).
- **A purchase counts once it cannot be undone**: the item is owned, and the purchase is not the one still inside its 10 second undo window; one dated after the game time (a clock set back) does not count until the window has passed, so buy, set the clock back, undo and the clock coming forward cannot pay a request for an item that was given back.
- **Paid when done, no Collect button; nothing expires.** A finished request pays its coins and, if it carries an item the player still does not own, the item (owned, not hung: a wallpaper stays off the wall until chosen). The slot waits 15 minutes (`doneAt` + 15). The oldest open request that has been open 3 days or more pays `ceil(coins x 1.25)`; the lower id wins a tie; a clock jump of 3 days gives it too (accepted).
- **The note over the room** (`Game.say`, Adult Mode only, 6 seconds) is said when `board.done` rises, also for payments made while the app was closed; a game put in by `replaceSave` is not announced. The note sums what the waits say was paid; a wait is dropped 15 minutes after it was paid, so after a longer catch-up the note says "Request done" or "N requests done" and states no amount, instead of one that is too small (found in review; the exact total needs the totals saved in the board, an offer).
- **A saved board is not trusted** (it can come from storage or the account): `migrateBoard` drops a bad entry (wrong type, a target of the wrong kind, `constructor`, the treat, `NaN`, a negative id), clamps `have` and what a wait says it paid, keeps at most 3 slots (open requests first), drops a later open request with the same id or the same type and target (so one meal never pays two), and raises `drawn` above the highest open id (so a new request never takes the id of an open one). A save from before the board gets an empty one. A Kid Mode save carries an empty `board` key like any other save; nothing in Kid Mode reads it.
- **The Home (owner's answers 2026-11-24; the plan is home-plan.md):** a wide home of three rooms, the camera does not follow the creature (drag to pan, pinch to zoom), a scale close to Stardew Valley's, both modes (this overrides "Kid Mode stays as it is" for this feature: the Kid room changes on purpose and the Kid comparison with main expects differences on the room pages only), before A2.4 (hats), and a Stardew-style designable home as the direction (Decorate mode is slice H2). The Shop's room picture stays as built.
- **The Shop panel: a fixed top and a list that scrolls inside it (owner request 2026-11-24).** The panel no longer scrolls as a page: the title, wallet, tabs, room picture and Undo bar stay put and only the list under them scrolls (`.shop-top`, `.shop-scroll`). The room picture is capped at 26dvh (26vh fallback) high and the fixed block uses 10 px gaps so a 320 x 568 window keeps a card of the list in view. The Undo bar moved into the fixed block, so a purchase can be undone from any scroll position. `key={tab}` on the scroller makes each tab's list open at its top. Rejected: a bottom sheet over the real room (the item would have to be drawn in the real room before it is bought; offered to the owner). The check is `shop-scroll` in `tools/verify/board-browser.mjs`.
- **The Shop panel, second pass: the page behind is locked and a phone on its side gets two columns (owner report 2026-11-24, "shop scroll doesnt work ... you enabled it for the home page which makes thing act wierd").** The first pass was checked with a mouse wheel in a desktop-style window. A real touch test (a mobile window, touch events sent a few pixels at a time) found two defects it had missed: a finger dragged on the title, tabs or room picture, where nothing scrolls, was handed to the home page behind the panel and scrolled it (0 to 83 px at 360 x 640, 0 to 106 at 320 x 568), which also makes a phone's toolbar hide and resize the panel; and on a phone on its side the stacked fixed block left the list 65 px of a 740 x 360 window (88 px of 844 x 390), less than one card. Fixes: `body:has(.shop-panel) { overflow: hidden }` (the page does not scroll while the Shop is open; a browser without `:has()` keeps the old behaviour), and in a short landscape window (`orientation: landscape` and `max-height: 520px`) the fixed block takes the left column and the list the whole height of the right one, the left column scrolling if it is taller than the window (the Undo bar at 640 x 320 and 568 x 320). Not done: the other panels (Settings, Book, Forecast, Developer) scroll themselves and, by the CSS, hand their end to the page behind in a similar way (not run); a lock like this one would likely fix them and was not asked for.
- **Every panel locks the page behind it (owner, 2026-11-25: "do the one-line fix for the other panels").** A real-touch probe of the build before the change (a throwaway script, not kept) showed Settings, the Creature Book, the Growth Forecast and Developer mode handing a finger's drag at their top and their end to the home page: a drag down at the top moved the page behind from 14 to 0 px and a drag up at the end from 42 to 83 px at 360 x 640 (14 to 0 and 53 to 106 at 320 x 568; on its side at 740 x 360 a drag up at the end moved it 246 to 375), and in Kid Mode on a phone on its side (179 to 308 at 740 x 360; a portrait phone's Kid home page does not scroll, so there is nothing to move). The fix is the selector of the Shop's lock: `body:has(.shop-panel)` became `body:has(.panel)` (the five panels are the only elements with that class, grep), so Kid Mode's panels get the same lock too; nothing else changed. `overscroll-behavior: contain` on `.panel` was not added: it only stops the hand-over from a panel that can scroll, not from one whose content fits, and the lock covers both. Pull-to-refresh on a panel's top edge is not covered (see known-issues).
- **The reward numbers come from the measured day (`tools/verify/income.ts`, `run-income.sh`):** a scripted three-visit player (08:00, 12:30, 19:00, 15 minutes each) earns 12.2 coins a day without the board; with it, answering every request type (a meal, the named job spot, a fight only with at least 80 energy, a field trip of 21 minutes, the named purchase with its price added back), 19.5 a day and 3.9 requests a day: 1.6 times. The two-visit player goes from 7.7 to 15.8 (2.1 times, 3.4 requests a day) and the every-5-minutes player from 18.9 to 39.3 (2.1 times, 8.5 requests a day). That is the plan's 1.5 to 2 times, so the five numbers stay as written. Without the 80 energy rule the same fights spent the energy the jobs need and the three-visit player earned 16.7 (1.4 times); the model is crude (the fight is always "attack"), so these are orders of magnitude, not a promise. (Every row of `income.ts` is about 4 percent high, because its window is about 13.5 days divided by 13; the rows compare with each other.)
- **Not in A2.3:** a badge or a line in the header for a done request, a "next request" line, requests chained across slots (after A3), hats (A2.4), saving the totals paid so the note is exact after a long catch-up.

## Home H1: the home scene, the camera and the walk (2026-11-25, branch `home-h1`, stacked on `home-h0` and `adult-panels-lock`)

Under the owner's blanket approval ("complete the rest of the plan overnight, do not wait for me on anything"); every pick below is mine and reversible. The owner's closed answers (a wide home of bedroom, living room and kitchen; the camera does not follow the creature, drag to pan and pinch to zoom; scale close to Stardew; both modes; before A2.4; the Shop's room is the room picture; a Stardew-style designable home) are in `home-plan.md` section 1 and are not re-asked.

- **Two worlds, one canvas.** The old 128 x 128 room stays for the fields, the habitat and the arena (the "line" world in `idle.ts`); the Room screen at home is now the "home" world: 768 x 192 game pixels on a 24 pixel grid (32 x 8 tiles; three rooms of 10 columns; partitions at columns 10 and 21 with a doorway in rows 4 and 5; wall rows 0 and 1). It is drawn through a camera into the same square canvas (128 x k device pixels), so the stage, the nav and the Shop's panel are as they were. Kid Mode gets the home too.
- **The default zoom changed from H0's pick** (1 CSS pixel per game pixel) **to the largest whole zoom at which the home's 192 pixel height still fits the square picture:** `floor(picture / 192)`, at least 1, at most `round(2.5 x ratio)`. That is 2, 3, 5 and 1 at 320 x 568@2, 360 x 640@2, 390 x 844@3 and 360 x 640@1. H0's pick and this rule are the same zoom at 320 wide and at ratio 1; at 360 and 390 wide (ratio 2 and 3) H0's pick left the home 192 CSS pixels high in a picture 320 and 341 high (the adult 48 CSS pixels tall), and this rule fills 288 and 320 of those and makes the adult 72 and 80 CSS pixels tall (computed from the zoom and the picture's size; the whole 192 game pixel height always fits).
- **The camera is a point of the home plus a whole zoom,** kept in the Stage (a ref, not saved, not in the game state), clamped so the view never passes a wall (a view wider or taller than the home shows the home centred). A pinch zooms smoothly about the point between the fingers and snaps to a whole number on release (so every game pixel is the same size at rest). The keys: the arrows pan by `round(picture / 5)` device pixels, `+` `=` zoom in one whole step, `-` `_` out one; a key with Ctrl, Meta or Alt is left to the browser (Ctrl and + is the browser's own zoom, Alt and the left arrow its back button).
- **Gestures (`src/ui/gesture.ts`, no DOM, tested alone).** One finger within 8 CSS pixels of where it landed is a tap (and may be a hold, which pets); past 8 it is a pan, measured from where it landed so the home does not jump behind it; a second finger makes a pinch and ends a hold at once; a third finger changes nothing; lifting one of two leaves a pan by the finger that is left, from where it is; lifting one of three or more starts the pinch again from the two that are left (the test review found a stale baseline there: the view would have jumped). A finger that starts on the creature and drags pans the home and never pets. The picture has `touch-action: none` so the browser does not scroll the page under it.
- **Petting still works in the home:** a hold on the creature (or within 14 CSS pixels of its picture: the slack is a size on the screen, so zooming in does not shrink it) pets after 450 ms and every 800 ms after, and the third quick tap within 1.2 seconds tickles, as in the old room. The egg takes taps (the browser check measures 0.5 minute shaved a tap).
- **Find** is an icon-only button (named "Find <name>" for a screen reader), 48 x 48 CSS pixels over the picture's bottom right corner, and it is there only while the creature's box is not wholly in view. It takes the camera to the creature in 0.35 seconds, or at once when less motion is asked for. It sits in the same grid cell as the picture; for that the stage centres its one cell (`place-content: center`) and the picture takes cell 1 / 1. That CSS applies to every world, so the Kid comparison lists the resolved grid values of the stage on all pages (and no change of any size or position).
- **The camera does not follow a sleeping creature.** It walks to the bed (20 pixels a second, along the floor, through the doorway) and lies down in it; if the picture is looking elsewhere the Find button shows. A nap that is called off before the creature gets there (it is woken) ends the walk, and the next nap starts a new one from where it stands. A sleeping creature darkens the whole picture, not only its room.
- **Walking is a shortest path on the tile grid** (no diagonals). A creature stands on an anchor: the leftmost tile of its footprint (1 tile wide for an egg, baby or kid, 2 for a young or an adult) and the row of its feet. Awake it walks at 14 pixels a second (8 when sad or sick) to random reachable anchors, through the doorways. Food goes on the tile on the side it faces, else the other side, else below it, else the tile it stands on. Furniture is drawn behind a creature whose feet are at or below its bottom edge and in front of one standing above it.
- **The words for a screen reader** get ` In the bedroom.`, ` In the living room.` or ` In the kitchen.` after the usual sentence, and are made again when the creature walks into another room (the Stage keeps the room in a ref and a state; without the state nothing re-rendered the label until the game's next minute).
- **Kid Mode:** the same gestures and no new words (the only text is the room name in the label and the Find button's name, which a screen reader reads). CLAUDE.md section 12 was added and the note in 7.4 corrected for this in the same pull request (the owner's earlier "Kid Mode stays as it is" rule now has the home as its one exception).
- **The old rooms are untouched:** the fields, the habitat and the arena keep the side view and the one-line walk. The Shop's picture shows the room the item belongs to, cropped from the home (`drawHomePreview`).

Verification decisions (how the checks see things, so they are not rewritten by accident):

- **The camera is read from the canvas's own pixels,** because the game keeps it in a ref and shows no number: the wall is drawn in stripes 5 game pixels wide every 10 (`drawHomeBack`), so the width of a stripe is 5 x the zoom, a band across the top of the wall moves by exactly the finger's travel (compared pixel by pixel, with the half-stripe shift required NOT to match so a band that looks the same everywhere cannot pass), and above and below a home that fits the picture is the void colour. Expected values are literals worked out by hand, never the page's own functions.
- **Real touch events** (`Input.dispatchTouchEvent` through CDP, a few pixels at a time; two points for a pinch), a real mouse and real keys. Correction (2026-11-25, found in H2a): this said that with Playwright's fake clock the game's frames and timers run only inside `page.clock.runFor`. They do not: `setFixedTime` fixes `Date.now` but nothing pauses the timers, which run in real time between a check's steps (a creature asleep for 12 real seconds had walked to its bed with no `runFor` at all), and `runFor` jumps them forward on top. The H1 checks have tolerances that hid it; a check that needs a picture at two times reads both from one page.
- **Find is clicked with `click()`, not a touch tap:** the emulated phone holds back the click of a touch tap on a button until the next touch.
- **`savedGame()` runs the clock 800 ms** (the game writes its save 600 ms after a change) and reads until two reads 50 ms apart agree, so a read in the middle of a run of taps moves the clock: the tickle check is two separate runs of taps with the 1.2 second window let run out between them (a first version read between two taps and never got its third tap in time).
- **`Math.random` is pinned to 0.99 in the page** so a creature never starts a walk or a hop by itself; the walk to bed is not random and is checked with it.
- **A comparison that has to ignore the creature's bed uses only the columns beside it** (the first version compared a band that includes the bed, where a lying creature differs by design).
- **Kid comparison with `main`, `--expect-home`:** the home is MEANT to change Kid Mode's room, so the comparison takes a list of expected differences with their exact old and new values (the stage's centring and track sizes on every page, the picture's grid cell on every page, and on the room pages its `touch-action: manipulation` to `none`, `tabindex` missing to `0`, the style gaining `touch-action: none;` and the label gaining ` In the <room>.`) and fails on every other difference and on a missing expected one. Two deliberate breaks fail it: the old build presented as the new one gives `missing=60`, and a build whose `place-content` is `space-around` (every rectangle unchanged) gives 120 differences. Without the flag it is the old script, unchanged.
- **Mutants that were left out of the unit list, with the reason, are in the comment above `MUTANTS` in `mutate-home-unit.py`** (equivalent for every input the home has, or a hang rather than a failed test).

## Home H2a: the layout in the save (2026-11-25, branch `home-h2`, stacked on `home-h1`)

Under the owner's blanket approval; every pick below is mine and reversible. H2 (Decorate mode) is split into three pull requests so each can be reviewed: **H2a** (this one) makes the home drawn and walked from a saved layout, with no screen to change it, so nothing in the game writes `save.home` yet and a player sees no difference; **H2b** is the Decorate screen (tray, drag, bin); **H2c** is a wallpaper for each room. The plan is `home-plan.md` section 12.

- **The save gets `home?: HomeSave`,** `{ pieces: Partial<Record<PieceKind, Placement | null>> }`: a kind that is missing is at its starter place, `null` means put away. The save stays version 3 (a missing `home` is the starter layout, as a missing `book` or `board` was). `migrateSave` keeps only a well-formed one: the shape check `coerceHome` lives in `data/home.ts` because the game side must not import the art side, and it never throws (a bad entry anywhere drops the whole `home`). Whether a piece may stand where it is put is `art/homeLayout.ts`'s rule, not the migrate step's.
- **The model:** `Layout = Record<PieceKind, Placement | null>`, always complete; `STARTER` is exactly H1's home (a test pins the nine places as literals; they were also compared with H1's `PIECES` by diff); `SHAPES` gives each kind's size, whether it is solid and whether it stands against the wall (may start in row 1 and reach down onto the floor). Nine kinds: bed 3 x 2, dresser 2 x 2, sofa 4 x 2, rug 4 x 3 (flat), table 2 x 2, counter 6 x 2, fridge 2 x 2, mat 3 x 1 (flat), bowl 1 x 1.
- **Six rules (`problemWith`, returns the first broken one as words or null):** (1) a placed piece is on whole tiles, inside one room's columns (never across a partition) and inside the home, and starts at row 1 only if it stands against the wall; (2) two solid pieces never overlap (a rug and the mat are flat and may lie under anything); (3) a solid piece covers none of the protected tiles (the egg's, the five poop tiles, the 3 x 2 block of the grave); (4) the two tiles in front of the bed are bare floor; (5) a creature one tile wide and one two tiles wide can each walk from where they start to every place they fit (checked with the creature's own walking code, on the layout being tried, so no pocket is cut off and every room is open); (6) the bed is placed.
- **A layout that breaks a rule is not half-applied:** `layoutOf` gives the starter layout whole. The same saved home gives the very same `Layout` object (kept by its pieces' JSON, at most 32), which is how the Stage tells that the furniture changed with one comparison.
- **The walking follows the layout.** `art/home.ts` keeps one "layout in force": the floor (which tiles are free) and the bed's place are derived from it, and `withLayout(layout, fn)` tries one out and puts the old one back, also when `fn` throws. The Stage's frame loop puts a changed layout in force and calls `reseat(view)`: a creature that a piece now covers is put on the nearest free anchor, a walk and a meal are called off (it stands still for a second), and a sleeper is stood in front of the bed where it is now. The bed's art, the left edge of a lying creature and the tile it walks to are all derived from the bed's tile (`bedOf`), not constants.
- **What a layout does not change:** the Shop's pictures stay on the starter layout (`drawHomePreview`: the crops are fixed on it); the egg, the dead creature and the poop stay on their tiles (rule 3 keeps furniture off the egg's tile, the five poop tiles and the grave's block). The "away" bubble over the living room (tile (16, 3)) is not protected: a piece can stand under it, which only hides part of a speech bubble.
- **Cloud sync:** `isUntouched` counts a saved `home` as something the player did, so an egg whose furniture was moved is not overwritten by the account's game without asking.
- **Not covered in a browser in this slice, on purpose:** a layout that changes while the page is open (`reseat` is unit-tested; there is no screen that changes it until H2b, which gets the browser check) and a layout that covers the tile the creature first stands on (startAnchor and reseat are unit-tested).

Verification decisions:

- **The browser check reads pixels of two moved layouts** (`adult-home-moved`: the sofa two tiles right and the rug two tiles left; `adult-home-bedmoved`: the bed in the living room), against the starter game as the control for every probe: each point is the sofa seat, rug or pillow colour in one game and wood floor in the other. The fixtures are checked against the game's own rules when they are made, so a layout the page would throw away stops the run instead of comparing the starter home with itself. A sleeper is found lying in the moved bed by comparing ONE page's picture at its first frame with its picture 20 s later (a second page of the same save keeps running while the first is read: see the correction under H1).
- **The mutation runners:** the UI runner has 10 layout mutants (53 in all, from 43) and the unit runner 65 new ones (193 in all, from 128) for the rules, the shape check, `layoutOf`, `bedOf`, the floor in force, `reseat`, the migrate step and `isUntouched`; four older unit mutants were retargeted because the floor and bed code was refactored. The cache's `known.clear()` and the early return of `useLayout` are not mutated: they change memory and speed, not results.

## Home H2b: Decorate mode (2026-11-25, branch `home-h2b`, stacked on `home-h2`)

Under the owner's blanket approval; every pick below is mine and reversible. H2b is the screen that writes `save.home`: the player can now move, put away and bring out the furniture. The plan is `home-plan.md` section 12, the result is section 13. Wallpaper for each room is H2c.

- **Decorate mode is screen state, never saved.** `Game.decor` is `{ selected: PieceKind | null }` or null. `startDecor()` works only on the room screen, in the home's world, with no hatch or evolve scene, and not twice; it ends on Done, when the player leaves the room screen, when the world is no longer the home (a field), when a scene starts and when a game from the account replaces this one. While it is on, `view.still` keeps the creature where it stands: a walk already begun is called off, none starts, and a sleepy creature does not walk to its bed (one already lying in it stays).
- **The way in:** a 48 px icon button over the picture's top right corner (`aria-label` "Decorate the home"), in Adult and Kid Mode and in every phase (egg, alive, dead) except while a scene runs. While the mode is on the dock holds only the tray, the bin and Done: the nav and care rows are gone, and so is the death card (it comes back after Done).
- **What a finger does (the rules of the plan's pick 4, in `Stage.tsx`):** a finger that lands on a piece (its tiles, even where the creature stands) selects it and carries it, keeping the grip, one tile at a time; a finger anywhere else pans (and a tap on bare floor lets go of the selection); a second finger puts the carried piece back and pinches; a third is ignored; a cancelled finger puts the piece back; the 450 ms pet hold never starts, so the creature cannot be petted or startled. A finger that never leaves the 8 px slop is a tap: it selects the piece and moves nothing, even if it crossed a tile line (a review caught this: the first build moved the piece one tile). The mouse's main button does all of this; the right button does nothing. A piece put down on a spot the rules refuse (or on the tile it came from) goes back where it was and nothing is saved.
- **Seeing it:** a piece being carried is drawn last, over everything, with a white outline where the six rules allow it and a red one (`#e0455b`) where they do not (a dark outer edge and two coloured lines); a selected piece has the white outline. The picture's `aria-label` says what is selected ("Decorating the home. The sofa is selected. The arrow keys move it.").
- **The tray:** one icon button per piece that is put away, in the pieces' own order (bed, dresser, sofa, rug, table, counter, fridge, mat, bowl), five to a row; each icon is the piece's own drawing (`drawPiece`), scaled by the page. The Feeding Mat is in the tray, and can be touched in the home, only while it is owned. A tap on an icon brings the piece to the nearest allowed spot to the middle of what the picture shows (`Game.viewMiddle`, the camera's middle in tiles, kept by the Stage each frame; not the home's middle), selects it, and puts the keyboard focus on the picture.
- **The bin and the keys:** the bin puts the selected piece in the tray. The bed cannot be put away (a sleepy creature walks to it): in Kid Mode the bin is `disabled` with the bed selected; in Adult Mode it is `aria-disabled` and says "The bed has to stay: your creature sleeps in it." (Adult Mode also shows the words Put away and Done under the icons.) The arrow keys move a selected piece one tile (a refused step changes nothing) and, with nothing selected, pan the picture; Escape lets go.
- **How a change is saved:** `Game.setLayout(layout)` goes through `act` and writes `save.home = homeOf(layout)`, so the save lists all nine pieces (a put-away one as `null`) from the first change on, and syncs like any change. Every move first passes `moved()` in `art/homeEdit.ts`, which runs H2a's six rules (`problemWith`), so no layout the rules refuse reaches the save. The Stage sees the new layout, puts it in force and `reseat`s the creature (H2a).
- **New code:** `src/art/homeEdit.ts` (`moved`, `trayOf`, `tileOf`, `pieceAt`, `nearestSpot`, `lift`, `follow`, `drop`), `src/ui/DecorateBar.tsx`, `Game` methods (`startDecor`, `endDecor`, `select`, `setLayout`, `bringOut`, `putAway`, `nudge`), drawing helpers `drawPiece` and `drawOutline` in `art/room.ts`, three icons (decorate, bin, done) in `art/sprites.ts`. The game side does not import the art side except `ui/game.ts`.

My picks (none blocks the PR):

1. **A refused drop says nothing in words:** the red outline and the piece going back are the whole answer (Kid Mode must not need to read). A spoken reason in Adult Mode is a small later addition.
2. **A carried piece never scrolls the camera:** a finger at the picture's edge does not pan it; to move a piece far, pinch out first.
3. **A piece out of the tray lands by the view's middle, not the home's:** with the picture panned to the kitchen, a table comes out in the kitchen.
4. **Starting Decorate mode calls off a meal and re-seats the creature** (H2a's `reseat`, which ends a walk and a meal picture); the food and the stats are not touched.
5. **The dock grows a row when six to eight pieces are in the tray** (known-issues): on a tall phone the stage re-centres the picture, so it moves up by half of the growth (31 CSS px measured at 390 x 844@3, 0 where the page has no spare height). With up to five pieces it does not move. Left as it is; a dock that always reserves two rows would stop the move at the cost of a permanent shift on entering the mode.

## Home H2c: a wallpaper for each room (2026-11-25, branch `home-h2c`, stacked on `home-h2b`)

Under the owner's blanket approval; every pick below is mine and reversible. The plan is `home-plan.md` section 14, the result is its section 15. Floors are not part of it (the Shop sells none and there is no floor art).

- **Where it is saved:** `save.home.walls`, next to `pieces`: `{ bedroom?, living?, kitchen? }`, each an owned wallpaper id or `null` (the plain wall). A room with no entry shows the whole home's wall, `save.wall`, which only the Shop sets (`wallOfRoom(whole, home, room)` in `data/home.ts`; an own-property check, so a prototype key is not a room). A home nobody has decorated draws as before. No version bump.
- **What the Shop does:** buying and hanging a wallpaper still changes `save.wall` only, so a room the player has decorated keeps its own wall. `undoBuy` also takes the room entries that name the undone wallpaper off (`withoutWall`): it is not owned any more, and those rooms go back to following the whole home's wall. The Shop's "hung" mark therefore means "the wall of every room you have not decorated".
- **Saves:** `coerceHome` keeps a well-formed `walls` (`coerceWalls`: an object whose keys are room ids and whose values are null or a wallpaper id) and drops a malformed one alone, keeping the pieces; `migrateSave` then drops entries that are not owned wallpapers (`ownedWalls`), as it does for `wall`; `Game.setLayout` passes `save.home?.walls` on, so moving a piece keeps the walls, and a wall change keeps the pieces. A wall chosen before any piece was moved writes the whole starter layout with it (as the first moved piece does), so cloud sync counts the game as touched.
- **How a player does it:** in Decorate mode a tap on a room's bare wall (rows 0 and 1, no piece on the tile; a piece still takes the tap) selects that room's wall (`Game.selectWall`, `Decor.wall`; a piece and a wall are never selected together). The picture draws an outline round the wall (`drawWallOutline`, the same dark edge and two white lines as a selected piece) and the picture's `aria-label` says "The kitchen wall is selected. Pick a wallpaper below." The dock then shows one swatch button per choice in place of the furniture tray: the plain wall, then each owned wallpaper (the wall's stripes over its baseboard, in the wallpaper's own colours; `aria-label` "Put the meadow wallpaper on the kitchen wall"; `aria-pressed` on the wallpaper the room shows, whether its own or the whole home's). A tap puts it on that room (`Game.setWall`: refused when Decorate mode is off, the wallpaper is not owned or not a wallpaper, or the room already shows it) and the keyboard focus goes back to the picture, so Escape lets go. A tap on bare floor, Escape or a tap on a piece also lets go. The bin is off while a wall is selected (disabled in Kid Mode, `aria-disabled` in Adult Mode).
- **How it is drawn:** `drawHomeBack` paints each room's wall in its own wallpaper inside a clip of that room's columns (`WALL_SPANS`), using the old whole-width drawing code for each, so three equal walls give the old picture. `Look.walls` holds the three rooms' wallpapers (`lookOf`). A partition belongs to the room on its left (`wallRoomOf`: column 10 the bedroom, column 21 the living room): its wall, its edges and a tap on it. The old one-line room (a field) and the Shop's previews show the living room's wallpaper.
- **Kid Mode** gets the same wall selection and swatches with no new words (the swatches are pictures; the labels are for screen readers).

My picks (none blocks the PR):

1. **A partition belongs to the room on its left.** One rule that is easy to say; the contact sheet shows how it looks.
2. **The Shop sets the default only,** so a decorated room is never overwritten by a purchase.
3. **The Shop's wallpaper preview always shows the wallpaper in the living room,** even when the living room has its own wallpaper and so would not change on buying (known-issues). The alternative (showing the room unchanged) would hide what the wallpaper looks like.
4. **A wall is selected by pointer only,** as pieces are (the keyboard moves a selected piece or pans). The swatches are ordinary buttons, so Tab should reach them (not tried).
5. **No hint when no wallpaper is owned:** the dock then offers only the plain swatch.

- **Verification of H2c ran the whole suite of runners it touched, not only its own.** Five earlier runners' targets were displaced by the slice's edits (known-issues.md, H2c), so each was repaired and checked with `--check-targets`/`--list`. Re-run results: `mutate-shop-ui.py` in full (34 of 34 caught), `mutate-decorate-ui.py` (74 of 74) and `mutate-decorate-unit.py` (55 of 55) in full, `mutate-walls-unit.py` (47 of 47), and only the repaired mutants of `mutate-home-unit.py` (5 of 5) and `mutate-home-ui.py` (2 of 2, with `--only`). Cheaper alternative rejected: running only `mutate-walls-unit.py` and `mutate-decorate-ui.py`, which would have left the other runners silently stale.

## Adult track A2.4: hats (2026-11-25, branch `adult-a2-4`, off main a5058b0)

Under the owner's blanket approval and "start a2.4"; every pick below is mine and reversible. The plan is `adult-a2-plan.md` section 12 (the plan review's 13 findings are applied in it); the results are in progress.md.

- **One rule puts a hat on any picture of any form, in any pose** (`art/hat.ts`, pure, no per-form data). The crown row is the first row whose filled span is at least `max(3, round(0.4 x the widest row))` (`MIN_CELLS`, `MIN_SHARE`), so ears, horns and spikes that stand above the head are left beside the hat; the hat's last row lies on that row, centred on its span, and a hat that would start above the picture moves down to row 0. A hat cell outside the picture is dropped (never wrapped), the picture keeps its size, and the hat is drawn in its own palette letters, the digits 1 to 5 (no form uses a digit: tested for all 65). `withHat` returns a new picture (a new rows array and a new palette; a picture with no crown row, an empty one, comes back as the same object) and the hatless one stays in the cache untouched.
- **Two sizes by stage:** a baby and a kid get the 7 wide hat, a young and an adult the 13 wide one (`hatSizeOf`). A third, wider size for the widest adult heads is offered, not built (known-issues).
- **A form's second standing drawing is held within `MAX_HOP` = 2 rows and columns of where the rule puts the hat on its first drawing.** Found on the real code: one form (droopstar) lifts a claw above its head in its second drawing and carried the hat 10 rows up and 5 columns across at every swap while walking.
- **The sleeping creature's blanket is fitted to the HATLESS picture** (`scene.ts` passes `faceSprite(form, kind, frame)` to `drawBlanket`). A hat moves `blanketBox` for 69 of the 520 combinations of form, lying picture and hat (a Scorchlet's top is row 26 bare, 24 in a Knit Cap, in both lying pictures); making `blanketBox` skip the hat's digits was tried and is not enough, because the hat's cells also overwrite body cells.
- **One hat at a time, `save.hat: string | null`,** an owned hat's id or null (`migrateSave` keeps it only when it is an owned hat id; an older save has none). `useHat(save, id | null)` is like `useWall`. **Buying a hat does not put it on** (a wallpaper does): the card then says "Wear"; the card's button toggles "Wear" / "Take off" (`aria-pressed`). Undoing the purchase of a worn hat takes it off (`undoBuy`).
- **The four hats** (Knit Cap with Fiber, Acorn Cap with Wood, Fisher Hat with Fish, Stone Crown with Stone) each cost 12 coins and 2 of one material, `[tune]`: about one day of the measured income, as the wallpapers are. They are items 10 to 13 of 13 in the shop; they have no `dish` and are not wallpaper. They join the request board's pools (`itemIds`): a buy request can name a hat and a reward can be one (it arrives owned, not worn); the existing seeded tests that counted nine items were repaired.
- **Where it shows:** wherever `scene.ts` draws the living creature (the home, the one-line room, the field picture) in both modes, and in the habitat (at home and at work), and in the Shop's preview (the living-room crop with the creature standing in it, its bottom edge at y 120 of 128, `PREVIEW_FEET`). **Not** on a dead creature, in the arena, the hatch and evolve scenes, the Book, the forecast or the picker (plan question 1).
- **The canvas key has the hat in it when one is worn** (`form:<id>:<kind>:<frame>:<hat>`, at `scene.ts` and `habitat.ts`; the preview's key always has it); the arena's and the moments' keys stay hatless because they never draw a hat.
- **Kid Mode** has no Shop, so it cannot change a hat, but a hat worn in Adult Mode shows there, as a wallpaper does; the Kid comparison with `main` is on saves that own nothing.
- **Verification ran the cheap-model review three times after the code** (10, 7 and 2 findings; progress.md lists each with what was done) **and the runners it displaced were repaired first** (three Shop-`Preview` mutants in `mutate-shop-ui.py` and `mutate-board-ui.py`). A review found two mutants that would have survived (a dead creature's cap and the arena) because the dead tint changes the cap's colour whichever way it is drawn; both were applied by hand and failed their checks before the runs.
- **Left out:** the arena and the hatch scenes (question 1), more than one hat at once, hats from the request board put on automatically, a hat per stage of art beyond two sizes, a Wear button in the Book or the Room, bond effects and "hat tolerance" (A3). CLAUDE.md section 7.7's "hats draw at one anchor point per form" is old gear design; it is not edited (an edit needs the owner's approval).

## Home H3, the house grows (2026-11-25, branch `home-h3`; plan: home-plan.md section 16; every pick is mine under the owner's blanket approval and can be changed)

- **One new room, the Playroom, bought in the Shop** as item 14 (kind `room`, 36 coins + 4 Wood + 4 Stone, the last card). It is the fourth room of the home: columns 33 to 42 behind a partition at column 32 with the same two-row doorway. It starts empty (bare carpet, a window, the plain wall); the player moves the nine existing pieces into it in Decorate mode. No new furniture was built (scope: an empty room is only worth what goes in it; asked of the owner).
- **The price is 36, not the plan's first 60.** `tests/shop.test.ts` lets no price exceed three days of the measured 12.2 coins a day; the test refused 60. The plan, the data and the comments were changed to 36 the same day.
- **The home is as wide as the rooms built.** `COLS` (43) is the width of the widest home and stays the stride of every grid array; `colsOf(rooms)` is the width in force (32 or 43). `art/home.ts` keeps the layout AND the number of rooms "in force" and mutates `HOME.w` in place (every reader holds the one object); `useLayout(layout, rooms)` returns early only when BOTH are unchanged, because a profile that never moved anything has the very same `STARTER` object at three rooms and at four (the Stage compares both).
- **Pure functions default to `rooms = 3`**, so every old caller and test keeps its meaning; `wallRoomOf` defaults to the base three too, and `room.ts` passes `ROOMS.length` itself where it draws all the wall spans.
- **A layout the new room breaks is mended, not thrown away.** The only way a layout that was fine with three rooms breaks is a solid piece in the kitchen's east end closing the new doorway. `layoutOf(home, rooms)` then puts away solid pieces other than the bed, nearest the doorway (32.5, 5) first, until the rules pass; a tie goes to the piece that comes first in `KINDS`; if nothing mends it, the starter layout whole (as for any bad layout). It is a READ: nothing is written until the player's next move, bin or wallpaper, which then saves the repaired layout. The bed is never a candidate, and the mutation runner has a layout where it is the nearest piece and the other pieces go instead.
- **The undo takes the room back.** `undoBuy` for the room runs `withoutRoom`: every piece the save has inside the room is set to `null` (never a deleted key: a missing key means the starter place) and the room's wallpaper entry is dropped. The bed cannot be put away (rule 6), so a bed saved inside the room has its key deleted: it goes back to its starter place. The creature, if it stood in the Playroom, is put on the nearest free tile (`reseat`).
- **A buy request may name the Playroom; a reward is never the Playroom** (a free room worth three days of coins is not the small gift the board means).
- **Kid Mode has no Shop**, but a Playroom the saved game owns is built there too (as a wallpaper or a hat is). The Kid comparison with `main` is on saves that own nothing.
- **Fixed spots do not move** (the egg, the grave, the poop tiles, the start tile are in the first three rooms). A creature may wander into the Playroom, be fed, petted and put to bed from it.
- **The Shop's picture for the Playroom is the room itself**, a 128 x 128 window at (848, 0) of the home, drawn with four rooms whether or not it is built (`lookWith` sets `rooms`), the layout fixed on the starter one like every preview.
- **The save is still version 3.** `migrateSave` keeps `room-play` once; `coerceHome` keeps `walls.playroom`. No migration. A build older than this one drops the item on load (known-issues.md).
