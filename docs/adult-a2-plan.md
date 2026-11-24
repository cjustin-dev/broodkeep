# Adult track A2: "Spend it" (plan v1, written 2026-11-23, before any code)

Spec: [adult-expansion-spec.md](adult-expansion-spec.md) Spec 2 (Shop and Request Board) and the UI/HUD chapter's habitat parts (spot cards, the job card, the haul).
Owner's answers and the corrections to the spec: [decisions.md](decisions.md), "Adult expansion". Where this plan and the spec differ, this plan wins; where this plan and decisions.md differ, decisions.md wins.
Everything below is "will", not "is", except the section "What is true today". Facts were read from the code on 2026-11-23 (files are named). Nothing is built; the plan stops for the owner's answers (section 4).

## 1. Slices (each its own branch and pull request, each ends with a stop for the owner)

A2 is too big for one pull request, and its parts do not need each other to be useful.

| Slice | Ships | New saved state | Depends on |
|---|---|---|---|
| **A2.1 Spot cards, the job card, an honest call back** | A card for each spot (what it gives, how long, how much energy, why it is shut), a live card while the creature is away, a call back that keeps what the time earned and says so | none | no other slice; it can start once Q1, Q5 and Q6 (section 4) are answered |
| **A2.2 The shop** | Coins and materials become spendable: the wallet rules, owned items, buy with a 10 second undo, the shop panel, items 1 to 9 of section 5 (nine items) | `owned`, `lastBuy` (the undo) | A2.1 only for the spot cards' "you have 4 / need 2" wording |
| **A2.3 The request board** | Exactly 3 requests of the types that exist in the game today, picture-first, coins on every one | `requests` | A2.2 (a request can ask for a purchase, and its reward can be an item) |
| **A2.4 Hats** (may slip to A4) | Four hats drawn on the creature, added to the shop as items 10 to 13 (thirteen items in all) | `hat` (the one worn id; a hat bought is in `owned`) | A2.2 |

Each slice gets its own edge-case list and mutation targets before its code, as A1.2 to A1.4 did. This plan carries them in full for A2.1 only (section 6) and an outline of what A2.2 to A2.4 must settle first (section 7).

## 2. What is true today

- **Coins and materials are earned and never spent.** Every write is in `game/habitat/jobs.ts` (`stepJob`: a job's haul) and `game/combat/fight.ts` (a won fight: coins, and one material half the time). Every read is a display (`ui/HabitatBar.tsx`, `ui/AdultHud.tsx`) or `sync/sync.ts` `isUntouched` (an egg save that has not been touched counts as untouched: it also needs 0 coins, an empty bag, no hauls, no creature and at most one log line). `game/crafting/` holds only a README.
- **The five materials** (`data/habitat.ts`): Fiber, Herbs, Wood, Fish, Stone, dropped by Bug meadow, Herb patch, Trees, Pond and Rock pile. There is no cap on the bag.
- **The spots** (`data/habitat.ts`, `spots`), in minutes / energy / coins / material:

  | Spot | From | Min | Energy | Coins | Material | Coins per energy (computed) |
  |---|---|---|---|---|---|---|
  | Bug meadow (fiber) | baby | 3 | 5 | 1 to 2 | 1 to 2 | 0.300 |
  | Herb patch (herbs) | baby | 3 | 5 | 1 to 2 | 1 to 2 | 0.300 |
  | Trees (wood) | young | 5 | 10 | 2 to 3 | 1 to 2 | 0.250 |
  | Pond (fish) | young | 6 | 10 | 2 to 4 | 1 to 2 | 0.300 |
  | Rock pile (stone) | adult | 8 | 15 | 3 to 5 | 1 to 3 | 0.267 |

  A creature only sets off if it keeps at least 20 energy (`habitatTuning.energyFloor`). So one full bar (100 down to 20) is worth, on average, 16 meadow or herb jobs (24 coins, 24 materials, 48 minutes), 8 trees jobs (20 coins, 12 materials), 8 pond jobs (24 coins, 12 materials) or 5 rock jobs (20 coins, 10 materials). Energy returns at 0.25 per minute asleep (`tuning.sleepEnergyPerMinute`, 15 an hour; refilling 80 energy takes 5 h 20 min) and falls 100 to 0 over 16 awake hours. **Coins are the scarce thing (about 20 to 24 a bar) and materials are plentiful (10 to 24 a bar).**
- **`refusal` order for a job** (`jobRefusal`): busy, asleep, sick, too-young, tired. In Adult Mode a refused spot is `aria-disabled` and a tap shows the reason as a short note over the picture (`game.whyNot` and `game.say` in `ui/game.ts`, shown by `ui/Stage.tsx`; the words are `game/reasons.ts` `spotReason`); in Kid Mode it is a small icon. Adult Mode already writes a short word under each spot and the stage on a locked one (A1.3).
- **While away**, the adult context line already reads "Away at <Spot> · <back text>" (`game/hud.ts`). There is no card, no progress bar and no haul preview.
- **Call back** (`actions.ts` `callBack`) ends the job, brings **nothing** back, and does not return the energy. The button is a house icon with no words (`HabitatBar.tsx`).
- **The haul** is a modal "Welcome back" card (`ui/HaulCard.tsx`) that shows the oldest of `save.hauls` (at most 5, `habitatTuning.unseenHaulsMax`) and is dismissed by a tap (`dismissHaul`). So a finished job cannot sit unseen behind a badge: the card already stops the player until it is read. The spec's nav badge and "pile in the scene" are therefore not needed for honesty and are left out (section 3, item 7).
- **There is no furniture, no cosmetics and no owned-items state.** The room is one fixed drawing (`art/room.ts`: wall, floor, window, rug, bowl, bed, in plain rectangles). `Save` has no `owned`, `requests` or `placed`.
- **Saves:** version 3; a new field is added with a default in `migrateSave` (as `book` and `retired` were); `isSave` checks only a few fields; the server stops at 256,000 bytes and a request under 60,000 characters is sent with `keepalive` (`sync/cloud.ts`).
- **Panels** open from `ui/App.tsx` (`panel`: settings, dev, book, forecast), from buttons in the Adult header's strip (`ui/AdultHud.tsx`).
- **Foods:** unlimited (owner's answer 1). `feed` (`actions.ts`) calls `countServing` and `countCareCells`; growth counts only a field's three foods (`growth.ts`).

## 3. Decisions (mine, changeable)

1. **Shop and board are Adult Mode only** (they sit behind `settings.adultMode`, as the spec's Spec 1 says adult features do). What a player owns still works if the mode is switched off, and nothing is lost either way. A profile that has never bought anything sees no change at all, and Kid Mode's own screens (room, header, habitat, arena) are not changed by A2.2 to A2.4; a profile that bought a wallpaper or a bed and later switches Adult Mode off keeps their look and effect, on purpose (taking them away would be a penalty). The Kid Mode comparison therefore runs on Kid saves that own nothing. See Q2.
2. **The spec's catalogue is cut to what can be built without later specs** (section 5): no Toy Shelf (needs Bond, A3), no Lamp (needs field pickups, A3), no Garden Plot (needs the garden timer, A3), no Storage Box (the bag has no cap, so there is nothing to raise), no Job Board+ (a creature has one job at a time; a second slot has no meaning yet). That leaves 13 items against the spec's 12 to 16.
3. **Furniture has a fixed place** in the room (a bed spot, a bowl spot, a wall spot), not free placement. The spec asks for free placement as "the first slice of the room editor", which is a whole piece of work (drag, snap, rotate, an invalid-spot outline) for two furniture items. See Q3.
4. **No coins for real money, no rotation, no timers, nothing expires** (the spec's guardrails apply to every slice).
5. **Prices are set from the measured income, not guessed.** Section 2 gives the arithmetic (about 20 to 24 coins per energy bar). Before A2.2 is built a short script will run the real simulation for a day of play and record coins and materials, and the prices will be written from that, with the spec's tiers (a cosmetic about 1 day, a useful item 2 to 3 days, an upgrade about a week) and marked `[tune]`.
6. **Every material has at least two uses in the catalogue** (the spec's rule): section 5 spreads the five materials over the items so each appears in at least two costs. A material used by fewer than two items would stop dropping instead (not planned: it would change the habitat).
7. **Left out of A2.1 although the spec lists them:** the Habitat nav badge and the haul pile in the scene (the modal card already does their job, section 2), a coin cost on a spot (spots unlock by stage, decisions.md), a "second job slot".
8. **Call back keeps what the time earned**, rounded down, exactly and shown before the tap (section 6). The energy it spent is still not returned, as today (the spec's "never a penalty" is read as: nothing the creature already has is taken away; the energy is spent either way). See Q1.

## 4. Questions for the owner (the plan stops here)

- **Q1. Call back, in both modes?** Today it brings nothing back. Planned: it keeps `floor(average haul x fraction of the time done)` of each of coins and material, shown on the button in Adult Mode ("Call back now: 1 coin, 1 Fish"), and Kid Mode's house icon does the same without words (and a call back that pays shows the Welcome back card, which is a new sight in Kid Mode). It is the one rule change that also touches Kid Mode's play (not its other screens). The spec says "never zero", which would let a player send and recall at once for a free coin, so it is not copied: an early call back keeps nothing, and the energy it spent is not given back (it is spent either way). *My pick: both modes, proportional, rounded down.*
- **Q2. Shop and board in Adult Mode only?** The alternative is both modes (a Kid Mode game would gain a shop button and cards to read, against CLAUDE.md 7.10). *My pick: Adult Mode only.*
- **Q3. Fixed furniture places, or free placement?** *My pick: fixed places now; free placement waits for the real room editor.*
- **Q4. Is the cut catalogue (section 5) right,** and are hats a separate slice that may slip? (A hat must sit on 65 different creatures in every pose.) The shop has nine items after A2.2, below the spec's 12 to 16, until hats land; if hats are dropped, the gap would be filled by cheap decor drawn in the room (a rug, a plant, a poster) rather than by more hats. *My pick: hats last, and drop them if they look wrong.*
- **Q5. Adults: one tap to look at a spot, a second to send?** The spec wants a card on tap with a Send button; today one tap sends. *My pick: the spec's two taps in Adult Mode (a mistaken send costs energy), one tap in Kid Mode as now.*
- **Q6. Which slice first?** *My pick: A2.1, because it needs no new saved state and the shop's wording ("you have 4, you need 2") reuses its cards.*

## 5. Draft catalogue (13 items: 1 to 9 in A2.2, 10 to 13 with the hats in A2.4; prices are placeholders until the measurement in decision 5)

| # | Item | What it does | Draft price | Materials used |
|---|---|---|---|---|
| 1 | Comfy Bed | happiness falls slower while it sleeps (a lower `asleepDecayFactor` for happiness only) | 60 coins | 3 Fiber, 2 Wood |
| 2 | Feeding Mat | grace on the hunger-cell rule (what exactly is decided in the A2.2 plan from `countCareCells`) | 50 coins | 3 Fiber, 2 Herbs |
| 3 | Wallpaper: Meadow | recolours the wall | 30 coins | 2 Herbs |
| 4 | Wallpaper: Dusk | recolours the wall | 30 coins | 2 Stone |
| 5 to 7 | Three booster foods | each counts as extra servings of one kind of a field's foods (filling, light, sweet); a new food id each, so the A2.2 plan reads `growth.ts` and `data/foods.ts` first | 40 coins each | Fish, Herbs, Fiber |
| 8, 9 | Two recipe foods | a food whose one meal counts a serving of two different foods of a field's three (it moves two food cells in one feeding); unlocked once, no workshop, no stock (foods stay unlimited) | 50 coins each | Wood and Stone, Fish and Stone |
| 10 to 13 | Four hats | drawn on the creature (A2.4) | 30 coins each | Fiber, Wood, Fish, Stone |

Materials per use count: Fiber 4 (items 1, 2, 7, 10), Herbs 3 (2, 3, 6), Wood 3 (1, 8, 11), Fish 3 (5, 9, 12), Stone 4 (4, 8, 9, 13). Every material appears at least twice. The ten uses the decision asked for are met by 17 material slots.

## 6. A2.1 in detail: spot cards, the job card, an honest call back

### New and changed

- **A spot card** (Adult Mode only). A tap on a spot selects it and shows a card under the spot row: the spot's name and what it gives ("Pond: Fish"), "6 min, 10 energy", "Haul: 2 to 4 coins, 1 to 2 Fish" (ranges from `data/habitat.ts`, never invented), and either a **Send** button or the reason it cannot go (the existing `spotReason` strings, plus a line "it has 61, it needs 30 to set off" for energy: `energyNeededForSpot` already exists). A second tap on the same spot or on Send sends. A locked spot's card says "opens at Young" and the stage the creature is now. Kid Mode keeps one tap to send.
- **The job card** (Adult Mode, while the creature is away, in the place the spot card takes): the spot, a progress bar (elapsed over total), the energy it spent, "Haul: 2 to 4 coins, 1 to 2 Fish", and the **Call back** button with its words. The adult context line stays as it is.
- **An honest call back:** `callBack(save, nowMs)` keeps its result type (`"called" | "nothing"`). It ends the job and adds the haul the time earned, given by a helper: `fraction = clamp((nowMs - startedAt) / (endsAt - startedAt), 0, 1)`; coins and material each `Math.floor(average of the range x fraction)`. That haul is added to the bag and pushed as a normal haul (so the "Welcome back" card shows it) when coins plus material is more than zero; `ui/HaulCard.tsx` will not draw a row that is 0 (a call back can pay a coin and no material), which no full haul ever hits. A call back that earned nothing only ends the job, as today. The energy is not returned, as today (the button says so).
- **One helper, two users:** `callBackHaul(job, nowMs)` in `game/habitat/jobs.ts` (it takes the spot, so it knows the ranges) is read by both the action and the button's words, so the label always equals what the tap does (the A1.3 rule, tested by a sweep).
- **Words** live in one pure module (`game/habitat/cards.ts`), like `game/retire.ts`: no word of loss ("you lose"), and a test over the whole strings.
- **No new saved state, no migration.** Selecting a spot is panel-local state.

### Edge cases (a test for each; "(b)" means a browser check)

Rules (unit, on caught-up saves; the screen list starts at 15):
1. `callBackHaul` at 0%, 25%, 33%, 50%, 99% and 100% of a job, for each of the five spots, equals the literal expected numbers (computed by hand from the ranges, written as literals, rounded down). The cases include an exact whole number (Rock pile coins, average 4, at 25% is exactly 1), an exact half (Bug meadow coins, average 1.5, at one third is exactly 0.5 and pays 0) and a value just under a whole number.
2. A clock set back so `now` is before `startedAt`: fraction 0, no haul, no negative number. A clock far ahead (job already past `endsAt`): the simulation has already finished the job, so `callBack` returns "nothing", as today.
3. `callBack` on a creature that is not away returns "nothing" and changes nothing; on a dead or egg save returns "nothing".
4. The haul is added once: coins and material in the bag match the haul pushed; calling twice adds nothing the second time.
5. Energy is not returned (`stats.energy` the same before and after).
6. A call back worth nothing pushes no haul (no empty "Welcome back" card) and logs "Called back from the <Spot> early"; one worth a coin and no material pushes a haul with `amount` 0, and the card draws only the coin row.
7. The sweep: for every spot and every fraction step of 5%, the number the button's words state equals what `callBack` then adds.
8. A job that ends in the same moment as the tap: the simulation finishes it first (the action catches up), so the full haul arrives and `callBack` returns "nothing".
9. The cards' words: every string for every spot, the banned-word test, the numbers are the data's own (a literal check against `data/habitat.ts`).
10. `jobRefusal` is unchanged (the existing tests pass untouched).
11. Night falls while the creature is away: a job is not stopped by sleep (`stepJob` never asks), so it finishes as today; a call back while it is asleep away works the same as awake (`callBack` has no sleep or sick check). A test fixes this as today's behaviour, so a change to it is a decision.
12. The creature gets sick while away: the job finishes as today; a call back works. It dies while away (phase `dead`): `callBack` returns "nothing", no haul, no coins, and the habitat bar and cards are not shown (`HabitatBar` returns null for a creature that is not alive).
13. An away adult cannot retire (A1.4 refuses "away"), so a call back never meets a retired creature; the test asserts the order: retire refuses, call back works, then retire works.
14. The passive device: a call back adds coins to the save, and the save is one document that syncs by the existing newest-save-wins rule. A device left open with the old save (job still running, no call back coins) that saves later brings the job back and removes the coins: the call back is undone, there is no double pay (that device's job finishes with a full haul on its own clock), and the rule is the same one that known-issues.md records for Retire. A test builds both saves and checks the coin total of each, and the entry in known-issues.md is added with the slice.

Screen (b), real clicks, Adult Mode, at 320, 360 and 390 wide (pixel ratio 1 and 2):
15. (b) A tap on a spot shows its card with the literal numbers; a second tap sends; a refused spot shows its reason and no Send button; a locked spot shows the stage word.
16. (b) While away, the job card shows the progress and the call back words; moving the frozen clock changes the progress and the words; tapping Call back adds the shown haul to the saved game.
17. (b) Kid Mode: one tap sends and the house icon calls back, with the same haul rule; no card and no words appear.
18. (b) Every line of each card fits (a Range against its box), the panel does not scroll sideways, buttons are at least 44 px high, and each button has its own fill and edge (the `btn-look` check, from the A1.4 tooling).
19. (b) Two quick taps on Call back: one haul. (b) A Feed tray open while the creature goes away: unchanged from today.
20. (b) The Kid Mode comparison with `origin/main` shows 0 differences (the habitat page is in it, so a stray change to Kid Mode's spot row would show). Its saves have no hauls, so the new Kid Mode haul card of a paying call back is covered by 17, not by this.

Mutation targets (break, watch fail on its own assertion, restore, diff): the fraction (no clamp), the rounding (nearest or up instead of down), the average, the coins/material swap, energy returned, a haul pushed when zero, the card's numbers from the wrong spot, the Kid Mode branch (the card showing in Kid Mode), the second-tap rule, the label not equal to the action.

### Verification plan

Contact sheet first (every state of the card at the three widths, looked at before any gate), then typecheck, tests, build with warnings compared with `origin/main` (and the bundle's size against the 600 kB limit), the browser checks, both mutation runs, the Kid Mode comparison. The scripts are in `tools/verify/`; the A2.1 checks join them as their own files so the Retire checks keep running. A cheap-model reviewer reads the plan, then the code, then the new scripts, before each run.

## 7. What A2.2 to A2.4 must settle before their code (outlines)

- **A2.2 shop.** (a) The wallet rule: a buy checks `coins >= price` and each material, spends all in one step, refuses with a code and leaves the save deep-equal; exactly the price (no off-by-one), one short of it, two quick taps (one purchase), a purchase of something already owned (refused, no charge). (b) The 10-second undo: kept as `{ item, boughtAt }` in the save or in panel state? In the save (`lastBuy`) so a reload inside the window can still undo; a clock set back or far ahead must not make the window longer than 10 s or negative (clamp, as jobs do); undo returns exactly what was paid. (c) `owned: string[]` with the same migrate pattern as `retired` (only known ids kept; an id a later version removes does not crash), and `isUntouched` must count it (a save that owns something is not untouched, or a sign-in could replace a bought game). (d) The passive device: an idle device with an old save that saves after the buying device brings the coins back and removes the item (the existing newest-save-wins rule, as for Retire); there is never a double spend, because the save is one document. (e) The effects: Comfy Bed and Feeding Mat change `sim` / `care` rules, so the Kid Mode comparison, the growth tests and a replay of a scripted day with and without the item are needed; the booster foods must read `growth.ts` first (a new food id changes `foodIds`, the tray and the dev tree). (f) Previews: a wallpaper and furniture show in the room before the buy.
- **A2.3 request board.** Three slots; the types that exist today are feed a named food (x2), spend 20 minutes in a named field, send the creature to a named spot, win a fight, buy a named item (A2.2); the spec's other types need A3. Progress must be counted by the request itself from the moment it is drawn (the stage counters reset at each evolution and cannot be used). The replacement delay (15 minutes) and the "oldest gains +25% after 3 days" rule need a clock rule that survives a clock set back and a device idle for a week (the guardrail: 7 days untouched loses nothing). A request must never ask for something the creature cannot yet do (a baby is not asked for Rock pile). Rewards: coins on every one; an item from the catalogue every third or fourth, shown on the card.
- **A2.4 hats.** One generic rule to place a hat on any of the 65 forms from the top of its drawing (no per-form data), checked on a contact sheet of all forms in every pose (standing, drooping, lying, sleeping); drop it if it looks wrong.

## 8. Not in A2

Bond, the favourite toy, initiatives, minigames, field pickups, the garden (A3); the perfect-run badge, inheritance, Book recipes, timed combat (A4); sharing (A5); free furniture placement and a room editor; selling items back; a second job slot; a storage cap; real money.
