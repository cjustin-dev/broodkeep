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
- **`foodEaten` and `neglectMinutes` counters are kept but unused.** They are for the Phase 2 evolution rules.
- **Not usable without touch or a mouse (accessibility, reported by the review, not built).** In the egg phase the only
  way to help it hatch is a pointer on the canvas. Petting and tickling also need a pointer. The food tray comes before
  the Feed button in tab order and focus does not move into it. Settings and Dev panels have no Escape key, no focus
  return to the gear and do not block the page behind them. Fine for a phone game, worth doing in Phase 7.
- **Dev "Hatch this form now" and "New egg" replace a living creature without asking.** Dev only.

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
