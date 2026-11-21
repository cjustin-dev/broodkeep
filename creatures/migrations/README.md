# Database migrations (Cloudflare D1)

D1 is Cloudflare's SQLite database. A migration is a numbered .sql file that changes the
database (create a table, add a column). Wrangler remembers which files it has already run
and only runs the new ones, in number order.

There is no database yet. It gets created in Phase 5 (accounts and cloud sync), and the first
file will be 0001_init.sql.

Commands, for later (run from the creatures folder):

    npx wrangler d1 create broodkeep                        # once, makes the database
    npx wrangler d1 migrations create broodkeep add_thing   # new empty numbered .sql file
    npx wrangler d1 migrations apply broodkeep --local      # run new files on your computer
    npx wrangler d1 migrations apply broodkeep --remote     # run new files on the live database

Rules:
- Never edit a migration that has already been applied. Add a new file instead.
- Never put real user data or secrets in a migration file. It is committed to git.
