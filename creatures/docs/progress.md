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

## Signed out play marked as changed (branch `signed-out-dirty`, 2026-11-22; committed and pushed on "commit and push")

Found while planning profiles: a change made while signed out was never marked as changed (`CloudSync.noteSave` ignored it), so signing
in again as the same account, after another device had saved, replaced that play with the account's game and left no backup. Now
`noteSave` marks it (changed and dated) once the device has met an account, without arming the timer or calling the server; the next
sign in sends it and the server's newest-save-wins rule decides, the older game going to the backups. A device that never met an
account stores nothing. Owner asked for the fix ("fix and start", 2026-11-22). 9 new tests in `tests/cloud-sync.test.ts` (5 of them fail on the
old code, each for the right reason; the others guard what already held); 6 deliberate breaks of `noteSave` all caught; typecheck 0, 24 files /
1288 tests, build 0. A cheap-model review found 6 points: 1 (a tap that changes nothing counts as a touch) is the existing rule, now in
known-issues.md and cloud-saves.md; 2 (flush before saving) does not hold, because `App.tsx` saves on hide by itself; 3 to 6 fixed.
The owner opens and merges the pull request: https://github.com/cjustin-dev/broodkeep/pull/new/signed-out-dirty. It and `profiles-slice-1` both edit this file (`docs/progress.md`), so the second to merge has a docs-only conflict (checked with `git merge-tree`; the code and the tests merge cleanly).
## Profiles and adult PINs (plan merged in PR #22; slice 1 built and committed on branch `profiles-slice-1` in ~/broodkeep-profiles, 2026-11-22)

The owner said "move to the next phase. im not committing this yet." I read it as the next item of the order I gave: kid profiles
and adult PINs (the rest of Phase 5). The plan is [profiles-plan.md](profiles-plan.md): profiles inside one account (adult or kid),
a "who is playing" picker, one save per profile on the device and in the account, and an optional 4 digit adult PIN as a screen lock.
Slice 1 is profiles without PINs (add and rename, no removal), slice 2 the PINs and the lock, each its own pull request. A cheap-model
review of version 1 found 25 problems and a second review of version 2 found 15; version 3 of the plan (section 10 of the plan) keeps
the first profile's device keys `save` and `cloud`, switches profiles by save, send and reload, takes the signed in state from one
device record, and defers removal. The draft migration was run on SQLite 3.51.2 (scratch script, not in the repo) and behaves as the
plan says; D1 itself is not checked. The owner asked how accounts work (answer: one household account, profiles inside it, another
household signs up with its own account and shares nothing), then said "we are good then commit and push" (2026-11-22). Read as
accepting the plan and my defaults for questions 1 to 5 of section 8: sign in required, the PIN lock as written with its holes, the
header switch button, slice 1 then slice 2 as separate pull requests, removal and adult/kid change later. **Closed; do not ask
again.** Question 6 (the existing bug where play done while signed out can be overwritten on the next sign in) was fixed in its own branch
(`signed-out-dirty`, below). The two proposed edits to this file (section 3 PIN sentence, section 5 profiles row) were approved and applied on
2026-11-22 ("apply the old profile edits to claude.md"). The branch was cut from `main` before `pwa-install` (that pull request was not merged first);
both touched `App.tsx`, `SettingsPanel.tsx` and `game.ts`, so the second to merge had conflicts; they were resolved on `pwa-install` (next section).

## Adult expansion (adopted 2026-11-22, branch `adult-plan` in ~/broodkeep-adult, docs only, committed 35fed3b and pushed on "commit and push")

The owner added [adult-expansion-spec.md](adult-expansion-spec.md) to `main` (95f869b) and asked whether it can go into the game. The
review against the code: yes, with corrections. The owner answered all six questions the same day (the sixth first with "not sure", then "yours is fine") and approved moving the spec into
`docs/` and editing CLAUDE.md. Done in this branch, nothing built: the spec moved to `docs/`, CLAUDE.md got dated notes in sections 7.2,
7.4, 7.5, 7.6, 7.8, 7.9 and 9 and a new section 12, and [decisions.md](decisions.md) has the section "Adult expansion" (the answers, the
corrections, the measured space). The answers: food and medicine stay unlimited (shop foods boost the existing food types); a minimal
Retire joins A1 (it may slip to A2); new creatures will start at discipline 30; the perfect run is tier 1 with no mistake in any stage; the 65th entry stays
Dustpuff with no secret slot; the sixth question, the energy wording, is closed too (the owner was unsure, then accepted my reading: no real-time lockout; decisions.md). Next,
when the owner says to start: A1 (Adult Mode toggle, status and stat panels, context bar, labelled care row with the reason on every
disabled button, Growth Forecast, the feed and poke texts, a minimal Retire, discipline start 30), planned with its edge cases first.
A cheap-model review of these docs checked every code claim in decisions.md; it found 7 wrong or contradictory statements (planned values
written as current, boss wins, which stats fights train, Pond being real, mistakes counting in every stage, the dev tree imports, a
space figure that contradicted itself); all 7 were checked against the code and fixed, and the pointer and the Garden question were
added. Not re-reviewed after the fixes. The branch is off `main`; the owner opens the pull request: https://github.com/cjustin-dev/broodkeep/pull/new/adult-plan.
**Slice 1 built (2026-11-22, on the owner's "fix and start"; committed and pushed to `origin/profiles-slice-1` on "commit and push", because `profiles` itself was already merged in PR #22).** Profiles without PINs: add and rename (no
removal), a "who is playing" picker, a switch chip under the header, a Players part in Settings, one game per profile on the device and in
the account. Server: migration `0003_profiles.sql` (`kind`, `name_key`, `pin_hash` unused), `GET/POST/PATCH /api/profiles`, `?profile=<id>`
on `/api/save`. Device: `src/sync/profiles.ts` (names), `roster.ts` (keys, start rule, list), `choice.ts` (sessionStorage), the shell in
`main.tsx`, `Picker.tsx`, `PlayersSection.tsx`. Checked on the final tree: typecheck 0, 27 files / 1441 tests (was 24 / 1279 on `main`),
build 0, the only warning is node:sqlite's ExperimentalWarning. Mutation runs (break the code on purpose, read the failure, restore, `cmp`):
server 42 mutants (all caught; the count-then-insert race mutant first SURVIVED because the D1 stand-in never overlaps two requests, so
`slowReads` in `tests/cloud-helpers.ts` was added and it is now caught), device 45 mutants (2 survivors fixed), 3 UI mutants through the
browser (CSS wrap rule, double tap guard, blocked-storage note: each fails exactly its own check). Browser run: Chromium against
`wrangler pages dev` with a local D1 (migrations 0001 to 0003 applied), 64 checks, all pass: sign up, add and rename, switch, picker, a
reload, a second window, 320 / 360 / 390 px layout with a 20-wide-letter name (contact sheet looked at), a session that ends in another
profile, sign in again, sign out, a window with blocked storage, a double tap on a tile. The script is in the session scratchpad, not in
the repo. It found two real defects my unit tests could not: the rename form made the Settings box 42 px too wide at 320 px, and
one of its own checks could not fail (`|| true`; replaced). Two cheap-model reviews of the plan and two of the code (14 findings, then 8 on the fixes; each checked in the code, the real ones
fixed with tests that failed first, the rest documented: plan section 10 has the list). Deviations from
plan version 3, listed for the owner: the picker keeps the account's order (no "last used first"), names collapse inner spaces, and
`GET /api/profiles` answers `{ profiles: [...] }` (decisions.md). Not checked: real D1 (migration and conditional insert ran on SQLite
3.51.2 and wrangler's local D1), a real phone, the free plan's CPU limit and the PBKDF2 time on a phone, 320 x 568 shows the page 16 px
taller (known-issues.md). Gate for the owner: run migration 0003 once in the D1 Console BEFORE merging (numbered steps are in plan section 9, written 2026-11-22).

**Signed out play marked as changed (Q6, branch `signed-out-dirty` in ~/broodkeep-signedout, committed and pushed on the owner's "commit and push", 2026-11-22).** Fixed in its own branch, as
the owner's "fix" was read; its notes are in that branch's `docs/progress.md` (section "Signed out play marked as changed").

## Installable app: `main` merged into `pwa-install` (2026-11-22, on the owner's "resolve pwa-install")

The owner merged `profiles-slice-1` (#23), `signed-out-dirty` (#24) and `adult-plan` (#25) but `pwa-install` was not merged and had no pull
request, so it conflicted with `main` in `App.tsx`, `SettingsPanel.tsx`, `game.ts`, `decisions.md` and `known-issues.md`. Resolved in the
branch by merging `origin/main` into it: `SettingsPanel` takes both `update` and `roster` (the roster hook runs first), `App` passes both,
`game.ts` is `main`'s (both sides had made `saveNow` answer with the write; `main`'s also passes the profile's key), the two docs keep both
sides' sections. One test needed a change: `tests/game-save-hook.test.ts` asserted `writeSave(game.save)`, now `writeSave(game.save, "save")`
(the first profile's device key, pinned as a literal; it fails on its own assertion when `saveNow` drops the key, checked by breaking it).
Checked on the merged tree: typecheck 0, 28 files / 1469 tests, build 0 with no warnings; in real Chromium against `wrangler pages dev` with a
local D1 (migrations 0001 to 0003): the 64 profiles checks pass with the worker active, the earlier install and update run passes (phase A 21
checks, phase B 11: the notice, no reload by itself, "Update now" switches version with the account kept, a second window left alone), and
a new offline run (8 checks: the worker controls the page, `/api/profiles` is JSON while controlled, a new tab offline shows the picker from
the stored list and opens Mia's game, no page file fails to load offline); two breaks of it (the stored list never written, the picker always
opening the first player) each failed their own check. A cheap-model review of the merge and of the offline script found no lost or
duplicated hunk and no conflict marker, and three defects in the script (a selector that could never match, no check that the right
profile opened, silenced waits), all fixed before the run. Not checked: a real phone, real D1.

## Adult track A1.1: the Adult Mode header (built 2026-11-22 on the owner's "start a1"; branch `adult-a1` in ~/broodkeep-adult; committed together with A1.2 in one commit and pushed on the owner's "commit and push", 2026-11-22; the owner's questions are under Open for the owner)

Plan and edge cases: [adult-a1-plan.md](adult-a1-plan.md) (version 2). Built: the Settings checkbox "Adult Mode" (saved per profile as `settings.adultMode`, only `true` is on); the adult
header in place of the Kid header (strip with name, stage, clock, coins and materials, Book percent, Settings and the Switch button; five stat cells with floored numbers, a colour level, the
time left and a "!" on the cell the creature is calling for; a tap opens a card with rates per hour, time to empty at this rate, the food-refusal line and the discipline; one context line);
`game/hud.ts` (every number and sentence, no screen code); `statChangePerMinute` in `care.ts`, which the simulation itself now uses, so the display cannot drift; newborn discipline 30.
Files: `src/game/hud.ts`, `src/ui/AdultHud.tsx`, `tests/hud.test.ts` and `docs/adult-a1-plan.md` are new; `tuning.ts`, `care.ts`, `state.ts`, `App.tsx`, `SettingsPanel.tsx`, `app.css` and these three docs changed.
**Checked on the final tree:** typecheck 0; 29 files / 1,521 tests (`main`: 28 / 1,469; the 52 new ones are `tests/hud.test.ts`); build 0 with 0 warnings (same as `main`); the only test-run
warning is node:sqlite's ExperimentalWarning, as on `main`. Browser (Chromium, `wrangler pages dev`, saved games at a frozen clock; the scripts are in the session scratchpad, not in the repo):
3,618 checks on 13 states at 7 sizes (320 x 568, 360 x 640, 360 x 780, 390 x 844, 412 x 915, 480 x 900, 844 x 390), 26 on the account run (sign up, a second player, a 20-wide-letter name, the
Switch button at 320, 360, 390 and 480 px), 116 screenshots (contact sheets looked at), 0 failures, 0 console problems. **Kid Mode comparison with `main`:** 40 pages, 1,906 elements, 941,564 computed
styles, 0 differences (the room canvas pixels are not compared). **Mutation runs (break on purpose, read the failure, restore, `diff`):** 34 unit mutants (2 survived: the 10-hour format and the last
minute before an egg hatches; two tests added, both now caught), 12 screen mutants (1 survived: an over-wide cell word; the check was tightened to the cell's padding, now caught; one made the script crash
instead of fail, now a failed check), 3 Kid Mode mutants through the comparison (all caught). **Three cheap-model reviews** (the code and harness, the harness again, the mutation script): 14, 8 and 8
findings, each checked against the code; 11 of the first 14 fixed (one was already covered by the full run, two are plan changes, written into the plan), all of the other 16 taken. **Real defects the runs found:**
the Switch button's player name did not end in an ellipsis (the button centred it at the width of the whole name: the page scrolled sideways at every width); the dead creature's stage line was cut off at 320 px
(now wraps); the CLEAN cell with 100 and the most poop was wider than its cell at 320 px (the poop badge now wraps under the number); `minutesUntilItEats` was a minute out at hunger 100 (floating point; now counted
with the simulation's own arithmetic). **Found on `main`, not mine, not fixed:** every living creature's room scrolls 28 px sideways at 320 px (the care row, known-issues.md).
**Not built (as planned):** the Growth Forecast (A1.2), the labelled care row with reasons (A1.3), Retire (A1.4). **Not checked:** a real phone, browsers other than Chromium, two profiles keeping their own setting
(it lives in each profile's own save; not run), the cloud carrying the setting. **Measured cost, for the owner to judge:** the adult header is 177 to 221 px against 60 px; the adult page is 643 to 687 px tall at 320 x 568 and
360 x 640 (scrolls up to 119 px) and fits from 360 x 780 up (the plan said about 60 px net). Committed with A1.2 as one commit (the two slices share files), so the pull request is one: https://github.com/cjustin-dev/broodkeep/pull/new/adult-a1.

## Adult track A1.2: the Growth Forecast (built 2026-11-22 after the owner's "approved. continue"; same branch `adult-a1`; committed with A1.1 in one commit and pushed on the owner's "commit and push", 2026-11-22; the owner's questions are under Open for the owner)

Plan and edge cases: [adult-a1-plan.md](adult-a1-plan.md), section 3b; decisions in [decisions.md](decisions.md) (section "Adult track A1.2") and the rules it found in [known-issues.md](known-issues.md) ("Growth Forecast").
Built: in Adult Mode, tapping the strip's name and stage (a button with a "›") opens a full-screen Growth Forecast panel: the form the creature would grow into if the time were up now (with its tier), the
real time left, a confidence line ("Locked: nothing it can still do changes this", "Still open", or "It grows up right away"), the stage's counters as rows (a baby's field cells, a kid's food cells, a young one's hunger cells,
happy cells and care mistakes) each with a "try more" stepper that only looks at a copy, the tie rule and "what would change it" (for each rival, the least minutes, servings or mistakes that change the leader, worked out by running
the game's own `leadingForm` on copies), the care clock for the special form, a "What changes this?" list of the rules from the tuning numbers, and a Care Log (the last 8 care mistakes of this stage, `counters.mistakeLog`).
Everything it says is worked out in `game/forecast.ts` (pure, no screen code). A final form, the special and a dead or egg state have their own, shorter panels or no entry.
Files: new `src/game/forecast.ts` (540 lines), `src/ui/ForecastPanel.tsx` (190), `tests/forecast.test.ts` (728 lines, 77 tests); changed `AdultHud.tsx` (the way in), `App.tsx`, `app.css` (a Forecast block), `hud.ts` (`callText`
exported), `state.ts` (`Counters.mistakeLog`), `tuning.ts` (`calls.mistakeLogMax`), `care.ts` (writes the log) and `growth.ts` (the word `export` on `canBecomeSpecial`), plus plan 3b and the three docs. With A1.1 that is 17 uncommitted files
(`git status`: 10 modified, 7 new).
**Checked on the final tree:** typecheck 0; 30 files / 1,598 tests (A1.1: 29 / 1,521; the 77 new ones are `tests/forecast.test.ts`); build 0 with 0 warnings. Tests play the real simulation against every "Locked" claim (baby in each
field, kid feeding each food as often as the game lets it, young leaving every call unanswered, the special's 4 hours, a partial minute, a random sweep of 240 creatures where each stage must produce locked cases) and hold the what-if to
a deep-frozen creature. Browser (Chromium, `wrangler pages dev`, 17 saved games at a frozen clock, 320, 360 and 390 px; scripts in the session scratchpad, not the repo): 1,784 checks, 0 failures, 0 console problems; 45 screenshots
(15 games with a panel at 3 widths), contact sheets looked at: four of the five 320 px sheets and one 390 px sheet, no clipping, overlap or sideways scroll (the other sheets are covered by the box and word checks only). **Kid Mode comparison with `main`:** 40 pages,
1,906 elements, 941,564 computed styles, 0 differences. **Mutation runs (break on purpose, read the failure, restore, `diff`):** 44 unit mutants, all caught on the last run (earlier runs: 5 patterns gone stale after a refactor, fixed; 1 survivor, "the time bound
rounds down", became a real unsafe mutant, a partial-minute test and a real attack, now caught), 7 screen mutants on the built files (the way in wider than the window, the lead box wider than the panel, 30 px steppers, the empty-log text, "of 5", the
label, the panel part of the page), each caught by the check it was meant for. **Cheap-model reviews:** the plan against the code (7 numbered findings), the forecast code and tests (9), the three scripts before their first run (12), the entry-measuring script (4), the
sideways check change (3) and the screen-mutation script (6 items, one of them "no finding"); the findings were fixed or folded into the plan. The fixes to the mutation script were checked by its own run, not reviewed again.
**Real defects the reviews and runs found:** a meals test that used a baby (no carrot on its menu) and so tested nothing; rival gaps that ignored the time left; a kid's tie line that ignored meals; attacks that fed once a minute where the game lets a
player feed several times in one; a forecast counted from the clock instead of from `lastSimulatedAt` (a page a little behind could say "Locked" too early); and in the browser script, a "nothing sideways" check that blamed the panel for the 28 px that is already in the page behind it
(now compared with the page before the panel opens, and with 348 as the most it may be at 320 px). **Found in the game, not fixed (known-issues.md):** a tie in a baby's cells goes to the egg pattern's field even when that field is behind; calls keep counting while the creature is away on a job;
a job goes on while the creature sleeps; a device clock set back leaves the stage running until real time catches up (the panel shows the real time and says so).
**Not checked:** a real phone, browsers other than Chromium, a screen reader reading the panel. **Not built (as planned):** the labelled care row (A1.3), Retire (A1.4). Committed (17 files, one commit with A1.1) and pushed to origin/adult-a1; the owner opens the pull request: https://github.com/cjustin-dev/broodkeep/pull/new/adult-a1. Next after it merges: flatten the repo (item 6 of Next), then A1.3.

## Open for the owner

- A1.2 (the Growth Forecast), for the owner after trying it on a phone: (1) forms the player has not found yet show their real name and picture (the spec's choice; one line changes it to "???"); (2) the spec's "Avoid mistakes" stepper is a "slip" stepper
  because the count never goes down (it previews adding mistakes; the count now is the best case); (3) the way in is the strip's name and stage with a "›": clear enough, or a labelled button (costs 14 px of height at 320 x 568 and 360 x 640)? (4) a baby's tie goes to the egg pattern's field even when that field
  is behind (the game's own rule, now shown in words): keep it or change the game? (5) "Locked" shows rarely on purpose; do you want a looser, less certain line as well? (6) are the words right ("A meal that takes hunger from under 95 to 95 or more", "Still open", "slip")?
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

- A1.1 (the adult header), for the owner after looking at it on a phone: (1) is the header too tall (177 to 221 px; the care buttons go below the fold at 320 x 568 and 360 x 640)? I can make it more compact (for example the
  coins on the first row, or the context line folded into the strip); (2) the care row overflows 28 px sideways at 320 px on `main` (one-line fix, a Kid Mode change: `repeat(5, minmax(0, 1fr))`): fix it in A1.1 or in A1.3? (3) are
  the words right (FOOD, MOOD, ENRG, CLEAN, WELL; "9h left"; the card text)? (4) one gap in the review list: the browser scripts are in my scratchpad, not in the repo: do you want them added (a `tools/e2e/` folder)?
- Installable app (item 5 of Next, once it is merged): install it on a phone and say how the icon, the start screen and the top bar look, and
  whether the red "A new version is ready" notice reads as a warning (it reuses the existing `.notice` look).
- Closed 2026-11-22 (owner: "can apply fix one in this branch"): the 320 px header overflow is fixed in the `pwa-install` branch (item 5 of Next). Do not ask again.

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
   the commit: passwords are stretched in the browser). **Merged by the owner (PR #17 cloud-saves with PR #18 creature-book, then PR #19 with the D1 database id
   `d7dd68cc-5111-48fb-8b3c-af3194162db1` in `wrangler.toml`, 2026-11-21).** The owner ran the migration in the D1 Console (first by pasting
   the file name, which failed; the step in cloud-saves.md now says to paste the SQL text) and set the `SIGNUP_CODE` secret ("done and
   done"). **Checked live 2026-11-22 with fake credentials:** `GET /api/me` answers 401 JSON, a login for an unknown email answers 401 "not
   right" (so the D1 tables are there), a sign up with a wrong code answers 403 "That family code is not right." (so the secret is set).
   One earlier probe of the sign up route answered 500 once, right after the deploy, and never again in 3 more tries; the cause is not
   known (no access to the function logs). **Closed 2026-11-22 (owner, "all done", after the username change below):** the real sign up and the second
   device check. The probes added a few failed tries from this server's address to the rate limit (they expire after 15 minutes).
   **Username instead of email (2026-11-22, owner: "can we just do user id instead of email?", read as a username the family picks):**
   branch `username-login` in ~/broodkeep-cloud; plan section 7 of [cloud-saves.md](cloud-saves.md). **Live and closed 2026-11-22: the owner ran `migrations/0002_username.sql`
   in the D1 Console, merged it (PR #21, `main` b743968) and said "all done".** Checked from here: the live site serves the same JavaScript file as my
   local build (`index-NVgD0mj7.js`), a live login with a made up username answers 401 "That username or password is not right." (not 500, so the
   migration ran), a request with the old `email` field answers 400, and a wrong family code answers 403. The owner's real sign up and second
   device check is taken from their "all done", not seen by me. Plan section 7 of [cloud-saves.md](cloud-saves.md).
   **Status (2026-11-22): built, checked, committed (0775bcc) and pushed to `origin/username-login` on the owner's "commit and push"; the owner merged it as PR #21 after running 0002 in the D1 Console.** `npm run typecheck` and `npm run build` exit 0;
   1279 tests in 24 files pass (`origin/main`: 1270), and 40 full runs in a row had no failure. A cheap-model review, before any test ran, found one
   broken test (my own global replace had turned an email shaped entry of a "refused" list into the valid name `kid`), one title that claimed more
   than it checked, and the Kelvin sign (a letter that lower cases to plain `k`: same account on both sides, now pinned by a test). Mutation
   checks: 104 deliberate breaks, all caught on the tests they should fail, each file restored and compared byte for byte. The first run had one
   survivor, the guard that ignores the server's answer to a send when the player has signed in as someone else meanwhile (an old test gap); a new
   test with a held back answer now catches it (its first version failed for the wrong reason, a racy precondition, which I found by reading the
   failure message and not trusting "caught"). End to end: the three browser script (13 checks) passes against `wrangler pages dev` with a local D1
   after 0001, an old style email row and 0002 were applied in that order (the old row survived); the Username field looks right at 320 and 390 px.
   **Test race found and fixed:** two existing sync tests asserted that the request list was exactly `["GET /api/save"]` right after a timer fired;
   the server answers on a real clock, so the send after the GET can already be there. They failed 4 of 32 full runs on this branch, 0 of 32 on
   `origin/main` (and 1 of 25 file only runs on `origin/main`); they now check only that the first request is the GET, and 40 full runs pass.
   **The owner approved the three reflect edits** ("make the edits and push", 2026-11-22; applied: two rules and an extension in the home CLAUDE.md, and the `accounts` line of this project's CLAUDE.md now says username). `origin/main` had moved (PR #20, the note above) and was merged into the branch; only this file conflicted.
5. **Installable app (Phase 7, first slice; the owner said "go ahead with phase 7", 2026-11-22, read as the install slice first: sound and the desktop layout
   follow as their own slices, and visitor befriending waits for Phase 5's soften mode).** Branch `pwa-install` in ~/broodkeep-cloud (off `main`
   b743968, the username merge), **built and checked, committed and pushed to `origin/pwa-install` on the owner's "commit and push" (2026-11-22, with the header and stat bar fixes below); the owner opens and merges the pull request (https://github.com/cjustin-dev/broodkeep/pull/new/pwa-install)**. What it adds: a web app
   manifest (`pwa-manifest.ts`; standalone, the dusk colour, id and scope `/`), five icons drawn from Blip by `tools/pwa-icons.py` (192, 512, a 512 maskable
   one inside the safe circle, the 180 iPhone one, a 48 favicon), the phone tags in `index.html`, a service worker from vite-plugin-pwa (precache of the
   game's own files only, no runtime caching, `/api/` never answered by it, a typed in path opens the game), a `/sw.js` `no-cache` rule in `_headers`, and an
   "Update now" notice in Settings (a new version waits; the game is saved on the device first, then the upload to the account is started, then the
   page reloads; the hourly check for a new version runs while the app stays open). The page registers the worker from its own script, so the strict
   policy is unchanged. `Game.saveNow()` now returns the write, so the update can wait for it. Decisions: decisions.md "the installable app"; limits:
   known-issues.md "Installable app".
   **Checks (2026-11-22):** `npm run typecheck` and `npm run build` exit 0 (456.7 KB of JavaScript, 84.6 KB gzipped as `vite build` prints them, plus a 5.7 KB piece for the update
   helper; before: 453.0 KB, 83.1 KB); 1298 tests in 25 files pass, three full runs in a row (run again after the second review's fixes, same result) (18 of them in the new `tests/pwa.test.ts`, which runs a real
   build into a temp folder; one more in `tests/game-save-hook.test.ts`); `tools/pwa-icons.py --check` exits 0; the dev server registers no worker and logs
   no console problem. **Mutation checks:** 41 deliberate breaks of the manifest, page tags, headers, build settings, the registration and `saveNow`, each file
   restored and compared (39 caught; the 2 others are equivalent, below; run again on the final tree, same result). The first run had 4 survivors: `registerType: "autoUpdate"` and `injectRegister: "script"` were real gaps (two tests added: the
   config asks for "prompt", the built page loads exactly one script), and removing `cleanupOutdatedCaches: true` or `navigateFallback` changes nothing
   because the plugin defaults to the same values (the explicit lines stay as documentation; breaking them to "off" is caught). **Real browser (headless
   Chromium against `wrangler pages dev` with a local D1, scripts in the session scratchpad, not in the repo):** 21 checks on the first version (files and
   headers, the worker registered and controlling, Chromium's own installability check finds nothing wrong, the manifest parses, the game starts with the
   network off, `/api` is never answered by the worker online or off, a typed in path opens the game, a real sign up works through the worker) and 10 on
   the update (the notice appears, nothing reloads by itself, "Update now" reloads onto the new version, still signed in, a second open window is not
   reloaded), and 4 on two windows (see the second review), no policy violations. **A guard that only a browser run proved:** the page that taps "Update now" reloads itself, other open windows do not
   (`onNeedReload` with a flag in `App.tsx`); without it the library reloads every window that saw the update. My first mutation run of this "survived", which
   was my mistake and not the code's: during an update the windows run the OLD build's code, so the break has to be in the old build. With the guard removed from
   the old build the second window is reloaded and the check fails. **Cheap-model review (before any test ran):** 10 findings. Refuted by a browser run: item 1
   ("Update now never reloads the tapping tab without `clientsClaim`": it does, Chromium fires the controller change without a claim; so `clientsClaim` is
   not added and a test pins that). Accepted and fixed: other windows reload by themselves (item 2, the flag above), the save and the upload were not ordered
   before the reload (item 3: `saveNow` now returns the write and the update waits for it; the upload is a keepalive request that is started, not awaited),
   a test that asserted a string that never appears (item 4), titles that claimed more than they checked (5), brittle regexes (6), a comment pointing at a
   script that is not in the repo (7: it now says the worker is checked by hand), `__pycache__` written by `--check` (9) and a traceback on a corrupt PNG (10). Kept
   as it was: the notice has `role="status"`, not the `alert` the account errors use (item 8: an update is not urgent, so a polite announcement fits). **One
   more fix after the review:** `vite.config.ts` imported `./pwa-manifest` with no extension, which Vite warned would stop working when its config loader
   changes; it now imports `./pwa-manifest.ts` (`allowImportingTsExtensions` in tsconfig).
   **Second cheap-model review (on the final tree, after all of the above):** 6 findings. **Real, reproduced in a browser and fixed:** after one window had
   applied the update, tapping "Update now" in the other did nothing (the library only posts "skip waiting" when a waiting worker exists, and none did): the
   tap now checks for a waiting worker and, if there is none, reloads straight away. The browser run failed 'the second window reloads' before the fix and passes
   after it; with the fallback removed from the old build it fails again on that same check. (My earlier known-issues line, that this tap works, was wrong
   and is corrected.) **Real, fixed cheaply:** "Your game is saved first." was shown even when saving is blocked, so it now shows only when saving works (the
   red warning below it was already there; the reload loses progress then, as closing the page would: known-issues.md). **Fixed:** a test title that claimed
   what only a browser run shows, two doc figures that disagreed (456.5 vs 456.6 KB), "(an adult screen)" for Settings, which has no PIN yet, and a redundant
   `pwa-manifest.ts` entry in tsconfig `include` (Vite's config imports it already; typecheck still exit 0). **Disclosed, kept:** the version label bump, the
   "Loading Broodkeep…" text and the progress.md closure note for the username work (the owner said "all done") were not in the brief; they are in decisions.md
   and can be reverted on request. **Not verified by anyone:** a first visit that never had a controlling worker cannot show the notice at all (a worker with no
   controlled page activates at once), which is why that case is not built for; I did not test it. **Found, not mine, fixed in this branch on the owner's
   word ("can apply fix one in this branch", 2026-11-22):** at 320 px wide the home screen scrolled sideways by 24 px (the header's two gear buttons ended
   at 344 px; the header needs exactly 360 px at its normal sizes, so 360 and 390 were fine). `src/ui/app.css` now has one rule under 360 px
   (`@media (max-width: 359px)`: gear buttons 40 px (they were already 40 at 360 px and reach 46 only from about 372 px up), gaps 6 and 5 px, columns `minmax(0, 1fr)`, 3 px side padding on a stat); 360 px and wider are
   untouched. A scratch script (not in the repo, so not in `npm test`) measured 300, 320, 340, 359, 360 and 390 px, home and Settings open: no sideways scroll,
   both buttons inside the page, all five icons inside their cells (28 px, never scaled), and it fails at 300, 320 and 340 on the old stylesheet (scrollWidth 344).
   Looked at on one sheet at 300, 320, 359 and 360 px. **Cheap-model review of this rule:** 2 findings, both taken. The docs said "46 to 38", but the old layout already gave 40 px at 360 (measured: 40 at 360, 45.5 at 371, 46 from 372), so the gear is now 40 px, which also centres the 28 px icon exactly (in a 38 px button it sat 1 px right of centre: the button's 6 px side padding leaves a 26 px box; measured at 300 to 390 px) and is a slightly bigger touch target (40 x 60). **Found while looking, not mine, fixed on the owner's word ("fix it", 2026-11-22):** a one pixel reddish sliver at the left edge of an empty stat bar, from the fill sliding out at fractional positions (there at 390 px too, where the rule above does not apply). An empty bar now hides its fill once the slide out is done (`.stat[aria-valuenow="0"] .fill`, CSS only). A script reading screenshot pixels at 300 to 412 px and pixel ratios 1, 2 and 3 found a worst deviation of 88 before and 14 after (a sliver is 29 or more, edge anti-aliasing about 16); a browser run checked that a stat with a value shows its fill at once, an emptying one still slides out before hiding, and a refilled one shows again at once. Not checked: anything under 300 px, and a real phone. Not checked: a real phone (the icon's crop,
   the iPhone start screen and status bar, iPhone storage), the free-plan CPU limit and the phone's PBKDF2 time (still the owner's from the cloud saves).
   **After "commit and push" and the owner's merge:** check the live site (the manifest and icons are served, `/sw.js` answers `Cache-Control: no-cache`,
   the JavaScript file matches my build), then the owner installs it on a phone: Android Chrome menu, "Install app"; iPhone Safari, Share, "Add to Home Screen".
6. **Flatten the repo (queued 2026-11-22, the owner: "let's queue for after a1.1 merging"; not started).** The repo holds only `.gitignore` and `creatures/`, a leftover of
   the old template site. Plan: one pull request that moves the contents of `creatures/` to the repo root with `git mv` (history kept) and updates the paths in the docs,
   CLAUDE.md and the hub notes; the owner changes the Cloudflare Pages "Root directory" from `creatures` to blank, timed with the merge (the build fails in between).
   Do it after A1.1 has merged and before the next slice branches, so no open branch has to be rebased. Nothing in the code depends on the folder name.
