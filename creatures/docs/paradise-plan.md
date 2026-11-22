# Paradise growth plan

Written 2026-11-21, after the owner approved the style ("blend looks right") and the scope ("so long as it follows paradise
design its fine"). It replaces plan sections 6 (the 20 forms and the tree) and the evolution parts of 5, 7.1, 7.2 and 8 in
[../CLAUDE.md](../CLAUDE.md). Nothing in CLAUDE.md is edited yet; a one line pointer is proposed in progress.md.

Sources, both read from the pictures only, not from the game: the Tamagotchi Paradise growth chart by Neo_Mametchi
(https://i.redd.it/xjeya1d8d8ff1.png) and a second chart the owner sent the same day, by Waji Pascua from the Tamagotchi wiki,
17 July 2025 (https://i.redd.it/k5v0slgphudf1.jpeg). They agree on the ladder and on the adult table (5 hunger, 5 happy, 0
mistakes; then 0 to 1, 2 to 5 and 6 or more mistakes; the "3x" notes on chart 2 are a worked example, not a threshold). Chart 2
adds the 4 cell rule for the kid and the "4 hours of no care" special. The structure is copied. The creatures, names, art and
foods are original, because the charts' characters are Bandai's.

Where a rule below is the charts' it says "chart". Where it is my choice it says "my choice" and is listed in section 8.

## 1. The growth ladder

| Stage | Chosen by | Choices | Picture |
|---|---|---|---|
| Egg | taps and time, as now | 1 baby | 16 px (as now) |
| Baby | nothing, one form (Blip) | 3 kids | 20 px |
| Kid | the first field to reach 4 cells (15 minutes in a field is one cell) | 3 (one per field) | 24 px |
| Young | food cells: what the kid ate | 4 per kid, 12 in all | 36 px |
| Adult | care cells: hunger cells, happy cells, care mistakes | 4 per young, 48 in all | 48 px |

That is 1 + 3 + 12 + 48 = **64 creatures to draw** (the egg is not counted). Nine already exist as drawings on the "Gritty + cute
blend" sheet: the kids Pebblin (Land), Drizzle (Water), Cinderling (Sky); the young Cragpup (Land), Lanternfin (Water), Scorchlet
(Sky); the adults Gravelhorn (Land), Murkfang (Water), Ashwing (Sky). So 55 are still to draw: Land 19, Water 18, Sky 18.

## 2. The rules

**Field cells (baby to kid).** Chart: staying in a Land, Water or Sky field for 15 minutes during the baby stage earns that
field one cell (chart 1); "raise baby in Land field to get 4 leaf cell icons", bubbles for Water, clouds for Sky (chart 2). So
the first field to reach 4 cells decides the kid, and two fields can never tie.
- A creature has a place: home or one of three fields. The player moves it between them. All the care actions work in every
  place; the picture behind it changes. My choice.
- A field's minutes grow while the creature is awake, in that field, and not away on a habitat job. They are kept per field
  (leaving does not lose them), and a cell is every full 15 minutes. My choice (the charts say only "stay 15 minutes").
- Safety net, my choice: a baby that has not reached 4 cells in any field 6 real hours after hatching grows into the kid of the
  field with the most cells, or of its egg pattern's field if there are none or several are level (speckled Land, striped Water,
  swirled Sky). A baby is never stuck, and the three egg patterns keep a job. A "go outside" call bubble can nudge the player.

**Food cells (kid to young).** Chart: nine foods, three per field (Land: meat, carrot, worm; Water: seafood, seaweed, shrimp;
Sky: chicken, corn, syrup). Feeding a set number of servings of one item earns a cell of that type; the type with the highest
count when the kid evolves decides the young. Pellets only, or equal amounts of different types, gives the fourth young (the
charts' "indeterminate diet").
- My choice: one food item per type (the charts have three items per type needing x2, x3 or x5 servings), and 2 servings make 1
  cell. Servings are counted for the whole stage and a cell is every full 2, so a leftover serving stays counted. Cells are
  compared as whole cells, so 4 servings of meat and 5 of carrot are both 2 cells and tie. (My reading of "equal amounts".)
- A kid that was never fed a field food has all counts at zero, which is a tie, so it grows into the fourth young.
- Only the kid's own field's three foods count. Other foods still fill the stomach. The menu shows pellets, the three field
  foods and the treat (today's candy, which keeps its sickness risk). That is 11 foods: 9 field foods, pellets and the treat.
  Berry and fish go; meat stays and is Land's meat; candy becomes the treat.
- Foods stay unlimited, as the owner chose for Phase 3.

**Care cells (young to adult).** Chart: a hunger cell for maxing the hunger meter, a happy cell for maxing the happiness meter,
a mistake for a care mistake. Tier 1 is 5 hunger cells, 5 happy cells and 0 mistakes. Every other creature is placed by mistakes
alone: 0 to 1 is tier 2, 2 to 5 is tier 3, 6 or more is tier 4 (so 2 hunger cells, 5 happy cells and 0 mistakes is tier 2).
- Numbers, my choice: a hunger cell is a feeding that takes hunger from below the full line (95, `fullAtHunger`, where the creature
  refuses food) to at or above it; a happy cell is happiness reaching 100 from below. Each caps at 5 per stage.
- Mistakes are the existing care mistakes. One call is wanted at a time (sick, hungry, dirty, sad, sleepy, in that order of
  priority). An unanswered call counts awake minutes, every 60 of them is one mistake, and the count restarts when the wanted
  call changes or is answered.
- Cells and mistakes count in the young stage only, as every counter resets at each evolution today.
- Tier 1 is the grandest adult, tier 4 the scruffiest.

**Stage lengths, my choice, in real hours since the stage began (night included, as the game does today):** the baby ends at 4
field cells or 6 hours, the kid after 24 hours, the young after 48 hours, the adult stays. Milestone 3 simulates a player and
checks that every food can win and every tier can be reached in these times, and the numbers move if not.

**Stages elsewhere in the game.** The old stage list (baby, training, rookie, champion, ultimate) is read by combat, the habitat
and the trained-point caps, so it is remapped: training becomes kid, rookie becomes young, champion and ultimate become adult.
- Combat may start at kid (it starts at training today). The trained-point caps become baby 0, kid 12, young 20, adult 40 (the
  old caps were 0, 12, 20, 32, 50). The four fighting stages become three, so the opponent ladder is checked again in milestone 3.
- Habitat spots: meadow and herbs stay baby, trees and pond become young, rocks become adult.
- Base stats of the 64 forms are derived, not hand-written: a stage budget (the average total of the old forms at the mapped
  stage, worked out from the old data before it is deleted, so fights stay about where they are) split by a role written on the
  form (fighter, tank, caster, quick). The care tier does not change stats.

**Not in the first slices.** The charts have a "Bbmarutchi" special (chart 1: left unchanged as a baby or kid for 4 hours; chart
2: "4 hours of no care") and three secret adults that need shells connected during the young stage (a Land shell with a Water
and a Sky shell; how connecting works here is open, and it probably needs accounts). Both wait. When the special is built it
needs a rule for which wins on a neglected baby, the 4 hour special or the 6 hour safety net.

**Combat stays as it is** against NPC opponents. Evolution no longer reads battles, wins, strength, defense or spirit.

## 3. The look (approved on the blend sheet)

- Cute baby and kid, blended young, gritty adult. Colors darken stage by stage; kid outlines are a dark tone of the body, young
  and adult outlines are black.
- Eyes: kid 4 x 4 glossy, young 5 x 4 glossy with a slit pupil and brows, adult 5 x 3 slits under heavy brows. Sad has a tear
  and worried brows; happy is an arch.
- **Faces are stamped by the engine from an anchor on the form** (left eye column and row, mouth row or none), instead of being
  drawn into the picture and found again as a 2 x 2 block. One drawing then gives every emotion, and the new eyes need no
  special case. The pattern tables live in one data file that both the Python drawing tools and the game read, so the sheets show
  what the game shows. The face letters are reserved: I iris, W gloss, K pupil and outline, A brow and arch color (so a dark body
  can use a light one), M mouth, T tooth, P blush, U tear.
- The room and fields become 128 x 128 game pixels (96 today). An adult is 48, so it fills three eighths of the width.
- Each drawing must pass the checks I wrote for the blend sheet, moved into `tools/art/`: no part cut off by the edge (only
  outline pixels may touch it), every letter in the palette, no floating pixel, faces centred (even widths on an even canvas).
- Fields (areas): Land is the dusk ruins hollow from the gritty sheet. Water and Sky are designed when their slice starts.

## 4. The Land roster (working names, final when drawn)

| Stage | Land |
|---|---|
| Baby | Blip, a round jelly blob (redrawn at 20 px; it has no field) |
| Kid | Pebblin, a tan pup with small horn ears (drawn) |
| Young, meat | Cragpup, a stone-shouldered horned cub (drawn) |
| Young, carrot | Dugling, a long-eared digger with big claws and one fang |
| Young, worm | Frillet, a small frilled lizard |
| Young, other | Sporeling, a mushroom sprout |

| Young | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|---|
| Cragpup | Gravelhorn, stone-armored horned brute (drawn) | Cindermane, ember-maned wildcat | Scrapjaw, scruffy scavenger | Gutterfang, skinny rat with one big fang |
| Dugling | Moonlop, crescent-horned stag-hare | Barrowbun, round warm digger | Tuskmole, grumpy tusked mole | Mudlop, muddy sulking rabbit |
| Frillet | Sunfrill, huge sun-fan frill | Plateback, small stegosaur | Bogviper, snake | Slugwyrm, limp half-slug wyrm |
| Sporeling | Hollowbloom, flower sprite with glowing fangs | Potterling, flower-pot creature | Needlecap, cactus | Mossheap, shaggy moss heap |

Sky (chicken, corn, syrup) gets its roster when its slice starts. Its kid Cinderling and Scorchlet and Ashwing are drawn.

### The Water roster (slice 2, written 2026-11-21; names and animals are my choice and can change)

Foods: seafood, seaweed, shrimp. One animal family per line, so no two lines share a silhouette (and none repeats a Land one).
Colors: each line has a palette family; the young is halfway between the kid Drizzle and the line's tier 1.

| Stage | Water |
|---|---|
| Kid | Drizzle, a pale aqua blob with a glowing lure (drawn) |
| Young, seafood | Lanternfin, a mid-teal angler (drawn) |
| Young, seaweed | Kelpet, a sea-turtle pup with a kelp tuft |
| Young, shrimp | Scuttlet, a small pink shrimp-crab with big claws |
| Young, other | Bellet, a jellyfish sprout |

| Young | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---|---|---|---|
| Lanternfin (fish) | Murkfang, deep-sea angler (drawn) | Puffglow, round pufferfish with glowing spots | Rustgill, scarred underbite piranha | Wilteel, thin limp eel |
| Kelpet (sea herbivores) | Coralback, armored sea turtle with a coral shell | Bubblebelly, round manatee | Brinetusk, grumpy walrus | Limpseal, slumped seal |
| Scuttlet (crustaceans) | Rampclaw, armored lobster king | Shellsnug, hermit crab in a spiral shell | Chipclaw, scrappy crab with a chipped claw | Softshell, limp molting shrimp |
| Bellet (soft sea life) | Stormbell, huge glowing jellyfish | Inkpot, round friendly octopus | Spinewad, grumpy sea urchin | Droopstar, limp starfish |

Tier rules as for Land: tier 1 biggest and most striking, tier 2 round and friendly, tier 3 scrappy and grumpy, tier 4 thin or
limp and sad. The Water field is a sunken ruin with a glowing pearl shell for the creature to stand on (the Land one is a rune
slab); the baby that never went outside grows toward the field of its egg pattern, so a striped egg now gives Drizzle.

## 5. What changes in the code

- `game/types.ts`: stages become baby, kid, young, adult. Foods go from 4 to 11. The `Metric`, `Need` and `Evolution` types go.
- `data/forms/`: the 20 forms are replaced by 64 in four files: `baby.ts` (Blip), `land.ts`, `water.ts`, `sky.ts`. A form gets a
  `face` anchor and a role; the size comes from the stage.
- `data/fields.ts` (new): each field's kid, its three foods, its young by food, and each young's four adults by tier.
- `game/growth.ts` (new): counts cells and picks the next form. `evolution.ts` and `metrics.ts` go.
- `game/state.ts`: save version 3 (field minutes, servings, hunger and happy cells, where the creature is).
- `game/care.ts`, `game/actions.ts`: count cells when feeding and when happiness fills; move between places.
- `art/`: new sizes, anchor faces (rewriting the eye and mouth parts of the 332 line `face.ts`; the squash, slump and blanket
  parts stay), the emotes rebuilt on them, 128 pixel scenes and the three field backgrounds.
- `ui/`: the field picker, the food menu per field, the dev tree viewer showing cells and which form leads.
- Stage remap in combat and the habitat as in section 2.
- Tests: the tree, evolution, data, face, moment and art tests are rewritten (about 1,000 lines of face and moment tests among
  them); the care, sim, combat and arena tests mostly stay.

## 6. Milestones

The Land creatures are what the owner can judge and they are pure Python drawing, so the art comes first and the game side only
after the owner has seen it.

1. **Python art library** (`tools/art/paradise/`): the face pattern file, face stamping per stage, the palette helper, the art
   checks, the sheet renderer. Body drawings carry no face; each one returns an anchor.
2. **Land art:** baby, the three new young, 15 new adults, and the Land field, on contact sheets checked blind before the owner
   sees them. **Owner checkpoint: do the Land creatures look right?**
3. **Game side:** the anchor face engine and emotes in TypeScript, the 128 pixel layout, the form files, `fields.ts`, `growth.ts`,
   save version 3, the stage remap, the dev tree viewer, the new menus, tests, and a scripted playthrough that reaches every
   Land adult and checks the times in section 2.
4. **Pull request 1:** Land complete and playable (Water and Sky fields stay locked until their slices). The owner merges.
5. **Water:** 4 young and 16 adults still to draw plus the field art, then a pull request.
6. **Sky:** the same.
7. **Later:** the special form, the secret evolutions, and slices 3 and 4 of the old Phase 3 (garden plots turn into a food
   source; the Creature Book fits a 64 creature game well).

Milestones 1 to 3 are on the branch `paradise` and go nowhere until milestone 4, so the live game never shows half art.

## 7. Cost and risk, plainly

- The art is most of the work: 55 creatures still to draw, each checked. Each field is about the size of the old Phase 2
  (20 forms), so three big pull requests.
- The face rewrite is the riskiest code change. It touches the eye and mouth parts of `face.ts`, `moment.ts` and the tests built
  on them.
- **Old saves:** the 20 old forms are removed, so an existing creature cannot carry over. The owner said (2026-11-21) that old
  saves do not matter, so there is no migration: save version 3 is the only one read, and an older save is kept under the name
  `save-unreadable` while a new egg starts (sync/local.ts). Coins, bag and settings of an old save are not carried over. The
  owner is told when pull request 1 is ready.
- Bundle: measured with Land only (22 forms) the JavaScript was 205.6 KB; with Land and Water (43 forms) it is 319 KB (64.6 KB
  gzipped). Each field adds about 113 KB, so all three will be about 430 KB (an estimate). Acceptable for now; if it matters, load a
  field's forms only when a creature of that field exists.

## 8. My choices, which the owner can change (not blocking)

Everything marked "my choice" above: the place model (home and three fields), field minutes counted awake and kept per field,
the 6 hour baby safety net and the egg pattern fallback, one food item per type, 2 servings per food cell, the 95 and 100 lines
for hunger and happy cells, stage lengths (6, 24, 48 real hours), the stage remap and caps, derived base stats, the treat kept, berry and fish dropped, Land first, the special form later. Added while building milestone 3: a creature
sleeps in its own bed, so bedtime and a nap send it home (with a log line); a baby is offered pellets and the treat only (the
field foods start with the kid); an unanswered call's timer restarts when the creature grows up; while a field is locked a baby
whose egg pattern names it, and that never went outside, grows into the first open field's kid, and each later field adds its three
foods and its forms. Added with the Water slice (2026-11-21): the Water names and animals (the table in section 4), the three foods
with the same numbers as the Land food in the same slot, and the Water field picture (a sunken ruin, a pearl shell instead of the
rune slab). With Water open a striped egg grows into Drizzle.
