# Broodkeep progress

Plan: [../CLAUDE.md](../CLAUDE.md). Repo: github.com/cjustin-dev/broodkeep. Local clone: ~/broodkeep (hub).

## State (2026-11-21)

**Phase 1 and the emotes are merged and LIVE at https://broodkeep.pages.dev** (PR #3, #4 and #5, `main` at c6cb54f). Cloudflare
Pages project `broodkeep`, root dir `creatures`, build `npm run build`, output `dist`, builds from `main`. The owner deletes
merged branches on GitHub. Owner feedback so far: the egg shakes on tap (PC and Android), then the request for more emotion
(the emotes below). Nothing reported yet on how the emotes feel on a real phone.

**Phase 2 is built on branch `phase-2-forms` (not pushed).** All 20 forms, the full evolution tree, a dev tree viewer and
the hatch and evolve scenes. See the Phase 2 section below.

What Phase 1 contains (plan section 9): egg with tap-to-hatch, six care stats, feeding (4 foods, candy makes it ill),
poop and cleaning, night sleep by the clock plus naps, sickness and medicine, calls for attention, offline catch-up,
death and a new egg, idle behaviours, tap reactions (poke, pet, tickle), a settings panel (sleeping hours) and a dev panel
(7 taps on the version line). One fixed room. Saves on the device only (IndexedDB). Design choices are in
[decisions.md](decisions.md), accepted gaps in [known-issues.md](known-issues.md).

Phase 1 checks: typecheck, tests and build exit 0, a cheap-model review that found 5 real defects (all fixed), and the
built game driven in a headless phone browser through the whole flow with no console errors. Not checked: a real phone,
and iOS Safari save-on-close.

## Phase 2: all 20 forms (branch `phase-2-forms`, not pushed)

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

- Play Phase 1 on a phone and report what feels wrong. Dev mode (gear, tap the version line 7 times) skips the waits.
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

1. Owner says "push it" for `phase-2-forms`, opens the pull request and merges it, then plays the new creatures and the
   scenes (dev mode: Evolve to it, or the Hatch this form button, shows every form and the scenes).
2. Collect the owner's feedback on the emotes and on Phase 2, and fix it. Tune the tree numbers after real play.
3. Phase 3 (habitat, jobs, turn-based combat, coins, the Creature Book) only after that feedback. It makes most Champion
   and Ultimate paths reachable.
   Work on a new branch, never push `main`, and the owner merges the pull request.
