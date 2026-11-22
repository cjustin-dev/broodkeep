---
title: Broodkeep — Adult Expansion Spec
project: Broodkeep
repo: https://github.com/cjustin-dev/broodkeep
live: https://broodkeep.pages.dev/
stack: PWA, Vite + TypeScript + Preact, Cloudflare Pages
audience: Claude Code / implementing developer
status: Build-ready spec. Build in phase order (see Build order).
---

# Broodkeep — Adult Expansion Spec (Markdown edition)

Make staying worth it. This is the full adult expansion for Broodkeep, specified to numbers, screens, rules, data changes, and acceptance tests, so it can be built in order without re-deciding it.

This Markdown edition contains the same content as the PDF spec, restructured for code-assistant ingestion: one file, task-sized sections, data models as TypeScript code blocks, and every acceptance checklist preserved as checkboxes.

## How to use this file with Claude Code

- Work one phase at a time, in the order in [Build order](#build-order--five-phases-value-every-phase). Do not start a later phase's systems early.
- Treat each `## Spec N` section as one work package. Its **Acceptance** checklist is the definition of done for that package.
- Values marked `[tune]` are playtest starting values, not sacred values. Everything not marked `[tune]` is a decision — if you change it, change the matching acceptance test with it.
- Items marked `TODO(verify)` were inferred from screenshots, not from code. Check them against the codebase before building from them. See [Open verification items](#open-verification-items--check-against-code-first).
- Do not add systems from the [Do Not Build list](#do-not-build-list). Do not add new creatures.

Suggested prompt pattern:

```text
Read broodkeep-adult-expansion-spec.md. Implement Phase 1 only:
Spec 1 (Adult Mode) + the UI/HUD chapter + the Spec 9 display fixes.
Follow the data model in Implementation reference. Run the Acceptance
checklists for Spec 1 and the UI/HUD chapter and report pass/fail per item.
```

## Contents

- [Context — why this spec exists](#context--why-this-spec-exists)
- [Guardrails — hard constraints](#guardrails--hard-constraints)
- [Spec 1 — Adult Mode: show the math](#spec-1--adult-mode-show-the-math)
- [Spec 2 — Shop and Request Board: give coins a job](#spec-2--shop-and-request-board-give-coins-a-job)
- [Spec 3 — Creature Initiatives: the creature starts things](#spec-3--creature-initiatives-the-creature-starts-things)
- [Spec 4 — Training minigames: replace the missing Train action](#spec-4--training-minigames-replace-the-missing-train-action)
- [UI/HUD chapter — Adult HUD Mode and the tall-phone layout](#uihud-chapter--adult-hud-mode-and-the-tall-phone-layout)
- [Spec 5 — Bond: petting that builds something](#spec-5--bond-petting-that-builds-something)
- [Spec 6 — Interactive fields](#spec-6--interactive-fields)
- [Spec 7 — Combat: from stat check to skill check](#spec-7--combat-from-stat-check-to-skill-check)
- [Spec 8 — Adult endgame: Book, perfect run, legacy, secrets](#spec-8--adult-endgame-book-perfect-run-legacy-secrets)
- [Spec 9 — Small fixes that unblock the rest](#spec-9--small-fixes-that-unblock-the-rest)
- [Build order — five phases, value every phase](#build-order--five-phases-value-every-phase)
- [Implementation reference — data, migration, metrics](#implementation-reference--data-migration-metrics)
- [Appendix — Balancing quick reference](#appendix--balancing-quick-reference)
- [Do Not Build list](#do-not-build-list)
- [Open verification items — check against code first](#open-verification-items--check-against-code-first)

## Context — why this spec exists

Broodkeep today: 64 creatures plus Dustpuff special (65 Book entries total). Paradise growth system already in the game:

- Field time selects the kid form.
- Food selects the young form.
- Care cells and care mistakes select the adult tier.

This spec builds on those systems. It adds no new creatures and removes none.

**The problem in one line:** Today the game is 30 seconds of maintenance, then waiting. Stats take 14–24 hours to empty, petting caps out, coins buy nothing, and an adult-stage creature has nowhere left to go.

**The fix in one line:** Show the math adults can master, give coins and care a purpose, let the creature start the interaction every 60–90 seconds, and give the adult stage a chase that outlives growth.

### Diagnosis — the open session dies in 30 seconds

An adult player opens Broodkeep, feeds, pets, cleans, sends the creature on a habitat job, and is done. Nothing else rewards staying, and several systems actively tell the player to stop. Until that arithmetic changes, new content will not save retention — the player will never be present long enough to see it.

| System today | Current value | What it teaches |
| --- | --- | --- |
| Hunger / happiness drain | 14–24 hours to empty | Come back tomorrow |
| Stage durations | 6h, then 24h, then 48h | Waiting is the game |
| Petting | Poke +0, Pet +2, Tickle +3; cap 15 happiness / hour | Stop touching it |
| Feeding | Refused at 95+ hunger | Your care is rejected |
| Habitat jobs | Creature away 3–8 minutes | Close the app |
| Coins and materials | Earned, but shop / crafting not built | Rewards are worthless |
| Combat | Untrained 1–5% vs boss; max-trained 98–100% on every rung | Stats decide, you do not |
| Training | No Train action exists; discipline never rises | Sulk rule can never fire |
| Adult stage | No further growth, no endgame | Finished = churn |

**The adult insight:** Adults do not need the game to be darker, louder, or faster. They need it to be:

1. **Legible** — they can see why a form is winning.
2. **Masterable** — skill and planning change the outcome.
3. **Respectful** — it never punishes a missed day.

Every spec in this document serves one of those three words.

## Guardrails — hard constraints

These apply to every phase. Do not violate them to fix a metric or ship faster.

- No loot boxes or any randomised paid/earned rarity pull.
- No FOMO timers. Nothing is framed as "gone forever."
- No streak punishment, login calendars, or any system that removes value for a missed day.
- No ads. No real-money purchases in any phase of this spec.
- No energy timers that block play.
- Rewards only go up — nothing in this spec ever takes something away for being absent.
- Kid Mode experience stays intact. Adult features are additive and toggle-gated (Spec 1).

## Spec 1 — Adult Mode: show the math

- **Phase:** 1 — build first
- **Effort:** Small. Uses data the game already has. **Risk:** Low.

**Goal:** Let an adult player see exactly why their creature will become what it will become — and change it on purpose. The dev evolution tree already calculates the leading form. This spec promotes that calculation to a player feature, gated behind a toggle so the gentle kid experience stays untouched.

### The toggle

- Location: `Settings > Display > Adult Mode: Off / On`. Default `Off` for new players.
- Turning it On requires no account and can be flipped at any time with no penalty.
- `Off` = current experience: icons, bars, no raw numbers. `On` = everything below appears.
- Nothing about care, growth, or economy changes — only visibility.
- Persist per save: `settings.adultMode: boolean`.

### What Adult Mode shows

| Panel | Exact content |
| --- | --- |
| Stats panel | Numeric value + max for every stat and HP (e.g. `47 / 60`), plus drain rate per hour and time-to-empty at current rate |
| Care cells | Field cells 0–4, food cells by food type, hunger cells 0–5, happy cells 0–5 — each as filled/total pips with the numeric count |
| Mistakes ledger | Care mistakes this stage: count, what caused each one, and timestamp. No shame language — label it "Care log" |
| Stage timer | Time remaining in stage as `hh:mm`, plus the exact growth checkpoint time |
| Growth Forecast | See below — the centrepiece |

### Growth Forecast — the screen adults will live in

- **Leading form, live.** Large portrait of the currently leading next form, its name, and tier. Under it, the two or three nearest rival forms with the gap in plain numbers, e.g. "Meadow Kid leads by 2 field cells. 3 more hours in Forest flips to Forest Kid."
- **What-if, without commitment.** Three sliders/steppers — Add field time, Add food, Avoid mistakes — that preview the forecast only. They never alter the creature. A "What changes this?" link expands the full rule: which input (field / food / cells / mistakes) decides this stage, its current leader, and what would overtake it.
- **Confidence line.** `"Locked"` when no remaining time or feedings in the stage can change the outcome; otherwise `"Still open — X feedings and Y field-hours remain in this stage."`

Why this works for adults: it converts waiting into planning. A player who can see they are 1 happy cell short of a perfect run will stay, play, and return on purpose. A player who cannot see it just waits — and waiting players churn.

### Edge cases

- At adult stage, Forecast becomes `"Final form — growth complete"` and links to the Endgame panel (Spec 8).
- When two forms tie, show both and name the tie-breaker rule explicitly.
- All numbers must read from the same functions the growth system uses — never duplicate the maths for display.

### Acceptance — Spec 1

- [ ] Toggle Off restores the current UI exactly; toggle On shows every panel above with live values.
- [ ] Forecast leader matches the dev tree leader in 20/20 test saves, including ties.
- [ ] Changing field time or feeding in a test save updates the forecast within one frame/tick.

## Spec 2 — Shop and Request Board: give coins a job

- **Phase:** 2
- **Effort:** Medium. Fixes the dead economy. **Risk:** Low–Medium.

**Goal:** Every coin and material the game already hands out must be spendable on something the player can see, use, or show off — in the first shop visit. Keep the shop small and functional. A small shop that works beats the planned large shop (shop + crafting + garden + room editor) that does not exist.

### Shop — launch catalogue (12–16 items, no more)

| Category | Launch items | Why it matters |
| --- | --- | --- |
| Functional furniture | Comfy Bed (slower happiness drain while resting), Feeding Mat (feedings count + small hunger-cell grace `[tune]`), Toy Shelf (unlocks favourite-toy slot, Spec 5), Lamp (field sparkles visible longer, Spec 6) | Purchases change play, not just looks |
| Food and recipes | 3 new foods, each strong on a different food-cell type; 2 recipes that combine existing foods | Feeding becomes a growth decision |
| Cosmetics | 4 hats/accessories, 2 habitat wallpapers | Identity and screenshots — the adult sharing loop |
| Habitat upgrades | Garden Plot (grow 1 food passively), Storage Box (+material capacity), Job Board+ (second habitat job slot) | Long-term coin sink |

Rules:

- **Pricing rule `[tune]`:** a useful functional item costs roughly 2–3 days of normal request + job income. A cosmetic costs roughly 1 day. The habitat upgrade costs roughly a week. Never price so high that saving feels pointless, and never sell coins for real money in this phase.
- **No rotation pressure.** The launch catalogue is always available. If you later add a weekly item, it returns on a published cycle — never "gone forever".
- **Preview before purchase:** furniture and cosmetics preview in the habitat. One-tap undo within 10 seconds, full refund.
- Owned items live in the habitat. Placing furniture is free-form within the existing room — this is the first slice of the room editor, without building a separate editor mode.

### Materials

- Materials earned from jobs and field pickups (Spec 6) are spent in the same shop as a second currency, shown side by side with coins.
- Two materials at launch is enough (for example Wood and Stone, or whatever the game already drops).
- Every material must have at least two uses at launch, or do not drop it yet.

### Request Board — a goal in every session

The Request Board sits beside the shop and answers the question every open session needs: what am I working towards right now?

| Rule | Spec |
| --- | --- |
| Slots | Exactly 3 active requests at a time. Completing one draws a replacement after a short delay (15 min `[tune]`) so the board never sits empty and never floods |
| Form | Picture-first cards a child could read and an adult can optimise: creature portrait + wanted item/action + reward. In Adult Mode, show the exact numbers under the picture |
| Types (launch) | Feed a specific food (x2); Spend time in a named field (20 min); Win a training game (any, Spec 4); Collect field pickups (x3, Spec 6); Place/buy a named furniture item; Reach a bond milestone (Spec 5) |
| Rewards | Coins on every request. Every 3rd–4th request also pays a rare item: a recipe, a cosmetic, or a legacy tint shard (Spec 8). Show the rare reward on the card before the player starts |
| Stacking and expiry | Requests never expire punitively. Unfinished requests stay. If the board is full for 3+ days, the oldest request gains a small bonus (+25% coins `[tune]`) instead of expiring — returning is rewarded, absence is not punished |
| Difficulty | Scale to stage: kid-stage requests are single actions; adult-stage requests can chain (feed + field + game). Never request an item the player cannot yet obtain |

### Acceptance — Spec 2

- [ ] A new player can earn and spend coins within their first two sessions, without waiting overnight.
- [ ] Every dropped material has 2+ uses in the shop on day one.
- [ ] Leaving requests untouched for 7 simulated days loses nothing and triggers no warning, streak break, or sad-creature penalty.

## Spec 3 — Creature Initiatives: the creature starts things

- **Phase:** 2–3
- **Effort:** Medium. Core open-session loop. **Risk:** Low.

**Goal:** While the game is open, the creature — not just its falling bars — asks for the player's attention. Answering an initiative always gives real progress: bond, a cell, a material, a request tick, or a discovery. Never only "+happiness".

| Initiative | What happens | Reward for answering |
| --- | --- | --- |
| Play invite | Creature brings a toy / bounces expectantly. Tap to play a 15–20 sec toss-or-chase micro-interaction | Bond XP + request progress |
| Craving | Thought bubble shows a specific food (sometimes a shop/recipe food) | That feeding counts double toward its food cell `[tune]` |
| Trick moment | Creature attempts a trick it is learning (by bond level). Cheer (tap in rhythm) to help it land | Trick mastery +; unlocks trick at bond milestones |
| Found gift | Creature nudges a leaf, shell, or shiny it found in the field/habitat | Material or coins; occasionally a Book clue (Spec 8) |
| Show me | Creature looks at a placed furniture item/hat and reacts; player can equip/move it | Bond XP; teaches the player the shop loop |
| Nap / quiet time | Creature curls up. Player can tuck it in (one tap) or leave it — both are fine | Small discipline +; models that ignoring is sometimes correct |

Rules:

- **Cadence:** one initiative every 60–90 seconds while the app is foregrounded and the creature is awake and present (not on a job). Randomise inside that window so it does not feel metronomic.
- **Politeness rules:** max 1 active initiative at a time; it fades without penalty after 30 seconds if ignored; never during a minigame, combat, or a menu; never as a push notification in this phase.
- **Personality:** weight initiative types by form and bond level, so two players' creatures feel different. Log the weights in Adult Mode ("Prefers: play, cravings").

### Acceptance — Spec 3

- [ ] In a 5-minute open session, a tester sees 3–4 initiatives, none overlapping, none blocking the UI.
- [ ] Ignoring every initiative for a full session causes no stat, bond, or currency loss.

## Spec 4 — Training minigames: replace the missing Train action

- **Phase:** 3
- **Effort:** Medium–Large. Build ONE first, then copy. **Risk:** Medium.

**Goal:** Today there is no way to train, so combat is decided before it starts and discipline never rises. One good 60–90 second training game fixes all three. Build Bug Catch completely first; the other two reuse its session shell, scoring, and reward plumbing.

### The session shell (shared by all three games)

- **Length:** 60–90 seconds, one-thumb, playable with sound off. Pause on app-switch; resume where it left off.
- **Entry:** Train button on the home screen + creature play invites can offer it. No energy cost, no entry fee, no daily cap on playing.
- **Rewards taper, play does not:** full stat reward for the first 3 sessions per stat per day `[tune]`, half reward for the next 3, then bond XP only. The player can always play — the game just stops being the fastest grind. Show this plainly in Adult Mode.
- **Scoring:** Bronze / Silver / Gold bands by score. Gold also pays +discipline. Any completed session pays +small discipline (see Spec 9) — this is what finally makes the sulk rule reachable and fair.
- **Accessibility:** no colour-only signals, no required audio cues, difficulty scales to the creature's stage, not the player's wallet.

### The three games

**1. Bug Catch — Speed**

- Bugs dart across the field; tap (not drag) to catch. Golden bugs are fast and worth 3x. Missing is never punished beyond no points. Combo multiplier for 5 catches without a miss.
- Trains: Speed. Field tie-in: played in the current field; caught bugs can drop field materials.

**2. Rhythm Grove — Spirit**

- Notes fall/pulse in time; tap on the beat as the creature dances. Perfect / Good / Miss windows shown in Adult Mode in milliseconds `[tune: Perfect ±80ms]`. Song is a short loop, different per field.
- Trains: Spirit. Note: this game doubles as the timing tutor for combat (Spec 7) — reuse the same windows and feedback words.

**3. Stack & Balance — Strength**

- Tap to drop falling blocks/food crates into a stack; wider perfect placements grow the combo. Stack height + stability time = score. One wobble recovery per run forgives a bad drop.
- Trains: Strength. Request tie-in: "stack 8 high" is a natural Request Board card.

### Balancing targets

| Target | Value `[tune]` |
| --- | --- |
| One stat, untrained to combat-ready, via games alone | ~4–5 days of 3 full-reward sessions |
| Gold band reachability for an average adult on day 1 | ~20–30% of runs |
| Session reward vs. overnight drain | A Gold session visibly moves the stat bar in Adult Mode |

### Acceptance — Spec 4

- [ ] A tester can raise a stat from base to the first combat rung's requirement using only Bug Catch, with no other system.
- [ ] Discipline rises from completed sessions and the increase is visible in Adult Mode.
- [ ] All three games complete start-to-reward with one thumb, sound off, in under 90 seconds.

## UI/HUD chapter — Adult HUD Mode and the tall-phone layout

- **Phase:** 1 — build with Spec 1. This chapter is a Phase 1 deliverable, not a polish pass.
- **Source screens:** owner's screenshots of the live build at broodkeep.pages.dev, 22 Nov 2026 — (A) Habitat at night; (B) Room at night, creature asleep, five poops on the floor.

### What the live screenshots actually show

Both screenshots are the live build on a tall Android phone, taken at night (1:02 PM real time, in-game night). Read them as an adult first-time player would: what needs me, when, and what happens if I tap anything? Almost none of that is answerable.

- **Screenshot A — Habitat, night.** Three locked spots read as dark empty boxes. Garden and flowers are decoration. No job, haul, or timer info.
- **Screenshot B — Room, night.** Creature asleep in bed (faint Zz), five poops — three on the pink rug, two on the floor — and a food bowl. Nothing counts the poops or flags dirty/sick.

| # | Finding | Evidence in the screenshots |
| ---: | --- | --- |
| 1 | Stats are illegible | Five small icon-only bars (food, face, lightning, droplet, heart) with green fills, no labels, no numbers, no decay cue. Hunger vs happiness vs energy is a guessing game; a bar at 60% and a bar at 15% demand completely different actions and look almost the same at a glance |
| 2 | The tall screen is wasted | The square scene sits in the middle with large empty dark-purple bands above and below it. On a ~19.5:9 phone roughly a third of the vertical space carries no information at all — exactly where timers, currency, and forecast belong |
| 3 | State that matters is invisible | Room: no clock, no wake time, no stage/evolution countdown, no coins. Habitat: coins and materials appear only as tiny chips (4 / 2 / 3) on this screen and vanish on the room screen. Five poops produce no alert, count, or Clean shortcut |
| 4 | Locked means blank | Habitat spots and the bottom spot row show locks with no name, yield, duration, energy cost, or unlock condition. A lock with no reason is a dead end, not a goal |
| 5 | Nothing can call for help | No badge, dot, or banner anywhere: not on Book, not on navigation (home / tree / swords), not for a finished haul, a pending call, or a creature need. The player must already know where to look |

### One toggle, same screens

- `Settings > Display > HUD: Kid / Adult` — this is the Spec 1 Adult Mode toggle, surfaced in the HUD itself (long-press the Book icon also opens it).
- Kid Mode keeps today's icon-only look exactly.
- Adult Mode keeps the same screens, scene, and buttons, and adds labels, numbers, timers, and panels in the space that is currently empty.
- No screen is replaced; nothing moves so far that a kid-mode player gets lost.

### The layout: fill the dead space, keep the scene sacred

The scene stays a centred square (the 128×128 pixel world, scaled). Everything new lives above and below it. Design at 360–390px wide; test at 360px first — if it reads there, it reads everywhere.

```text
ZONE 1 — STATUS STRIP (always visible, ~28px)
  Creature name + stage | In-game clock + day | Coins + each material | Book % | Settings gear

ZONE 2 — ADULT STAT BAR (replaces icon-only row, ~64px)
  Five labelled stat cells: icon + short label + value + bar + time-to-empty.
  Book button sits at the right end with a progress ring / % (see Stat bar).

ZONE 3 — CONTEXT BAR (~30px, one line, changes per screen)
  Room: "Asleep — wakes 06:00 — Next stage in 11:24"
  Habitat: active job / haul line | Fight: opponent + rung.
  This is where the single most time-sensitive fact lives.

  ┌─────────────────────────────────────────────┐
  │  SQUARE SCENE — unchanged size and position │
  │  Creature, room / field, tappable objects.  │
  │  Speech / craving bubble anchors here.      │
  └─────────────────────────────────────────────┘

ZONE 4 — FORECAST / ACTION PANEL (~92–110px, swipeable cards)
  Card 1: Growth Forecast. Card 2: Requests (0/3 done, next reward).
  Card 3: Bond + Train. This panel fills the large empty band below
  the scene in both screenshots.

ZONE 5 — CARE ROW (labelled, ~64px)
  Screen-specific care buttons with text labels, counts, and disabled reasons.

ZONE 6 — NAV DOCK (~56px, always visible)
  Home / Habitat / Fight — icon + word + badge dot/count. Never scrolls away.
```

### Readability rules at 360–390px

- Minimum tap target 44px; minimum HUD text 11px in-game (labels 10px only for secondary decay text, never for values). Values are tabular numbers so bars do not jitter as they tick.
- Five stat cells at 360px = ~62px each: icon 18px, label 3–4 letters (FOOD, MOOD, ENGY, HYGN, HP — or full words on two lines at 390px), value under the bar. If it does not fit, drop the label to the tap-expanded detail — never shrink the value.
- Colour is never the only signal: every bar also has a number, and a low bar also gets a "!" call indicator (see Stat bar). Keep the existing green fill; add amber under 30% and red pulse under 15% — paired with text, not instead of it.
- Dark-purple background stays (it is the game's night identity) — new panels use a slightly lighter purple surface with a 1px lighter border so zones read as layers, not one flat void.

### Zone 2 — the stat bar an adult can act on

| Cell | Adult Mode shows | Tap expands to |
| --- | --- | --- |
| Food (hunger) | Value/max, bar, time-to-empty ("empty in 9h") | Decay/hour, last fed time, foods owned, craving if active |
| Mood (happiness) | Value/max, bar, time-to-empty | Decay/hour, bond level, last play/pet time |
| Energy | Value/max, bar, "wakes 06:00" while asleep | Sleep schedule, drain while awake vs asleep |
| Hygiene | Value/max, bar, poop count badge when > 0 | Poops on floor, last cleaned, dirty/sick risk in plain words |
| Health (HP) | Value/max, bar, sick icon if sick | Condition, medicine owned, what cures it |

- **Call indicator:** when any stat crosses its "needs care" threshold, its cell gets a bouncing "!" and the creature gets a matching thought bubble in the scene. One indicator per need, cleared by addressing that need — never a generic red dot that means nothing specific. This is the HUD half of the existing call system: the bar tells you what, the bubble tells you where to look.
- **Book button:** keep the red book icon at the right end of the row, add completion underneath it — "Book 12%" in Adult Mode (from `book.ts`), plus a dot when a new entry was just unlocked. Settings gear moves to Zone 1 so the stat row is purely creature state.
- **No new art needed:** reuse the five existing icons at larger size. Labels and numbers are text, not sprites.

### Room HUD — fix Screenshot B

| Problem in Screenshot B | Redesign |
| --- | --- |
| Asleep, but no clock or wake time; Zz is barely visible | Zone 3 context bar: moon icon + "Asleep — wakes at 06:00 (in 2:14)" + in-game clock. In-scene, Zz gets a soft bubble with the wake time on tap. Care buttons that need an awake creature disable with the reason "Asleep" (below) |
| Five poops, zero signal | Hygiene cell shows a poop-count badge "5". Zone 4 card 1 becomes a care alert: "5 poops — tap Clean to clear all" with a one-tap Clean All that walks the creature's cleaner animation once, not five taps. If hygiene stays low, the alert upgrades in words: "Dirty — sickness risk rising" — information, not punishment |
| No growth or stage info at all | Zone 3 second line / Zone 4 Forecast card: stage name, next evolution countdown, and leading form (full panel below). Even collapsed, one line is always visible: "Young — evolves in 11:24 — leading: [form]" |
| Food bowl in scene, food state unknown | Tapping the bowl shows bowl state ("Empty / Half / Full") and a Feed shortcut. The bowl gets a tiny fill indicator in-scene so its state reads without a tap |
| Coins / inventory invisible on this screen | Zone 1 status strip is global — coins and materials show on every screen, not just Habitat |

### Care row (Zone 5, Room) — labelled, honest buttons

Today: five icon-only buttons (bowl, broom, moon, cross, lamp/stand) with only the moon showing a selected outline and no explanation of any state.

Adult Mode: each button is icon + word — Feed, Clean, Sleep/Wake, Medicine, Lights.

> `TODO(verify)` Confirm the fifth button's actual function in code and label it that; do not guess in the shipped UI. The PDF spec guessed "Lights" from the screenshot.

Rules:

- **Counts on buttons:** Clean shows the poop count; Feed shows food count owned; Medicine shows doses owned. Zero-owned disables with "None — get from Shop / Habitat"; tapping explains where to get it.
- **Disabled always says why:** greyed + reason in the button or on tap — "Asleep", "Already full (95+)", "No medicine". Never a silent dead button, and never the current Feed refusal with no feedback: at 95+ show "Full — feeding now wastes the food cell" so the refusal becomes a taught rule.
- **Selected state** (like Sleep in the screenshot) gets label + outline + a Zone 3 line explaining what it is doing and how to undo it.

### Habitat spots — a lock must state its price (fix Screenshot A)

Every spot — in the scene and in the bottom spot row, which must show identical information — gets a spot card on tap, and a one-line label under its icon without a tap in Adult Mode:

| Field on every spot card | Example format |
| --- | --- |
| Name + what it yields | "Pond — Fish + Water material" |
| Duration + energy cost | "5 min — 10 energy" |
| Coins / haul preview | "Haul: 3–6 Fish, 8–15 coins" (range, not a gamble reveal) |
| Stage / unlock gate | Unlocked: "Send" button. Locked: "Unlocks at Young stage" or "Costs 40 coins + 2 Wood — you have 4 / 2" with the shortfall in words |
| While away | Card flips to a live job card (below); spot in scene shows a countdown badge |

> `TODO(verify)` The yield, duration, cost, and haul numbers in the example column are format examples from the PDF spec, which were inferred from screenshots. Replace them with the real spot names, yields, durations, and costs from code before shipping any spot card.

- The three locked spots in Screenshot A (forest, pond, cave) currently read as identical dark boxes. In Adult Mode their silhouettes get name labels ("Forest — locked: Young stage") so the field itself becomes a map of future goals.
- Garden plot and flowers stop being decoration: garden gets a label + growth timer ("Sprouts ready in 1:12 — tap to harvest") once Spec 2's Garden Plot is owned; before that, its card says what it will do and what unlocks it. Flowers get a tap card only ("Bee meadow — +Mood while in Habitat `[tune]`") — if a decoration has no function, say "Decoration" honestly rather than implying one.
- **Creature presence:** the creature is small and centred on the path in Screenshot A. While in Habitat, a name + status chip floats above it ("Exploring — happy") and tapping it opens the Forecast card. While away on a job, its place shows an "Away — back in 2:31" marker instead of an empty path.

### Active job / haul card (Zone 3 + Zone 4, Habitat)

- **While away:** Zone 3 reads "At Pond — back in 2:31 — expected: Fish x3–6". Zone 4 card 1 is the job card: spot name, progress bar, energy spent, haul preview range, and a Call Back button. Calling back early returns a partial haul proportional to time spent — never zero, never a penalty — and the button states that before the tap: "Call back now: keep ~half haul".
- **On return:** haul lands as a tappable pile in the scene + a Zone 4 summary ("Returned: Fish x4, Coins +11") and a badge on the Habitat nav button until viewed. Hauls never expire and never rot.

### Bottom dock (Zone 6) and spot row — labels and badges

| Button | Adult Mode label | Badge rule |
| --- | --- | --- |
| House (nav) | Home | Dot when a care call is active in the room (poop, sick, hungry call) |
| Tree (nav) | Habitat | Count when a haul is ready / job finished; dot when a garden harvest is ready |
| Swords (nav) | Fight | Dot when a new rung is unlocked or a fight reward is unclaimed — never a daily-pressure badge |
| Spot row (5, Habitat) | Name under each icon (e.g. Berry, Leaf, Nest, Pond, Cave — use the real spot names from code) | Locked spots show the gate in miniature ("Young" / coin cost); active spot shows countdown |
| Currency chips | Move to Zone 1 (global) | On Habitat they may repeat inside the spot card where a cost is shown, with have/need ("4 / 40") |

Badges clear by viewing the thing they point to, never by a timer, and never count down. A badge is a signpost, not a threat: no badge in this game ever says "do this or lose it".

### Growth Forecast panel — Zone 4, Card 1 (default card)

Data source is the existing growth logic (`growth.ts`) and Book data (`book.ts`) — this panel is a view, not a new system, and needs no new creature art beyond the small portraits the Book already uses.

| Row | Content (Adult Mode) |
| --- | --- |
| Leading form | Portrait + name + tier of the currently leading next form, from `growth.ts`. Kid Mode: portrait only, no panel |
| Field cells | 0–4 pips + number, split by field if two fields contribute ("Forest 3 — Pond 1") |
| Food cells | Per food type eaten this stage, as pips + counts; the leading food highlighted |
| Hunger cells | 0–5 pips + number, with the threshold for the next cell ("next cell at 80% avg") |
| Happy cells | 0–5 pips + number, same threshold treatment |
| Mistakes | Count this stage + one-word causes from the Care Log (Spec 1). Labelled neutrally |
| Countdown + gap | "Evolves in 11:24 — Meadow leads Forest by 2 cells. 3h in Forest flips it." Plain-language gap, computed from the same leader function |

At adult stage the card becomes the Endgame card (Spec 8): "Final form — Book 41 / 65 — Perfect-run cells: Hunger 5 / Happy 5 / Mistakes 0" plus the legacy action. One card slot, three lives: forecast, then requests during long stages, then endgame.

### HUD feedback for positive interaction while the game is open

The scene is where interaction happens; the HUD is where it must register. If a reward only animates in the scene and no number anywhere moves, adults learn that interaction does nothing. Every positive loop in Specs 3–6 gets a HUD surface:

| Loop | HUD placement | Feedback spec |
| --- | --- | --- |
| Creature-initiated prompt (Spec 3) | Speech bubble in scene + matching chip in Zone 3 | Zone 3 chip names it ("Wants: Berry — feed for 2x food cell") with a Go button that scrolls/highlights the right care button. Fades in 30s, no penalty, no badge left behind |
| Minigame entry (Spec 4) | Zone 4 Card 3: "Train" card | Shows today's sessions per stat ("Speed 2/3 full reward"), best band, and a Play button. After a game, the trained stat cell in Zone 2 flashes its +gain ("Speed 47 +3") |
| Bonding (Spec 5) | Zone 4 Card 3 + Mood cell detail | Bond level + progress bar to next level ("Bond 4 — 62% to 5: unlocks High-Five"). Petting combo appears as a small floating counter at the creature and a combo bar under Zone 2 — combo feedback lives in the HUD so the scene stays uncluttered |
| Requests (Spec 2) | Zone 4 Card 2 + Shop/Board badge | "Requests 1/3 — next: Feed Berry x2 — reward 15c + recipe". Completing one fires a Zone 3 celebration line and the coin count in Zone 1 ticks up visibly. No streak counter, ever |
| Perfect / combo moments | Zone 3 celebration line (shared slot) | One line, plain words, ~3 seconds: "Perfect catch streak x8!" / "Perfect guard!" (Spec 7). Queue, never stack; max 1 line at a time; Kid Mode shows the in-scene version only |
| Field pickups (Spec 6) | Zone 1 material chips | Chip pulses and ticks +1 at the moment of pickup, with the material name floated in-scene. The player sees exploration become inventory |

### Acceptance — UI/HUD chapter (verify from real-phone screenshots)

- [ ] At 360px wide, Adult Mode screenshots of Room and Habitat each show, without scrolling or tapping: all five stat values, coins, Book %, in-game time, next-stage countdown, and the leading form's name.
- [ ] Room screenshot with 5 poops shows "5" on Hygiene/Clean and a Clean All action; asleep screenshot shows the wake time in Zone 3.
- [ ] Habitat screenshot shows every locked spot's name and gate (stage or cost) without opening a menu; an active job shows its countdown in Zone 3 and on the nav badge.
- [ ] Kid Mode screenshots are pixel-equivalent in layout to today's build — Adult Mode added panels only in the former dead space and the stat row.
- [ ] Every disabled care button, tapped, displays its reason. No button in either mode is silently dead.
- [ ] No HUD element anywhere shows a countdown that removes a reward, a streak, or a purchase offer.

## Spec 5 — Bond: petting that builds something

- **Phase:** 3
- **Effort:** Small–Medium. Replaces the hard cap. **Risk:** Low.

**Goal:** Today petting pays +2 (pet) / +3 (tickle) until a hard cap of 15 happiness per hour, then pays nothing — the game literally tells the player to stop touching their creature. Bond turns that same touching into permanent progression.

- **Bond levels 1–10.** Pet, tickle, play invites, trick cheers, and training sessions earn Bond XP. Level thresholds grow gently `[tune: L2 in day 1, L5 in week 1, L10 in ~a month of regular play]`. Bond never decays.
- **Unlocks:** L2 new idle reaction; L3 first trick; L4 favourite-toy slot (with Toy Shelf, Spec 2); L5 new petting reaction + hat tolerance (cosmetics stay on in-scene); L7 second trick; L10 a unique bond animation + a Book entry. Every level shows its unlock in the HUD (UI/HUD chapter).
- **Rhythm combo:** petting in a steady rhythm builds a combo counter (shown in HUD). Combo multiplies Bond XP, not happiness — happiness still fills its bar and stops mattering, bond keeps counting. Missing the rhythm resets the combo, nothing else.
- **Diminishing returns, not a wall:** replace the 15/hour hard cap with a taper — full happiness gain for the first ~15 points per hour, half after, quarter after `[tune]` — and always full Bond XP for the first minutes of a session. The player is never told "nothing happened".
- **Poke gets a job:** poke becomes the attention tap — it wakes a dozing (not sleeping) creature, triggers a look/blink reaction, and can start a play invite. It pays no stats, and Adult Mode says so ("Poke: gets attention"). See Spec 9.

## Spec 6 — Interactive fields

- **Phase:** 3–4
- **Effort:** Medium. Reuses field art. **Risk:** Low.

**Goal:** A field is currently a background swap where the creature walks the left side. Field time already decides the kid form — it should feel like the most alive place in the game, not the emptiest.

- **Tappables:** 3–5 per field visit, spawning every 20–40 seconds while present: sparkles (tap: material/coin glint), bugs (tap: starts a 10-second Bug Catch burst, Spec 4), rustles (tap: creature investigates — bond moment or a found gift, Spec 3), and hidden pickups unique to the field (shell at Pond, acorn in Forest, crystal in Cave — `TODO(verify)` use real spot yields from code).
- **Creature reacts, always:** every tap produces a creature animation/bubble — chase, sniff, startle, proud-carry. A tap with no reaction is a bug, per the acceptance test.
- **Full-width life:** let the creature roam the full field width while foraging, returning to the path on idle. Pickups can spawn anywhere walkable so the player scans the whole scene.
- **Economy tie-in:** pickups pay the materials the Shop (Spec 2) spends and tick Request Board collection requests. HUD chips tick up live (UI/HUD chapter). Spawn rates are generous early, tapering never below "something every ~30 seconds while present".

### Acceptance — Specs 5–6

- [ ] Ten minutes of petting never produces a zero-feedback interaction; Bond level and next unlock are visible in the HUD throughout.
- [ ] In a 3-minute field visit a tester finds 4+ tappables, each with a creature reaction, and sees a material chip increase.

## Spec 7 — Combat: from stat check to skill check

- **Phase:** 4
- **Effort:** Medium. Keeps the damage engine. **Risk:** Medium.

**Goal:** Today combat is decided by stats alone: an untrained creature wins 1–5% against the boss and a max-trained one wins 98–100% on every rung, by pressing Attack, Guard, Special on repeat. Keep the engine and the stat ladder — add the player's hands.

### The three skill inputs (reuse Rhythm Grove timing)

| Input | Mechanic | Effect `[tune]` |
| --- | --- | --- |
| Timed attack | On Attack, a shrinking ring/sweep crosses a target zone; tap inside it. Perfect / Good / Normal bands use the same windows and words as Spec 4 | Perfect: +50% damage and a small crit sparkle. Good: +20%. Normal: base damage. A miss-tap is Normal, never zero — skill raises the ceiling, it does not lower the floor |
| Timed guard | On enemy attack, a Guard prompt with the same timing window. Perfect Guard is a parry | Perfect: damage to 0 and reflect a small amount / gain Special charge. Good: halved damage. Late: normal Guard reduction |
| Special as a decision | Special charges from Perfects, not just turns. The player chooses when to spend it — save for a boss phase or spend to finish a rung safely | Charge rate and boss phases shown in Adult Mode; Kid Mode shows a filling star |

- **Target balance:** a mid-trained creature played perfectly should beat a rung that a max-trained creature played passively barely beats — and a max-trained creature played passively should no longer sit at 98–100% on the boss. Playtest targets `[tune]`: boss win rate ~15–25% mid-trained + perfect play; ~60–75% max-trained + good play; ~30–40% max-trained + passive play.
- **HUD:** timing feedback uses the Zone 3 celebration line ("Perfect guard!") and the enemy HP + rung + your HP are numeric in Adult Mode, bars in Kid Mode. Fight nav badge follows the dock rules in the UI/HUD chapter.
- **Discipline / sulk:** with discipline now earnable (Specs 4, 9), the sulk rule can finally fire — a low-discipline creature may refuse a command once per fight with a clear "Sulking — discipline too low" message and a known remedy (train/bond), never a silent failed tap.

> **Scope guard — PvP.** The owner's own direction is that PvP should be minigames, not monster battling. Do not build PvP on this combat system. Phase 5 specs PvP as asynchronous minigame scores (best Bug Catch / Rhythm score on a friend's creature card) once accounts exist. If that direction changes, re-spec combat PvP separately — do not quietly reuse this system.

### Acceptance — Spec 7

- [ ] Same save, same stats: a perfect-play run beats a rung that a passive-play run loses, in 8/10 paired tests.
- [ ] No fight outcome is 0% or 100% across the test matrix of training levels × play quality.

## Spec 8 — Adult endgame: Book, perfect run, legacy, secrets

- **Phase:** 4
- **Effort:** Medium. Mostly content + rules. **Risk:** Low.

**Goal:** An adult-stage creature never grows again — so the chase has to move from *what will it become* to *what can I complete, perfect, and pass on*. Four chases, all using systems already in this spec.

### 1. The Book — 64 of 65, and the 65th

- Book completion is the headline number (Zone 1 / Zone 2, from `book.ts`). Each entry unlocks with portrait, how it was earned, and — for unearned entries — the growth recipe in Adult Mode ("Field: Forest 4 — Food: Berry-led — Mistakes: 0–1"). A collection you cannot plan is a collection adults abandon.
- The 65th entry is the secret slot: shown as "??? — 64 / 65" once 64 are owned, with a riddle-style hint earned from Found Gifts (Spec 3), not a wiki lookup. It is the long chase that justifies the legacy loop below.

### 2. The perfect run

- Define it on the Forecast card so it is chased live, not discovered afterwards: Hunger cells 5/5, Happy cells 5/5, Mistakes 0 for a Tier 1 adult. Award a Perfect badge on that creature's Book entry and card, permanently.
- Perfect is a badge, never a requirement: every tier stays collectible without it, and a non-perfect creature is never labelled a failure anywhere in the UI.

### 3. Legacy / prestige — retirement that gives, never takes

| Rule | Spec |
| --- | --- |
| Retire | An adult (optionally Perfect) can be retired to the Book as a completed life. Retiring is voluntary, explained in full before confirming, and the retired creature remains viewable forever in the Book / Legacy gallery |
| Inherit | The next egg inherits ONE chosen legacy: the retired creature's tint, OR a small flat stat bonus (+3 to one stat `[tune]`), OR its favourite toy (bond starts at L2). Player picks at hatching, from what that life actually earned |
| Stacking cap | Legacy bonuses do not stack beyond one generation's worth — a Gen 5 creature is distinctive, not overpowered. Tints can be collected in the gallery without limit |
| No loss framing | Copy rule: "retire / complete / pass on" — never "sacrifice", "release forever", or anything that hides the creature. The gallery is the emotional receipt |

### 4. Secret evolutions (after accounts)

The already-planned secret evolutions ship only after accounts/cloud saves exist, because losing a secret form to a lost phone ends trust permanently. Until then, ship their hints (Book riddle, Found Gifts) so the chase is seeded. Each secret needs: a discoverable in-game hint, a recipe an adult can execute from the Forecast panel, and a Book entry that records how it was found.

### Acceptance — Spec 8

- [ ] A player can state, from the Book alone, the exact recipe for their next unearned creature.
- [ ] Retiring and hatching completes with the chosen inheritance visible on the new creature's card and in Adult Mode stats.
- [ ] No copy anywhere frames retirement or a non-perfect run as loss or failure (copy review sign-off).

## Spec 9 — Small fixes that unblock the rest

- **Phase:** 1–2 (quick wins). Do alongside Phase 1.
- **Effort:** Small each. **Risk:** Low.

| Fix | Rule change |
| --- | --- |
| Poke does nothing | Poke = attention tap (Spec 5): wakes a dozing creature, triggers a reaction, can start a play invite. Labelled honestly in Adult Mode |
| Feed refused at 95+ | Keep the refusal (it protects food-cell strategy) but explain it at the tap: "Full — feeding now wastes this food's cell" + show current hunger number. A taught rule, not a dead tap (see Stat bar, UI/HUD chapter) |
| Discipline never rises; sulk never fires | Discipline sources: completed training sessions (Spec 4), tuck-in / quiet-time respected (Spec 3), requests completed. Display in Adult Mode. Sulk threshold and remedy shown before it can fire in combat (Spec 7) |
| Habitat jobs send the creature away 3–8 min | Keep jobs, add the job/haul card, call-back with proportional haul, and nav badge (UI/HUD chapter). While away, Room shows "Away at [spot] — back in [timer]" instead of an empty room, and initiatives pause cleanly |
| Petting hard cap 15/hour | Replaced by the taper + Bond XP (Spec 5). Migrate the cap constant; do not keep both systems |

## Build order — five phases, value every phase

| Phase | Ships | Why this order |
| --- | --- | --- |
| 1. See it | Spec 1 Adult Mode + UI/HUD chapter: status strip, adult stat bar, context bar, labelled dock/care row, Forecast card — plus Spec 9 poke/feed/discipline display fixes | Cheapest, uses `growth.ts` / `book.ts` data that already exists, and every later system needs its HUD surface to register. HUD is not polish — it is the display layer for all of it |
| 2. Spend it | Spec 2 Shop + Request Board + habitat job/haul cards | Fixes the dead economy and gives every session a goal; needs Phase 1's currency strip and badges |
| 3. Stay for it | Spec 3 Initiatives + Spec 4 Bug Catch (one game, full shell) + Spec 5 Bond + Spec 6 field tappables | The open-session loop. One minigame done well before three done thinly |
| 4. Master it | Spec 4 remaining games + Spec 7 combat timing + Spec 8 Book recipes, perfect run, legacy | Skill and endgame land once training and bond give them inputs |
| 5. Share it | Accounts / cloud save, then secret evolutions, then PvP as asynchronous minigame scores | Nothing that can be lost or compared ships before saves are safe |

## Implementation reference — data, migration, metrics

### New / changed state (minimum set)

```ts
// One flag, two names max — pick ONE name in code and use it everywhere.
settings.adultMode: boolean
// (the HUD chapter calls the same toggle hudMode: "kid" | "adult")

interface BondState {
  level: number;            // 1–10, never decays
  xp: number;
  favouriteToyId: string | null;
  tricks: string[];
}

discipline: number          // now writable: training, tuck-in, requests

interface RequestState {
  id: string;
  type: string;             // feed | field-time | training-win | collect | furniture | bond
  target: unknown;          // item/field/game the request wants
  progress: number;
  rewardCoins: number;
  rewardItemId: string | null;
  createdAt: number;        // for the 3+ day stale bonus, never for expiry
}
requests: RequestState[]    // exactly 3 active

interface ShopState {
  ownedItems: string[];
  placedItems: string[];    // placed in habitat/room
  gardenReadyAt: number | null;
}

interface LegacyState {
  retired: unknown[];       // completed lives, viewable forever
  pendingInheritance: unknown | null; // tint | stat bonus | favourite toy
}

interface HudState {
  badges: { home: boolean; habitat: boolean; fight: boolean };
  lastSeenHaulId: string | null;
}
// Prefer deriving badges from state over storing them, where possible.

// Growth Forecast: NO new state — read model over growth.ts + book.ts only.
```

### Migration rule

Every addition defaults safely for existing saves (bond L1, discipline at current value, empty requests dealt on first open). No existing creature, coin, or Book entry changes value in migration.

### Playtest and metrics — measure staying, not suffering

| Question | Measure | Healthy sign |
| --- | --- | --- |
| Do adults stay while open? | Median open-session length; initiatives seen/answered per session | Session length rises from ~30s baseline; 2+ initiatives answered |
| Does the HUD teach? | % of testers who can name the leading form + one action that changes it, after 2 min in Adult Mode | 80%+ unaided |
| Does the economy move? | Coins earned vs spent per day; first purchase timing | First purchase inside 2 sessions; spend ratio climbs, hoarding falls |
| Is skill real? | Combat win rate by training level × play quality (Spec 7 matrix) | No 0% / 100% cells |
| Is absence respected? | Return rate after 3+ and 7+ day gaps; qualitative "did the game punish me?" | Returners report zero loss — because there is zero loss |

Do not add streaks, login calendars, or expiring offers to "fix" a weak metric. Fix the loop the metric points at.

## Appendix — Balancing quick reference

All values below are `[tune]` starting values.

| Knob | Start value | Knob | Start value |
| --- | ---: | --- | ---: |
| Initiative cadence (open, awake) | 60–90s | Request slots / replacement delay | 3 / 15 min |
| Initiative fade, no penalty | 30s | Stale-request bonus (3+ days) | +25% coins |
| Training session length | 60–90s | Perfect timing window | ±80ms |
| Full-reward training / stat / day | 3, then 3 at half | Perfect attack / guard bonus | +50% / reflect |
| Field tappable spawn | every 20–40s | Legacy stat inheritance | +3, one stat |
| Amber / red stat thresholds | 30% / 15% | Perfect run | 5/5/0 |

## Do Not Build list

- Loot boxes or any randomised paid/earned rarity pull.
- Energy timers that block play.
- Streaks, login calendars, or any system that removes value for a missed day.
- Expiring hauls, requests, or shop stock framed as "gone forever".
- Ads or real-money purchases in any phase of this spec.
- New creatures before the loop above works — the 64 + 1 secret are already more collection than the current loop can honour.

## Open verification items — check against code first

The PDF spec flagged these two items itself: they were inferred from the owner's screenshots, not read from code. Verify them before building the affected UI.

1. **Habitat spot yields, names, durations, and costs.** The spot-card examples in the UI/HUD chapter ("Pond — Fish + Water material", "5 min — 10 energy", "Haul: 3–6 Fish, 8–15 coins", spot names Berry/Leaf/Nest/Pond/Cave, and field pickups shell/acorn/crystal) are format examples. Pull the real values from the habitat/field code and update the spot cards, dock labels, and Spec 6 pickups to match.
2. **The fifth care button.** The Room care row has five buttons (bowl, broom, moon, cross, lamp/stand in the screenshot). The PDF labelled the fifth "Lights" as a guess and instructed: confirm its actual function in code and label it that in the shipped UI.

## Sources

- Broodkeep repository: https://github.com/cjustin-dev/broodkeep
- Live build: https://broodkeep.pages.dev/
- Owner's habitat and room screenshots of 22 Nov 2026, reproduced and critiqued in the UI/HUD chapter of the PDF spec.

All `[tune]` values are playtest starting points; all acceptance checklists are the definition of done for their spec.
