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

