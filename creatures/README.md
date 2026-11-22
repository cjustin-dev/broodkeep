# Broodkeep (the game)

A raise-a-creature game that runs in the browser and installs on a phone. This folder is the whole game.
It is deployed as one Cloudflare Pages project, `broodkeep`, and this folder is its root directory.

The plan lives in [CLAUDE.md](CLAUDE.md). It is the source of truth for what gets built and in which phase.

Right now this is only the scaffold: the folders, the tooling and the security settings. There is no game yet.

## What each folder is for

| Folder | What goes there |
|---|---|
| `src/` | The game code that runs in the browser. `main.ts` is where it starts. |
| `src/game/` | Game rules only (time passing, care, evolution, randomness). No screen code. |
| `src/game/combat/` | Battle rules. |
| `src/game/habitat/` | Outdoor chores, gardens, gathering and job timers. |
| `src/game/crafting/` | Workshops and recipe timers. |
| `src/data/` | Content you edit to add things: foods, items, recipes, tuning numbers. |
| `src/data/forms/` | One file per creature. |
| `src/art/` | Pixel art drawing code and color palettes. |
| `src/ui/` | Screens and menus. |
| `src/audio/` | Sound effects made in code. No sound files. |
| `src/sync/` | Saving on the device and syncing to the cloud. |
| `tests/` | Automatic checks of the game rules. |
| `public/` | Files copied as-is to the live site: the app icons (drawn by `tools/pwa-icons.py`) and `_headers` (security settings). The manifest is built from `pwa-manifest.ts`. |
| `functions/api/` | Backend routes (login, profiles, saves). Empty until Phase 5. |
| `functions/_lib/` | Shared backend helpers: passwords, validation, responses, database. Notes only for now. |
| `migrations/` | Database setup files. See the README inside. |

## Run it on your computer

You need Node.js 22 or newer. Check with `node --version`.

1. Open a terminal and go into this folder: `cd creatures`
2. Install the tools (first time only, and after `package.json` changes): `npm install`
3. Start the dev server: `npm run dev`
4. Open the address it prints (usually http://localhost:5173). The page updates when you save a file.
5. Stop it with Ctrl+C.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Builds the live version into the `dist/` folder. |
| `npm run preview` | Serves the built `dist/` folder so you can try it. |
| `npm test` | Runs the tests. |
| `npm run typecheck` | Checks the TypeScript for mistakes without building. |

To see the real security headers, build first, then serve the folder the way Cloudflare does:

    npm run build
    npx wrangler pages dev dist

The dev server from `npm run dev` does not apply `public/_headers`. Only the build does.

## Run the tests

    npm test

The tests are in `tests/` and their names end in `.test.ts`. There are none yet, so it reports
"No test files found" and still counts as a pass.

## Where secrets go

Never put a password, key or token in any file that is committed to git.

- **On your computer:** copy `.dev.vars.example` to `.dev.vars` and fill in real values.
  `.dev.vars` is in `.gitignore`, so git ignores it. Check with `git check-ignore -v .dev.vars`.
- **On the live site:** Cloudflare dashboard, your project, Settings, Variables and Secrets.

`wrangler.toml` and the files in `functions/` are committed, so they must never hold a real secret.
The database id in `wrangler.toml` is not a secret, but it is a placeholder until Phase 5.

## Deploying

The game is one Cloudflare Pages project, `broodkeep`, with these settings:

- Root directory: `creatures`
- Build command: `npm run build`
- Build output directory: `dist`

Deploys happen when changes reach the `main` branch.
