#!/usr/bin/env python3
"""The hat contact sheet: every form in four pictures (open0, open1, droop, lie0) with each of the four hats, drawn from hats.dump.ts's output.
No assertions: it is to be LOOKED at before any check about the hats is trusted. Needs Pillow.
Run: python3 sheet-hats.py [out dir]   (default $VERIFY_OUT/hats-sheet, where hats.dump.ts wrote sprites.json)
Writes <out dir>/<hat>-<picture>.png: 65 forms in a grid of 9 columns, the form's id above each cell, at 2x (4x for a baby and a kid)."""
import json
import os
import sys
import tempfile

from PIL import Image, ImageDraw

out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get("VERIFY_OUT", os.path.join(tempfile.gettempdir(), "broodkeep-verify")), "hats-sheet")
data = json.load(open(os.path.join(out, "sprites.json")))
CELL, LABEL, COLS = 112, 12, 9
BACK = (233, 227, 242)


def rgb(hex_colour):
    return tuple(int(hex_colour[i:i + 2], 16) for i in (1, 3, 5))


def draw(rows, palette, scale):
    image = Image.new("RGB", (len(rows[0]) * scale, len(rows) * scale), BACK)
    pixels = image.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            colour = rgb(palette[ch])
            for dy in range(scale):
                for dx in range(scale):
                    pixels[x * scale + dx, y * scale + dy] = colour
    return image


groups = {}
for key, value in data.items():
    hat, picture, form = key.split("|")
    groups.setdefault((hat, picture), []).append((form, value))
for (hat, picture), cells in sorted(groups.items()):
    rows_needed = (len(cells) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * CELL, rows_needed * (CELL + LABEL)), (255, 255, 255))
    pen = ImageDraw.Draw(sheet)
    for i, (form, value) in enumerate(cells):
        scale = 4 if value["stage"] in ("baby", "kid") and len(value["rows"][0]) <= 28 else 2
        picture_image = draw(value["rows"], value["palette"], scale)
        x = (i % COLS) * CELL + (CELL - min(picture_image.width, CELL)) // 2
        y = (i // COLS) * (CELL + LABEL) + LABEL + (CELL - min(picture_image.height, CELL))
        sheet.paste(picture_image.crop((0, 0, min(picture_image.width, CELL), min(picture_image.height, CELL))), (x, y))
        pen.text(((i % COLS) * CELL + 2, (i // COLS) * (CELL + LABEL)), form, fill=(0, 0, 0))
    sheet.save(os.path.join(out, f"{hat}-{picture}.png"))
print(f"wrote {len(groups)} sheets to {out}")
