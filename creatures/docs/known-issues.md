# Broodkeep known issues and gotchas

> 2026-11-21: sections below that talk about the 20 forms, the old evolution tree, the old 16 to 32 pixel sizes or the 96 pixel
> room are history. The Paradise growth design (docs/paradise-plan.md, milestone 3) replaced them; the live list is
> "Paradise growth, game side" at the end of this file.

## Cloudflare Pages

- **`_headers` does not apply to Functions responses.** Only static files get them. `functions/_lib/response.ts` must set
  `Cache-Control: no-store`, nosniff and the other security headers itself.
- **Unknown paths return `index.html` with status 200.** Seen live: `/api/anything` returns the placeholder page. Once
  Functions exist, unknown API routes should return a JSON 404.
- **"Retry deployment" rebuilds the OLD commit.** After merging a fix, look for the new deployment for the merge commit.
  Retrying the failed row fails the same way (seen 2026-11-20: `Cannot find cwd: /opt/buildhome/repo/creatures`).
- **Two setup flows.** The Workers flow shows a "Deploy command" box (`npx wrangler deploy`). The Pages flow does not.
  This project is Pages. If you see a deploy command, you are in the wrong flow.
- **The project builds from `main`.** `creatures/` must be on `main` before the first build can pass.
- **Renaming the GitHub repo does not rename the Cloudflare label.** The old project kept showing `kharbranth`. Cloudflare's
  docs do not cover renames. Moot now, the old project was deleted.

## Phase 1 game (accepted for now)

- **Dev mode has no PIN.** Settings, then tap the version line 7 times opens it. The plan wants an adult PIN, but accounts
  and PINs arrive in Phase 5. Until then a child can open it.
- **Food and medicine are unlimited.** There is no inventory until the habitat and crafting phases.
- **Bedtime uses the device clock** (`hourOf` uses local time). Travelling or changing timezone moves bedtime. Revisit
  with profiles in Phase 5.
- **Off-grid `bornAt` on a tap hatch.** `tapEgg` calls `hatchIfReady` with the tap's exact time, so a hatch by tap can
  stamp `bornAt` between simulated minutes. Under a minute, harmless, but it is the one place "identical save however
  time is split" is not strictly true.
- **The egg has no visible "tap me" hint.** Only the screen reader label says it. Easy to add if testers do not find it.
- **Desktop shows the phone column** (480 px max). Real desktop layout is Phase 7 in the plan.
- **The call bubble blinks** (hidden half a second in every two). Intended. Ask testers whether it feels nagging.
- **Not usable without touch or a mouse (accessibility, reported by the review, not built).** In the egg phase the only
  way to help it hatch is a pointer on the canvas. Petting and tickling also need a pointer. The food tray comes before
  the Feed button in tab order and focus does not move into it. Settings and Dev panels have no Escape key, no focus
  return to the gear and do not block the page behind them. Fine for a phone game, worth doing in Phase 7.
- **Dev "Hatch this form now" and "New egg" replace a living creature without asking.** Dev only.

## Emotes (accepted for now)

- **"Squash" is really a one pixel shift.** `drawSprite`'s `height` option drops whole rows, and these sprites have an
  empty bottom row, so the awake breathing bob and the chewing bob are just the sprite moving down one pixel. Real squash
  frames would need hand-drawn pictures, which Phase 2 did not add (the emotes stay derived from one picture per form). The lying-down picture is separate and is a true flat shape.
- **One meal at a time.** Feeding again during a meal replaces the food on the floor and restarts the eating.
- **The mouth only changes for a yawn.** A sad creature has the same small mouth as a happy one, the sadness is in the
  heavy eyelids, the slump and the tears. Eyes only look up (at falling food) or stay as drawn, there is no looking around.
- **The slumped yawn mouth is a wide red oval** (the mouth grows with the widened body), and reads as a small plus sign at
  a glance. Hand-drawn frames would fix it.
- **Sick shows as droop, green tint and sway.** There is no separate "sick" face, and a sad and sick creature look alike
  apart from the tears.
- **The feelings use fixed cut-offs** (hungry under 25, sleepy under 25, sad under 30), the same idea as the red part of the
  stat bars. They are in `moodOf` in `scene.ts`.
- **The blanket sits on top of the bed,** it is a pink rectangle, not a drawing that follows the creature's shape.
- **Happy eyes last only as long as the happy hop (0.8 s).** That is when the look shows, so after a meal, a pet, a
  clean, a cure, a hatch or an evolve it is a short flash of joy, not a lasting mood. The hatch and evolve scenes draw
  their own open-eyed picture, so the arches show after the pop, not during it. On a sad creature the happy look is
  slumped and has no tears while it lasts (that is drawing code in `scene.ts`, so no test covers it). Checked as stills (all 20 forms, standing and slumped) and in a headless phone
  browser after a meal, not on a real phone.

## Phase 2: forms, tree and scenes (accepted for now)

- **Most Champion and Ultimate paths cannot fire in normal play yet.** Their rules use training, battles, jobs and trained
  stats (strength, defense, spirit) and discipline, which do not exist until Phase 3 and later, so those numbers read 0.
  Today a creature takes the rules that use care mistakes, feeding and happiness, and otherwise the fallback path. Dev mode
  can set the missing numbers (Dev panel, "Numbers for later systems"). The tree viewer marks every such rule "not in the
  game yet".
- **A fully attentive player gets the same few forms.** With care alone: Blip or Drip, Pip, then Fennix or Mothlet,
  then Lumiwing, then Aurelith. The other branches need Phase 3 or neglect.
- **All numbers in the tree are first guesses** (thresholds, and 6, 24, 72, 120 hours per stage from the plan). Example: a
  baby can only eat about 3 to 4 foods in 6 hours without candy, so "lots of feeding" (5 foods) needs a little candy.
  Tune them in the form files after real play.
- **Discipline has no way to rise.** The stat exists and the tree reads it (Citadrake), but nothing changes it, so it sits
  at 50 unless dev mode moves it.
- **Some pictures are plain.** Thornback's spikes are small, Smudge reads as a grumpy blob more than smoke, and Bastion and
  Citadrake have blocky towers. Checked as stills only. All 20 were also checked standing, sad and asleep in the room.
- **The hatch and evolve scenes have no automated drawing tests.** The timing and state are tested, the drawing was checked
  by eye on frames from a headless phone browser, not on a real phone. They do not stop for `prefers-reduced-motion`, like
  the rest of the canvas motion. The flash is one fade at 80% white, and the old form flickers 2 to 5 times a second.
- **An evolution while the app was closed plays its scene when the app opens,** from the form on screen when it was last
  open to the form it is now. If it grew through two stages while away, the scene shows the first form turning into the last.
- **A creature that evolves in its sleep gets no scene,** it simply is the new form when it wakes. Dev "Hatch this form
  now" and "Evolve to it" play the scenes (handy for looking at them), except "Hatch" on a dead creature.
- **Drip reaches Nubbin only through training** (the plan's line for Drip), so until Phase 3 a Drip becomes Pip or Smudge.
  Blip can also reach Nubbin by lots of feeding.

## Creature redesign (accepted for now)

- **Big creatures look small in bed.** The bed is 32 wide and a lying Champion or Ultimate fills it. The pink blanket starts
  at the mouth row, so on the tall designs it covers most of the body and only the head, ears, horns or wings show. Fine for
  a sleeping monster, but a bigger bed or a blanket that follows the body would look better (Phase 4 redecorates the room).
- **Big creatures have less floor.** A 32 pixel creature walks over 38 pixels of the 96 wide room and often stands in front
  of the bed. Food is still an 8 pixel icon on the floor beside it, which reads small next to an Ultimate.
- **Lying and slumped are squashed copies.** `lieDown` drops rows and doubles columns at even spacing, so detailed designs
  (Citadrake's towers, Aurelith's wings, Hollowking's staff) get flatter and a little distorted. All 20 were checked on a
  contact sheet in every look. Hand-drawn lying pictures would fix it.
- **Shut eyes can be hard to see.** Only the happy arch has a contrast rule. By a rough measure (the dark shut-eye line
  against the pixel above it) seven forms are under 3 to 1: Shellby, Mothlet, Pyrefang, Thornback, Citadrake, Dreadmaw and
  Hollowking. On Shellby, Mothlet and Hollowking that pixel is outline, so the shut eye merges into it. Not looked at in
  the room beyond the contact sheet.
- **Dreadmaw and Hollowking yawn into a dark oval,** because their `M` pixels are colored like the surface they sit on. It
  showed as a dark oval on the contact sheet (not looked at in the room).
- **No automated test covers the drawing.** `scene.ts` and the drawing parts of `moment.ts` were checked by eye in a
  headless phone browser (all 20 forms standing, sad, asleep, plus hungry, eating, petting, sick and dead for five), not on
  a real phone. The motion itself (two drawings swapping every half second, a step each quarter second) is untested as
  motion: the owner should judge whether the pace feels right.
- **A sleeping creature's tap area is the standing square** at the bed spot, bigger than the lying body. A tap above the
  lying creature still counts.
- **The two babies have no second drawing,** so they only bob. They were not redrawn.

## Phase 3 slice 1: the habitat (accepted for now)

- **Coins and materials have no use yet.** Coins first buy habitat upgrades in slice 3; materials are used by crafting in
  Phase 4. They are only collected and shown in the bag.
- **A job pays up to a minute after its bar fills,** because the simulation moves in whole game minutes and a job can start
  between two of them.
- **A creature out at night looks awake and working** in the habitat even though care has put it to sleep, and it pays when
  it gets home. A creature at home at night is not drawn outside: a bubble says it is in bed.
- **A job already out is not stopped** by night or sickness (the checks are made at set-off, and a job is at most 8 minutes).
  A creature that dies on the way pays nothing and the job stays on the dead creature.
- **A welcome-back card that was never dismissed** can show later on an egg or after a death. The coins are already banked.
- **The habitat's night tint follows the clock** (night is 8 pm to 5 am, like the room window), not the sleeping hours in
  Settings.
- **A big creature covers the spot it works at** (a 32 pixel creature is a third of the picture). The progress bar sits on top.
- **Tapping the habitat picture does nothing;** the spots are the buttons under it. The picture has a text description for
  screen readers, but not per spot.
- **The creature's calls are not shown in the habitat,** and while it is out a hungry or dirty creature cannot be cared for
  (call it back). A job is at most 8 minutes against a call patience of 60.
- **The drawing code is only tested for placement** (`tests/habitat-art.test.ts`: boxes inside the picture, no overlaps, no
  spot covered at home, the lock). How it looks was checked in a headless phone browser, not on a real phone.
- **Dev mode cannot set chores below the real count** (it stores the difference above it).

## Phase 3 slice 2: combat and the arena (accepted for now)

- **A fight is not saved.** Closing the app, reloading or tapping Run away in the middle of one forgets it. The energy spent to
  start it stays spent and nothing else changes (no coins, no HP lost, no `battles` count).
- **The checks are made once, when the fight starts.** A creature that falls asleep or sick in the middle of a fight keeps
  fighting. Only a death or an evolution ends it.
- **The boss is close to out of reach untrained, and trained to the cap everything is easy.** Simulated win rate by rung for an
  untrained creature at full HP is 97 to 100%, 79 to 91%, 52 to 68%, 13 to 21% and 1 to 5% for the boss; with the three stats at
  the stage cap it is 98 to 100% at every rung (see decisions.md). All numbers are first guesses.
- **The only way to train a stat is to win fights** (1 point a win, 2 for the boss, in the stat of the action used most). There is
  no Train action, so the `training` evolution metric still reads 0 and the paths that need it (Blip and Drip to Nubbin, Smudge
  to Gruntle) are not reachable without dev mode.
- **Discipline never rises,** so the sulk rule (a creature ignoring a command) is dormant at the starting 50, and the paths that
  need discipline 60 (Thornback and Bastion to Citadrake) are not reachable without dev mode.
- **The wild creature can be the same form as the player's** (a mirror match). Its picture is the same, flipped, with a red tint
  on the boss.
- **A material from a fight is always 1 of a kind** the creature's stage can gather. Like coins, nothing uses it yet.
- **The picture says HP and the meter with bars and pips only,** no numbers, and the screen-reader text gives each side's HP
  percent when the screen next redraws (after a round, not during its blows).
- **An evolve scene is not drawn on the arena or habitat screen,** so a creature that evolves while the player is there changes
  form without the scene.
- **The result is paid when the last round is played,** a moment before the picture finishes showing the last blow. Closing the
  app in that moment keeps the result.
- **The drawing code is only tested for the timeline and the placement** (`tests/arena.test.ts`: the order and timing of a round,
  the HP replay, the fighters inside the picture and never overlapping). How it looks and moves was checked in a headless phone
  browser as still frames, not on a real phone, and the pace has not been judged as motion.

## Backend (Phase 5)

- **PBKDF2 iteration cap.** Workers is reported to cap PBKDF2 at 100,000, below the OWASP figure of 600,000 for SHA-256.
  Not confirmed in a primary source. Check before choosing the number.
- **Safari and Secure cookies on http://localhost** may be refused. Test login in Chrome or Firefox locally.

## Tooling

- **`npm audit`: 4 moderate warnings** (2026-11-20), a `minimatch` denial-of-service advisory in dev tooling. Not in the
  shipped bundle. Re-check before Phase 5.
- **The dev server has no security headers.** Running `npm run dev` does not apply `public/_headers`. Use `npm run build` then
  `npx wrangler pages dev dist` to see the real headers.
- **Phone screenshots with Playwright.** Playwright 1.65.1 wants a chromium revision that is not installed here, so pass
  `executablePath` for a cached one. `page.clock` fakes JS timers and `Date` but not CSS animations, so wait in real time
  (about 450 ms) after opening a panel or a half faded screenshot results. `clock.fastForward` rejects `72:00:00`, pass
  milliseconds.
- **Pixel drawings end in two outline layers.** In `tools/art/bk.py`, `put(ring=True)` rings each part and `outline()` rings the
  whole drawing, so a part ends up with a 2 pixel dark edge and a drawing that fills its canvas has outline pixels on the
  canvas edge. That is fine. A part is cut off only if a non-outline letter sits on the edge. The Python sample scripts
  (session scratch folder) draw an unknown palette letter as magenta without complaint, so check that every letter used is in
  the palette before looking at a sheet. Odd-width faces or mouths on an even-width canvas sit half a pixel off centre.
  `tools/art/paradise/lib.py` now enforces these: a missing palette letter, a cut-off edge, a detached piece of any size (not
  joined up, down, left or right to the biggest piece), a face piece that lands off the picture (`Canvas.px` drops those
  silently, so `put_face` raises), and a mouth that is not centered, custom `x` included. A custom mouth gives its own `x` and
  must still have equal margins, so draw a jaw or beak symmetric about the picture's middle line: teeth must stay on columns the
  cavity has (Murkfang's first jaw had one tooth column too many and sat half a pixel right).
- **Art library gaps left on purpose** (2026-11-21, cheap-model review): a custom mouth with no `rows` key, or a face-patterns
  look with no `eyes` key, can still crash the checks with a `KeyError` instead of a report, and custom mouths are not checked
  for face letters (their other letters are caught by the palette check). Only the Paradise art scripts write these, so a
  traceback is acceptable. Fix them if a second person ever writes creature files.
- **Land art, seen in the blind reviews (2026-11-21).** (1) The sad look reads mainly through the 2 pixel blue tear, and on
  grey or blue-grey bodies (Moonlop, Gutterfang, Tuskmole) it is faint; a body-specific `tear` color through `with_face` fixes
  one creature without touching the face system. (2) Frame two of every drawing is a small accent (an ear, a tail, a claw), on
  purpose: `idle.ts` already bobs and squashes every sprite. (3) The nine creatures drawn before milestone 2 (Gravelhorn and the
  Water and Sky creatures) place feet claws with `int(x + cx - 1)` from a left-side formula, so the right foot's claws are a
  shifted copy of the left one's, up to 3 px off a true mirror. The new files use `sym()` for them. The nine are not changed
  because the owner has seen them. (4) Mossheap's fringe and Needlecap's needles were off by one from a mirror before the
  review; both now mirror about the middle.

## Paradise growth, game side (accepted for now)

- **A creature in a field walks only the left part of the picture.** The walking limit is shared with the room (`walkRight` 84, so
  food never lands on the bed), so the right side of the Land field (the arch and the bog) is never reached.
- **The field is always dusk.** The room follows the clock, the field picture does not.
- **A tap on a locked field only makes the creature shake its head.** The habitat's spots show a small icon saying why; the
  picker does not. The lock badge on the button is the only explanation.
- **The wall rule for food cannot be reached any more.** `startEating` turns the creature away from a wall closer than 8 pixels,
  but the walking area now stops at 8, where the food just fits. The test uses x = 4 to check the rule itself.
- **The new screen code has no automated test.** The places tray, the field drawing and the Stage hookup were checked with
  Playwright screenshots of the running game (a script in the session scratch folder, not in the repo). The placement numbers, the
  field data, `goTo` and the face stamping are tested.
- **Icons are placeholders.** The signpost, Land, Water and Sky icons and the redrawn pellet and treat are 8 x 8 and crude.
- **`emit_ts.py` needs Pillow** (the field is drawn with it). `selftest.py` skips its field cases without it.
- **A job does not send a creature home from a field.** `startJob` and `callBack` leave `place` alone, so after the job the
  creature is back in the field it left and its field minutes count again. Bedtime and naps do send it home. The owner chose to
  leave it this way (2026-11-21), so it is a decision, not a gap.
- **The dev tree's option lists have no `key`s.** No visible effect in Preact for these short, fixed lists.
- **A field with no picture would show the room.** `drawField` returns false for a field without a picture and the room is drawn. All
  three fields have one now, so nothing tests that fallback (the old test of it checked nothing once Sky opened and was rewritten).

## Paradise Water slice (accepted for now)

- **The Water names and animals are my choice** (plan section 4); the owner has not been asked. A redraw or rename is cheap until
  Sky starts.
- **A creature in the Water field walks only the left part of the picture**, like the Land one (the shared `walkRight` 84), so the
  ruined arch and the glowing anemones on the right are never reached. The Water picture is always the same light (no clock).
- **The JavaScript grew from 205.6 KB to 319 KB** with the 21 Water forms (64.6 KB gzipped). All three fields will be about 430 KB
  (an estimate). See plan section 7.
- **A face mirrors about the picture's centre column.** The anchor gives the left eye and the right eye is the mirror, so a head
  that is not centred on x = 24 gets a right eye outside the body (`lib.problems` reports it). Wilteel's head is centred and its
  body trails to one side for that reason.
- **The three new food icons are 8 x 8 placeholders.** The shrimp (a curled red body with orange stripes) is the weakest; at that
  size it is close to a bird.
- **Some Water drawings read ambiguously on a blind look** (cheap-model check): Limpseal as a seal sitting up (medium), Droopstar
  as a slumped starfish (medium), Wilteel's dim lure stalk as stray dots. Left as they are; the owner can ask for redraws.
- **The `assert`s in `land_all.py` and `water_all.py` vanish under `python3 -O`**, so a drawn creature left out of `ORDER` would be
  dropped without a message. Run the tools without `-O`.

## Paradise Sky slice (accepted for now)

- **The Sky names and animals are my choice** (plan section 4); the owner has not been asked. "Cinderling" (Sky kid) and "Cindermane"
  (Land adult, live) share a prefix; left alone because Cindermane is live.
- **Cinderling and Scorchlet have no mouth** (`mouth: null`, the beak is part of the body), so their beak never opens or lowers. The
  other beaked forms (Ashwing and the 8 new ones) draw the beak as a mouth pattern and do open and lower. Scorchlet could get
  `beak_mouths` like Chirplet: a scope suggestion, not done.
- **A beak and the claws are the creature's tooth colour.** They are drawn with the letter T, which `lib.with_face()` sets from
  `tooth=` after the palette, so a palette entry "T" is overwritten without a message (8 such entries were removed). A bird with an
  orange beak needs a different letter.
- **A sleeping beaked form has no M pixel** (a closed beak is drawn in the beak's colours), so `blanketBox` falls back to starting
  the blanket about 55 percent of the way down. Eyes still show above it (seen on Cinderling, Chirplet, Peckjack and Downwren in the running game); the per-form test now
  checks "below the eyes" and "at the mouth when there is one".
- **Weaker readings on a blind look** (cheap-model check, left as drawn): Cinderling's orange belly patch under the beak reads as a
  second mouth; Ashwing and Sootsnarl have close silhouettes (the same line, tiers 1 and 3); Wisplet and Softnimbus are both pale
  clouds; Gildcrest's teal wings read as arms; Paleveil's blue spots can read as headphones; Smogrump's smoke wisp as a chimney;
  Fogsag as a ghost or tadpole (the hook reads like a question mark). On the field, the far islands read as downward triangles
  and the fallen column as a fence.
- **Smogrump's two feet are 1 px off a mirrored pair** and Wisplet's side lobes differ in size: smoke and cloud are meant to be lumpy.
- **The chicken icon is close to the meat icon** (cream bone ends on a brown-orange roast). A Sky tray never shows meat, so they
  are never side by side. 8 x 8 placeholders, like the rest.
- **The Sky picture looks muted while a creature sleeps.** The "lights off" overlay (40 percent dark blue) is the same for every place.
- **The JavaScript is 436.7 KB (77.9 KB gzipped)** with all three fields (64 forms), up from 319 KB. See plan section 7.
