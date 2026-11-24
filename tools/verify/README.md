# tools/verify: browser checks and mutation runs (Retire, A1.4; habitat cards and call back, A2.1)

These scripts are not part of the game, the build or `npm test`. They check the Retire card in the Creature Book (A1.4) and the habitat's spot
card, job card and call back (A2.1) on a real browser, and check the checks: a mutation run breaks the code on purpose and the named check must fail. What they found and how often they were run is
in docs/progress.md (A1.4) and the reasons for them in docs/decisions.md.

Everything they make (saved games, screenshots, builds, copies, logs) goes to `$VERIFY_OUT`, which is `<system temp>/broodkeep-verify`
unless you set it. Nothing is written into the repo.

Playwright is not a dependency of the game. The scripts take it from `~/homelab-dashboard/node_modules`; set `PLAYWRIGHT_FROM` to another
`package.json` that sits beside a `node_modules` with `playwright` (and its Chromium) to use a different one.

| File | What it is |
|---|---|
| `gen-saves.sh`, `gen-saves.ts` | Writes the 12 saved games the checks start from (adult at home, young, away, in a fight, egg, a list of lives, each in Kid and Adult Mode). The run scripts call it themselves each time, so the saves follow `src/game/state.ts`. |
| `run-browser.sh`, `retire-browser.mjs` | The checks (21 ids) against `dist/`, with real clicks and a frozen clock, at 320, 360 and 390 wide, pixel ratio 1 and 2, in both modes. Extra arguments go to the checker: `--only btn-look,face-slot`, `--sizes 360x640@2`, `--modes kid`. Exit 0 all passed, 1 a check failed, 2 the run could not start. |
| `mutate-retire-unit.py` | Mutation run for the rules (`src/game/retire.ts`, `actions.ts`, `state.ts`): each mutant must fail its named test in `tests/retire.test.ts`. Works on a copy. |
| `mutate-retire-ui.py` | Mutation run for the screen: each mutant is rebuilt and served, and only the check ids it must break are run. `--check-targets` proves every `old` text occurs exactly once without running anything. Works on a copy; needs ports 4180 to 4189 free. |
| `run-kid.sh`, `kid-compare.mjs` | Kid Mode must not change: builds a ref (default `origin/main`, which a stale local `main` is not), compares computed styles, text and positions of every Kid page of both builds, at pixel ratio 1 and 2, and proves it can see a difference (`--selftest`) and sees none when the same build is compared with itself. |
| `run-sheet.sh`, `sheet-retire.mjs`, `stitch-sheets.py` | The contact sheet: every state of the section at the three widths in one picture each (`$VERIFY_OUT/sheets/sheet-<W>x<H>.png`). Look at it before trusting any layout check. |
| `gen-saves-habitat.sh`, `gen-saves-habitat.ts` | Writes the 22 saved games of the habitat checks (`saves/hab-<scenario>-<mode>.json`: a creature at home at each stage, tired, napping, sick, and away at four spots, each in Kid and Adult Mode). The habitat run scripts call it themselves. |
| `run-habitat.sh`, `habitat-browser.mjs` | The habitat checks (18 ids) against `dist/`: the spot card and its two taps, shut spots and their reasons, the job card moving with a frozen clock, the call back's pay and its words, layout at 320, 360 and 390 wide at pixel ratio 1 and 2, buttons with their own fill and edge, and Kid Mode unchanged. Same flags and exit codes as `run-browser.sh`. |
| `mutate-habitat-unit.py` | Mutation run for the call back rules and the cards' words (`src/game/habitat/jobs.ts`, `cards.ts`, `actions.ts`): each mutant must fail its named test in `tests/callback.test.ts`. Same use as `mutate-retire-unit.py`. |
| `mutate-habitat-ui.py` | Mutation run for the habitat screen: each mutant is rebuilt and served on port 4180 and only its named check ids are run. `--check-targets` proves every `old` text occurs exactly once. Works on `$VERIFY_OUT/habitat-ui-copy`. |
| `run-sheet-habitat.sh`, `sheet-habitat.mjs`, `stitch-habitat.py` | The habitat contact sheet: 21 states (every spot's card, the shut cards, the job cards, the welcome-back cards, Kid Mode) at three widths, as `$VERIFY_OUT/sheets-habitat/sheet-<W>x<H>-<group>.png`. It prints each page's height against the window's. Look at it before trusting any check. |
| `lib.sh` | Shared by the run scripts: where output goes, and a server that refuses a port that already answers. |

## The usual order

```
npm run typecheck && npm test && npm run build
tools/verify/run-sheet.sh        # look at the pictures first
tools/verify/run-browser.sh      # all checks, all sizes, both modes
python3 tools/verify/mutate-retire-unit.py
python3 tools/verify/mutate-retire-ui.py
tools/verify/run-kid.sh          # needs git history with main

# the habitat cards (A2.1), the same order
tools/verify/run-sheet-habitat.sh
tools/verify/run-habitat.sh
python3 tools/verify/mutate-habitat-unit.py
python3 tools/verify/mutate-habitat-ui.py
```

A new check or mutant counts only after the matching mutant failed it on its own assertion (read the failure text), and each check id needs
at least one mutant. When the feature changes, the literals in `retire-browser.mjs` (the words, the dates, the counts) are changed by hand:
they are copied from the rules on purpose, so a changed rule fails here instead of passing by itself.
