# Broodkeep progress

Plan: [../CLAUDE.md](../CLAUDE.md). Repo: github.com/cjustin-dev/broodkeep. Local clone: ~/broodkeep (hub).

## State (2026-11-20)

**Phase 1 is merged (PR #3, `main` at d94c749) and LIVE at https://broodkeep.pages.dev.** The live page serves the same
asset file names as the local build (`index-CbvsJsE3.js`, `index-C5ifZwfL.css`). Cloudflare Pages project `broodkeep`,
root dir `creatures`, build `npm run build`, output `dist`, builds from `main`. The owner deleted the merged branches on
GitHub; `main` is the only branch there. Owner feedback so far: on a PC browser and an Android browser the egg shakes when
tapped. Nothing else reported yet.

What Phase 1 contains (plan section 9): egg with tap-to-hatch, six care stats, feeding (4 foods, candy makes it ill),
poop and cleaning, night sleep by the clock plus naps, sickness and medicine, calls for attention, offline catch-up,
death and a new egg, idle behaviours, tap reactions (poke, pet, tickle), a settings panel (sleeping hours) and a dev panel
(7 taps on the version line). Three placeholder forms: Blip, Pip, Fennix. One fixed room. Saves on the device only
(IndexedDB). Design choices are in [decisions.md](decisions.md), accepted gaps in [known-issues.md](known-issues.md).

Checks run on the final code: `npm run typecheck`, `npm test` (103 tests, 7 files) and `npm run build` all exit 0. The
bundle is 49 KB JS (18 KB gzip) and 5.6 KB CSS. 12 deliberate code mutations on the simulation were all caught by tests.
The built game was driven in a headless phone browser (390 x 844, 3x, fake clock) through egg, hatch, reload, feeding,
hungry call, night, death, new egg, settings, dev panel and a desktop view, with no console errors or CSP violations. The
impeccable design detector reports nothing on the UI files. A cheap-model fresh-eyes review of the UI found 5 real
defects, all fixed (see decisions.md). Two of them (second finger, failed read) have a browser check that fails on the old
code and passes on the new.

Not checked by me: hatching, feeding and the other screens on a real phone, and iOS Safari save-on-close.

## Emotes (branch `creature-emotes`, not pushed)

Owner feedback after the first playtest: more visible emotion for small children. Built the three things asked for:
food appears and the creature eats it bite by bite (eyes shut while chewing, then a heart and a hop); asleep (and dead)
it lies flat with eyes shut instead of standing with open eyes; saying no is eyes shut and a slow gentle sway, with the
old quick rattle kept only for a tapped egg. Design notes in [decisions.md](decisions.md), accepted gaps in
[known-issues.md](known-issues.md).

Checks: typecheck, 120 tests (17 new) and build exit 0. 17 deliberate code mutations on the new code were all caught (one
was first missed because a test only looked at the end state, and was fixed). The built game was driven in a headless
phone browser through eating, refusing, a Blip, Pip and Fennix asleep and a dead Fennix, with no console errors.
A cheap-model review found 3 real issues (meal not cancelled by death, food position not on a whole pixel, missing
tests), all fixed. Not checked: a real phone, and the sway as motion (tests cover its size and speed, the pictures are
stills).

## Open for the owner

- Play Phase 1 on a phone and report what feels wrong. Dev mode (gear, tap the version line 7 times) skips the waits.
- `LICENSE` at the repo root is the old template author's MIT notice. It could read as the game's license. Keep, replace
  or remove?
- Plan sections 1 and 2 and the handoff notes still describe the old site and say "do not touch the repo root". Update
  the plan to match, or leave as history?
- Add GitHub branch protection on `main`. The hub's deploy key can push any branch.
- Confirm the old Cloudflare project (`kharbranth`) is deleted. It is disposable.

## Facts that are easy to get wrong

- Pages `_headers` does not apply to Functions responses, so `functions/_lib/response.ts` must set headers itself.
- Workers may cap PBKDF2 at 100,000 iterations (reported, not confirmed in primary docs). Check before Phase 5.
- Unknown paths return `index.html` with 200 (SPA fallback). Once Functions exist, unknown API routes should return a JSON 404.
- Pages "Retry deployment" rebuilds the OLD commit. After a merge, look for the new deployment instead.
- The Workers setup flow shows a "Deploy command" box; the Pages flow does not. This project is Pages.
- `SESSION_SECRET` in `.dev.vars.example` is only an example name. Phase 5 decides what is really needed.
- More in [known-issues.md](known-issues.md) and [decisions.md](decisions.md).

## Next

1. Owner reviews the emotes (after a push and merge), and picks which of the suggested extra emotes, if any, to add.
2. Collect the owner's Phase 1 feedback and fix it. Phase 2 (all 20 forms, full evolution tree, dev tree viewer) only
   after that feedback.
   Work on a new branch, never push `main`, and the owner merges the pull request.
