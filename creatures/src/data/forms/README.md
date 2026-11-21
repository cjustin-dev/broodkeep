Creature forms. `baby.ts` and `land.ts` are generated from the Python drawings in `tools/art/paradise/` by
`python3 tools/art/paradise/emit_ts.py` (do not edit them by hand; `emit_ts.py --check` finds a hand edit). `stats.ts` works
out the base stats from each form's stage and role. The tree that says which form follows which is `../fields.ts`.
