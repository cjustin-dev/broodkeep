# Broodkeep progress

Plan: [../CLAUDE.md](../CLAUDE.md). Repo: github.com/cjustin-dev/broodkeep. Local clone: ~/broodkeep (hub).

## State (2026-11-21)

Scaffold is on `main` and LIVE at https://broodkeep.pages.dev (Cloudflare Pages project `broodkeep`, root dir `creatures`,
build `npm run build`, output `dist`, builds from `main`). The old template site was removed from the repo root (PR #2,
merge commit 33fc7a5). Repo root on `main` is now `.gitignore`, `LICENSE` and `creatures/`. No game code. Phase 1 not started.

Checked on the live site: all security headers present on `/` and `/api/*` (`no-store`), and source files such as
`/package.json` and `/wrangler.toml` return the placeholder page, not the real files. The placeholder D1 id did not
break the deploy. After PR #2 the build passed and the site was unchanged.

Local checks: `npm run build`, `npm run typecheck` and `npm test` exit 0. `public/_headers` was verified by serving
`dist` with `wrangler pages dev` (headers present, and absent when the file is removed). The built `index.html` has no
inline script or style, so the CSP needs no exceptions.

## Open for the owner

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

1. Phase 1 (single local creature: egg, hatching, care, sleep, sickness, offline catch-up, dev mode), only on the owner's go-ahead.
   Work on a new branch, never push `main`, and the owner merges the pull request.
