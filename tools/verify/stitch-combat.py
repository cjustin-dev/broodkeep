#!/usr/bin/env python3
"""Puts the screenshots of sheet-combat.mjs ($VERIFY_OUT/sheet-combat/<state>-<W>x<H>@<ratio>.png) into one picture per window size, at the page's own CSS
width, 5 states to a row (the pages differ in height, so a row is as tall as its tallest), each with its state name above it. Writes
$VERIFY_OUT/sheet-combat/sheet-<W>x<H>@<ratio>.png. Exit 0 only when every expected screenshot exists and reads; 2 when one is missing or unreadable (it is named)."""
import os
import sys
import tempfile

from PIL import Image, ImageDraw

OUT = os.environ.get("VERIFY_OUT") or os.path.join(tempfile.gettempdir(), "broodkeep-verify")
DIR = os.path.join(OUT, "sheet-combat")
SIZES = [(320, 568, 2), (360, 640, 2), (390, 844, 3), (740, 360, 2), (844, 390, 3)]
STATES = ["start", "pad-0", "pad-mid", "pad-target", "perfect", "intent-attack", "intent-guard", "intent-special", "guard-pad", "parry", "sulk", "won", "kid", "reduced-dim", "reduced-lit"]
PER_ROW = 5
LABEL_H = 22
GAP = 8


def main():
    missing = [f"{st}-{w}x{h}@{r}" for (w, h, r) in SIZES for st in STATES if not os.path.isfile(os.path.join(DIR, f"{st}-{w}x{h}@{r}.png"))]
    if missing:
        print("missing screenshots:", ", ".join(missing))
        return 2
    for (w, h, r) in SIZES:
        images = []
        for st in STATES:
            name = f"{st}-{w}x{h}@{r}"
            try:
                img = Image.open(os.path.join(DIR, f"{name}.png")).convert("RGB")
            except Exception as e:  # a truncated or unreadable PNG is named, not a traceback
                print(f"{name}: cannot read the picture: {e!r}")
                return 2
            if img.size[0] != w * r:
                print(f"{name}: width {img.size[0]}, expected {w * r}")
                return 2
            images.append((st, img.resize((w, round(img.size[1] / r)), Image.LANCZOS)))
        rows = [images[i : i + PER_ROW] for i in range(0, len(images), PER_ROW)]
        heights = [max(im.size[1] for _, im in row) + LABEL_H + GAP for row in rows]
        sheet = Image.new("RGB", (PER_ROW * (w + GAP) + GAP, sum(heights) + GAP), (30, 30, 30))
        draw = ImageDraw.Draw(sheet)
        y = GAP
        for row, row_h in zip(rows, heights):
            for i, (st, im) in enumerate(row):
                x = GAP + i * (w + GAP)
                draw.text((x, y + 4), st, fill=(255, 255, 255))
                sheet.paste(im, (x, y + LABEL_H))
            y += row_h
        sheet.save(os.path.join(DIR, f"sheet-{w}x{h}@{r}.png"))
        print(f"sheet-{w}x{h}@{r}.png")
    return 0


sys.exit(main())
