# Broodkeep: Plan v2 (expanded design)

**Game name: Broodkeep.** Use it for the PWA name, page titles and the Cloudflare Pages project (`broodkeep`). The game folder in the repo stays `creatures/` so the plan below still reads correctly. The forms and the evolution tree are replaced by the Paradise growth design in `docs/paradise-plan.md` (section 6). Version 2 adds the full gameplay design: stats, the habitat and room, the crafting economy, combat details, fun systems and a revised seven-phase order (sections 7 and 9).

## Handoff notes for Claude Code

- Build **Phase 1 only**, deploy it, give the phone test steps, then stop for feedback.
- Sections 7 and 9 describe the whole game. Build only what the current phase lists, but keep the data files and code ready for the later systems (items, recipes, habitat, combat).
- Explain every Cloudflare dashboard step as plain, numbered instructions. This is the owner's first game and first deploy.
- Hosting is one Cloudflare Pages project, `broodkeep`, built from the `creatures/` folder (see section 2). The repo root holds nothing else but `.gitignore`.
- Keep game rules and content in data files (`src/data/`), not in logic, so new creatures can be added later.
- Keep code commented enough for a beginner to follow.
- Owner preference: plain, direct writing. No em dashes, no corporate phrasing.

## 1. What's in the broodkeep repo today

- The repo root holds only `.gitignore` and the `creatures/` folder. The game is all of `creatures/`.
- The repo started as the unmodified "cloudflare-pages-template" (plain static HTML, Bootstrap, no build step). Those files were removed on 2026-11-20, because nothing depended on that site.
- `creatures/` is a Vite + TypeScript + Preact project: `package.json`, `wrangler.toml`, `src/`, `tests/`, `docs/`, plus `functions/` and `migrations/` that stay mostly empty until Phase 5.
- There is no license file, so the code is all rights reserved. The template's MIT notice named its author, not this game, and was removed on 2026-11-21.
- Cloudflare Pages builds from the `main` branch, so a merged pull request deploys. Work happens on feature branches and the owner merges.

## 2. Hosting: one Pages project from a subfolder

The game is **one Cloudflare Pages project**, `broodkeep` (https://broodkeep.pages.dev), built from the `creatures/` folder:

- Root directory: `creatures`
- Build command: `npm run build`
- Build output directory: `dist`
- Branch: `main`

How it got here: the first version of this plan recommended a second Pages project beside the old template site, so a game deploy could never break that site. The old Cloudflare project turned out to be disposable and was deleted, and the old site files were removed from the repo, so there is only the one project.

Why a subfolder with its own project still makes sense:
- The game needs a build step (TypeScript, bundling, PWA files) and backend functions, and the project settings are built around that.
- The project has its own URL, its own D1 database binding and its own deploy logs.
- A PWA works best when it owns the whole origin (its own home-screen icon, offline cache and cookies), not a subpath of another site.
- A custom domain or subdomain can be added later without moving anything.

## 3. Tech stack

| Piece | Choice | Why |
|---|---|---|
| Language | TypeScript | Catches mistakes early, easier to read later |
| Bundler / dev server | Vite | Fast, simple, first-class Cloudflare Pages support |
| UI | Preact (tiny React) for menus and buttons | Icon-heavy screens are easier as components |
| Game drawing | HTML Canvas 2D, scaled up with crisp pixels | Real chunky pixel art at any screen size |
| Art | Pixel maps written as text grids + per-creature palettes | No outside assets, and you can edit a creature by editing text |
| Sound | Synthesized chiptune bleeps with the Web Audio API | No sound files needed, tiny, mute toggle |
| Local saves | IndexedDB | Works offline, survives app restarts |
| Backend | Cloudflare Pages Functions | Same project, same deploy |
| Database | Cloudflare D1 (SQLite) | See below |
| PWA | vite-plugin-pwa | Generates the manifest and offline service worker |
| Tests | Vitest for the game rules | Lets me check evolution and time catch-up math without waiting days |

**Why D1 over the other Cloudflare options:** accounts, profiles, sessions, saves and history are related records, which is what a SQL database is for. KV is "eventually consistent" (a save on your phone might not show up on the computer for up to a minute, and logins get flaky), and Durable Objects are built for real-time multiplayer, which this doesn't need. D1's free tier is far more than a family will ever use.

**Security:** passwords are stretched with PBKDF2 in the browser and only a salted hash of the result is stored (the free plan gives a server 10 ms of CPU, too little for a safe amount of PBKDF2; see [docs/cloud-saves.md](docs/cloud-saves.md)), sessions as random tokens in an HttpOnly, Secure cookie, and only a hash of the token stored in the database. Adult PINs are handled the same way.

## 4. Folder layout

```
broodkeep/                       <- the repo root: only .gitignore and creatures/
  creatures/                     <- root of the Pages project
    package.json, vite.config.ts, wrangler.toml
    index.html
    migrations/0001_init.sql     <- D1 tables
    functions/api/               <- backend: auth, profiles, sync
    src/
      main.ts
      game/        <- pure rules, no screen code
        state.ts       the save shape
        sim.ts         ticks time forward (also used for offline catch-up)
        care.ts        stat decay, care mistakes, sickness, sleep, death
        evolution.ts   reads the rules in data/ and picks the next form
        combat/        turn-based first, then auto and tap-timing
        rng.ts         seeded randomness, so results are repeatable
        habitat/       chores, gardens, gathering, job timers
        crafting/      workshops, recipe timers
      data/        <- everything you'd edit to add content
        forms/         one file per creature: stats, art, evolution rules
        foods.ts  items.ts  recipes.ts  jobs.ts  habitat.ts  room-items.ts  wild-creatures.ts  tuning.ts
      art/         pixel renderer, palettes, animations
      ui/          screens: profile picker, home, feed, jobs, battle, settings, dev
      audio/       synthesized sound effects
      sync/        local save + cloud sync
    tests/
    tools/art/                   <- Python drawing tools for the creatures (not part of the build or the tests)
```

A creature file will look roughly like this, so adding one later is mostly copy, paste and draw:

```ts
export const fennix: Form = {
  id: "fennix", stage: "rookie", name: "Fennix",
  palette: { K: "#1a1020", O: "#f08a24", Y: "#ffd25a", W: "#ffffff" },
  idle: [
    "....K....K....",
    "...KOK..KOK...",
    // ...more rows
  ],
  softLook: null,              // only scary forms need one
  baseStats: { vit: 8, str: 6, def: 4, spi: 5, spd: 7 },
  evolvesTo: [
    { to: "pyrefang", minHours: 72, need: { strMin: 40, battlesMin: 10, careMistakesMax: 3 } },
    { to: "lumiwing", minHours: 72, need: { happinessAvgMin: 70, jobsMin: 15 } },
  ],
};
```

## 5. Data model

**What a creature tracks (the save):**
- Care stats (0 to 100): hunger, happiness, energy, hygiene, wellness, discipline
- Combat stats: vitality, strength, defense, spirit, speed, plus current battle HP
- Equipment (hat, armor, charm) and active elixir timers
- Counters for the current stage (reset at each evolution): care mistakes, food eaten by type, training sessions, battles won and lost, jobs done by type, time spent neglected, average happiness
- Status: asleep, sick, poop count, current form, stage start time, last simulated time
- Habitat: garden plots and growth timers, chore priorities, job timers, workshop timers
- Room: placed furniture (item, tile position, rotation)
- Inventory: materials, crops, food, elixirs, scrolls, gear; coins; Homestead level

**How time works:** on every open, the game simulates from "last simulated time" to now in 1-minute steps (fast, deterministic). Every stat change and event goes to the dev log. The creature sleeps at night (default 8pm to 7am, adjustable) and decays much slower then, so bedtime never counts as neglect.

**Neglect and death (tunable in `tuning.ts`):** a "care mistake" happens when hunger or happiness sits at zero for over an hour, or a call for attention goes unanswered. Sickness comes from poop left out or too much candy. Death happens when health stays at zero for an extended stretch; as a starting number, a creature ignored completely dies after roughly two days. Soften mode replaces death with "goes to sleep" and a new egg.

**Cloud database (D1):**
- `accounts` (username, password hash, created)
- `sessions` (token hash, account, expiry)
- `profiles` (account, name, adult or kid, optional PIN hash, soften mode, settings)
- `saves` (profile, save JSON, revision number, saved-at time)
- `save_backups` (the last few overwritten saves per profile, for safety)
- `history` (past creatures: form reached, born, died or slept, cause, stats summary)

**Offline sync rule: newest save wins, per profile, with a safety net.** Each device keeps playing offline and uploads when it reconnects. If the server already has a newer save for that profile (another device played more recently), the newer one wins and the older one gets copied to `save_backups` instead of disappearing. Past-creatures history is merged rather than overwritten, so a death recorded on one device is never lost. Since each kid mostly plays on one device, real conflicts should be rare.

## 6. Growth and forms (replaced 2026-11-21)

The 20 forms and the evolution tree that stood here are gone. The game follows the Paradise growth design instead: egg, baby (Blip), kid by field, young by food, adult by care, 64 original creatures in all, plus one special form for a neglected baby or kid (the 65th). The rules, the ladder, the Land roster, the code changes and the milestones are in [docs/paradise-plan.md](docs/paradise-plan.md). That file is the plan for forms and evolution. This file stays the plan for everything else.

Soften mode (Phase 5) still applies: creatures with a scary edge get a rounder, friendlier "soft look" and a cute nickname for that profile, and death becomes "fell asleep" followed by a new egg. Which of the 64 forms get a soft look is decided when Phase 5 starts.

## 7. Gameplay systems

### 7.1 Creature stats

- **Care stats (0 to 100, drop over time):** hunger, happiness, energy, hygiene, discipline and wellness. Wellness replaces "health" so it never gets confused with battle HP. Low wellness means sickness.
- **Combat stats:** vitality (max HP), strength (physical damage), defense (cuts physical damage), spirit (magic damage, magic resistance, special meter), speed (turn order, dodge, crit chance).
- **Training and evolution:** training raises combat stats with diminishing returns. Each stage has a stat cap, so a champion cannot reach ultimate-level numbers early. When a creature evolves, the new form's base stats apply and about half of the trained points carry over.
- **Discipline in battle:** a low-discipline creature sometimes ignores the player's command (a cute sulk animation). In auto-battle it picks worse moves.
- **Affinity (optional, later):** each form can have one of Ember, Stone, Glow or Shadow, with a simple strong and weak table. Kept out of Phase 3 and added only if the family wants more depth.
- **Evolution counters** (reset each stage): care mistakes, food eaten by type, training sessions, battles won and lost, jobs by type, time neglected, average happiness.

### 7.2 Foods

Berries (wellness, defense, small HP heal), Meat (strength, toward fighters, medium HP heal), Fish (speed, spirit), Candy (big happiness, but wellness down and sickness risk), hot meals cooked in the kitchen (big HP heal and a small stat bonus), and Medicine (cures sickness). Crops and catches from the habitat become these foods, so what the family grows steers evolution.

**Adopted 2026-11-22:** foods and medicine stay unlimited (the owner's earlier decision). Foods sold in the shop (adult track, spec 2) are optional boosters: each counts as servings of one of the existing food types, and none adds a food type, because growth only counts each field's three foods.

### 7.3 Habitat (outdoors)

The habitat is a top-down outdoor map on the same tile grid and renderer as the room. It is where the creature works.

- **Gathering spots:** rock pile (stone, strength), trees (wood), pond (fish, spirit), bug meadow (speed, fiber), herb patch, crystal cave (crystals, later).
- **Garden plots:** plant a seed, water it, and it grows through a few icon stages in real time, then harvest. Crops wait to be harvested and never wither.
- **Sending the creature:** tap a spot, and the creature walks there, works for a few real minutes, and returns with a haul. Jobs finish while the app is closed, using the same time catch-up as stat decay.
- **Standing chores:** the owner sets chore priorities with icons (garden, wood, pond, rocks). The creature works through them while awake and healthy. Each form is better at some chores based on its stats (Shellby gardens well, Gruntle hauls rocks), so every branch has a purpose.
- **Limits:** jobs cost energy. The creature will not work while asleep or sick. Babies and In-Training do light jobs only, and heavier spots unlock by stage.
- **Upgrades:** more plots, more spots, fences and paths, bought with coins. Biomes (meadow, cave, beach) are habitat zones with different resources.

### 7.4 Room (indoors)

- A top-down room on a tile grid. Furniture snaps to tiles.
- **Decorate mode** is a separate toggle, so a small child playing normally cannot rearrange the room by accident.
- Drag items from an icon-only tray (bottom of the screen on a phone, side panel on desktop). Tap to rotate, drag to a bin to remove. An invalid spot shows a red outline, not an error message.
- **Furniture does things:** the creature walks to the bed when tired, the bowl when hungry, the bath when dirty, toys when bored. A better bed speeds HP and energy recovery. Placement changes how the creature moves around.
- Coins and crafted goods buy new items, wallpapers, floors and larger rooms. A second room can unlock later.
- Creature art uses a three-quarter view: a front-facing sprite that flips left and right with a hop-walk bounce. This keeps art cost the same as a plain sprite for each of the 20 forms.
- A room saves as a small list of item, position and rotation, so it syncs and works offline like everything else.
- Phase 3 ships a simple fixed room. The full editor comes in Phase 4.
- **2026-11-22:** the adult track's shop places furniture free-form in the existing room. That is the first slice of this editor, with no separate editor mode; the full Decorate mode stays for later.

### 7.5 Crafting and economy

**Replaced for now (2026-11-22):** the adult track's shop (12 to 16 items, bought with coins and materials) and request board (3 slots) take the place of the workshops, crafting and Homestead level below. The shop has two food recipes and no workshops, and the rest is not planned until that loop works (spec 2 in [docs/adult-expansion-spec.md](docs/adult-expansion-spec.md)). The text below is the old design, kept for reference.

- **Ladder:** raw materials (wood, stone, fiber, fish, herbs, crystals) go into workshops and come out as goods.
- **Workshops** are placeable habitat buildings: Kitchen (foods), Workbench (furniture and decor), Cauldron (elixirs and spell scrolls), Forge and Sewing table (gear). Each can be upgraded.
- Crafting takes real time and finishes while the app is closed, like machines in Stardew Valley.
- **Recipes** show as pictures (three item icons, an arrow, the result) so a non-reader can use them. They live in `recipes.ts`, so new ones are data only.
- **Homestead level:** rises with total output. It unlocks land, workshops, recipes and biomes.
- **Request board:** visiting wild creatures post picture requests ("3 fish please"). This works like Stardew bundles and gives every session a clear goal.
- **Currency:** coins only. No real-money purchases.

### 7.6 Combat

- **Opponents:** computer-controlled wild creatures only, drawn from the same form list and scaled to the player's stage. Each biome has a ladder of wild creatures ending in a boss.
- **Turn-based (built first):** speed sets the order. Each turn the player picks an icon: Attack, Guard (halves damage and charges the special meter), Special, or Item.
- **Damage:** attack reduced by the target's defense, with small random variance and speed-based crits. Discipline can make the creature ignore a command.
- **One engine, three controllers:** auto-battle and tap-timing mini-game use the same formulas as turn-based. Only the input layer differs, so the later styles do not need a second combat system.
- **HP between fights:** HP carries over and a win does not heal.
- **Recovery:** resting refills HP over real time, faster while asleep, slower if the creature is hungry or dirty (starting target: about 30 minutes awake from empty, tunable). Berries heal a little, hot meals heal a lot, elixirs heal instantly, and a better bed speeds rest.
- **Energy gate:** each fight costs energy. A creature that is asleep, sick or worn out cannot fight, so care decides when battles happen.
- **Losing:** nobody dies in battle. A knocked-out creature wakes after a short nap at 25% HP, loses that fight's reward, and its energy drops. Death comes only from long neglect.
- **Rewards:** small stat gains based on how the fight went, coins, material drops, and the wins counter used by evolution.
- **Display for kids:** HP is a big heart or color bar with no numbers. Adults get a detail card (that is Adult Mode, section 12).
- **Adult track (2026-11-22):** spec 7 adds skill to this engine: a timed attack, a timed guard, and a special the player chooses when to spend (phase A4). New creatures will start with discipline 30 (A1), so the sulk rule is live until training, tuck-ins and requests raise it.

### 7.7 Items and stat modifiers

- **Final stat** = (form base + trained points) x (1 + elixir bonus) + gear bonus. Dev mode shows this breakdown.
- **Food** feeds care stats and evolution counters. It does not directly raise combat numbers.
- **Elixirs:** temporary, lasting one battle or about 30 minutes. Rare catalyst elixirs can tilt an evolution toward a branch, but only as a nudge, so raising still decides the result.
- **Gear:** three slots. Hat (spirit and speed), armor (defense and vitality), charm (a special effect such as regeneration or lucky crits). Gear bonuses are capped at about 30% of the total stat, so trained stats still matter most.
- **Spell scrolls:** teach a special move, with two move slots.
- **Gear never changes which form a creature evolves into.** Only how it was raised does.
- **Gear visuals:** hats draw at one anchor point per form, armor shows as a small badge or glow, and the full look appears on the status card. This avoids drawing gear for every form.

### 7.8 Fun systems (keeping the creature alive)

- **Idle life:** the creature wanders, naps, plays with toys, chases bugs and gets startled. Each form has a couple of quirks.
- **Tap reactions:** poking, petting and tickling each give a different reaction and sound.
- **Moods from raising:** a well-fed fighter flexes, a neglected one sulks in a corner.
- **Surprise gifts:** after a job or a good night's sleep the creature sometimes brings a coin, a rare food or a decoration. Gifts cannot be bought and never expire.
- **Daily rhythm:** wake-up, mealtimes and a lights-out ritual (tuck in, lamp dims, lullaby).
- **Gentle call bubbles:** icon thought bubbles with a soft sound, never nagging.
- **Creature Book:** a family-wide collection page. Silhouettes show every form, each fills in the first time anyone raises it, and hints point toward missing ones. In soften mode it reads as "forms you have met".
- **Evolution moments:** glow, flash, fanfare, then the reveal.
- **Legacy:** a creature that dies or goes to sleep leaves a keepsake on a memorial shelf, and the next egg can inherit a small hint such as a palette tint. (2026-11-22: retiring a living adult starts the next egg early, adult track A1. The inheritance is a tint, +3 to one stat, or a favourite toy, chosen at hatching, A4.)
- **Customization:** hats, wallpapers, toys and decor, bought with coins. None of it affects battles.
- **Befriend visitors (soften mode option):** a wild creature can become a visitor you feed and befriend instead of fighting, using the same art and data with different rules.

### 7.9 Active play and screen time

The goal is a game kids want to play actively, not one built to trap them.

- Every visit has something to do. Jobs and training become small skill mini-games (catch the bugs, stack the blocks, hit the beat). A pocket arcade of three or four of these earns coins. (2026-11-22: replaced by the three training minigames of spec 4: Bug Catch first, then Rhythm Grove and Stack & Balance.)
- Tap-timing combat has combos, perfect-hit bonuses and tougher wild creatures.
- Parent and child can share one device and take turns on the arcade or a fight.
- Every session ends on a satisfying beat: the creature yawns, waves and curls up.
- **Parent controls (adult profiles):** a daily play limit and quiet hours per profile.
- **Design guardrails:** no loot boxes or gacha rolls, no countdown FOMO timers, no streak counters that punish a missed day, no ads, no real-money purchases. Rewards only go up, and crops and crafting wait instead of spoiling.

### 7.10 Kid-friendly UI

Big icon buttons, the creature shows needs with thought bubbles (a drumstick for hungry, a cloud for sad), a sound cue when it needs attention, picture-only recipes and requests, and no reading required outside settings and adult menus. A big house and tree icon pair at the bottom switches between the room and the habitat.

## 8. Developer mode

Unlocked from an adult profile: Settings, tap the version number 7 times, then enter that profile's PIN. Includes everything on your list: time multiplier (1x to 1000x), skip ahead X hours, stat editor, force hatch or evolve to any form, jump to a stage, simulate neglect and death, spawn eggs or specific creatures, the evolution tree with each candidate's conditions shown as pass or fail ("Pyrefang: strength 32/40, battles 12/10, mistakes 1/3"), profile reset, and a scrolling event log. For the expanded design it also gets: set HP, start any battle, spawn any item or material, grow crops and finish crafting instantly, set Homestead level, and unlock any recipe or workshop.

## 9. Phases (each one deployed and playable)

1. **Single local creature:** egg, hatching with tap boost, care stats, feeding, poop and cleaning, sleep, sickness, offline catch-up, death, dev mode, idle behaviors and tap reactions. Uses 3 placeholder forms and a plain fixed room. Saves on the device only. Includes setting up the new Pages project.
2. **All 20 forms:** full pixel art with idle, eat, happy, sick, evolve and hatch animations, the full branching tree, the dev tree viewer.
3. **Habitat, jobs and turn-based combat:** the outdoor habitat, gathering spots, garden plots, standing chores, coins, HP and recovery, turn-based combat with wild creature ladders, the Creature Book and legacy shelf, and the simple fixed room.
4. **Room editor and crafting:** top-down furniture editor with decorate mode, workshops (kitchen and workbench first), picture recipes, Homestead level and the request board.
5. **Accounts, profiles, PINs, soften mode, D1 and cloud sync:** also the adult play limits and quiet hours. This is when you will create the D1 database.
6. **Combat styles, magic and gear:** auto-battle and tap-timing combat, the arcade mini-games, elixirs, spell scrolls, gear and the cauldron and forge. Affinities only if wanted.
7. **PWA install, sound and polish:** installable app, synthesized sound with mute toggle, desktop layout tuning (side panels for stats and log instead of a stretched phone screen), visitor befriending for soften mode.

**Adult track (adopted 2026-11-22):** [docs/adult-expansion-spec.md](docs/adult-expansion-spec.md) has five phases of its own, called A1 to A5 here so they are not confused with the list above. They replace Phases 4 and 6 and the garden plots and standing chores of Phase 3 (decisions.md, section "Adult expansion", says how). **A1 See it:** Adult Mode, the adult HUD, the Growth Forecast, the small fixes and a minimal Retire (it may slip to A2). **A2 Spend it:** shop, request board, job and haul cards. **A3 Stay for it:** creature initiatives, Bug Catch, bond, field tappables. **A4 Master it:** the other two minigames, timed combat, Book recipes, the perfect run, legacy. **A5 Share it:** secret evolutions (PvP is not planned; the spec only allows it later as minigame scores, never combat). Phase 5 goes on beside the track: accounts and cloud saves are live, and profiles and then PINs follow docs/profiles-plan.md (docs/progress.md says where they stand). Phase 7 stays as listed.

At the end of each phase I will stop, give you the test URL and phone steps, and wait for feedback.

## 10. What you'll do yourself (preview)

- **Phase 1:** create the Cloudflare Pages project and point it at the `creatures` folder (about 5 minutes; I'll give numbered steps).
- **Phase 5:** create a D1 database, bind it to the project, and run one setup command (about 10 minutes; numbered steps then too).
- No paid plans needed. Everything fits the free tiers.

## 11. Name

Chosen: **Broodkeep**. Runners-up were Hatchwild, Shellshift, Moltlings and Wyldegg.

## 12. Adult expansion (adopted 2026-11-22)

The owner added an adult expansion spec and, after a review of it against the code, adopted it. The spec is [docs/adult-expansion-spec.md](docs/adult-expansion-spec.md): Adult Mode and an adult HUD, a shop and request board, creature initiatives, training minigames, bond, interactive fields, skill combat and an adult endgame.

- **Where the spec and the code disagree, the section "Adult expansion" of [docs/decisions.md](docs/decisions.md) wins.** It holds the owner's answers, the corrections (the real spot, field and button names, how growth really counts) and the changes made to the spec.
- **Kid Mode stays as it is.** Adult features are additive and switched by `settings.adultMode`, saved per profile.
- **Food and medicine stay unlimited.** No new creatures. The spec's guardrails stay in force: no loot boxes, no FOMO timers, no streak punishment, no ads, no real money, rewards only go up (section 7.9 says the same). The spec's other guardrail, "no energy timers that block play", means no real-time lockout (answer 6 in decisions.md, closed 2026-11-22): the creature's own Energy stat keeps gating jobs and fights.
- **Build in the spec's phase order (A1 to A5, section 9), one phase at a time.** Values marked `[tune]` are playtest starting values.
- This section does not change sections 1 to 5, 8, 10 or 11.
