# Adult track A3, "Stay for it": plan v1

Written 2026-11-25, before any code, on the owner's "lets go. build out this game. i want it done and i want it to be super fun and interactive" (the go-ahead for A3 to A5 in the spec's order, under the standing blanket approval: take recommended answers as reversible assumptions, never merge). Branch `adult-a3` in `~/broodkeep-a3`, off `home-h3` (2bfd7b1, PR #46 open), because the home code in `Stage.tsx` and `game.ts` changed there. Sources: [adult-expansion-spec.md](adult-expansion-spec.md) (Build order, Specs 3 to 6 and 9), [decisions.md](decisions.md) ("Adult expansion": the corrections to the spec win), CLAUDE.md sections 7.9, 7.10 and 12. Every value marked `[tune]` is a starting value for a playtest, not a measured one.

## 1. Slices (each its own branch and pull request, each ends with the owner merging; I never merge)

The spec's Phase 3 is four systems. The order is by dependency, so each slice is playable and testable alone:

| Slice | Ships | Why here |
|---|---|---|
| **A3.1 Bond** (Spec 5, and the poke part of Spec 9) | Bond XP and levels 1 to 10 per creature, the taper that replaces the 15-an-hour petting cap, the petting streak, poke's honest job, the Bond display | Every later slice pays in Bond XP, so the currency comes first. Small and low risk |
| **A3.2 Bug Catch** (Spec 4, one game) | The training session shell (60 to 90 seconds, pause on app-switch, taper of rewards that never blocks play), Bug Catch, bands, discipline +, speed points | The most direct "fun" in the phase, and the first thing that can raise discipline (the sulk rule is unreachable today) |
| **A3.3 Initiatives** (Spec 3) | The creature starts things every 60 to 90 seconds while the app is open: play invite, craving, found gift first | Needs Bond (its reward) and Bug Catch (a play invite can offer it) |
| **A3.4 Field tappables** (Spec 6) | Sparkles, bugs (start a 10 second Bug Catch burst), rustles, one pickup per field; the creature reacts to every tap | Needs Bug Catch and found gifts |

A4 (the other two games, skill combat, Book recipes, the perfect run, legacy) and A5 (secret evolutions) follow, each planned the same way. Only A3.1 is planned in detail below; A3.2 to A3.4 each get their own section (written before their code, as A2 did) once the one before is built.

## 2. What is true today (read from the code on 2026-11-25; every line was grepped)

- `touch(save, kind, now)` is in `game/actions.ts` (line 178 on). `poke` returns `{ gained: 0 }` before doing anything. A pet or a tickle calls `noteCare`, then gives `tuning.affection.pet` (2) or `.tickle` (3) happiness, but at most `maxGainPerWindow` (15) per `windowMinutes` (60): `tuning.affection` in `data/tuning.ts` line 84, the window is `Creature.affection: { windowStart, gained }` (`state.ts` line 74, created in `sim.ts` line 102). A sleeping creature returns `{ asleep: true }`.
- Petting in the picture (`ui/Stage.tsx`): a finger held on the creature for 450 ms starts petting, then one pet every 800 ms while held (lines 389 to 407). A plain tap is a poke: the creature startles and nothing is paid (`tap()`, line 297 on). Three taps inside 1,200 ms are a tickle (`touch(s, "tickle", t)`, the happy pose, four sparkles). A heart floats up only when `gained > 0`.
- The poses are `idle walk hop happy startle refuse wobble eat sleep rumble yawn`, the effects are `heart` and `sparkle` (`art/idle.ts` lines 17 to 30). No pose or effect is new in A3.1.
- `Creature.discipline` is 30 at hatching and nothing raises or lowers it; only combat reads it (the sulk chance) (`state.ts` line 25).
- A creature's optional fields (`job?`, `hp?`, `trained?`, `rung?`) are how a new field is added without a version bump: `Save.version` stays 3, and `migrateSave` (`state.ts`, line 216 on) coerces each. A creature is dropped with its save when it dies or retires, so a field on the creature starts again with the next egg.
- Adult Mode is `settings.adultMode`, saved per profile; `isAdultMode(save)` is what the Stage already uses. Kid Mode stays as it is (CLAUDE.md section 12).
- The Adult HUD (`ui/AdultHud.tsx`) is a strip (the creature's name and stage, the Book, Settings, the coin and material chips, the player) and a stat bar of five cells with a details card. Space is already short: decisions.md ("Space and size") measured the Adult room page at 360 x 640 as 83 px below the window at ratio 2 and 106 px at 320 x 568.
- Tests that pin the old petting rule and will be rewritten on purpose (as H3 rewrote the two width tests): `tests/actions.test.ts` lines 208 to 224 (the 15-an-hour total, the tickle 61 minutes later, poke, asleep). Tests that use `touch(save, "pet")` as a care action only and must still pass unchanged: `tests/helpers.ts` lines 62 and 84, `tests/growth.test.ts` lines 201 to 216, `tests/forecast.test.ts` line 594, `tests/playthrough.test.ts` line 107.

## 3. Decisions for A3 (mine, each changeable)

1. **Kid Mode is unchanged:** the hard cap of 15 an hour, no Bond, no new word. The taper and Bond are Adult Mode only (`isAdultMode(save)`), like the Shop. `touch` has one extra branch, not two systems that disagree: the spec's "do not keep both" is read as "the adult path replaces the cap", and the Kid path is the old rule until the owner says otherwise. Reversible: one condition.
2. **Bond belongs to the creature,** not the household: a new egg starts at level 1. Legacy (what a retired life leaves) is Spec 8, A4.
3. **Unlocks the HUD names are only the ones that exist.** The spec says every level shows its unlock; naming a trick that is two slices away would promise it. In A3.1 only L2 (an occasional idle hop, the existing `hop` pose) and L5 (a bigger heart and sparkle burst when petted, the existing effects) are real; each later slice adds its own (L3 and L7 tricks in A3.3, L4 the toy slot with the Shop's Toy Shelf, L10 the animation and the Book entry in A4). Levels with nothing to unlock still level up and say "Level 4".
4. **XP is never tapered, only happiness is** (the spec: "always full Bond XP"). XP stops at the level 10 threshold so the number stays small.
5. **The streak** is the spec's "rhythm combo" read for the gesture the game really has: pets one right after the other (a held finger makes one every 800 ms, repeated taps make the rest) chain, and from the tenth pet in a chain (8 seconds of a held finger) each pet is worth 2 XP instead of 1. A gap of 2 seconds ends the chain. It changes XP only, never happiness.
6. **Poke stays free of reward and says so.** The spec's "wakes a dozing creature" has nothing to wake (a creature is awake or asleep, and a sleeping one is not touched), and "starts a play invite" is A3.3. In A3.1 poke only gets its honest label in Adult Mode: "Poke: gets attention".
7. **The Bond display is placed after a measurement, not by a guess.** Three candidates, in my order of preference: (a) one chip in the strip beside the bag chips, (b) a thin row under the stat bar, (c) a line in the stat details card. A quick mock at 320, 360 and 390 at pixel ratios 1, 2 and 3 (as the Home's H0 did) gives the real heights and widths before any code; the plan's figures are not summed.

## 4. A3.1 in detail

### The rules

- **Levels:** XP at which each level starts, `[tune]`: L2 300, L3 800, L4 1,500, L5 3,000, L6 4,500, L7 6,500, L8 9,000, L9 12,000, L10 15,000. Worked out for the spec's targets from 5 minutes of petting a day (300 s / 0.8 s = 375 pets, up to 750 XP at 2 each): L2 in under a day, L5 in about 4 days and L10 in about 20 days of that, which real play (lifting the finger ends a chain, and not every day) stretches toward the spec's week and month. The later slices add XP sources, so these are retuned then.
- **XP per pet:** 1 while the chain is under 10, 2 from the tenth pet of a chain on; a tickle is 3, whatever the chain. Only while the creature is alive, awake and at home, in Adult Mode.
- **The taper of happiness** (replaces the 15 an hour cap for Adult Mode): per window of `windowMinutes`, a gain is the full amount while the window's gained points are under 15, half while under 30, a quarter after (`[tune]`). A pet is never worth 0, so the heart always floats.
- **State:** `Creature.bond?: { xp: number; chain: number; at: number }`, optional; missing means level 1 with nothing saved. `at` is the game time of the last pet. About 40 characters.
- **Level-up:** `touch` returns `levelUp: number | null` (the new level, once); the Stage shows a sparkle burst and the HUD line, and one line goes to the dev log (at most nine per creature).

### Edge cases (a test for each; "(b)" is a browser check)

1. Kid Mode: `touch` gives the old numbers exactly (the 15 an hour total, no `bond` key written) and the screen is the same as `main` (b: the Kid comparison, 0 differences).
2. Adult Mode, the taper: the gain of each pet in a window is 2, 2, ... then 1, then 0.5 at the thresholds; the tickle is 3, 1.5, 0.75; the window resets after 60 minutes; the hearts show on every pet (b).
3. A pet or a tickle on a creature that is asleep, dead, an egg or away gives no XP and does not touch the chain.
4. XP: a pet adds 1 up to chain 9 and 2 from chain 10; a tickle adds 3; the total stops at 15,000; XP never goes down; the level is a function of XP alone and level 10 stays level 10.
5. The streak: two pets 2,000 ms apart chain, 2,001 ms apart do not; a clock that goes backwards (the device clock, the dev time offset) restarts the chain at 1 and never makes a negative gap; a chain restarts after sleep and after the creature has been away.
6. Level-ups: crossing a threshold returns that level once, and the next pet returns null; a tickle at the edge cannot skip a level (the largest step is 3, the smallest gap between two levels is 500).
7. A new egg, a death and a retire: the next creature has no `bond` key and is level 1.
8. Saves: a missing `bond` loads as level 1; a damaged one (a string, negative or fractional `xp`, `NaN`, `Infinity`, above the cap, a `chain` over 10, a non-finite `at`, extra keys, `constructor`, an array) is dropped, never throws and never keeps half of it; a Kid profile that has `bond` data keeps it untouched and shows nothing; `version` stays 3.
9. Sync: `bond` is part of the creature in the one document, so the newest save wins as for every field. A passive idle device does not move its XP (nothing is clock driven), so the only conflict is an ordinary one.
10. The display (b): Adult Mode only; a name, a level, the progress to the next level and the next unlock that exists, readable at 320, 360 and 390 at pixel ratios 1, 2 and 3 with no clipped text and no sideways scroll (measured with a Range, not `scrollWidth`); the label for a screen reader reads "Bond level 3, 120 of 500 to level 4"; Kid Mode shows nothing new.
11. Poke in Adult Mode says "Poke: gets attention" in the stat or care help text; it still pays nothing and still startles (b).
12. The unlocks: L2 makes the idle behaviour hop now and then (a test of the weights with a pinned random source, and none below L2); L5 makes a pet's burst bigger; neither is shown to Kid Mode.
13. Growth is not skewed by accident: a 5 minute petting session in Adult Mode is measured against the old rule for the happiness cells it adds (a test over the real `fieldCells` and `careCells` functions); the number goes in decisions.md. If it changes which adult a creature becomes by a margin the owner has not seen, it is a question for the owner, not a quiet change.

### Mutation targets (each must fail its named test or check)

The two taper thresholds, the quarter factor, the Kid branch (`isAdultMode` removed), XP cap, the level table (each threshold, off by one), the streak window (2,000 vs 2,001), the backward clock, the chain cap of 10, the asleep guard, the tickle multiplier (must stay 3), `levelUp` reported twice, a missing `bond` key written for Kid saves, each migrate filter, the level-from-XP boundary, the L2 weight, the label text.

### Verification plan (as the earlier slices)

A quick mock of the three display places first (step 0), measured at the six window sizes and the three ratios. Unit tests with a mutation run. Browser checks with real pointer holds (`bond-hold`, `bond-kid`, `bond-fit`) at 320 x 568, 360 x 640 and 390 x 844 at ratios 1, 2 and 3, a mobile touch window, a frozen clock. A contact sheet of every HUD state (level 1, middle, 10, a streak, a level-up) looked at before any check is trusted. The Kid comparison with `main` (0 differences). The full gate (typecheck, tests, build; warnings and bundle size against `main`). A cheap-model review of this plan before any code, of the code after it, and of every new script before its runs.

## 5. What A3.2 to A3.4 must settle before their code (outlines)

- **A3.2 Bug Catch.** Where the Train button lives (the care row already has five buttons and the page is short: measure; the Places tray is a candidate); the real stat caps (arena wins cap `trained` at 12, 20 and 40 by stage, so Bug Catch must share them or the spec's "4 to 5 days" is wrong); how "3 full sessions a day" counts a day without a streak or a loss for a missed one (local calendar day, never a countdown); the bug art (small, original, pixel); pause when the page is hidden; no sound required; the bands (Bronze, Silver, Gold) tuned so Gold is 20 to 30 percent of first-day runs; discipline +1 for any completed session, more for Gold, shown in Adult Mode.
- **A3.3 Initiatives.** One engine (a tick every 60 to 90 seconds, at most one active, fades after 30 seconds, never during a minigame, a menu, Decorate mode, a fight, a job or sleep) and three initiatives first (play invite, craving, found gift); weights by form and by Bond level; the state is not saved and not written to the dev log; the first test is "ignoring all of them costs nothing".
- **A3.4 Field tappables.** Three to five per visit, one every 20 to 40 seconds; real names for each field's pickup (decisions.md: shell, acorn and crystal need names of their own for Land, Water and Sky); the creature reacts to every tap (a tap with no reaction is a bug); materials tick the Shop's costs and the board.

## 6. Not in A3

Push notifications, PvP, accounts changes, new creatures, loot boxes, energy timers that block play, streak rewards or any loss for a missed day (the spec's Do Not Build list), the other two minigames and the Book entry for Bond 10 (A4), the Toy Shelf (a later Shop slice), sound.

## 7. Questions for the owner (none blocks the build; my picks are in section 3)

1. Kid Mode keeps the old petting rule and gets no Bond (decision 1). Say if Kid Mode should get Bond too.
2. Bond starts again with each new creature (decision 2).
3. After A3.1 is built, the measured effect of the taper on growth goes in decisions.md (edge 13).
