# tools/verify: browser checks and mutation runs (Retire, A1.4; habitat cards and call back, A2.1; the shop, A2.2a; the shop's foods, A2.2b; the request board, A2.3; the home, H0 and H1)

These scripts are not part of the game, the build or `npm test`. They check the Retire card in the Creature Book (A1.4) and the habitat's spot
card, job card and call back (A2.1), the shop (A2.2a), its foods in the Feed tray (A2.2b) and the request board (A2.3) on a real browser, and check the checks: a mutation run breaks the code on purpose and the named check must fail. What they found and how often they were run is
in docs/progress.md (A1.4) and the reasons for them in docs/decisions.md.

Everything they make (saved games, screenshots, builds, copies, logs) goes to `$VERIFY_OUT`, which is `<system temp>/broodkeep-verify`
unless you set it. Nothing is written into the repo.

Playwright is not a dependency of the game. The scripts take it from `~/homelab-dashboard/node_modules`; set `PLAYWRIGHT_FROM` to another
`package.json` that sits beside a `node_modules` with `playwright` (and its Chromium) to use a different one.

| File | What it is |
|---|---|
| `gen-saves.sh`, `gen-saves.ts` | Writes the 16 saved games the checks start from (8 scenarios: adult at home, young, a Land kid that owns nothing, a Land kid whose save holds a request board, away, in a fight, egg, a list of lives; each in Kid and Adult Mode). The run scripts call it themselves each time, so the saves follow `src/game/state.ts`. |
| `run-browser.sh`, `retire-browser.mjs` | The checks (21 ids) against `dist/`, with real clicks and a frozen clock, at 320, 360 and 390 wide, pixel ratio 1 and 2, in both modes. Extra arguments go to the checker: `--only btn-look,face-slot`, `--sizes 360x640@2`, `--modes kid`. Exit 0 all passed, 1 a check failed, 2 the run could not start. |
| `mutate-retire-unit.py` | Mutation run for the rules (`src/game/retire.ts`, `actions.ts`, `state.ts`): each mutant must fail its named test in `tests/retire.test.ts`. Works on a copy. |
| `mutate-retire-ui.py` | Mutation run for the screen: each mutant is rebuilt and served, and only the check ids it must break are run. `--check-targets` proves every `old` text occurs exactly once without running anything. Works on a copy; needs ports 4180 to 4189 free. |
| `run-kid.sh`, `kid-compare.mjs` | Kid Mode must not change: builds a ref (default `origin/main`, which a stale local `main` is not), compares computed styles, text and positions of every Kid page (adult, young, kid, away, egg) of both builds, at pixel ratio 1 and 2, and proves it can see a difference (`--selftest`) and sees none when the same build is compared with itself. |
| `run-sheet.sh`, `sheet-retire.mjs`, `stitch-sheets.py` | The contact sheet: every state of the section at the three widths in one picture each (`$VERIFY_OUT/sheets/sheet-<W>x<H>.png`). Look at it before trusting any layout check. |
| `gen-saves-habitat.sh`, `gen-saves-habitat.ts` | Writes the 22 saved games of the habitat checks (`saves/hab-<scenario>-<mode>.json`: a creature at home at each stage, tired, napping, sick, and away at four spots, each in Kid and Adult Mode). The habitat run scripts call it themselves. |
| `run-habitat.sh`, `habitat-browser.mjs` | The habitat checks (18 ids) against `dist/`: the spot card and its two taps, shut spots and their reasons, the job card moving with a frozen clock, the call back's pay and its words, layout at 320, 360 and 390 wide at pixel ratio 1 and 2, buttons with their own fill and edge, and Kid Mode unchanged. Same flags and exit codes as `run-browser.sh`. |
| `mutate-habitat-unit.py` | Mutation run for the call back rules and the cards' words (`src/game/habitat/jobs.ts`, `cards.ts`, `actions.ts`): each mutant must fail its named test in `tests/callback.test.ts`. Same use as `mutate-retire-unit.py`. |
| `mutate-habitat-ui.py` | Mutation run for the habitat screen: each mutant is rebuilt and served on port 4180 and only its named check ids are run. `--check-targets` proves every `old` text occurs exactly once. Works on `$VERIFY_OUT/habitat-ui-copy`. |
| `run-sheet-habitat.sh`, `sheet-habitat.mjs`, `stitch-habitat.py` | The habitat contact sheet: 21 states (every spot's card, the shut cards, the job cards, the welcome-back cards, Kid Mode) at three widths, as `$VERIFY_OUT/sheets-habitat/sheet-<W>x<H>-<group>.png`. It prints each page's height against the window's. Look at it before trusting any check. |
| `gen-saves-shop.sh`, `gen-saves-shop.ts` | Writes the 18 saved games of the shop checks (`saves/shop-<scenario>-<mode>.json`: rich, poor, mixed, exact-meadow, one-short-meadow, long-name, owned-walls, owned-all, just-bought, each in Kid and Adult Mode). The shop run scripts call it themselves. |
| `run-shop.sh`, `shop-browser.mjs` | The shop checks (14 ids) against `dist/`: the fourth nav button, opening and closing, buying at exactly the price, a refused buy, two taps on one Buy, the 10 second undo moving with a frozen clock, the preview and the live room drawn against literal pixel colours, the HUD's Mood line with the Comfy Bed, a reload, layout at 320, 360 and 390 wide at pixel ratio 1 and 2, and buttons with their own fill and edge. Output: `$VERIFY_OUT/shop-browser.out`. |
| `mutate-shop-unit.py` | Mutation run for the shop rules and what they change (`src/game/shop.ts`, `perks.ts`, `care.ts`, `growth.ts`, `actions.ts`, `availability.ts`, `hud.ts`, `forecast.ts`, `state.ts`, `src/data/shop.ts`, `tuning.ts`, `src/sync/sync.ts`): 42 mutants, each must fail its named test in `tests/shop.test.ts`. `--list` proves every `old` text occurs exactly once. |
| `mutate-shop-ui.py` | Mutation run for the shop screen: 34 mutants, each rebuilt and served on port 4180 and only its named check ids are run. `--check-targets` proves every `old` text occurs exactly once. Works on `$VERIFY_OUT/shop-ui-copy`. |
| `run-sheet-shop.sh`, `sheet-shop.mjs`, `stitch-shop.py` | The shop contact sheet (every wallet and ownership state, the four looks of the room, Kid and Adult Mode) at three widths, as `$VERIFY_OUT/sheets-shop/sheet-<W>x<H>-<group>.png`. It has no assertions: look at it before trusting any layout check. |
| `run-income.sh`, `income.ts` | Measures what a day of play earns (14 simulated days of an adult under six kinds of player, and under three of them who also answer the request board (`-board` rows: requests a day and coins a day), with the real rules) so the shop's prices come from numbers. Read-only: it prints coins and materials a day for each player. |
| `gen-saves-dishes.sh`, `gen-saves-dishes.ts` | Writes the 38 saved games of the dish checks (`saves/dishes-<scenario>-<mode>.json`: 19 scenarios, each in Kid and Adult Mode: a Land kid owning nothing, one dish or all five, hungry, full, about to grow up; a Water and a Sky kid; a young, an adult, the special and a baby that own all five; the shop's wallets). |
| `run-dishes.sh`, `dishes-browser.mjs` | The dish checks (12 ids, 19 runs per window size) against `dist/`: the second Feed tray row and its corner marks, no row for a creature that is not a kid, a single dish's size, eating a dish and what it counts, a full creature, a stale tap after growing up (Adult and Kid), buying and undoing in the shop, the preview, a reload, the tray's fit (the row adds 76 px, the care row stays reachable, the food row's 4 px baseline at 320) and the five food cards in four shop states. Has a `trap` that stops the preview server. |
| `mutate-dishes-unit.py` | Mutation run for the dish rules (30 mutants over `dishes.ts`, `availability.ts`, `actions.ts`, `growth.ts`, `forecast.ts`, `shop.ts` and `data/shop.ts`); each names the test, in `tests/dishes.test.ts` or `tests/shop.test.ts`, that must fail. `--list` checks every `old` text occurs once. |
| `mutate-dishes-ui.py` | Mutation run for the dish screen: 32 mutants, each rebuilt and served on port 4180 and only its named check ids run (a mutant may name its own window size). `--check-targets` proves every `old` text occurs exactly once and prints the table. |
| `run-sheet-dishes.sh`, `sheet-dishes.mjs`, `stitch-dishes.py` | The dish contact sheet (21 states: the tray with and without dishes, the Water and Sky trays in Adult Mode, a young and the special, a full creature, after a meal, the shop with the foods) at three widths. Look at it before trusting a layout check. |
| `gen-saves-board.sh`, `gen-saves-board.ts` | Writes the saved games of the request board checks and sheet (`saves/board-<scenario>-<mode>.json`: three, types-b, stale, longest, done, empty, undo-pending, rich, live-feed, each in Kid and Adult Mode, the Kid file holding the same board). |
| `run-sheet-board.sh`, `sheet-board.mjs`, `stitch-board.py` | The request board contact sheet (the Items tab as it opens, scrolled to its end and with the Undo bar, as the window shows it, seven Requests states, the room with a saved board in both modes) at three widths, as `$VERIFY_OUT/sheets-board/sheet-<W>x<H>-<group>.png`. No assertions: look at it first. A console or page error in a state counts as an error. |
| `run-board.sh`, `board-browser.mjs` | The board checks (10 ids) against `dist/`: the tab (default, keys, focus, undo on both tabs), every card as literal text, fit (Range, no sideways scroll, also the list's), taps (44 px, no button in a card), the Shop panel's scroll layout (`shop-scroll`: only the list scrolls under a real wheel, the title, tabs, room picture and Undo bar stay, a tap deep in the list changes the room picture), the same by touch (`shop-touch`, in a mobile window with real touch events: a finger scrolls only the list, a finger on the title, tabs, room picture or Undo bar moves nothing, also not the home page behind the panel, a tap and a flick; it also runs a phone on its side), the same page-behind check for the other four panels (`panel-touch`, both modes: a finger scrolls Settings, the Creature Book, the Growth Forecast and Developer mode, and a drag up in one, past its end and down at its top leaves the home page behind where it was), a request finished by two real meals (coins 12 to 14, the card, one log line) and a slot drawn again 15 minutes after, the note over the room and its 6 seconds, and Kid Mode (nothing shown, nothing counted, nothing drawn). Six window configurations (`shop-touch` has five of its own, two on their side, and `panel-touch` three, one on its side; `--sizes` overrides). |
| `mutate-board-unit.py` | Mutation run for the board rules (70 mutants over `requests.ts`, `board.ts`, `actions.ts`, `jobs.ts`, `fight.ts`, `ui/game.ts`); each names the test, in `tests/requests.test.ts` or `tests/game-note.test.ts`, that must fail. `--list` proves every `old` text occurs once. |
| `mutate-board-ui.py` | Mutation run for the board screen and the Shop panel's scroll layout: 35 mutants (`--only id1,id2` runs some of them after the same baselines), each rebuilt and served on port 4181 and only its named check ids run (a mutant may name its own window size; the clean build is then also run at that size first, so a 320-only mutant has a clean control at 320). `--check-targets` proves every `old` text occurs once. Same machinery as `mutate-shop-ui.py`. |
| `nav-mock.mjs` | Measures the room each word has in a four- and a five-button nav row at 320, 360 and 390 wide (ratio 1 and 2) with the real `app.css`: the figure behind putting the board in the shop as a tab (Habitat has 0.8 px to spare in a fifth button at 320). No assertions. |
| `home-mock.html`, `home-mock.mjs`, `run-home-mock.sh` | Home H0, the mock (no game code): a three-room top-down home drawn with the real creatures at tile 16 and 24 and at phone widths, as sheets in `$VERIFY_OUT/sheets-home/`. Kept because the plan's numbers (tiles across the picture, the zoom steps) came from it. |
| `run-home.sh`, `home-browser.mjs` | The home checks (8 ids: `home-open`, `home-pan`, `home-pinch`, `home-find`, `home-pet`, `home-asleep`, `home-keys`, `home-mouse`) against `dist/`, with real touch events (CDP `Input.dispatchTouchEvent`, a few pixels at a time), a real mouse and real keys, at 320x568@2, 360x640@2, 390x844@3 and 360x640@1 in both modes, plus 1024x768@1 for the keys and the mouse. The camera is read from the canvas's own pixels (the wall's stripes), never from a number the game shows. Extra arguments: `--only id1,id2 --sizes 360x640@2 --modes adult`. Output: `$VERIFY_OUT/home-browser.out`; exit 0 all passed, 1 a check failed, 2 the run could not start. |
| `mutate-home-ui.py` | Mutation run for the home's screen side (the camera, the gestures, the Find button, the touch rules, the walk to bed): each mutant is rebuilt and served on port 4182 and only its named check ids run at 360x640@2. `--check-targets` proves every `old` text occurs exactly once; `--only id1,id2` runs some. Works on `$VERIFY_OUT/home-ui-copy`. |
| `mutate-home-unit.py` | Mutation run for the home's pure rules (`src/art/home.ts`, `camera.ts`, `src/ui/gesture.ts`, `src/art/idle.ts`): each mutant must fail its named test in `tests/home.test.ts`, `camera.test.ts`, `gesture.test.ts` or `idle-home.test.ts` (only those four files run per mutant). `--list` checks every `old` occurs once. Works on `$VERIFY_OUT/home-unit-copy`. |
| `run-sheet-home.sh`, `sheet-home.mjs`, `stitch-home.py` | The home contact sheet (the states, the camera at each end and zoom, the pages round the picture) at three widths, as `$VERIFY_OUT/sheets-home-h1/sheet-<W>x<H>-<group>.png` (its own folder: the mock writes to `sheets-home/`). It has no assertions: look at it first. |
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

# the shop (A2.2a), the same order; run-income.sh is the price measurement
tools/verify/run-sheet-shop.sh
tools/verify/run-shop.sh
python3 tools/verify/mutate-shop-unit.py
python3 tools/verify/mutate-shop-ui.py

# the shop's foods (A2.2b), the same order
tools/verify/run-sheet-dishes.sh
tools/verify/run-dishes.sh
python3 tools/verify/mutate-dishes-unit.py
python3 tools/verify/mutate-dishes-ui.py
tools/verify/run-kid.sh

# the request board (A2.3), the same order; run-income.sh also prints the board players (the reward numbers)
tools/verify/run-sheet-board.sh
tools/verify/run-board.sh
python3 tools/verify/mutate-board-unit.py
python3 tools/verify/mutate-board-ui.py
tools/verify/run-kid.sh

# the home (H1), the same order; the home run needs `npm run build` first
tools/verify/run-sheet-home.sh
tools/verify/run-home.sh
python3 tools/verify/mutate-home-unit.py
python3 tools/verify/mutate-home-ui.py
tools/verify/run-kid.sh
```

A new check or mutant counts only after the matching mutant failed it on its own assertion (read the failure text), and each check id needs
at least one mutant. When the feature changes, the literals in `retire-browser.mjs` (the words, the dates, the counts) are changed by hand:
they are copied from the rules on purpose, so a changed rule fails here instead of passing by itself.
