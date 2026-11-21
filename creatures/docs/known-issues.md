# Broodkeep known issues and gotchas

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
