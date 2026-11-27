#!/usr/bin/env python3
"""Puts the screenshots of sheet-stack.mjs ($VERIFY_OUT/sheet-stack/<state>-<W>x<H>@<ratio>.png) into one picture per window size, at the page's own CSS
size, 6 states to a row, each with its state name above it. Writes $VERIFY_OUT/sheet-stack/sheet-<W>x<H>@<ratio>.png.
Exit 0 only when every expected screenshot exists and reads; 2 when one is missing or unreadable (it is named)."""
import os
import sys
import tempfile

from PIL import Image, ImageDraw

OUT = os.environ.get("VERIFY_OUT") or os.path.join(tempfile.gettempdir(), "broodkeep-verify")
DIR = os.path.join(OUT, "sheet-stack")
SIZES = [(320, 568, 2), (360, 640, 2), (390, 844, 3), (740, 360, 2), (844, 390, 3)]
STATES = ["pick-stack", "pick-spent", "play-start", "perfect", "good", "wobble", "tall", "play-kid", "paused", "result-none", "result-paid", "result-fell"]
PER_ROW = 6
LABEL_H = 22
GAP = 8


def main():
    missing = [f"{st}-{w}x{h}@{r}" for (w, h, r) in SIZES for st in STATES if not os.path.isfile(os.path.join(DIR, f"{st}-{w}x{h}@{r}.png"))]
    if missing:
        print("missing screenshots:", ", ".join(missing))
        return 2
    for (w, h, r) in SIZES:
        rows = (len(STATES) + PER_ROW - 1) // PER_ROW
        sheet = Image.new("RGB", (PER_ROW * (w + GAP) + GAP, rows * (h + LABEL_H + GAP) + GAP), (30, 30, 30))
        draw = ImageDraw.Draw(sheet)
        for i, st in enumerate(STATES):
            name = f"{st}-{w}x{h}@{r}"
            try:
                img = Image.open(os.path.join(DIR, f"{name}.png")).convert("RGB")
            except Exception as e:  # a truncated or unreadable PNG is named, not a traceback
                print(f"{name}: cannot read the picture: {e!r}")
                return 2
            if img.size != (w * r, h * r):
                print(f"{name}: size {img.size}, expected {(w * r, h * r)}")
                return 2
            img = img.resize((w, h), Image.LANCZOS)
            x = GAP + (i % PER_ROW) * (w + GAP)
            y = GAP + (i // PER_ROW) * (h + LABEL_H + GAP)
            draw.text((x, y + 4), f"{w}x{h}@{r} {st}", fill=(255, 255, 255))
            sheet.paste(img, (x, y + LABEL_H))
        out = os.path.join(DIR, f"sheet-{w}x{h}@{r}.png")
        sheet.save(out)
        print("wrote", out, sheet.size)
    return 0


if __name__ == "__main__":
    sys.exit(main())
