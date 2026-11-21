# Broodkeep progress

Plan: [../CLAUDE.md](../CLAUDE.md). Repo: github.com/cjustin-dev/broodkeep. Local clone: ~/broodkeep (hub).

## State (2026-11-20)

Scaffold done on branch `broodkeep-scaffold`, pushed to origin on 2026-11-20 (owner approved). `main` untouched. No game code.
Phase 1 not started. Old-project Git connection still shows the old repo name `kharbranth` in the Cloudflare dashboard
(stale label, unconfirmed whether builds still work). The push is the test: watch the old project's Deployments tab.

Verified locally: `npm run build`, `npm run typecheck` and `npm test` exit 0. `public/_headers` was checked
by serving `dist` with `wrangler pages dev` (headers present on `/`, `/api/*` and assets, absent when the
file is removed). The built `index.html` has no inline script or style, so the CSP needs no exceptions.

## Open decisions for the owner

- Root `_redirects` to hide `creatures/` source on the old site. A 404 rule is not supported by Cloudflare Pages
  (tested: silently ignored). `/creatures/* / 302` works (tested on a scratch copy). Waiting for a yes.
- Placeholder D1 `database_id` in wrangler.toml: unknown whether the first Pages deploy accepts it.
  If the first build fails with a D1 error, comment out the `[[d1_databases]]` block until Phase 5.

## Facts that are easy to get wrong

- Pages `_headers` does not apply to Functions responses, so `functions/_lib/response.ts` must set headers itself.
- Workers may cap PBKDF2 at 100,000 iterations (reported, not confirmed in primary docs). Check before Phase 5.
- plan section 2 still says `kharbranth.pages.dev` (old site URL, left as written) and "harmless" (outdated once the
  redirect rule is added).
- The hub pushes with a repo-scoped GitHub deploy key (write access). It can push any branch, so protect `main` on GitHub.

## Next

1. Owner: yes/no on the `_redirects` rule.
2. Owner: report whether the old Cloudflare project started a build for `broodkeep-scaffold` (connection test).
3. Owner: merge the branch to `main` on GitHub (no gh CLI or token on the hub), then create the second Cloudflare Pages
   project (steps given at hand-off).
4. Then Phase 1 (single local creature), only on the owner's go-ahead.
