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

