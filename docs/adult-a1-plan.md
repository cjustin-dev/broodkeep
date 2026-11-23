# A1 "See it": plan (2026-11-22, version 2 after a cheap-model review)

Phase A1 of [the adult expansion](adult-expansion-spec.md): Adult Mode, the adult HUD, the Growth Forecast, the small fixes and a minimal
Retire. [decisions.md](decisions.md), section "Adult expansion", wins over the spec. This file is the plan for building A1; it was written
after reading the spec's Spec 1, UI/HUD chapter, Spec 8 and Spec 9 and the code they touch, then checked by a cheap-model reviewer
against the code (20 findings, each checked in the code; the real ones are folded in below). Everything here is my default and can be
changed by the owner. Adult Mode only shows more. The one rule that changes for everybody is the start value of discipline (owner's answer 3).

## 1. Slices (each its own pull request, each ends with a stop for the owner)

| Slice | Ships | Touches |
|---|---|---|
| A1.1 The numbers | `settings.adultMode` and its toggle, discipline starts at 30, the adult stat bar (number, bar, time to empty, "!" call mark, poop badge, a detail card with decay per hour and discipline), the status strip (name and stage, clock, coins and materials, Book %, gear, switch player) and the context bar (one line per screen) | state.ts, tuning.ts, care.ts (one rate function), new game/hud.ts, new ui/AdultHud.tsx, App.tsx, SettingsPanel.tsx, app.css |
| A1.2 The forecast | `game/forecast.ts` (a read model over `growth.ts`), the Growth Forecast card with what-if steppers, the stage rows (cells, mistakes, stage timer with the exact checkpoint time), the Care Log (a small new list) | new forecast.ts, care.ts (record a mistake), state.ts (`careLog`), new ui/Forecast.tsx |
| A1.3 Honest buttons | labelled care row with a reason on every unavailable button, Clean count, the feed and poke texts, dock labels and badges, habitat spot labels with their gate | actions.ts (refusal functions shared with the buttons), ActionBar.tsx, Nav.tsx, HabitatBar.tsx |
| A1.4 Retire | adult-stage creature only, offered in both modes, explained before it is confirmed, "retire, complete, pass on"; starts the next egg; the retired life is kept as a short record and listed in the Book. May slip to A2 (owner's answer 2) | actions.ts, state.ts (`retired`), BookPanel.tsx |

Each slice needs the HUD of the one before it, so A1.1 is first.

## 2. Decisions (mine, changeable)

1. **The toggle** is in Settings, a new "Display" part with one checkbox labelled "Adult Mode" (unchecked is off; the label of Spec 1; the long press on the Book icon from the
   UI/HUD chapter is dropped, one way in is enough). It is saved in the game (`settings.adultMode`, optional, missing or anything but `true`
   means off), so each profile has its own and the cloud carries it. Any profile may switch it: it only shows more, it needs no PIN or account.
   New games start with it off. Like every field of the save it follows the newest-save-wins rule: a second device that is used later with
   an old copy can bring the old value back (known behavior, goes in known-issues.md).
2. **Kid Mode's screens stay the same.** With the toggle off, `App` renders today's markup, checked by a script (section 3, edge case 13).
   One rule changes for every profile, adult or kid: new creatures start at discipline 30, so in a fight they ignore a command about 1 round
   in 5 until something raises discipline (the owner approved this; nothing raises it before A3/A4, so Kid combat is a little rougher in
   the meantime). CLAUDE.md section 12's "Kid Mode stays as it is" needs this one note.
3. **Names and the clock.** The spec's "Home / Fight" are Room and Arena in the game; the dock keeps those. The fifth stat is wellness and is
   labelled WELL, never HP. The clock and "wakes at" read game time (`game.now()`: the device clock plus dev mode's skips), because sleep
   and wake follow game time. The special (Dustpuff) is a kid by size; its stage label is "Special".
4. **The feed text is true to the rule.** The spec says "feeding now wastes the food cell". The game refuses food at hunger 95 and above
   and counts nothing for a refused meal (`feed` returns before `countServing`), so nothing is wasted. The text says what is real:
   "Full: hunger 97. It eats again in about 17 minutes." (awake; about 67 minutes asleep), from a function that is checked against the
   simulation. decisions.md records the correction.
5. **Numbers are floored, not rounded,** in the adult bar. Every rule compares the exact value with a whole number (food refused at 95 or more,
   a hunger call below 25, amber below 30, red below 15), and `x < N` is the same as `floor(x) < N` for whole N, so the number on the screen and
   the rule always agree (a hunger of 94.6 shows 94 and does eat; Kid Mode's bars keep rounding, unchanged).
6. **The "!" call mark** follows `creature.call`, the same thing the scene's thought bubble and the pulsing care button follow, so the three
   always agree. The call only updates once per game minute, so a mark can stay up to a minute after the need is met. Mapping: hungry to
   FOOD, sad to MOOD, dirty to CLEAN, sick to WELL, sleepy to ENRG. Only one call exists at a time; a second low need has no mark but its bar
   turns amber or red.
7. **Time to empty is "at this rate".** It uses the rate now (awake or asleep, with the poops on the floor) and ignores that night is coming;
   the detail card says "at this rate". A nap that ends by energy is not predicted. Wellness has no time to empty: its cell shows
   what it is doing, in one word taken from the same conditions as the simulation (`updateWellness`): sick, falling (a stat is at 0 and
   draining it), rising (recovering) or steady. (Built wider than the first draft, which had only sick and steady.)
8. **Time formats.** Stage timers are `hh:mm` as the spec asks ("11:24", minutes floored, hours not capped). Time to empty is short:
   "<1m", "45m", "9h 20m", "14h", ">99h". Never negative, never NaN. A countdown never reads more than the stage's length or less than
   zero (a device clock set back leaves `stageStartedAt` in the future; this is an old gap, listed in known-issues.md, the display just clamps).
9. **Layout.** Kid Mode keeps today's header. Adult Mode replaces it (60 px) with the strip (about 28 px, with the switch-player chip folded
   in), the stat bar (about 64 px) and the context bar (about 30 px); the scene (256 px) does not move. Free vertical space today: 56 px at
   320 x 568, 128 at 360 x 640, 268 at 360 x 780, 332 at 390 x 844, 403 at 412 x 915. The new rows add about 60 px net. At 320 x 568 that is a
   few px over, and the page then scrolls up and down (it already does there: 584 px tall); it never scrolls sideways. Buttons in the strip are
   at least 44 px, text at least 11 px. Measured at 320, 360 and 390 when each slice is built, not assumed.
10. **No new saved state that is not needed yet.** The "new entry" dot on the Book button needs a saved "seen" count: left out. The detail card
    shows decay per hour, time to empty and discipline; "last fed" and "last cleaned" need new saved times and wait for a later slice. Badges
    are derived from the save, never stored.
11. **One source for every number.** Time to empty and "eats again in" come from the same function the simulation uses to drain (`care.ts`),
    the forecast from `growth.ts`, the refusals from `actions.ts`. A test per number compares the display function with the real code.
12. **CLAUDE.md 7.1 says discipline "drops over time".** In the code nothing lowers it and nothing but the dev panel writes it. For the owner to
    fix when convenient (editing it is the owner's call); decisions.md notes it.

## 3. A1.1 in detail

### New and changed

- `Save.settings.adultMode?: boolean`. `isSave` and `migrateSave` already accept the extra field; read it as `=== true`.
- `tuning.newborn.discipline` 50 to 30. A creature already in a save keeps what it has. Evolution keeps care stats.
- `care.ts`: `statChangePerMinute(c, stat, asleep)` (the loss of hunger, happiness and hygiene, where the hygiene loss is the base rate plus
  the poop term and both are cut by the asleep factor; energy falls awake and gains 0.25 a minute asleep). `decayStats` calls it, so the
  display and the simulation cannot drift apart.
- `game/hud.ts`, pure functions with no screen code:
  - `formatSpan(minutes)`, `formatHm(minutes)`.
  - `timeToEmpty(c, stat, asleep)`: minutes, or null (wellness; no creature).
  - `minutesUntilItEats(c, asleep)`: whole minutes until hunger is below `fullAtHunger`, 0 if it already is.
  - `statLevel(value)`: floor, then good / amber / red at 30 and 15.
  - `callCell(call)`: which cell gets the "!".
  - `contextLine(save, nowMs, screen, fight)`: the line for the context bar. `fight` is what `Game.arena` knows (rung, foe name or null), because a fight is not in the save.
  - `nextWake(nowMs, startHour, endHour)`: scans forward minute by minute with the simulation's own `isNightHour(hourOf(t))`, so a daylight
    saving change cannot disagree with it.
  - `bookPercent(save)`.
  - `stageLabel(c)`: "Baby", "Kid", "Young", "Adult" or "Special".
- `ui/AdultHud.tsx`: `StatusStrip`, `AdultStats` (with the detail card), `ContextBar`. `App.tsx` chooses between today's header and these.
- `SettingsPanel.tsx`: the Display part.

### Edge cases (a test for each; "(b)" means a browser check)

State and migration:
1. A save with no `adultMode`: off. `false`: off. A wrong type (`"yes"`, `1`, `null`): off.
2. Toggling saves, and survives a reload of the same profile (b); another profile's setting is separate.
3. Discipline: a creature hatched now has 30 (the literal is pinned in a test); a loaded creature at 50 stays 50 after loading and evolving; one at 30 stays 30.

Rates (the display must equal the simulation, one minute at a time):
4. For hunger, happiness, hygiene (poop 0, 3 and 5, awake and asleep) and energy (awake, asleep): the function's value equals the change one
   `stepCare` makes. The test pins a clock hour that matches the sleep state (a night sleeper at noon wakes in the same minute) and a nap
   with energy below 100, and stays away from the clamp at 0 and 100.
5. Time to empty at a value of 0 ("empty"), 1 and 100; with a rate that gives under a minute; energy asleep counts up (time to full); energy
   100 asleep is "full". Wellness gives null.
6. `minutesUntilItEats`: hunger 94, 95, 95.4, 97, 100, awake and asleep; stepping the real simulation that many minutes allows a feed, one
   minute fewer does not.

Formatting (just under and over each threshold, minutes): 0.4, 1, 59, 60, 61, 599, 600, 5999, 6000; no negative or NaN; `formatHm` at 0, 59, 60, 683.

Context line, one test per branch and the order they win in: dead (checked first, even with a job still set) over egg over away on a job
(spot, time left, 0 left) over asleep at night (wake time, the wrap past midnight, start hour equal to end hour meaning never night, a daylight
saving day with a pinned time zone) over a nap over awake with a call over awake with none; the habitat screen; the arena screen with and
without a fight running; a baby, kid and young (stage countdown, clamped), an adult and the special (no countdown); a stage whose time is
already up; a stage that began in the future (clock set back); a hatch or an evolution inside one catch-up (new name, new countdown).

Strip and bar:
7. Egg phase: bars dim and show no numbers; the strip says Egg (and when it hatches). Dead: the strip says it passed away; no time to empty.
8. A stat at exactly 30 and 15 and just under (29.9 shows 29 and amber); poop 0 shows no badge, 1 to 5 shows it; the "!" shows only on the
   cell its call names and goes when the call goes (after a stepped minute); a hunger of 94.6 shows 94 and the feed works.
9. Coins and materials: zero coins shows 0; a material at 0 is left out; all five materials plus 99,999 coins do not push the strip sideways at 320 px (b).
10. Book percent: 0, 1 of 65, all 65, a Book longer than the total (never above 100).
11. The longest form names (Hollowbloom and Bubblebelly, 11 letters) and the longest player name (20 wide letters), measured against their boxes at
    320, 360 and 390, and `scrollWidth <= innerWidth` on every screen in both modes (b). The strip's Book, gear and switch buttons are at least
    44 px, text at least 11 px (b).
12. 480 px wide (the app's maximum) and a phone on its side: no overflow (b).

Kid Mode:
13. Toggle off: for the same saved game at a frozen time, the `.app` markup, the position and size of every Kid element and its computed styles are
    identical on `main` and on the branch (egg, baby awake, asleep, away, habitat, arena, dead). The canvas pixels are not compared (the idle
    animation uses random numbers) and the hashed bundle file names are ignored. (b)

### Verification plan

Typecheck, the unit tests above, a mutation run on each new function (break it, read the failure, restore, diff), a browser run in Chromium
with screenshots at 320 x 568, 360 x 640, 360 x 780 and 390 x 844 in both modes (a contact sheet that I look at), the Kid Mode comparison, the
overflow and size checks, and a cheap-model review of the diff and of the browser script before it runs.

## 3b. A1.2 in detail: the Growth Forecast (written 2026-11-22, before any code)

Everything below is "will", not "is". Facts about the game's rules were read from `game/growth.ts`, `game/care.ts`, `game/actions.ts`,
`data/foods.ts` and `data/tuning.ts` on 2026-11-22.

### Decisions (mine, changeable)

1. **It is a full-screen panel, not a card on the page.** Measured on the real header (2026-11-22, 320x568 / 360x640 / 390x844): the page is
   already 659 to 703 px tall at 320x568 and 360x640 for the three states measured (Kid Mode has 56 px free at 320x568, section 2, item 9),
   so an inline card would push the action buttons off the screen. The panel is the same kind as the Creature Book (`.panel`), so it costs no page height. The spec's
   "Zone 4, swipeable cards" is not built: one scrolling panel holds every row.
2. **The way in is the strip's name and stage text** (row 1: "Hollowbloom / Adult · 12:00 pm ›"). Measured: row 1 is 44 px high and the
   text block 34.5 px, so making it the button adds no height; a 44 px context line would add 14 px at 320x568 and 360x640. It gets a
   "›" so it reads as tappable. Its label is "Growth Forecast, <name>, <stage>". It is there for a baby, kid, young, adult and special; not for an egg
   or a dead creature (nothing is growing).
3. **The panel shows the rows of the creature's current stage only** (the spec's list, cut to what each stage really counts):
   - baby: Land, Water and Sky cells, 4 pips each (`fieldCellsToKid`), with the minutes toward the next cell;
   - kid: the field's three foods, whole cells and servings (no pip cap: the rule has no maximum);
   - young: hunger cells (5 pips), happy cells (5 pips) and care mistakes, with the tier they give;
   - baby and kid also: a "care clock" row (awake minutes since the last care, of 240, and what happens at 240; time away on a job does not
     count, `countNeglectMinute`), because the neglect rule can override the leader, so the forecast would be wrong without it;
   - every stage with a limit: the time left (`hh:mm`, from the same clamp as the header's stage line) and the exact checkpoint time
     ("today 3:42 pm", "tomorrow ...", else a weekday).
   The spec's "next cell at 80% avg" is not used: the real rule is a meal that takes hunger from below 95 to 95 or above, or happiness
   reaching 100 from below (`countCareCells`), not an average. The panel states the real rule.
4. **Leader, rivals and gaps come from the game's own functions.** `leadingForm(c)` is the leader. A rival's gap is found by asking the real
   functions: copy the creature, add inputs one step at a time (a minute in a field, a serving of a food, a mistake) and run `leadingForm` on the
   copy until the leader changes. The panel says what changed it ("25 more awake minutes in Water makes Drizzle the leader"). No second copy of
   the rules. If the number needed is more than the stage's bound allows, it says "more than the time left allows" (same bound as "Locked"). For
   the tier above, the cells needed are held against the meals the time allows (hunger cells) and one cell a step (happy cells: happiness has to
   fall under 100 and come back, and it only falls on a step).
5. **Ties name their rule, from the code:** a baby with a tie at the top (or no cells at all) goes to the field of its egg pattern (speckled Land,
   striped Water, swirled Sky), even when that field is not one of the tied ones (`netField`); a kid with a tie at the top, or no field food, gets the
   field's fourth young (`youngOther`). Young has no ties.
6. **"Locked" is a promise, so it is conservative.** It is said only when a bound proves no input can change the result before the checkpoint;
   otherwise "Still open", which claims nothing. Bounds (a test attacks each with the real simulation):
   - time: T = minutes left to the checkpoint (a wall-clock minute count, an over-estimate of awake minutes);
   - the special: a baby or kid can still turn into the special while `neglectMinutes + T >= 240` (`neglectHours * 60`), so then it is never locked;
   - baby: locked when the leader's cells L beat every rival's most possible, `floor((minutes + T) / 15) < L` (a leader with 4 cells or more grows up
     at the next minute: "growing up now");
   - kid: locked when the leader is the only one at the top and every rival's most possible whole cells is below L. A rival can get at most
     `floor((100 - hunger + r*T) / g)` more servings, where r is the awake hunger drain per minute and g the least hunger a meal adds
     (`min(100 - fullAtHunger, hunger of each field food)`, 5 now). Each meal needs hunger under 95 and adds at least g, and only the drain makes room;
   - young: the tier can fall with mistakes (at most `floor((callMinutes + T) / 60)` more, one per 60 unanswered awake minutes) and rise to 1
     only with 0 mistakes and a cell short. Locked when the best and worst possible tier are the same (tier 4 always is: mistakes never go
     down);
   - rounding: the bounds use T = `ceil(minutes left) + 1`, because the game steps on whole minutes from its last step, and the step that ends
     the stage still runs the care first (a call can still become a mistake in it). There is no "T = 0 is locked": a player can still feed
     before the next minute, so the bounds above apply at T = 0 too (found by the plan review, 2026-11-22);
   - the bounds count from where the creature has been simulated (`save.lastSimulatedAt`), not from the clock: the game catches up about once a
     second on whole minutes, and the minutes in between have not happened to the creature yet (found by the code review);
   - T is the real time to `stageStartedAt + hours`, not the header's clamped countdown: after a device clock is set back the stage waits
     until real time catches up (known-issues.md), and a bound that used the clamped time would be too small. The panel then says the clock
     was set back (the header, from A1.1, still clamps its own number).
7. **What-if** has one stepper row per input of the stage (baby: minutes per field, kid: servings per food, young: hunger cells, happy cells and
   "slips" (extra mistakes)). It runs on a copy, shows the leader and tier with the changes, and a Reset. Nothing is saved, and the panel keeps
   the numbers only while it is open. A baby what-if with two fields at the 4 cells that end the stage shows no leader (one field gets there
   first in the real game and the stage ends; the code would pick the first in the list), only a line saying so. The spec's "Avoid mistakes" stepper cannot undo mistakes already made (the count never goes down), so
   the stepper previews the risk of one more instead; a count of 0 is the best case already shown. (A deviation from the spec's wording, for
   the owner to veto.)
8. **The Care Log** is `counters.mistakeLog?: { at: number; call: CallKind }[]` (newest last, the last 8 kept), written where `careMistakes`
   goes up (`care.ts`), and reset with the other counters at each evolution because `freshCounters()` leaves it out. The count and the list
   can differ (the dev panel sets the count; the cap); the panel says "N earlier ones are not listed". The wording is neutral: "3:12 pm ·
   Hungry, not answered for an hour". It is saved in both modes (Kid Mode shows nothing of it).
9. **Names and portraits follow the spec:** the leading form is shown with its portrait and name even when it is not yet in the Book. (The
   Book's silhouettes then give no surprise to an adult who opens the forecast; a one-line change if the owner prefers "???" until found.)
10. **Adult and special:** "Final form. Growth is complete." with the form's name, portrait and, for an adult, its tier (the form's place in
    the field's `adults` table); the special says it grows no further. No Endgame link yet (A4).
11. **Kid Mode is untouched.** The save gains one optional field; no Kid Mode markup changes (the Kid Mode comparison runs again).

### Edge cases (a test for each; "(b)" means a browser check)

Leader and rules:
1. The leader equals `leadingForm` and equals `nextForm` at the checkpoint time, for 24 or more creatures: every stage, every field, the egg pattern tie
   (Land 2 / Water 2 / Sky 0 with a swirled egg goes to Sky), the baby with no cells, the kid with all zero, two foods level, three level, 3 servings
   against 2 (equal whole cells), young at mistakes 0, 1, 2, 5 and 6 with cells 5/5, 4/5, 5/4.
2. A baby with 4 cells in one field: "growing up now" with that field's kid; a field at 3 cells and 59 minutes does not count as 4.
3. Special, adult, egg and dead creatures: the right text or no panel, no crash, no NaN.
4. A creature on a job, asleep, asleep on a job (a job started before bedtime goes on while it sleeps), and at home produce the same forecast
   numbers (they read counters, not what it is doing now). Calls and mistakes still count while it is away and cannot be answered.

Time:
5. Time left: full length at the start, mid-stage, 1 minute, 0, past due; never negative. A stage start in the future (clock set back): the real
   time left, longer than the stage, with the clock-set-back line. The checkpoint text across today, tomorrow, 3 days on, and a daylight saving
   change (pinned zone).

Locked (a lie here is the worst bug of the slice):
6. An attacker test: for each stage, near each bound, run the REAL simulation to the checkpoint with the best attack (the baby sits in the
   rival field awake every minute; the kid feeds the rival food whenever it is allowed; the young one lets every call go unanswered). Whenever the
   forecast says Locked, the creature that results has the forecast's form in every attack. At least one case per stage must come out
   Locked (a function that never says it would pass otherwise), and a clearly open case must not.
7. The neglect rule: a baby or kid with enough time for 240 awake minutes without care is never locked; one with less left can be.
8. The bound's own inputs: the least hunger a meal adds is derived from the data (a test fails if a field food gives less than 5).
9. Rival flip numbers: adding the stated amount flips the leader, one step less does not (checked with `leadingForm` independently), for both
   rivals of a baby and of a kid (the Carrot and Worm rows, tie and all). A tie clause whose second number is out of reach says so.
9b. The kid's neglect room (a kid with 140 minutes of neglect and 101 steps left is not locked, one with 100 is); exactly 1 minute left and half
    a minute; a creature that has been simulated 30 minutes less than the clock is not locked where a current one is.

What-if:
10. Never changes the creature: the creature is deep frozen in the test (a write throws) and its JSON is equal before and after; the save is
    equal too; adding 0 gives the same forecast as no what-if.
11. Amounts stay inside the rules (hunger and happy cells at most 5, nothing negative); a baby what-if that reaches 4 cells says "grows up right
    away"; two fields at 4 cells show no leader.

Care Log:
12. An unanswered call writes `{ at, call }` and the count goes up by one in the same step; two mistakes inside one catch-up get their own
    times; more than 8 keeps the last 8; evolving clears it; a save without the field loads; the count and list can differ.
13. A save with a full log is a few hundred characters bigger (the close-time upload limit is 60,000).

Screen (b):
14. The way in shows only in Adult Mode, for the five states above; Kid Mode's 40 pages still compare with 0 differences.
15. At 320, 360 and 390: no sideways scroll, no row past `innerWidth`, no clipped text (a Range, not `scrollWidth`), buttons at least 44 px, text at
    least 11 px, with the longest names (Hollowbloom, Bubblebelly) and a kid with large counts.
16. The panel's numbers equal values written out by hand for a few saved states, and the 13 states open without a console error.
17. Steppers change the preview and Reset restores it; the saved game read back from storage is identical after using them; closing and opening
    the panel again shows no what-if.
18. "What changes this?" expands and collapses (`aria-expanded`), and says the stage's rule from the tuning numbers.

Mutation (break, watch it fail, restore, diff): each of the bounds in decision 6, the egg pattern tie, the careless version of "Locked"
(always true), the what-if writing to the real creature, the log cap, and the log reset.

## 3c. A1.3 in detail: honest buttons (written 2026-11-22, before any code; revised the same day after a fresh-eyes review)

Everything below is "will", not "is". Rules and values were read from `game/actions.ts`, `game/habitat/jobs.ts`, `game/combat/fight.ts`, `data/habitat.ts`, `data/combat.ts`,
`data/tuning.ts` and the button, stage and game components on 2026-11-22. Layout figures were measured in Chromium on the built game with every proposed change mocked in the page
(one change per fresh page; 4 window sizes x pixel ratios 1, 2 and 3; saved game: a young creature, awake, at home), by a scratchpad script that is not in the repo.
A cheap-model reviewer read this plan against the code and returned 28 findings (7 wrong statements, 6 on the order of checks and the dimmed look, 8 on the note, 7 on reasons and states
the plan did not cover). All 28 are folded in; the log at the end of the section says where.

### What is true today (so the slice is honest about its start)

- **Five care buttons, icon only.** Feed (opens a food tray), Clean up, Lights off (the moon: a nap, or wake from one), Give medicine, Go somewhere (opens a places tray).
  `disabled` today: Feed and Go while asleep or away; Lights only at night or away (a napping creature's button is the wake button, so it stays on); Clean and Medicine only while away.
  The trays close by themselves only when the creature falls asleep or goes away. Place buttons are never disabled: the current place is `aria-pressed`, a locked field has a lock badge.
- **Spot buttons and Fight are never `disabled`.** A refused tap shows a small icon for 1.6 s (`.note` in `HabitatBar` and `ArenaBar`), and a spot the creature is too young for has a lock badge.
- **Silent refusals today:** Clean when nothing needs cleaning (`"nothing"`, no pose, no text), Go to the place it is already at (`"already"`), and every other refusal in Kid Mode and Adult Mode alike
  shows only a head-shake pose (feed at 95 or more, medicine when not sick, lights when not tired) or a small icon (spots, Fight). Nothing says why, or what number decides it.
- **The rules, from the code (each action's order of checks matters, see decision 1):** it refuses food at hunger 95 or more (`tuning.fullAtHunger`); it will nap below energy 90 (`tuning.napBelowEnergy`)
  and a night sleep follows the clock; medicine only works on a sick creature; cleaning needs poop or hygiene below 99; care is refused while it is away on a job (`alive()` returns null); a spot refuses
  with `jobRefusal` (busy, asleep, sick, too-young, tired: energy minus the spot's cost may not fall below `habitatTuning.energyFloor` 20, so a trip needs cost + 20); a fight refuses with `fightRefusal`
  (the same five; stage `kid` or older, cost 10, floor 20, so a fight needs energy 30). Spot gates: Bug meadow and Herb patch from baby (cost 5), Trees and Pond from young (cost 10), Rock pile from adult
  (cost 15). No field is locked any more (every field has a plan). Poop is capped at 5 (`tuning.maxPoop`).
- **Touch:** a single tap only startles (no game call); a hold pets every 800 ms (`touch`, +2); three quick taps tickle (+3). `Stage.tap()` returns before anything when the creature sleeps.
  The hourly happiness limit is a 60-minute window from the first touch (`affection.windowStart`), not a clock hour, and near the limit a touch gives less than its amount.
- **The dock** says Room, Habitat and Arena in `aria-label` only (icons), and `Nav` is rendered in both modes. The spec's "Home" and "Fight" are not the real names. A call that is waiting is shown only by the
  Adult header's "!" (`AdultHud`); the Kid header has no call marker.
- **The haul card is a modal** (`HaulCard`) that opens the moment a haul exists and is dismissed by tapping it, so the spec's "count badge on Habitat while a haul is ready" would never be seen.
- **Foods and medicine are unlimited** (owner's answer 1), so the spec's "count owned" and "None: get from Shop" are not built.
- **Dustpuff** (the special form) is a kid by stage but never grows (`stageLabel` says "Special"): Bugs, Herbs and Fight are open to it, Trees, Pond and Rocks never will be.

### Measured (2026-11-22, young creature at home; "below" is how far the page runs below the window)

- **The room's size depends on the device's pixel ratio** (`ui/Stage.tsx`: `k = floor(width x dpr / 128)`): 256 px at 320 wide for every ratio, 256 px at 360 wide with ratio 1 but 320 px with ratio 2 and 298.7 px with
  ratio 3, and 256, 320 and 341.3 px at 390 wide. **The A1.1 and A1.2 measurements and the line "the scene is 256 px at every phone width" were taken at ratio 1, which no real phone has.** Real figures for the Adult Mode room page:
  320x568: 674 px tall, 106 below (every ratio); 360x640: 659 / 19 below at ratio 1, **723 / 83 below at ratio 2**, 702 / 62 below at ratio 3; 360x780 and 390x844 fit at every ratio (spare 57 to 185 px).
- **The care row overflows today in both modes:** its last button ends 44 px past the row at 320 wide (the page is then 348 px wide in a 320 px window, the known 28 px sideways scroll), 4 px past it at 360 (still inside the
  window) and 0 at 390. `grid-template-columns: repeat(5, minmax(0, 1fr))` with 2 px of side padding on the buttons removes it at every size (mocked: row ends at 320 / 360 / 390, page no wider than the window).
- **Labels under the care icons cost 0 px** when each is one line (the buttons are 76 px high; icon 48 + label 14). "Medicine" at 11 px bold is 55.6 px wide and the button has 47 px free at 320: it wraps to two lines (+2 px row, and breaks the row's look).
  Words that fit in 47 px: Feed 29.9, Clean 34.6, Nap 24.5, Wake 33.7, Meds 32.8, Go 16.6.
- **Labels under the dock icons cost 0 px** (52 px buttons, 32 px icon + 14 px label): Room 35, Habitat 46.2 and Arena 36.7 px wide in 76 px.
- **The real spot names do not fit** under the spot icons (57 to 80 px of text in 40 to 53 px): wrapped to two or three lines they add **+17 px** at 320 and 360 wide and +4 px at 390. Short words fit
  (11 px bold, px wide): Bugs 30.6, Herbs 36.5, Trees 33.2, Pond 31.3, Rocks 36.4, and for a locked spot its stage word, Young 38.1 and Adult 33.3. At 320 the spot buttons have 40 px free today and will have about 47 once the spot row gets the same `minmax(0, 1fr)` fix as the care row (that was mocked for the care row only; edge case 16 checks it for the spots).
- **A reason line that stays on the page costs +45 px at 360 wide and up, +63 px at 320** (two and three lines of 13.6 px text) and pushes the page further below the window at 360x640 and 320x568 (+45 and +63 px). So a reason cannot be a
  permanent line; it is shown only when asked for.

### Decisions (mine, changeable)

1. **One source of truth for "can it?", in the order each action checks.** A new pure module `game/availability.ts` holds one function per action. Each takes a creature that is already caught up and returns a code or null; the
   codes are listed in the order the action checks them (the real order, menu step included), and `actions.ts` calls them after its own `alive()` and keeps returning exactly the words it returns today:
   - `feedRefusal(c, food)`: `away` (the action's `alive()` gives "unavailable"), `off-menu` (not in `menuOf(c)`: "unavailable"), `asleep` ("sleeping"), `full` (hunger at `fullAtHunger` or more: "full").
   - `cleanRefusal(c)`: `away`, `nothing` (poop 0 and hygiene 99 or more: "nothing").
   - `lightsRefusal(c)`: `away`, `night` ("night"), then `not-tired` (energy 90 or more: "not-tired"). A napping creature is never refused: the button wakes it.
   - `medicineRefusal(c)`: `away`, `not-sick` ("not-sick"). No sleep rule: the action has none.
   - `goRefusal(c, place)`: `away`, `asleep` ("sleeping"), `already` ("already"), `locked` (a field with no plan: "locked"). Sleep is checked before "already", as in the action.
   `jobRefusal` and `fightRefusal` already exist and are used as they are. A map in `actions.ts` from code to word is pinned by a test per code, so moving a check cannot silently change a word.
   The Feed button never calls `feed()` (it opens a tray), so "available" for Feed means the same state refusal holds for every food on the menu; the sweep uses the foods of `menuOf` and one food outside it.
2. **Adult Mode only. Kid Mode keeps today's markup and behaviour** (`disabled`, the head-shake, no labels, no note, no dot). Every new thing is behind `save.settings.adultMode`: the care row, spot row and Fight take an `adult`
   flag, `Nav` takes a `labels` flag, and `Game.say()` does nothing when Adult Mode is off. The Kid Mode comparison with `main` must stay at 0 differences.
   In Adult Mode an unavailable button is `aria-disabled="true"` (dimmed like `:disabled`, still focusable and tappable) instead of `disabled`. **Which buttons dim:** Feed (away, asleep, full), Clean (away, nothing to clean),
   Nap (away, night, not tired; it does not dim while napping), Meds (away, not sick), Go (away, asleep), every spot and Fight that has a refusal. Not dimmed: the Nav buttons (they keep today's `disabled` during a fight), the place
   buttons (the current place is `aria-pressed`, a locked field shows its lock) and the food buttons. **Dimming the spots, Fight, Clean and Meds is new** (today only Feed, Lights and Go dim); the owner said "can dim" on 2026-11-22.
3. **A tap asks the live state, not the picture.** The look comes from the last one-second tick, but every Adult Mode tap on a care button, spot, place, food or Fight first calls `game.tick()` (catch up to `game.now()`, the same
   moment `alive()` uses in the action), reads the creature again, asks the availability function, and then either shows the reason or does exactly what the button does today. So a dim button that became available a moment ago
   still works, and a lit one that became unavailable (night began, a job ended) shows the reason instead of a head-shake. A refusal that already has a pose today (feed full, not sick, not tired, locked field) still plays it.
   An unavailable Feed or Go tap shows the note and does **not** open its tray.
4. **The care row's words are the verbs, one line each:** Feed, Clean, Nap (Wake while it naps), Meds, Go. Accessible names match what is read: "Feed", "Clean up", "Nap" or "Wake", "Meds (give medicine)", "Go somewhere". The nap
   button has no `aria-pressed` in Adult Mode (its word says the state: Nap or Wake); at night it reads "Nap", is `aria-disabled` and says the night rule. The moon is "Nap", its real job (the spec's "Lights" was a guess about the wrong
   button; the fifth button is "Go"). Clean carries the poop count as a badge when there is any, 1 to 5 (`clean` already clears all of it in one tap: "Clean All" is a label and a count, not a new action), and its name says it
   ("Clean up, 3 poop"). The care row and the spot row use `minmax(0, 1fr)` and 2 px of button padding in Adult Mode so they never overflow. **The owner then asked for no overflow that affects things visually, so the base `.care` rule uses `minmax(0, 1fr)` for both modes (a deliberate Kid Mode change, see "Changes after the owner's answers"); only the spot row keeps an Adult-only rule.**
5. **The reason is a note drawn over the top of the room picture, not a line in the page.** Measured above: an in-flow line costs 45 to 63 px and pushes the buttons the player is tapping. The picture is what the player is looking at, so a
   note on it is read at once. It goes at the top, where the wall or the sky is empty: it was tried at the bottom first, and there it covered the creature standing on the floor (screenshots, 2026-11-22). How it is placed: `.stage` is a centred grid cell and the picture is its only item, so the note box is a second item in the same cell (in Adult Mode the stage gets the class `stage adult`, and `.stage.adult > *` is `grid-area: 1 / 1`, so Kid Mode's stage and canvas keep their computed styles exactly), sized to the picture
   with the picture's own size (`size.css`, a style object, which the CSP allows), and its text sits at the top of that box. On a tall screen, where `.stage` is taller than the picture, it still lands on the picture. The box is always rendered in
   Adult Mode (empty when there is no note) and never in Kid Mode: a live region has to exist before its text changes for a screen reader to announce the change, Kid Mode's markup is the same, and the canvas is never remounted. Its class is `.reason` (`.note` is taken by the habitat's small icon). Plain text in a rounded box, up to three
   lines, `pointer-events: none` (the creature under it can still be petted), `role="status"`.
   **State:** `Game.note` (a string or null) set by `game.say(text)`. `say()` and its clear **only notify the listeners, like `setScreen`; they never call `changed()`**, which would mark the player as having changed the game and schedule
   a save and a cloud upload. One 6 s timer: a new note replaces the old one and restarts it. The note is cleared by leaving the screen, a new egg, a death (by a tap or by the clock), switching Adult Mode off, and `replaceSave` (a game put in from the account or the dev panel).
   **A note is a statement made at tap time:** the text is built once and not recomputed while it shows (the creature may fall asleep in those 6 s; the next tap says the new truth).
6. **The words of the reasons are built in one place from the numbers the game uses:** a new pure module `game/reasons.ts` (no screen code), so tests call it directly. The away, night-sleep and nap sentences of `contextLine`
   are taken out of it into shared functions in `game/hud.ts` that return the tail ("back in 2:31", "wakes 7 am (in 2:14)", "wakes when rested (energy 41 of 100)"); `contextLine` and `reasons.ts` both call them, and
   `contextLine`'s output must not change (the A1.1 tests cover it). Numbers are shown floored like the header (94.99 shows 94). Sentences, one per code (the numbers come from the rule that refused, never typed twice: the data files, or `cleanAtHygiene` in `availability.ts`, the one literal the old Clean action had):
   - Feed: "Not hungry: food is 97 of 100. It refuses food at 95 or more." There is no "eats again in about N min": that needs the decay rate and nobody asked for it.
   - Clean: "Nothing to clean: no poop, and hygiene is 99 (cleaning starts below 99)." Nap: "Not tired: energy is 93. It naps below 90." Night: "Night sleep follows the clock: wakes 7 am (in 2:14)." Meds: "Not sick: medicine only works on a sick creature."
   - Asleep (care, places, spots, Fight, poke): "Asleep: wakes 7 am (in 2:14)." or the nap tail. Away (anything but Call back): "Away at Pond: back in 2:31. Care waits until it is home." (the spot's name as the context line says it)
   - Places: "Already at home." / "Already at the Land field." / "The Water field is not open yet."
   - Spots, per spot: "Sick: it needs medicine before it can work." "Too tired for Pond: it needs energy 30 to go (it has 24)." (cost + floor from `data/habitat.ts`: 25, 30 or 35.)
     "Too young for Pond: it opens at Young (now: Baby)." with the stage words from `stageLabel`; for Dustpuff: "...it opens at Young, and a Special grows no further."
   - Fight (the Arena stays reachable while away, so busy is a real case): the away sentence; asleep; "Sick: it needs medicine before it can fight."; "Too young to fight: it starts at Kid (now: Baby)."; "Too tired to fight: it needs energy 30 (it has 24)."
7. **Spots show a short word, and a refused spot says why.** Adult Mode: Bugs, Herbs, Trees, Pond, Rocks under the icon (full names stay in the `aria-label`); a spot the creature is too young for shows the stage word that opens it
   (Young or Adult) in place of the short name, next to its lock. Tapping an available spot still sends the creature at once (a spot card with the haul range is A2's job); tapping a refused spot, or Fight, shows the reason as a note
   instead of the small icon (Kid Mode keeps the icon). While the creature is away the Habitat screen shows Call back and no spot buttons (unchanged), so no spot note can appear then.
8. **DROPPED 2026-11-22 (owner: "do your suggestions" and "you can drop those notes"); not built, see "Changes after the owner's answers".** Was: **The dock says Room, Habitat, Arena under its icons in Adult Mode** (the real names), and Room gets a small dot while a care call is waiting, the creature is at home and the player is not in the room. It clears when the call is
   answered, never by a timer; its name is "Room, needs care". Not built: the spec's Habitat haul count (the modal card makes it pointless) and an Arena dot (it needs a new saved "seen" value for a new rung; an idle device must not
   change a save). The dot is small and the header's "!" already shows a call in Adult Mode; **the owner can drop it.**
9. **DROPPED 2026-11-22 (owner: "do your suggestions" and "you can drop those notes"); not built, see "Changes after the owner's answers".** Was: **Poke, pet and tickle say what they did** (Adult Mode, in the room, through the same note; this is the most droppable piece, kept because the spec lists "poke texts"). The text comes from a pure `touchNote(kind, result, creature)`
   in `reasons.ts`, from `tuning.affection`, the `TouchResult` the game returned (`gained`, not the nominal amount, since near the limit a touch gives less) and the creature's own `affection.gained`:
   poke "Startled. Hold to pet (+2 happy) or tap three times to tickle (+3)."; pet or tickle "+2 happy (6 of 15 in this 60-minute window)."; at the limit "No more happy for now: 15 of 15 in this 60-minute window. It still counts as care.";
   asleep: the asleep sentence. The third quick tap replaces the poke note with the tickle note. A hold says its note on the first pet and again only when the limit is reached, not every 800 ms, so a screen reader is not
   read to repeatedly. `Stage.tap()` changes in Adult Mode only: when the creature sleeps it says the asleep note before returning. Game rules do not change.
10. **No new saved state.** Nothing in the save changes, so no migration, no sync change, and an idle device still cannot change a save.
11. **Not in A1.3:** spot cards with haul ranges, the job card and a "call back keeps half" rule (A2), counts of owned food or medicine (answer 1), the Arena dot, the bond tap that gives a poke a use (A3), and the Kid Mode
    overflow fix (the owner's question).

### Edge cases (a test for each; "(b)" means a browser check)

Availability (pure, swept against the real actions on caught-up copies of a save; the boundary values are in every sweep):
1. Feed, for each food of `menuOf(c)` and one food outside it: hunger 0, 50, 94.99, 95, 100 x awake, nap, night x at home, away. The code is the action's order: away, off-menu, asleep, full. A baby asked for meat (off-menu) while asleep
   says `off-menu`, not `asleep` (the action's word is "unavailable", not "sleeping"). Available exactly when the action returns `"ate"`.
2. Clean: poop 0 and hygiene 98.99 is available, hygiene 99 and 100 with no poop is not, poop 1, 3 and 5 with hygiene 100 are available; away is not. Available exactly when the action returns `"cleaned"`.
3. Lights: awake with energy 89.99 (naps), 90 and 100 (not tired); napping at any energy (available: it wakes); night (refused: night sleep follows the clock); away. A night sleep with low energy is still refused.
4. Medicine: sick and not sick, awake and asleep (the action has no sleep rule, so the button has none either), away.
5. Go: asleep or awake x home or away x the current place and another place; asleep and the current place says `asleep`, not `already` (the action's order); a locked field (made locked in the test with `withLockedField`).
6. Spots and Fight: the existing `jobRefusal` and `fightRefusal` give the reason; a sweep over every spot x stage (baby, kid, young, adult, and Dustpuff) x energy (cost + 20 - 0.01, cost + 20) x asleep, sick, away.
   The thresholds in the sentences are computed from the data (25, 30, 35, and 30 for a fight), and the stage word comes from the spot's `minStage`.
7. An egg, a dead creature and a creature on the habitat or arena screen: no care row or no reasons, no crash (the components return nothing, as now).
8. The reason texts: every number in a sentence equals the value the rule used (floored like the header). 94.99 shows "94" and is available; 95.0 shows "95" and is not; hygiene 98.99 shows 98 and 99.0 shows 99. Away with 0 or less left
   says "back any moment"; with 0 to 1 s left it says "back in 0:00" (the clock face, as `contextLine` does today). A night sleep with no wake hour set (start equals end) says "Asleep" without a time: only a hand-built save reaches it, since the
   simulation clears such a sleep, so it is a unit case of the shared function, not a play case.
9. `contextLine` returns the same text as before for every state in the A1.1 tests (the extracted sentences are shared).
10. Dustpuff: Trees, Pond and Rocks say "a Special grows no further"; Bugs, Herbs and Fight are open to it.

The tap, the note and the buttons:
11. (b) A tap asks the live state: a creature whose night begins (or whose job ends) between the last tick and the tap gets the true answer, not the picture's. (Unit: the creature is made stale on purpose, then the tap runs.)
12. (b) The note never changes the page's height or width (the document is the same before and after a tap on an unavailable button), lands on the picture's top edge at every window size including a tall one (360x780 and 390x844,
    where `.stage` is taller than the picture), covers no part of the dock, and is at most three lines at 320, 360 and 390.
13. A new note replaces the old one and restarts its 6 s; rapid taps leave one timer; leaving the screen, a new egg, a death and `replaceSave` clear it; no note is made in Kid Mode, ever (`say()` does nothing there). A note's text is
    not recomputed while it shows.
14. `say()` never calls `changed()`: after any note the save is not marked as changed by the player, no save write is scheduled and no upload is asked for (tested with the pattern in `tests/game-save-hook.test.ts`: fake timers,
    the window stubbed, the local store mocked).
15. (b) An unavailable button is `aria-disabled="true"` and still focusable; Enter and Space on it show the note; an unavailable Feed or Go does not open its tray; a tap on an available button does the action as today (a feed
    opens the tray, a clean cleans). A food tray that is open when the creature becomes full (a dev stat edit, a game put in) stays open, and a food tap then closes it and shows the full note. Kid Mode's markup is byte-identical (the
    comparison with `main`).
16. (b) Every label in every state fits in the button's free width at 320, 360 and 390 (Feed, Clean, Nap, Wake, Meds, Go; Bugs, Herbs, Trees, Pond, Rocks, Young, Adult; Room, Habitat, Arena), measured with a Range against the
    button's content box, and no label wraps. The spot row ends inside its box.
17. (b) At 320, 360 and 390 the care row ends inside its box (no overflow) and the page is no wider than the window, in Adult Mode, for a creature with 0, 1 and 5 poop (the badge) and with a call waiting.
18. The Nap button reads "Wake" while napping and "Nap" otherwise, has no `aria-pressed`; at night it reads "Nap", is `aria-disabled` and says the night rule.
19. **DROPPED 2026-11-22 (owner: "do your suggestions" and "you can drop those notes"); not built, see "Changes after the owner's answers".** Was: The Room dot: shown only with a call waiting, the creature at home and the player not in the room, named "Room, needs care", gone as soon as the call is answered; not shown while the creature is away (care cannot be answered
    then); the Nav stays disabled during a fight as now; Kid Mode has neither the labels nor the dot.
20. **DROPPED 2026-11-22 (owner: "do your suggestions" and "you can drop those notes"); not built, see "Changes after the owner's answers".** Was: Poke, pet, tickle: each note's numbers come from `tuning.affection`, the returned `gained` and the creature after the touch; a pet that gains less than its amount near the limit says what it gained; the limit and asleep texts;
    the third quick tap changes the poke note to the tickle note; a hold says its note once and once more at the limit; an asleep tap says the asleep note; Kid Mode shows nothing new; the game result of each touch is unchanged.
21. Away: the care buttons and the places tray are unavailable with the away reason; the Arena's Fight says the away sentence; the Habitat screen shows Call back (unchanged) and no spot buttons.
22. The save is the same before and after any tap on an unavailable button (deep equal), except for the catch-up the tap itself does first (decision 3: the same `tick()` the one-second timer runs, so time that was due is simulated, marked as not the player's doing); the browser check freezes the page's clock so that catch-up is nil. No new field exists in a save (the A1.2 `mistakeLog` aside).

Mutation targets (break, watch fail on its own assertion, restore, diff): each threshold in `availability.ts` (95, 90, 99), the order of the checks in each action (menu before sleep in Feed, sleep before "already" in Go), the code-to-word
map in `actions.ts`, the Adult-only switch in `say()` and in each component, the label words, the `minmax` fix, the tick before the ask, `say()` calling `changed()`, the note anchored to `.stage` instead of
the picture, a note that writes to the save, the per-spot thresholds.

### Changes after the owner's answers (2026-11-22, after the build and its first verification)

The owner answered "can dim" (decision 2 stands), "i dont knwo you choose" for the note's 6 s and top position (kept), then "do your suggestions. you can drop those notes. i dont want kverflow of it affects things visually". Done:
- **Dropped:** decision 8's Room dot and decision 9's poke, pet and tickle notes (edges 19 and 20 with them). `Stage.tsx` keeps `main`'s touch code apart from the Adult class and the note box; `touchNote`, the dot and their tests, checks and mutants are gone. The words under the dock icons stay. (The owner's "those notes" named the touch notes; the dot was on my own "can be dropped" list and "do your suggestions" covered it.)
- **Dimmed buttons at 0.55, not 0.4** (Adult Mode's `aria-disabled` only; Kid Mode's `:disabled` stays 0.4): the dimmed word then measures 4.56:1 against its dimmed button (3.1:1 at 0.4; 0.5 gives 4.03, 0.6 gives 5.12).
- **Kid Mode care row:** the base `.care` rule is `repeat(5, minmax(0, 1fr))`. Measured before (Kid Mode behaves like `main`; 6 saved games x 3 widths x room, trays, habitat and arena): at 320 wide the Go button ends 28 px past the window on every room view and a tap on it scrolls the page 27 px sideways; at 360 the row ends 4 px past its box (inside the window); at 390 nothing. After: no screen runs past the window at 320, 360 or 390. The change is one CSS rule for both modes, so the Adult-only `care adult` class and its CSS were removed. Kid Mode's other CSS and all its markup are as before; the Kid comparison with `main` now differs only on the care row at 320 wide (see progress.md for the counts).

### Review log (the 28 findings of the plan review, 2026-11-22, and where each went)

- Wrong statements 1 to 7: the Lights `disabled` rule (what is true today), the per-spot threshold (decision 6, edge 6), the stage word from `stageLabel` (decision 6), the tickle amount, the limit window and `gained` (decision 9, edge 20),
  poop 5 not 9 (edge 17), the unreachable no-wake-hour case (edge 8), the 0 to 1 s away case (edge 8).
- Order and dimming 8 to 13: each action's order with the menu step (decision 1, edges 1 and 5), the Feed tray versus `feed()` (decision 1), Nav gated to Adult Mode and the Kid header has no call marker (decisions 2 and 8), an unavailable
  tap does not open a tray (decision 3, edge 15), the nap button's `aria-pressed` (decision 4, edge 18), which buttons dim (decision 2).
- The note 14 to 21: anchored to the picture and renamed (decision 5, edge 12), `say()` never calls `changed()` (decision 5, edge 14), the asleep poke needs a `Stage.tap()` change (decision 9), hold-to-pet announcements (decision 9, edge 20),
  poke to tickle (decision 9, edge 20), snapshot not recompute (decision 5, edge 13), `replaceSave` clears it (decision 5, edge 13), the tap catches up first (decision 3, edge 11).
- Reasons and states 22 to 28: fight sentences (decision 6, edge 21), the nap sentence (decision 6), places sentences (decision 6), Dustpuff (what is true today, decision 6, edge 10), the Room dot while away (decision 8, edge 19), tray state after a
  state change (edge 15), the touch-text module and the `Game` test pattern (decision 9, edge 14).

## 4. Later slices (outlines; each gets its own edge-case list before its code)

- **A1.2 forecast.** Planned in section 3b above.
- **A1.3 honest buttons.** Planned in section 3c above (the outline that follows is the first version; 3c wins). The refusal rules move into functions that both the action and the button use; a test sweeps
  states and checks "button says available" equals "action works". In Adult Mode an unavailable button is `aria-disabled` (still tappable)
  and shows its reason in a line; Kid Mode keeps today's `disabled`. The poke text says what a poke does today (nothing; the attention
  tap is Bond, A3), honestly.
- **A1.4 Retire.** An adult-stage creature (not the special, a kid by size), at home, not in a fight; offered in Kid Mode and in Adult Mode
  (so a Kid Mode game gains one small control when its creature is an adult; the Kid Mode comparison covers the other stages). Two steps: a
  card explaining what happens ("Retire, complete, pass on"), then confirm. It records `{ formId, bornAt, retiredAt }` (short, capped),
  puts a fresh egg in, and leaves the Book as it is. The Book panel lists the retired lives. The save stays small (the close-time upload
  limit is 60,000 characters). Only a player's action marks a save as changed to send, so an idle device does not undo it; a device that is
  used later with an old copy can still win on a newer save time, and the older game goes to the backups (the existing rule).

## 5. Not in A1 (so nobody expects it)

Shop, requests, job and haul cards, call back with half a haul, the spot card with a price (A2); initiatives, minigames, bond, field pickups
(A3); the perfect-run badge, inheritance, legacy gallery, Book recipes (A4); sharing (A5). Also left out: a Book "new" dot (needs saved
state), "last fed" and "last cleaned" times (need saved times), foods owned counts (food stays unlimited), the bowl state (feeding is instant).
