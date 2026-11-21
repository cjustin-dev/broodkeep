# Broodkeep progress

Plan: [../CLAUDE.md](../CLAUDE.md). Repo: github.com/cjustin-dev/broodkeep. Local clone: ~/broodkeep (hub).

## State (2026-11-21)

**Phase 1, the emotes, Phase 2 and happy eyes are merged** (PR #3 to #6 and #8, `main` at 4c4a657; the first four are confirmed
live at https://broodkeep.pages.dev, the happy eyes deploy was not checked).
Cloudflare Pages project `broodkeep`, root dir `creatures`, build `npm run build`, output `dist`, builds from `main`. The
owner deletes merged branches on GitHub. Owner feedback so far: the egg shakes on tap (PC and Android), the request for
more emotion (the emotes below), then after seeing the 20 forms: the creatures look dopey and have no character, the
evolutions are "the same circle like mass with some small affections", and the owner wants real changes like Digimon.

**The creature redesign is built on branch `creature-redesign` (pushed 2026-11-21, pull request for the owner to open and merge).** The owner
approved the concept sheet on 2026-11-21. See the redesign section below and [art-direction.md](art-direction.md).

What Phase 1 contains (plan section 9): egg with tap-to-hatch, six care stats, feeding (4 foods, candy makes it ill),
poop and cleaning, night sleep by the clock plus naps, sickness and medicine, calls for attention, offline catch-up,
death and a new egg, idle behaviours, tap reactions (poke, pet, tickle), a settings panel (sleeping hours) and a dev panel
(7 taps on the version line). One fixed room. Saves on the device only (IndexedDB). Design choices are in
[decisions.md](decisions.md), accepted gaps in [known-issues.md](known-issues.md).

Phase 1 checks: typecheck, tests and build exit 0, a cheap-model review that found 5 real defects (all fixed), and the
built game driven in a headless phone browser through the whole flow with no console errors. Not checked: a real phone,
and iOS Safari save-on-close.

## Creature redesign (branch `creature-redesign`, built and pushed 2026-11-21)

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

- Open and merge the pull request for `creature-redesign` (https://github.com/cjustin-dev/broodkeep/pull/new/creature-redesign), then play on a phone and report what feels wrong
  (how the creatures look, whether the two-drawing animation pace feels right, the happy eyes). Dev mode (gear, tap the
  version line 7 times) skips the waits and can hatch any form.
- Decide whether the Python drawing toolkit goes into the repo (`creatures/tools/art/`). It is not there now.
- Add GitHub branch protection on `main`. The hub's deploy key can push any branch.

## Facts that are easy to get wrong

- Pages `_headers` does not apply to Functions responses, so `functions/_lib/response.ts` must set headers itself.
- Workers may cap PBKDF2 at 100,000 iterations (reported, not confirmed in primary docs). Check before Phase 5.
- Unknown paths return `index.html` with 200 (SPA fallback). Once Functions exist, unknown API routes should return a JSON 404.
- Pages "Retry deployment" rebuilds the OLD commit. After a merge, look for the new deployment instead.
- The Workers setup flow shows a "Deploy command" box; the Pages flow does not. This project is Pages.
- `SESSION_SECRET` in `.dev.vars.example` is only an example name. Phase 5 decides what is really needed.
- More in [known-issues.md](known-issues.md) and [decisions.md](decisions.md).

## Next

1. Owner opens and merges the `creature-redesign` pull request, then plays on a phone and reports. Fix what feels wrong (pace of the second
   drawing, a bigger bed or blanket, creatures that still look dopey, shut eyes on dark bodies).
2. Collect the owner's feedback on the emotes and the redesign, and tune the tree numbers after real play.
3. Phase 3 (habitat, jobs, turn-based combat, coins, the Creature Book) only after that. It makes most Champion and
   Ultimate paths reachable.
   Work on a new branch, never push `main`, and the owner merges the pull request.
