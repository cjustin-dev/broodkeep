# Creature drawing tools

The Python that drew the 18 redesigned creatures. The game does not use it: it only reads the grids in
`src/data/forms/`, and nothing here runs in the build or the tests. Use it when you want to redraw or add a creature
without editing 32 x 32 grids by hand. The drawing rules (sizes, eyes, mouth, two drawings) are in
[../../docs/art-direction.md](../../docs/art-direction.md).

| File | What it is |
|---|---|
| `bk.py` | `Canvas`: ellipses, rectangles, polygons, lines, a ring or shading when a shape is painted, `eyes()` for the 2 x 2 eye blocks, `outline()`, and `check()` for the face rules |
| `stage1.py` | the in-training creatures (16 x 16: Pip, Nubbin, Smudge) and the rookies (22 x 22) |
| `stage2.py` | the champions (28 x 28) |
| `stage3.py` | the ultimates (32 x 32) |
| `blurbs.py` | a short description and "what the second drawing moves" for each creature: the first is the form file's header comment, the second goes in the comment above `idle2` |
| `emit.py` | writes the drawings into the form files |
| `preview.py` | a contact sheet PNG of one stage file (needs Pillow) |

Each stage file ends with `DESIGNS`, a list of `(form id, draw function, palette)`. A draw function takes the frame (0 or 1)
and returns a `Canvas`. The two babies (Blip, Drip) are not drawn here.

## Run it

Use plain `python3` from the repo root. `emit.py` needs only the standard library; `preview.py` needs Pillow.

```
python3 tools/art/preview.py stage3 /tmp/ultimates.png 8 3    # look at a stage: scale 8, 3 columns
python3 tools/art/emit.py                                      # write every drawing into src/data/forms/
python3 tools/art/emit.py --check                              # change nothing, exit 1 if a form file differs
```

`emit.py` checks every drawing against the face rules before it writes anything, and stops if one breaks them (two eyes,
six `W` pixels, empty last row). It will not touch a form file whose first line is not the `//` header comment. It rewrites
only the header comment, `palette`, `idle` and `idle2` of each form file. Stats and evolution rules are never touched.
After a change, run `npm test` too: the tests check the same rules on the form files plus every derived
look.

## The form files and these drawings must agree

The grids in `src/data/forms/` are what the game uses. Right now `emit.py --check` reports no differences. If you change a
form file by hand, either make the same change in the drawing here or expect `emit.py` to overwrite it. After editing a
drawing, run `emit.py`, then `npm test`, then look at the creature in the game (`docs/art-direction.md`, "Adding or
redrawing a creature").
