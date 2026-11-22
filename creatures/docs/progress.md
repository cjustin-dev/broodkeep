# Broodkeep progress

Plan: [../CLAUDE.md](../CLAUDE.md). Repo: github.com/cjustin-dev/broodkeep. Local clone: ~/broodkeep (hub).

## State (2026-11-21)

**Paradise growth: milestones 1 to 3 (Land playable) are merged as PR #14 (`main` efb3f04) and live** (the bundle on
https://broodkeep.pages.dev matched my local build). **The Water slice is built on branch `water`** (worktree
~/broodkeep-paradise/creatures, off `main` efb3f04): 18 new creatures, the Water field, 3 foods, Water open in the picker. It was
**committed and pushed to `origin/water` on the owner's "commit and push" (2026-11-21) and was merged by the owner as PR #15 (`main` e16036d; I did not check that it is live)**; on that branch `npm run typecheck`, 830 tests in 17 files, `selftest.py` (102 cases),
`emit_ts.py --check`, `face_hashes.py --check` and `npm run build` all exit 0. See "Next", item 1, and the Water section of
decisions.md.
**The Sky slice was merged by the owner as PR #16 (`main` 91a529f, my commit `cce4576`) and is live** (2026-11-21: the live site serves the same
JavaScript file as my local build, `index-BU5K_Zyk.js`). **Paradise growth is complete: all 64 creatures and the three fields are in the game.** The Sky slice:
18 new creatures, the Sky field, 3 foods, and no field is locked any more. On that branch `npm run typecheck`, 1086 tests in 17 files (an earlier note said 1085; counted again 2026-11-21),
`selftest.py` (120 cases), `emit_ts.py --check`, `face_hashes.py --check` (896 pictures) and `npm run build` (436.7 KB of JavaScript, 77.9 KB
gzipped) all exit 0. See "Next", item 1, and the Sky section of decisions.md. The older text below was written before the Paradise work and
still describes the old forms.

**The Creature Book is built on local branch `creature-book`** (off `main` 91a529f; **not committed, not pushed**: the owner has not said "commit
and push"). A "Creature Book" button in the header opens a panel with all 64 creatures: a dark shape and "???" until a creature of that form
has been raised, then its picture and name. Pages: the baby, then one per field (the kid, the four young, and under each young its four adults
from tier 1 down). A missing form shows a short hint once the form it grows from has been raised. The record is `Save.book` (form ids in the
order first met); a hatch or a growth adds to it and writes a log line. Older saves get a book from the forms their living creature must have
been through. Gate on that branch: `npm run typecheck` exit 0, 1104 tests in 18 files (1086 before, plus 18 in `tests/book.test.ts`), `npm run
build` exit 0 (439.5 KB of JavaScript, 78.6 KB gzipped, up from 436.7 KB). Ten mutation checks each failed a test and the file came back
byte-identical. Looked at in a headless phone browser (a new save, a mid-game save, every form raised): no page errors; equal columns, centred
baby and kid, silhouettes visible, hints readable, and the longest names (Bubblebelly, Softnimbus) fit one line. Fresh-eyes review (cheap model):
9 findings, all checked and fixed (silhouette far too dark, a hint that misstated the rule, columns stretched by long names, a wrong row count
and an impossible save in tests, an unasserted hatch). See the Creature Book section of decisions.md and known-issues.md.

**The special form is built on the same local branch** (2026-11-21, owner's answers recorded under "Next", item 2; **not committed**). A baby or a
kid with no care for 4 awake hours turns into **Dustpuff**, a scruffy lint dust bunny (24 px, one creature for all three fields, grows no
further); it wins over the baby's 6 hour safety net and the kid's growing up. Care = a meal eaten, a clean-up that did something, medicine that
cured, a pet or a tickle; sleeping and being away on a job do not run the clock. The Creature Book has a "Special" page after the fields. Final gate
for the branch (Book plus special): `npm run typecheck` exit 0, 1139 tests in 19 files (1097 in the older 17 files, 20 in `book.test.ts`, 22 in
`special.test.ts`), `selftest.py` 121 cases, `emit_ts.py --check` and `face_hashes.py --check` (910 pictures) match, `npm run build` exit 0
(441.9 KB of JavaScript, 79.1 KB gzipped). 19 mutation checks on the TypeScript and 2 on the drawing each failed a test or check, and
every file came back identical. Looked at in a headless phone browser (home, Land, Sky with a sad face, the Book's Special page dark and
found): no page errors. Fresh-eyes review (cheap model, run before the tests): 6 findings, all checked against the code and all led to a change;
for clean-ups and medicine while it sleeps the behaviour was kept on purpose and only a comment and a test changed (see decisions.md). See the special section of
decisions.md and known-issues.md.

**Phase 1, the emotes, Phase 2, happy eyes, the creature redesign, the drawing toolkit and Phase 3 slices 1 and 2 are merged** (PR #3
to #6, #8, #9, #11, #12 and #13, `main` at 932497c; the first four are confirmed live at https://broodkeep.pages.dev, and so is
slice 1 (the page showed the version label "0.3 (Phase 3a)"), the deploys in between and slice 2's were not checked).
Cloudflare Pages project `broodkeep`, root dir `creatures`, build `npm run build`, output `dist`, builds from `main`. The
owner deletes merged branches on GitHub. Owner feedback so far: the egg shakes on tap (PC and Android), the request for
more emotion (the emotes below), then after seeing the 20 forms: the creatures look dopey and have no character, the
evolutions are "the same circle like mass with some small affections", and the owner wants real changes like Digimon.

**The creature redesign is merged (PR #9, 2026-11-21) and the owner confirmed it is fine** ("the redesign is fine"). See the
redesign section below and [art-direction.md](art-direction.md).

**Phase 3 is being built in four slices** (the owner chose the order and that food stays unlimited): 1) habitat jobs, coins and
the bag (merged in PR #12, live), 2) turn-based combat with HP (merged in PR #13, see "Phase 3 slice 2" below), 3) garden plots, standing chores and habitat upgrades, 4) the Creature Book and the legacy
shelf.

**Owner feedback on slice 2 (2026-11-21): "seems kind of shit. i was hoping for more of a pokemon design for the habitat and
creature battle honestly."** The owner chose to restyle both screens (the rules and buttons stay; the battle gets the classic
Pokemon layout, the habitat a tile-map overworld look; the creature stays in place and the player still taps spots) and to see a
concept sheet before anything ships. The plan and art-direction.md had no visual reference for these two screens, so the first
look was generic placeholder art and nobody had asked for a reference. In progress on branch `pokemon-look` (off `main` 932497c),
see "Pokemon look" below.

**Owner feedback 2 (2026-11-21), right after the Pokemon concept sheet: "can we not get this game closer to tamagotchi paradise?
... the current design feels boring and lacking. id enjoy the game more if it was a clone of tamagotchi paradise with more
interesting looking creatures and areas."** Reference: the Tamagotchi Paradise growth chart (https://i.redd.it/xjeya1d8d8ff1.png;
read from the chart only, not from the game). Answers (AskUserQuestion, same day):
scope = "Show me a sample first" (three original creatures and one field in the new style on a concept sheet, then they pick the
scope); art = "Cuter pixel art" (keep the pixel pipeline: chunkier bodies, bigger eyes, pastel colors with colored outlines,
sprites up to about 48 px); and about the Pokemon look: "i want to drop monster battling. allow players to battle eachother
competetively like in the tamagotchi paradise. via minigames." So the wild-creature battling (arena, HP, fight ladder) is to go,
and player-versus-player minigames come instead. The Pokemon look is dropped; branch `pokemon-look` stays aside, uncommitted
(673 tests pass), not to be built on. Nothing is removed from `main` yet: the order is sample sheet, then scope. Original
creatures only: the chart's characters are Bandai's and are not copied.
Owner answers to the cute sample (2026-11-21): player-versus-player via **accounts with a server** (so Phase 5, D1 and
sync, has to come before PvP); style: **"cooler, less juvenile, a little more monster gritty"** (the pastel sample is rejected
on style); and **monster battling stays for now, against NPCs only**, "we may revisit it later because im not happy with how
its designed currently". This reverses the earlier "drop monster battling": nothing is removed. (The scope question that was
open here is closed: see "Direction decided" below.)
Gritty sample built 2026-11-21 (second sample, drawing only): three original monsters at 48 x 48 (Gravelhorn, a stone-shouldered
horned brute; Murkfang, a deep-sea angler with a lure; Ashwing, an ember-winged drake) with black outlines, glowing slit
eyes under heavy brows, fangs, and five looks each, plus a 128 x 128 dusk ruins field. On the Design canvas, page "Gritty
monster sample". Script: `scratchpad/sample/gritty.py` (session scratch folder, not in the repo). A blind cheap-model check
found clipped wing tips and horns, unreadable drake expressions, and a ruin lost in the haze; all fixed. The same check still
called the shapes "cute-moody, not gritty" (round, chubby bodies), so the owner should say whether this is gritty enough or
should go leaner and scarier. Engine work if chosen: bigger picture, a new face rule (slit eyes with brows, 5 x 3), black outline
kept, new drawings for all forms.
Owner answer to the gritty sample (2026-11-21): **"lets do a combination of gritty and cute monsters."** Third sample (drawing
only): one growth line per field (Land, Water, Sky), each with a cute 24 px baby, a hybrid 36 px young (chibi round body, big
glossy slit-pupil eyes, small brows, a fang, small horns or fins) and the gritty 48 px adult from the second sample, each with
open, happy and sad looks. Script: `scratchpad/sample/growth.py` (session scratch folder, not in the repo). Published on the
Design canvas as page "Gritty + cute blend" (canvas version 11); the owner said the blend looks right. A blind
cheap-model check said the open and sad looks were too close on the young and adult stages, the sky line's baby had no link to
its adult, the water line jumped from pale to dark in one step, and a headband, back dots and foot specks read as mistakes.
All fixed: heavier brows and a tear on sad, wings and an ember belly on the sky baby, young palettes halfway between baby and
adult, smaller young jaw. My own pixel check then found cut-off fin, tail and wing tips (also on the gritty adults) and a
magenta placeholder where the young eye gloss had no palette color; both fixed. Not changed: the adult drawings otherwise,
and the uneven column widths (they are the real size growth).
Sample built 2026-11-21 (drawing only, not the game): 40 x 40 pixel creatures with colored outlines instead of black, 4 x 5
glossy eyes, blush, three different silhouettes (spiky-maned cub, pear-shaped shell critter, winged bird), and a 128 x 128 Land
field. Drawn with `tools/art/bk.py`; the script is `scratchpad/sample/cute.py` in the session scratch folder (not in the repo).
A blind check by a cheap model found a clipped shell, an unreadable forehead gem, a hard-to-read sad face and a path hidden
behind the creature; all fixed before the sheet went up. If this style is chosen, the game needs: a bigger picture (96 to 128),
a new face rule (the engine finds eyes as a 2 x 2 `WW`/`WK` block, these are 4 x 5), a colored-outline rule instead of `K`
black, and new drawings for every form.
Design problems that followed from dropping battles, now closed: the evolution rules no longer read `battles`, `wins`,
`strength`, `defense` or `spirit` (the Paradise rules below use field time, food and care), and player-versus-player comes after
accounts and a server (Phase 5), as the owner chose.

The owner then sent a second growth chart as another reference (Waji Pascua, Tamagotchi wiki, 17 July 2025,
https://i.redd.it/k5v0slgphudf1.jpeg). It matches the first and adds two rules, now in the plan: a baby needs 4 field cells (an hour
in one field) to become a kid, and a baby with 4 hours of no care becomes the special plain form (parked for a later slice).

**Direction decided (2026-11-21).** Owner on the blend sample: **"blend looks right."** Asked whether the growth chart is in
scope: **"define scope? you mean how they evolve? so long as it follows paradise design its fine."** So the chart's growth design
is the scope: egg, baby, kid (Land, Water or Sky, by time spent in a field), young (four per kid, by what it ate), adult (four
per young, by care: hunger cells, happy cells, mistakes). That is 1 baby + 3 kids + 12 young + 48 adults = 64 original
creatures (the chart's characters are Bandai's and are not copied), replacing the 20 forms and their tree. Style: cute baby and
kid, blended young, gritty adult (the "Gritty + cute blend" sheet). Monster battling stays against NPCs for now, PvP comes after
accounts. The rules, sizes, roster, milestones and costs are in [paradise-plan.md](paradise-plan.md). Work is on branch
`paradise` (a git worktree at ~/broodkeep-paradise, off `main` 932497c, 665 tests pass there); nothing is pushed. The
`pokemon-look` branch and its uncommitted tree in ~/broodkeep stay aside, not to be built on.

**Branch protection is on for `main`** (owner set it 2026-11-21: pull request required, 0 approvals because GitHub has no 0 option
to pick, force pushes and deletions not allowed; the public API reports `protected: true`). Not tested: whether the hub's deploy
key can still push to `main` (it must never try).

**The drawing toolkit is in the repo** (`tools/art/`, 2026-11-21, owner said to move it): the Python that drew the 18 creatures,
`emit.py` to write drawings into the form files and `python3 tools/art/emit.py --check` to see whether they still agree
(0 differ today), `preview.py` for a contact sheet. The game and the tests never run it. Cheap-model review: 11 points, 10 fixed
(a header check, check-everything-before-writing, three wrong README or docstring claims, an old decisions.md bullet marked
superseded, three unused pieces of code, two unused baby entries), 1 left alone on purpose (the Phase 2 decisions.md entry about
its own throwaway script, still true). The scripts have no automated tests: they are checked by `emit.py --check` and by
breaking them on purpose (a bad first line and a broken later drawing both exit 1 with nothing written).

What Phase 1 contains (plan section 9): egg with tap-to-hatch, six care stats, feeding (4 foods, candy makes it ill),
poop and cleaning, night sleep by the clock plus naps, sickness and medicine, calls for attention, offline catch-up,
death and a new egg, idle behaviours, tap reactions (poke, pet, tickle), a settings panel (sleeping hours) and a dev panel
(7 taps on the version line). One fixed room. Saves on the device only (IndexedDB). Design choices are in
[decisions.md](decisions.md), accepted gaps in [known-issues.md](known-issues.md).

Phase 1 checks: typecheck, tests and build exit 0, a cheap-model review that found 5 real defects (all fixed), and the
built game driven in a headless phone browser through the whole flow with no console errors. Not checked: a real phone,
and iOS Safari save-on-close.

## Phase 3 slice 1: the habitat (merged in PR #12, live 2026-11-21)

What it adds: a habitat screen (switch with the house and tree buttons) with five gathering spots. The player taps a spot, the
creature works there for 3 to 8 real minutes (also while the app is closed) and comes home with coins and a material, shown on
a welcome-back card. Younger creatures can only use the light spots. While it is out the room is empty and care is
unavailable (a "Call back" button brings it home with nothing). Save version 2 (`coins`, `inventory`, `hauls`, `creature.job`,
`counters.chores`) with a migration for version 1 saves. `chores` is now a counted evolution metric. Version label "0.3 (Phase 3a)".
Design notes and the numbers are in [decisions.md](decisions.md), accepted gaps in [known-issues.md](known-issues.md).

Checks: typecheck and build exit 0, 593 tests (13 files; 547 before), 39 deliberate code mutations all caught (one test was
rewritten after a mutation survived), a headless phone browser run of the whole flow with no console problems (all four
creature sizes, night, a refused tap, a job, the room while away, the welcome-back card, calling back, and a death on the
habitat screen followed by a new egg), and a cheap-model review that found 9 points (6 fixed, 2 written down, 1 left alone on
purpose). Not checked: a real phone, and the drawing code beyond its placement tests.

## Phase 3 slice 2: combat and the arena (merged in PR #13, 2026-11-21)

What it adds: a third nav button (crossed swords) opens the arena. The creature (from the in-training stage up) fights a wild
creature of its own stage, turn by turn: Attack, Guard or Special (Special needs a full three-pip meter). Wins pay coins, now and
then a material, and one trained stat point; they climb a five-rung ladder whose last rung is a boss. A loss leaves it at a
quarter HP and tired. HP rests back over real time (also with the app closed). A fight is never saved: closing the app in
one forgets it and costs only the energy already spent. `battles`, `wins`, `strength`, `defense` and `spirit` are now counted
evolution metrics. The dev panel has battle HP and fight rung sliders. Version label "0.4 (Phase 3b)". Design notes and the
numbers are in [decisions.md](decisions.md), accepted gaps in [known-issues.md](known-issues.md).

Checks: typecheck and build exit 0, 665 tests (15 files; 593 in 13 before). 97 deliberate code mutations of the combat, arena
and `Game` code were all caught (the first pass caught 63 of 64 and 28 of 31, the 4 that survived were test gaps, each fixed
and re-run; 2 more were run for the review fixes). Four older tests that assumed strength reads 0 were updated. The built game was driven in a headless phone
browser with no console problems: an idle arena, a refused tap for each reason (too young, tired, asleep, sick, away), a whole
fight with frames of the first round, guard until the special is ready and then the special, all four creature sizes, the
boss rung at low HP (a loss), the result strips, run away, a death and an evolution in the middle of a fight, a reload in a
fight, and night. The look found one problem, the picture jumped between states because the dock changed height (fixed).
A cheap-model review found 3 points, all fixed (a test titled "a day later" that checked an hour, a test titled "an egg or a
death" with no egg case, and a recoil bound that held for almost any value). Not checked: a real phone, the pace of the
animations as motion, and the drawing code beyond its timeline and placement tests.

Simulated difficulty (first-guess numbers): an untrained creature at full HP wins 97 to 100% on rung 1, 13 to 21% on rung 4
and 1 to 5% against the boss; trained to the stage cap it wins 98 to 100% on every rung (details in decisions.md).

## Pokemon look (in progress, branch `pokemon-look`, nothing pushed)

Owner answers: restyle both screens, concept sheet first. Plan: a tile-based overworld look for the habitat (8 pixel tiles drawn
from text grids, like the creature and icon pictures) and the classic battle layout for the arena (the wild creature up on the
right on its platform, yours down on the left, a name and HP box for each, a boxed command menu). The rules, the buttons and the
save do not change. The sheet is made from the real game running the new art, so what is approved is what ships.

Built so far (uncommitted on the branch, 673 tests and typecheck pass, nothing pushed): `src/art/tiles.ts` (12 x 12 tile map,
8 pixel tiles), `src/art/habitat.ts` (draws that map; spot boxes sit on whole tiles; the job gauge moved under the creature's
feet as `progressBox`, 16 wide, so it never hides the creature or covers another spot), `src/art/font.ts` (3 x 5 capital
letters for the names), `src/art/arena.ts` (platforms, a name box for each fighter with name, HP bar and the fight ladder or the
special meter, diagonal lunge and recoil, grass field, night tint under the boxes), `src/ui/ArenaBar.tsx` and `app.css` (one
framed command box, same height in every state, refusal icon in its corner). Checked in a headless phone browser: every
arena state and every habitat state (no console errors). The Design canvas "Broodkeep Pokémon look" holds the real screenshots.
Still to do after the owner answers: deliberate code mutations of the new tests (restore and diff), the reviewer pass, the docs
(decisions.md, known-issues.md, art-direction.md with the reference), then "push it".

## Creature redesign (merged in PR #9, 2026-11-21)

Owner: "they look so dopey and have no real character, I want real changes like in Digimon". After a private concept sheet
the owner approved ("i approve the creature sheet for redesign"). All 18 non-baby creatures are redrawn as full-body
characters that grow by stage (in training 16 px, rookie 22, champion 28, ultimate 32; Blip and Drip unchanged) with a
second drawing each for idle and walking. The engine now works at any size: standing, walking, bed, dead and tombstone,
food, thought bubble, hearts, sparkles, tap area, the evolve scene (keeps the creature's middle), and the sleeping,
slumped, shut-eye, happy and yawn looks, all made from whichever drawing is showing. Design notes and the drawing rules are
in [art-direction.md](art-direction.md) and [decisions.md](decisions.md), accepted gaps in [known-issues.md](known-issues.md).

Checks: typecheck and build exit 0, 547 tests (10 files; 383 before), 45 deliberate code mutations of the new code all caught
(3 were first missed: a walk target that ignored the size could push at the wall forever, and sparkles that stayed in a
16 pixel corner, both now tested). Every look of every form was rendered on a contact sheet from the real engine code and the
room was viewed with each size. Tests and looking found: the two biggest forms had no mouth to yawn with, Thornback's two
happy eyes disagreed, and a blanket hung 5 pixels past the bed (all fixed; the lying width is now capped at the bed). The
built game was driven in a headless phone browser: all 20 forms standing, sad and asleep, the hatch and evolve scenes, and for
five sizes the tap hop, petting, hungry bubble, a whole meal, sad, sick and dead, with no console errors. A cheap-model review
of the code, tests and art-direction.md (not decisions.md or progress.md, which it was not given) found 7 points: 6 fixed (a
layout comment that said in training forms are bigger than 16, Thornback missing from the white-arch list, food drawn over a
big creature's edge column so it now sits beside the body, a test that only checked its own numbers, a lying-width test too weak
to notice no widening, the sleeping "z" clipped at the room edge for a 32 pixel creature) and 1 left alone on purpose (an unused
`eyesClosed` import in `scene.ts` that was already unused before this change). Not checked: a real phone, the animation pace as
motion, and the drawing code has no automated tests.

## Happy eyes (merged in PR #8, 2026-11-21)

Owner request: "a happy eye emote for when positive things happen". Eyes become small arches (`^ ^`) during the 0.8 s happy
hop, which already fires after a meal, petting, tickling, cleaning, a cure, a hatch and an evolve. A sad or sick creature
gets a slumped version. The arch is dark, or the creature's own eye color when the body is too dark for dark to show (three
forms when it was built: Dreadmaw, Hollowking, Gloomtoad; four after the redesign, Thornback joined). Design notes in [decisions.md](decisions.md), accepted gaps in [known-issues.md](known-issues.md).

Checks: typecheck, 383 tests (10 files) and build exit 0, 27 deliberate code mutations all caught (two were first missed:
one was a clause that turned out to be dead code and was removed, one exposed a weak test that was tightened), all 20 forms
rendered standing and slumped, and a headless phone browser after a meal shows the arches during the hop and open eyes
after it, with no console errors. A cheap-model review found 7 points, all fixed (the docs named six dark forms where it is
three, a test expected the wrong thing for a white cell beside an eye, two tests had titles that promised more than they
checked, a stale comment, and the no-tears rule is drawing code with no test, now written down). Not checked: a real phone, and a sad creature live in the browser (the slumped
picture is tested and was rendered, but not captured live).

## Phase 2: all 20 forms (merged in PR #6, live 2026-11-21)

Owner answers: full tree now with later rules waiting, 16 x 16 pictures for every form, derived emotes plus hatch and
evolve scenes.

- **20 forms** (2 babies, 3 in training, 5 rookies, 5 champions, 5 ultimates), 17 of them new. Eggs: speckled gives Blip,
  striped gives Drip, swirled gives either.
- **The full tree** is data in `src/data/forms/`. Rules that need training, battles, jobs, strength, defense, spirit or
  discipline read 0 until Phase 3, so today only care, feeding and happiness rules and the fallbacks can fire. All numbers
  are first guesses.
- **Dev tree viewer** (dev panel): each path from the current form with its rules as pass or fail, the path that would win,
  and number inputs for the systems that do not exist yet.
- **Hatch and evolve scenes**, looks only, never saved.

Checks: typecheck, 336 tests (10 files) and build exit 0. 35 deliberate code mutations of the new code were all caught
(30 on the first pass, 5 more for the review fixes). A cheap-model review found 12 points: 10 fixed (Drip had an extra path
the plan does not have, the evolve scene ignored the facing direction and ran while asleep, the scene was not cleared when
the game was replaced or the creature died, the egg tap made its own burst before the pop, a duplicate CSS rule, a stale
comment, a misleading test name, rule text rounding 69.96 up to 70.0, number inputs now select on focus), 1 documented (dev
Hatch on a dead creature plays no scene) and 1 kept on purpose (discipline reads the stat, with a hint in the dev panel).
The built game was driven in a headless phone browser: both scenes frame by frame, all 20 forms standing, sad and asleep
in the room, a real tap-hatch, and the dev viewer, with no console errors. Not checked: a real phone, and the drawing code
has no automated tests.

## Emotes (merged in PR #4, live 2026-11-21)

Owner feedback after the first playtest: more visible emotion for small children. Built in two rounds, both merged in
PR #4:

1. Eating (food drops in, four bites, eyes shut while chewing, then a heart and a hop), lying flat with eyes shut when
   asleep or dead, and a slow gentle "no" (eyes shut, slow sway) instead of a rattle. The quick rattle stays for a tapped
   egg.
2. On the owner's go-ahead, the rest: blinking, sad (slumped, heavy lids, tears), sick (slump, sway), hungry (tummy
   rumble), sleepy (heavy lids, yawn), a pink blanket over the sleeping creature, and pupils that look up at falling food.

Design notes in [decisions.md](decisions.md), accepted gaps in [known-issues.md](known-issues.md).

Checks (round 2, on top of round 1): typecheck, 147 tests and build exit 0. 41 deliberate code mutations of the emote code
were all caught (several tests were first too weak and were tightened). The built game was driven in a headless phone
browser for every feeling (time-lapse close-ups of eating, hungry, tired, sad, sad and tired, sick, asleep with the
blanket) with no console errors, and the earlier two-finger and failed-read browser checks still pass. Both rounds had a
cheap-model review; round 1 found 3 real issues and round 2 found 5, all fixed (a sad creature now stays slumped while
yawning, chewing or saying no, tears line up with the eyes, the wander roll is spread correctly after the growl and yawn
chances). Not checked: a real phone, and the motion as motion (tests cover sizes and timing, the pictures are stills).

## Open for the owner

- Slice 1 is on the live site: play the habitat on a phone and report what feels wrong (is 3 to 8 minutes of work about
  right, are the coins and bag worth having before anything can be bought, does the empty room while it is away feel ok). Dev
  mode (gear, tap the version line 7 times) skips the waits and can hatch any form.

- Slice 2 is merged: the owner has played it and wants a different look (above). Still unanswered: is the ladder too steep or too
  easy, do the buttons feel right. Dev mode has the HP and rung sliders.
- Closed by the Paradise decision: the proposed Train action and a way for discipline to rise existed only for the old tree's
  rules (the `training` and `discipline` metrics). Under the Paradise rules nothing reads them, so neither is needed for growth.
  (Discipline still has the unbuilt sulk rule in combat; that stays as is.)

- Closed 2026-11-21 (owner): the owner played the live Paradise growth and said "seems fine", then "move on". No tuning was asked for
  (15 awake minutes per field cell, 2 servings per food cell, the stage lengths stay), and Scorchlet's missing opening beak is left as it
  is. Do not ask again.
- Paradise growth, choices I made that the owner can change (listed in paradise-plan.md section 8): the place model (home and
  three fields), stage lengths (6, 24, 48 real hours), 2 servings per food cell, one food item per type, a baby that has not
  reached 4 cells in any field after 6 hours growing up anyway (egg pattern as the fallback), berry and fish dropped.
- Closed 2026-11-21 (owner): old saves do not matter. No migration: save version 3 may reset everything. The owner replaced
  section 6 of CLAUDE.md (done: it now points to paradise-plan.md) and approved the gate-script edit in ~/CLAUDE.md (done).
  The owner answered "proceed" to "do the Land creatures look right?", taken as yes; redraw notes can still come any time.

## Facts that are easy to get wrong

- Anything stored in the save as an absolute time (a job's finishing time, stage starts) can end up hours ahead if the device clock is set back by more than an hour, because the game then starts again from the new time. Jobs clamp their finishing time to their own length; other stored times (egg start, stage start) do not.
- Pages `_headers` does not apply to Functions responses, so `functions/_lib/response.ts` must set headers itself.
- Workers may cap PBKDF2 at 100,000 iterations (reported, not confirmed in primary docs). Check before Phase 5.
- Unknown paths return `index.html` with 200 (SPA fallback). Once Functions exist, unknown API routes should return a JSON 404.
- Pages "Retry deployment" rebuilds the OLD commit. After a merge, look for the new deployment instead.
- The Workers setup flow shows a "Deploy command" box; the Pages flow does not. This project is Pages.
- `SESSION_SECRET` in `.dev.vars.example` is only an example name. Phase 5 decides what is really needed.
- More in [known-issues.md](known-issues.md) and [decisions.md](decisions.md).

## Next

1. **Paradise growth** (decided 2026-11-21, plan in [paradise-plan.md](paradise-plan.md), branch `paradise`): milestone 1, the
   Python art library (face patterns, face stamping, palette helper, art checks, sheets, in `tools/art/paradise/`); milestone 2,
   the Land art (baby, 3 young, 15 adults, the Land field) with an owner checkpoint; milestone 3, the game side (anchor faces in
   TypeScript, 128 pixel layout, growth rules, save version 3); then pull request 1 (Land playable), then Water and Sky. CLAUDE.md section 6 now points to paradise-plan.md (owner OK, 2026-11-21).
   **Milestone 1 done (2026-11-21, in ~/broodkeep-paradise):** `src/data/face-patterns.json` (shared face pieces),
   `tools/art/paradise/lib.py` (face stamping, art checks, palettes, sheets), `sheet.py`, `selftest.py`, and `land.py`, `water.py`,
   `sky.py` with the nine blend-sheet creatures (kid, young, adult of each field) ported as body-only drawings with anchors, a
   second drawing each and, for Murkfang and Ashwing, custom mouth patterns. `selftest.py` has 56 cases (good creatures, each
   defect, the pattern file) and passes; breaking 36 lines of `lib.py` one at a time in a scratch copy made it fail every time
   (the harness is a scratchpad script, not in the repo). A cheap-model fresh-eyes review found Murkfang's neutral and yawn
   mouths half a pixel off centre plus gaps in the checks; all fixed, the rest recorded in known-issues. Sheets are in the
   session scratchpad (`m1/land.png`, `water.png`, `sky.png`), looked at 4x: faces, brows, tears and mouths read right.
   **Milestone 2 done (2026-11-21):** all 22 Land creatures (1 baby, 1 kid,
   4 young, 16 adults) are drawn in `tools/art/paradise/` (`baby.py`, `land.py`, and one file per line: `land_cragpup.py`,
   `land_dugling.py`, `land_frillet.py`, `land_sporeling.py`; `land_all.py` lists them in order). The Land field is ported
   unchanged from the gritty sheet as `land_field.py` (`python3 land_field.py out.png [creature id]`). Every creature passes
   the art checks and `selftest.py` (75 cases) now gates all 22. A blind cheap-model review of all 22 and a second one of the
   10 revised rows led to redraws: Moonlop (ears read as wings), Plateback (plates read as spikes), Gutterfang (an outlined
   snout read as an open mouth), plus lighter palettes for Tuskmole, Bogviper, Hollowbloom and Mossheap, a face plate for
   Potterling and warmer tan for Dugling. A code review found mirrored claws and toes placed with the wrong offset (fixed with
   `sym`) and dead shade arguments (removed). Contact sheets are on the design canvas, page "Paradise: Land creatures"
   (https://claude.ai/artifact/5V89utWpfU4Kh4CSiKMPSJ). Owner answered "proceed" (2026-11-21), taken as "look right";
   milestone 3 (the game side) is in progress.
   **Milestone 3 steps (started 2026-11-21; baseline `npm test` 665 passed, typecheck 0).** Layer A, game rules without the new
   faces (art stays on the old code and shows faceless bodies until layer B): A1 types, foods (pellet, treat, meat, carrot,
   worm; each later field adds its three), tuning, stage remap in combat and habitat, derived stats (stage budgets from the
   old forms: baby 20, kid 29, young 44, adult 93); A2 an emitter `tools/art/paradise/emit_ts.py` writes `data/forms/baby.ts`
   and `land.ts` (old 20 forms deleted); A3 `data/fields.ts`, `game/growth.ts`, save version 3 (old saves are not read), sim,
   care, actions, dev tools; A4 tests (growth, data, a scripted playthrough that reaches every Land adult); A5 menus (foods,
   place picker, dev tree). Layer B, art: B1 TypeScript anchor faces (a parity test against the Python sheets), B2 128 pixel
   room and the Land field, B3 art tests and screenshots of the running game.
   **Milestone 3 done (2026-11-21):** layers A and B are built. `npm run typecheck` exit 0,
   `npm test` 17 files and 574 tests pass, `selftest.py` 84 cases pass, `emit_ts.py --check` and `face_hashes.py --check` agree
   with the files, `npm run build` works (205.6 KB of JavaScript, 49.5 KB gzipped). The game now has 22 forms (1 baby, 1 kid, 4 young,
   16 adults), the growth rules (`growth.ts`), anchor faces (`face.ts`, 308 pictures checked against Python), the 128 pixel room,
   habitat and arena, the Land field drawn behind a creature that is out in it (`art/field.ts`, written by `emit_ts.py` as
   `art/field-land.ts`), and a "Go somewhere" tray (Home, Land, Water and Sky, the last two locked). Looked at on a contact sheet of
   13 states and two tray screenshots (Playwright against the dev server): all five sizes in the room and the field, sleeping on
   the bed, slumped, sick, dead with the tombstone, eating and poop in the field. The look found the five-food tray wrapping to a
   second row (fixed) and a pellet icon that looked like poop (redrawn). Mutation checks: the right-eye position, the field emitter
   checks, the field picture test, each branch of `goTo`, the width and column protection of `lieDown` and the poop spots were
   broken on purpose and the tests failed. A cheap-model fresh-eyes review of layer B (read-only, 18 files in the diff plus the new
   files by path) found 2 defects and 3 test gaps, all checked against the code and fixed: the habitat screen said "at home" and drew
   the creature at home while it was out in a field (now an empty habitat with a bubble of that field's icon, and the sentence says
   where it is); the test titles "changes nothing else" and "as wide as its picture allows" promised more than they checked (the
   first is covered by the Python parity hashes and the title now says so, the second now checks the width, and a new test checks
   that a protected column is never doubled); plus a poop spot drawn over the food bowl, a hard-coded "4" in the dev tree text and
   a stale size comment. Its other two points were left: a job does not send a creature home from a field (the owner chose to leave it, 2026-11-21, see Next) and the dev tree's option lists have no keys (no visible effect). See decisions.md and
   known-issues.md ("Paradise growth, game side"). Next for this branch: milestone 4, pull request 1 (Land playable, Water and
   Sky locked). Tell the owner then that existing saves reset. Milestones 1 to 3 were committed and pushed to branch `paradise` (2026-11-21, on the
   owner's "commit and push") and merged by the owner as PR #14 (`main` efb3f04, live).
   **Water slice built (2026-11-21, branch `water`, pushed, no PR yet):** the Water roster is in paradise-plan.md section 4 (names and
   animals are my choice). Drawn in `tools/art/paradise/`: `water_lanternfin.py` (Puffglow, Rustgill, Wilteel), `water_kelpet.py`
   (Kelpet, Coralback, Bubblebelly, Brinetusk, Limpseal), `water_scuttlet.py` (Scuttlet, Rampclaw, Shellsnug, Chipclaw, Softshell),
   `water_bellet.py` (Bellet, Stormbell, Inkpot, Spinewad, Droopstar), `water_field.py` (the sunken ruin with a pearl shell) and
   `water_all.py` (the 21 Water forms in order). `emit_ts.py` now also writes `forms/water.ts` and `art/field-water.ts`. Game side:
   seafood, seaweed and shrimp (same numbers as meat, carrot and worm), the Water plan in `data/fields.ts`, `fieldPictures.water`, three icons. A
   striped egg now grows into Drizzle. The playthrough test reaches all 32 adults of both fields at the planned hours. Looked at:
   every Water creature on the field on one contact sheet, and the real game in a headless phone browser (kid and adult in the
   field, the places tray with Water open and Sky locked, the five-food tray); no page errors. Fresh-eyes review: 6 code defects,
   all real, all fixed, plus three picture changes. Five mutation checks failed the new tests as they should. JavaScript is
   319 KB (64.6 KB gzipped), up from 205.6 KB. **Merged by the owner as PR #15 (`main` e16036d, 2026-11-21).** The Water slice changes
   nothing for a Land creature except that a striped egg now grows into Drizzle.
   **Sky slice built (2026-11-21, branch `sky` off `water`, committed `cce4576`, merged as PR #16 into `main` 91a529f, live):** the Sky roster is in paradise-plan.md section 4 (names and
   animals are my choice). Drawn in `tools/art/paradise/`: `sky_scorchlet.py` (Hearthwing, Sootsnarl, Dimwick), `sky_chirplet.py`
   (Chirplet, Gildcrest, Downwren, Peckjack, Slumpfinch), `sky_nectlet.py` (Nectlet, Paleveil, Honeyfuzz, Spitewing, Tatterwing),
   `sky_wisplet.py` (Wisplet, Galecrown, Softnimbus, Smogrump, Fogsag), `sky_parts.py` (the beak as a mouth pattern), `sky_field.py` (a
   floating island ruin in a morning sky, 40 colors) and `sky_all.py` (the 21 Sky forms in order). Cinderling, Scorchlet and Ashwing were
   already in `sky.py`. `emit_ts.py` now also writes `forms/sky.ts` and `art/field-sky.ts`. Game side: chicken, corn and syrup (the Land
   numbers in the same slot) with three icons, the Sky plan in `data/fields.ts`, `fieldPictures.sky`. A swirled egg now grows into
   Cinderling. The playthrough test reaches all 48 adults of the three fields at the planned hours. **What the wiring found:** 11 forms
   failed the sleeping-blanket test (Cinderling, Scorchlet and 9 beaked adults have no mouth pixel on a closed face, so the blanket
   used its fallback); the test now checks "below the eyes" (decisions.md). Looked at: every Sky creature on the field on one contact sheet,
   and the real game in a headless phone browser (kid and adult in the field, the places tray with all three open and none locked, the
   Sky food tray, sleeping and sad creatures, the same sleepers in Land and Water for comparison); no page errors. Fresh-eyes review: 13
   findings, 7 fixed (the sad beak did not lower on 8 forms, three second drawings that barely differed, dead code and palette entries, a
   docstring, a test that could never fail), 6 left with reasons (decisions.md, known-issues.md). Nine mutation checks failed as they
   should. **Done:** the owner merged it and the live bundle matches my build (436.7 KB of JavaScript). A swirled egg now grows into
   Cinderling. **Still open, scope suggestion for the owner:** load each field's forms only when needed
   if the bundle starts to matter. (Scorchlet's beak: closed, left as it is.)
   **Closed 2026-11-21 (owner: "leave it as it is"):** a creature that starts a habitat job from a field comes back to that same
   field when the job ends (nothing sends it home), while bedtime and naps do send it home. Do not ask again.
2. **Creature Book (the owner chose it as the next item, 2026-11-21; built on branch `creature-book`, off `main` 91a529f; committed (870d49b) and
   pushed to `origin/creature-book` on the owner's "commit and push", 2026-11-21; the owner opens and merges the pull request: https://github.com/cjustin-dev/broodkeep/pull/new/creature-book).** A panel that lists all 64 creatures as silhouettes that fill in the first
   time a creature of that form is raised (CLAUDE.md section 7.8). Per save for now (family-wide waits for accounts). Not part of this: the
   legacy shelf, soften mode wording. That commit also carries the notes edits made for the Sky merge.
   **Answered 2026-11-21 (owner, via a question; all closed, do not re-ask): the "no care for 4 hours" special form.** "No care" = 4 hours
   awake with no feed, clean or play (sleeping hours do not count). It can happen to a baby or a kid, and it wins over the 6 hour baby safety
   net. The special is one creature (a 65th form, one new drawing set) that grows no further. Its name and look are my choice. **Built 2026-11-21 on this branch (Dustpuff): see the State section.**
   Later: the secret evolutions (two players, so after accounts), slice 3 of the old Phase 3
   (garden plots become a food source, standing chores, habitat upgrades; it clashes with "food stays unlimited") and slice 4's legacy shelf.
3. Tune the stage lengths, cell counts and fight numbers after real play. (The owner played the live Paradise growth on 2026-11-21 and
   said "seems fine": nothing to tune now. Fight numbers have had no separate feedback.)
   Work on a new branch, never push `main`, and the owner merges the pull request.
4. **Cloud saves: accounts and a server copy of the save (the owner said "lets do it", 2026-11-21, after asking whether the database was
   active at server level; it was not, saves were on the device only).** A first slice of Phase 5 on branch `cloud-saves` (worktree
   ~/broodkeep-cloud, off `main` 91a529f, separate from the unmerged Creature Book branch). Plan, API, edge cases and the owner's Cloudflare
   steps: [cloud-saves.md](cloud-saves.md). In: email and password sign up, sign in and out, one save per account in D1, automatic sync,
   backups. Not in: kid profiles, PINs, soften mode, play limits, password reset, history. **Design change to flag:** the password is
   stretched in the browser (PBKDF2, 600,000 iterations) and the server stores a salted SHA-256 of the result, because server side PBKDF2
   took 19 ms at 100,000 iterations in the Workers runtime and the free plan gives 10 ms of CPU; this differs from CLAUDE.md section 3 ("PBKDF2
   in Cloudflare's runtime"), so that line needs an owner approved edit (proposed: "passwords are stretched with PBKDF2 in the browser and
   only a salted hash of the result is stored"). Sign up needs a family code (`SIGNUP_CODE`, fails closed).
   **Status (2026-11-21): built, checked, committed (d32939e) and pushed to `origin/cloud-saves` on the owner's "commit and push"; the owner opens and merges the pull request (https://github.com/cjustin-dev/broodkeep/pull/new/cloud-saves). D1 not created.** Server:
   `functions/api/{register,login,logout,me,save}.ts` over `functions/_lib/*` and `migrations/0001_init.sql`. Browser: `src/sync/cloud.ts`
   (HTTP), `sync.ts` (when to send, take or ask), an Account section in Settings (`src/ui/AccountSection.tsx`), `Game.onSave(byPlayer)`.
   `npm run typecheck` and `npm run build` exit 0; 1216 tests in 22 files pass (1085 before, 131 new; five runs, no flake). A cheap-model
   review (before any test ran) found 2 serious problems (an idle device left open would beat the device in use; a game that could not be
   loaded started a new egg that could overwrite the account's game) and 6 more; all fixed or recorded (decisions.md, known-issues.md).
   Mutation checks: 88 deliberate breaks, 73 caught at first, the 15 that survived were test gaps (tests importing the constant they
   guard; `settle()` hiding a broken timer) and were fixed, all 88 now fail a test; each file was restored and diffed. End to end: a
   script drives three browsers (real Chromium) against `wrangler pages dev` with a local D1 (13 checks pass: sign up pushes, an untouched
   egg takes the account's game, a game in progress asks, keep-this-device makes a backup, an idle device takes the newer game, sign out,
   wrong password). Not done: the real Cloudflare D1 (the owner's steps, cloud-saves.md section 6), the free plan CPU limit live, a
   phone's time for 600,000 PBKDF2 rounds. **The owner approved the CLAUDE.md section 3 edit** ("apply your suggestions", 2026-11-21; applied in
   the commit: passwords are stretched in the browser). **Merged by the owner (PR #17 cloud-saves, with PR #18 creature-book, 2026-11-21).** The owner then sent the D1 database id
   (`d7dd68cc-5111-48fb-8b3c-af3194162db1`, taken to be the `broodkeep` database from step 1, not checked against the dashboard);
   it is in `wrangler.toml` on branch `d1-database-id` (a pull request for the owner to open and merge; until it is merged the live
   site's functions still have the all-zeros placeholder). **Still to do by the owner, not confirmed:** step 2 (run
   `migrations/0001_init.sql` in the D1 Console) and step 3 (the `SIGNUP_CODE` secret, Production). Then sign up on the live site and
   sign in on a second device to check.
