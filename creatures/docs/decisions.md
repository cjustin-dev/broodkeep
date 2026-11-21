# Broodkeep decisions

## 2026-11-20: one Pages project, old Cloudflare project deleted

The plan (section 2) called for a second Pages project so the old root site kept working. The owner then said the old
Cloudflare project was just made and nothing depends on it. Decision: delete it and run ONE Pages project, `broodkeep`,
with root directory `creatures`. This made a root `_redirects` rule, build watch paths and a connection test unnecessary.
The old site files were then removed from the repo root (2026-11-20, owner approved, branch `remove-old-site`, 37 files
including the template README). Kept: `LICENSE` (the template author's MIT notice) and the generic root `.gitignore`.

## 2026-11-20: no `_redirects` rule

Considered `/creatures/* /404 404` to hide game source on the old site. Cloudflare Pages `_redirects` does not support a
404 status; tested on a scratch copy, the rule is silently ignored. `/creatures/* / 302` worked but was dropped when the
old project was deleted.

## 2026-11-20: scaffold choices

- `vite-plugin-pwa` and `preact` are installed as devDependencies (the brief asked for them) but the PWA plugin is not
  wired in until Phase 7.
- `npm test` is `vitest run --passWithNoTests`, because plain `vitest run` exits 1 when there are no test files.
- `vite.config.ts` imports `defineConfig` from `vitest/config` so one file serves both Vite and Vitest.
- The D1 binding in `wrangler.toml` keeps an all-zero placeholder id (as the brief asked). The first Pages deploy
  succeeded with it. Replace it in Phase 5.
- Progress notes live in `creatures/docs/`, not a root `docs/`, because the repo root was the old site's public folder.
- `SESSION_SECRET` in `.dev.vars.example` is only a name example. The planned session design needs no signing key.

## 2026-11-20: Phase 1 design choices

- **One deterministic simulation for live play and catch-up.** `simulateTo(save, nowMs)` runs whole 1-minute steps with a
  seeded RNG whose state lives in the save (`rngState`). Splitting a stretch of time into pieces gives an identical save,
  so reopening after a day is the same code path as watching it. Tests cover this.
- **Game time is real time plus `save.clockOffsetMs`.** Dev mode skips ahead and speeds time up through that offset, so
  nothing else in the code knows dev mode exists.
- **Clock rewinds.** A rewind of up to 60 minutes (`clockRewindToleranceMinutes`) is ignored. A bigger one re-baselines the
  save to the new time and logs it. No catch-up cap: the loop simply stops when the creature is dead.
- **Calls reset while asleep, they do not pause.** An unanswered call counts as one care mistake after 60 awake minutes.
  Resetting means bedtime can never be neglect, even if the call started just before it.
- **Death is tuned to the plan's "roughly two days".** Wellness at 0 for 480 minutes kills; `starvingDrain` 0.07 was
  calibrated with a probe grid. A fully ignored creature dies 43 to 51 hours after hatching (hatch at 08:00, 14:00, 21:00).
  The test checks three hatch hours against a 40 to 56 hour window. Death cause order: hunger, then sickness, then neglect.
- **Placeholder forms.** Blip, Pip, Fennix. All three egg patterns hatch Blip. Blip becomes Pip at 6 hours, Pip becomes
  Fennix at 24 hours, Fennix is the end. The evolution code is already data driven (`evolvesTo` with `need`), Phase 2 fills
  in the real tree.
- **Canvas is scaled by whole DEVICE pixels.** Scaling by whole CSS pixels left blank margins on phones. The room is
  96 x 96 game pixels and each is exactly `k` device pixels, so it fills the width and stays sharp.
- **UI rules.** Plain CSS and a strict CSP (no inline script or style attributes; Preact `style` objects are fine).
  Icon only buttons, 76 px touch targets. The care buttons sit at the bottom of the screen, the room takes the spare
  space. Stat bars slide with `transform`, not `width`, so they animate without relayout.
- **Icons must not repeat.** The Feed button is a bowl and Clean is a broom. In the first draft Feed, Meat and the hunger
  stat were all the same drumstick, and Clean looked like a shovel. Seen in the first phone screenshots.
- **Saves are local only** (IndexedDB `broodkeep`/`kv`). A save that cannot be read is kept under `save-unreadable`
  instead of being overwritten.
- **A failed read never overwrites a save.** If the saved game cannot be read (not just "none exists"), `local.ts` skips
  every later write for that session and Settings shows the "Saving is blocked" warning. Found by the fresh-eyes review:
  before, a read error looked the same as "no save" and the first write replaced a real creature with a new egg.
  A failed open is also retried next time instead of being cached, and a later good write clears the warning.
- **One finger at a time on the room.** A second finger replaces the first hold, and only the finger that started a hold
  can end it. Before, a second finger left the first finger's petting timer running forever.
