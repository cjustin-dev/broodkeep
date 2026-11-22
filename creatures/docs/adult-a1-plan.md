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

## 4. Later slices (outlines; each gets its own edge-case list before its code)

- **A1.2 forecast.** Planned in section 3b above.
- **A1.3 honest buttons.** The refusal rules move into functions in `actions.ts` that both the action and the button use; a test sweeps
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
