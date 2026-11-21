# Broodkeep progress

Plan: [../CLAUDE.md](../CLAUDE.md). Repo: github.com/cjustin-dev/broodkeep. Local clone: ~/broodkeep (hub).

## State (2026-11-21)

**Phase 1, the emotes, Phase 2, happy eyes, the creature redesign and the drawing toolkit are merged** (PR #3 to #6, #8, #9 and
#11, `main` at 5015162; the first four are confirmed live at https://broodkeep.pages.dev, the deploys after that were not checked).
Cloudflare Pages project `broodkeep`, root dir `creatures`, build `npm run build`, output `dist`, builds from `main`. The
owner deletes merged branches on GitHub. Owner feedback so far: the egg shakes on tap (PC and Android), the request for
more emotion (the emotes below), then after seeing the 20 forms: the creatures look dopey and have no character, the
evolutions are "the same circle like mass with some small affections", and the owner wants real changes like Digimon.

**The creature redesign is merged (PR #9, 2026-11-21) and the owner confirmed it is fine** ("the redesign is fine"). See the
redesign section below and [art-direction.md](art-direction.md).

**Phase 3 is being built in four slices** (the owner chose the order and that food stays unlimited): 1) habitat jobs, coins and
the bag (built, pushed on branch `phase-3a-habitat` 2026-11-21, pull request not merged yet), 2) turn-based combat with HP, 3) garden plots, standing chores and
habitat upgrades, 4) the Creature Book and the legacy shelf. See "Phase 3 slice 1" below.

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

## Phase 3 slice 1: the habitat (built and pushed 2026-11-21, branch `phase-3a-habitat`, waiting for the owner to merge)

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

- When slice 1 is on the live site: play the habitat on a phone and report what feels wrong (is 3 to 8 minutes of work about
  right, are the coins and bag worth having before anything can be bought, does the empty room while it is away feel ok). Dev
  mode (gear, tap the version line 7 times) skips the waits and can hatch any form.

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

1. The owner opens and merges the pull request for `phase-3a-habitat` (github.com/cjustin-dev/broodkeep/pull/new/phase-3a-habitat), then plays the habitat.
2. Phase 3 slice 2: turn-based combat (HP and recovery, wild creature ladders, stat gains that feed `battles`, `wins`,
   `strength`, `defense` and `spirit`). Then slice 3 (garden plots, standing chores, habitat upgrades: the first thing coins
   buy) and slice 4 (the Creature Book and the legacy shelf). Phase 3 makes most Champion and Ultimate paths reachable.
3. Tune the tree and job numbers after real play.
   Work on a new branch, never push `main`, and the owner merges the pull request.
