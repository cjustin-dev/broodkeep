# Broodkeep art direction

How the creatures are drawn and what the game expects of a drawing. Written 2026-11-21 when the owner approved the
redesign ("looks dopey, no character, I want real changes like Digimon"). Design choices and their reasons are in
[decisions.md](decisions.md), accepted gaps in [known-issues.md](known-issues.md).

## The idea

A creature is a **full-body character that gets bigger and more detailed as it grows**: arms, legs, tails, wings, horns
and gear, not a face on a lump. A line of creatures keeps its family look (color, silhouette idea) while each stage adds
new shapes and gear, the way a Digimon line changes. Every creature is a frontal, upright character with two big readable
eyes, so the game can make every emotion from the one drawing.

## Sizes

| Stage | Picture | Forms |
|---|---|---|
| Baby | 16 x 16 | Blip, Drip (simple blobs, kept as they were) |
| In training | 16 x 16 | Pip, Nubbin, Smudge |
| Rookie | 22 x 22 | Fennix, Shellby, Gruntle, Mothlet, Grumblot |
| Champion | 28 x 28 | Pyrefang, Bastion, Lumiwing, Thornback, Gloomtoad |
| Ultimate | 32 x 32 | Solarion, Citadrake, Aurelith, Dreadmaw, Hollowking |

The room is 96 x 96 game pixels, so an Ultimate fills a third of its width. Eggs are 16 x 16. A test requires every form's
picture to be square and the size of its stage (`tests/data.test.ts`). All sizes are even, so a creature has a whole-pixel
middle.

## The five lines

| Line | Rookie | Champion | Ultimate | Idea |
|---|---|---|---|---|
| Fox | Fennix | Pyrefang | Solarion | an ember tail grows into a flame mane, then a sun mane with wings |
| Shell | Shellby | Bastion | Citadrake | a mossy shell grows a tower, then a fortress |
| Moth | Mothlet | Lumiwing | Aurelith | fuzzy wings become patterned and lit, then star-filled with a halo |
| Brawler | Gruntle | Thornback | Dreadmaw | horns and fists become armor and spikes, then a huge jaw |
| Toad | Grumblot | Gloomtoad | Hollowking | a grumpy lump gets a lantern, then a crown of roots |

The in-training forms (Pip, Nubbin, Smudge) feed into these. The tree and its numbers are in the form files
(`evolvesTo`) and did not change with the art.

## What every drawing must follow

These are what the emotes are built on, and tests enforce all of them on every drawing of every form.

1. **A square grid of text rows,** one letter per pixel, `.` is see-through. Every letter used must be in the form's palette.
2. **Exactly two eyes,** each a 2 x 2 block: `WW` over `WK` (white, white / white, dark pupil). That is six `W` pixels in the
   whole picture, so **`W` is used for nothing but eyes.** The palette letter `W` can be any color (Dreadmaw's eyes are
   yellow, Hollowking's pale green). Shut eyes, sleepy lids, happy arches, looking up and tears are all found by looking
   for this block.
3. **A mouth drawn with the letter `M`** (at least one pixel, usually two side by side). A yawn grows the `M` pixels into an
   oval, and the blanket starts at the mouth row. `M` may share a color with another letter: Dreadmaw's and Hollowking's
   `M` pixels are the same color as the pixels they replaced, so the standing picture looks as drawn and only a yawn shows
   a dark opening.
4. **The last row is empty.** The idle bob shifts the picture down one pixel, and the feet sit on the floor line with the
   empty row under them.
5. **`K` is the outline color** (`#1a1020` on every form). The happy arch is `K`, or the creature's eye color `W` if the body
   is too dark for `K` to show (contrast under 3 to 1: Dreadmaw, Hollowking, Gloomtoad and Thornback).
6. **Palette keys are one character.** Any letter can be any color. Use new letters for teeth, horns, highlights, gear.
7. **A second drawing (`idle2`)** of the same size, for every form except the two babies. It must differ from the first,
   keep the eyes in the same columns (a one pixel head bob up or down is fine, Pip, Shellby, Bastion and Aurelith do this),
   and follow rules 1 to 4 itself. It shows what moves: tails swish, wings flap, flames flicker, arms lift.

## Two drawings, and what is made from them

The game swaps `idle` and `idle2` every half second while a creature stands, hops or is happy, and every quarter second
while it walks (a step each). Every other look is **made by the engine** from whichever drawing is showing, so adding a
creature needs only the two drawings:

| Look | When | Made from |
|---|---|---|
| shut eyes, heavy lids, eyes up, happy arches, yawn | blink, tired, watching food, joy, yawning | the drawing showing |
| slumped (droop, droop with shut eyes, yawn or happy arches) | sad or sick | the first drawing |
| lying (two breathing pictures) and the blanket | asleep, dead | the first drawing |

Drawings that move on their own (the two babies have no second drawing, so the game's bob moves them) are the only art
cost beyond the two grids. The look code is `src/art/face.ts`.

## Where things go in the room

`src/art/layout.ts` has the helpers. A creature of size `s` stands with its feet on the floor line (picture top at `72 - s`),
walks with its left edge between 6 and `76 - s`, sleeps centered on the bed (the bed is 32 wide and its middle is x 78) with
the same bottom edge a 16 pixel creature always had, and lies dead near x 32 with a tombstone beside it, clear of the bed.
The lying and slumped pictures are 8 pixels wider than the standing one but never wider than the bed (32), so a big
creature only gets flatter. Calls (the thought bubble), the "z", the tummy marks, hearts, sparkles and the food on the floor
all follow the size (`scene.ts`, `idle.ts`). A bigger creature has less floor to walk on, and it sometimes stands in front
of the bed.

## Adding or redrawing a creature

1. Draw the two grids at the stage's size, following the rules above (with `tools/art/`, or by hand), and put them in `idle`
   and `idle2` in the form file. Start from an existing form of the same stage to see how a face and feet sit.
2. Run the tests. `tests/data.test.ts` checks size, eyes, mouth, empty last row, palette and the second drawing, and
   `tests/face.test.ts` checks every derived look on both drawings.
3. **Look at it.** Render every look for the form (standing, both frames, shut, tired, up, happy, yawn, slumped, lying) on one
   contact sheet, and in the room standing, asleep, slumped, eating and dead. Tests prove the rules hold, not that it
   looks right (the first happy arch passed its tests and was invisible on three dark forms).
4. Check the form in the real game with the dev panel (Settings, tap the version 7 times, pick the form, "Hatch this form
   now"), and in a headless phone browser if the change is large.

## Where the drawing tools are

`tools/art/` has the Python toolkit that drew the 18 redesigned creatures (ellipses, rectangles, polygons and lines,
outlines, a checker for the eye rule), plus `emit.py` that writes the drawings into the form files and
`preview.py` that draws a contact sheet. See [../tools/art/README.md](../tools/art/README.md). The game never runs it.
The grids in the form files are what the game uses, and `python3 tools/art/emit.py --check` says whether the drawings
and the form files still agree. A form can also be changed by editing its grid by hand (it is plain text), though a
32 x 32 grid is slow that way.

## Per creature

| Form | Looks like | Second drawing moves |
|---|---|---|
| Blip | round jelly blob with big eyes | none (the game's bob) |
| Drip | teardrop blob that wobbles | none (the game's bob) |
| Pip | hoppy sprout with leaf ears and rosy cheeks | hops, ears flop out |
| Nubbin | stubby lump with tiny horns, ready for a play fight | fists swing up |
| Smudge | smoky, frowny puff with a curling tail | smoke drifts |
| Fennix | fox pup with big ears and an ember at the tip of its tail | ember flickers, ears twitch |
| Shellby | round turtle with a mossy shell and a bobbing head | head bobs, a foot steps |
| Gruntle | horned brawler pup with big fists and small tusks | fists pump |
| Mothlet | fuzzy little moth with antennae and lilac wings | wings flap |
| Grumblot | lumpy, grumpy toad with bulging eyes and a wide frown | belly puffs, mouth opens |
| Pyrefang | flame-maned wolf on two legs, with fangs and claws | flames flicker, one arm lifts |
| Bastion | stone tortoise with a little tower on its back | flag flaps, head nods |
| Lumiwing | glowing moth with big patterned wings and lit antennae | wings sweep up |
| Thornback | spiky armored lizard with belly plates and a spiked tail | tail swishes |
| Gloomtoad | swamp toad carrying a lantern of cold light | lantern sways, mouth opens |
| Solarion | radiant lion-dragon with a sun mane, bat wings and a sun plate | mane turns, wings lift, one arm lifts |
| Citadrake | dragon with a fortress grown into its back, two towers with flags | flags flutter, smoke drifts, tail sways |
| Aurelith | celestial moth-angel with a halo and star-filled wings | floats up, wings lift, stars twinkle |
| Dreadmaw | shadow beast with many red eyes and a huge jaw | jaw opens wider, smoke shifts |
| Hollowking | hollow-eyed swamp king in a mossy cloak with a crown of roots | roots sway, hem ripples |
