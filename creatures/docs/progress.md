# Broodkeep progress

Plan: [../CLAUDE.md](../CLAUDE.md). Repo: github.com/cjustin-dev/broodkeep. Local clone: ~/broodkeep (hub).

## State (2026-11-20)

Scaffold is MERGED to `main` (PR #1, merge commit 389934e) and LIVE at https://broodkeep.pages.dev (second Pages project,
root dir `creatures`, built from `main`). No game code. Phase 1 not started.
Live check 2026-11-21: all security headers present on `/` and `/api/*` (`no-store`), and source files such as
`/package.json` and `/wrangler.toml` return the placeholder page, not the real files. The placeholder D1 id did not
break the deploy.
Local branch `broodkeep-scaffold` has 3 notes-only commits not on `main`; they ride along with the next branch.
Pages gotcha seen: "Retry deployment" rebuilds the OLD commit. After a merge, look for the new deployment instead.
Dashboard gotcha seen: the Workers setup flow shows a "Deploy command" box; the Pages flow does not. Use the Pages flow.

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

1. Owner: confirm the old Cloudflare project is deleted (or leave it; it is disposable).
2. Owner's call: delete the old site files at the repo root, now that nothing serves them.
3. Phase 1 (single local creature), only on the owner's go-ahead.
4. Phase 5 note: the host falls back to `index.html` with 200 for unknown paths, so `/api/typo` returns 200 HTML today.
   Once Functions exist, unknown API routes should return a JSON 404.
