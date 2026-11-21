# Broodkeep progress

Plan: [../CLAUDE.md](../CLAUDE.md). Repo: github.com/cjustin-dev/broodkeep. Local clone: ~/broodkeep (hub).

## State (2026-11-20)

Scaffold done on branch `broodkeep-scaffold`, pushed to origin on 2026-11-20 (owner approved). `main` untouched. No game code.
Phase 1 not started. The old Cloudflare project still shows the old repo name `kharbranth` (stale label), which is moot
because that project is being deleted.

Verified locally: `npm run build`, `npm run typecheck` and `npm test` exit 0. `public/_headers` was checked
by serving `dist` with `wrangler pages dev` (headers present on `/`, `/api/*` and assets, absent when the
file is removed). The built `index.html` has no inline script or style, so the CSP needs no exceptions.

## Open decisions for the owner

- DECIDED 2026-11-20: the owner said the old Cloudflare project (`kharbranth`) is disposable (just made, nothing depends on
  it). Plan: delete it, then create one new Pages project `broodkeep` (root dir `creatures`). That makes the root
  `_redirects` rule, the build watch paths and the old-connection test unnecessary. Kept for reference if the old
  project is ever kept: a 404 rule in `_redirects` is not supported (tested: silently ignored), and `/creatures/* / 302`
  works (tested on a scratch copy).
- Optional, owner's call: delete the old site files at the repo root (index.html, css/, js/, img/, fonts/, _headers,
  robots.txt, sitemap.xml, style.css, favicon.png). They are harmless once nothing serves the root.
- Placeholder D1 `database_id` in wrangler.toml: unknown whether the first Pages deploy accepts it.
  If the first build fails with a D1 error, comment out the `[[d1_databases]]` block until Phase 5.

## Facts that are easy to get wrong

- Pages `_headers` does not apply to Functions responses, so `functions/_lib/response.ts` must set headers itself.
- Workers may cap PBKDF2 at 100,000 iterations (reported, not confirmed in primary docs). Check before Phase 5.
- plan section 2 still says `kharbranth.pages.dev` (old site URL, left as written) and "harmless" (outdated once the
  redirect rule is added).
- The hub pushes with a repo-scoped GitHub deploy key (write access). It can push any branch, so protect `main` on GitHub.

## Next

1. Owner: delete the old Cloudflare Pages project (check it has no custom domain first).
2. Owner: merge the branch to `main` on GitHub (no gh CLI or token on the hub).
3. Owner: create the Cloudflare Pages project `broodkeep` (root `creatures`, build `npm run build`, output `dist`).
4. Then Phase 1 (single local creature), only on the owner's go-ahead.
