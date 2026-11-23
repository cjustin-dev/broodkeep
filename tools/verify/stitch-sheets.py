#!/usr/bin/env python3
"""Puts the screenshots of sheet-retire.mjs (sheets/<WxH>-<state>.png, pixel ratio 2) into one picture per window size, at the page's own
CSS size (half the file size), in the order of STATES, 5 per row, each with its state name above it. Writes sheets/sheet-<WxH>.png.
Exit 0 only when every expected screenshot exists; 2 when one is missing (it is named)."""
import os
import sys
import tempfile

from PIL import Image, ImageDraw

OUT = os.environ.get("VERIFY_OUT") or os.path.join(tempfile.gettempdir(), "broodkeep-verify")
SHEETS = os.path.join(OUT, "sheets")
SIZES = ["320x568", "360x640", "390x844"]
STATES = ["ready", "card", "after", "after-lives", "lives", "teaser", "away", "fight", "kid-ready", "kid-card"]
PER_ROW = 5
LABEL_H = 22
GAP = 8


def main():
    missing = [f"{s}-{st}" for s in SIZES for st in STATES if not os.path.isfile(os.path.join(SHEETS, f"{s}-{st}.png"))]
    if missing:
        print("missing screenshots:", ", ".join(missing))
        return 2
    for s in SIZES:
        w, h = (int(x) for x in s.split("x"))
        rows = (len(STATES) + PER_ROW - 1) // PER_ROW
        sheet = Image.new("RGB", (PER_ROW * (w + GAP) + GAP, rows * (h + LABEL_H + GAP) + GAP), (30, 30, 30))
        draw = ImageDraw.Draw(sheet)
        for i, st in enumerate(STATES):
            try:
                img = Image.open(os.path.join(SHEETS, f"{s}-{st}.png")).convert("RGB")
            except Exception as e:  # a truncated or unreadable PNG is named, not a traceback
                print(f"{s}-{st}: cannot read the picture: {e!r}")
                return 2
            if img.size != (w * 2, h * 2):
                print(f"{s}-{st}: size {img.size}, expected {(w * 2, h * 2)}")
                return 2
            img = img.resize((w, h), Image.LANCZOS)
            x = GAP + (i % PER_ROW) * (w + GAP)
            y = GAP + (i // PER_ROW) * (h + LABEL_H + GAP)
            draw.text((x, y + 4), f"{s} {st}", fill=(255, 255, 255))
            sheet.paste(img, (x, y + LABEL_H))
        out = os.path.join(SHEETS, f"sheet-{s}.png")
        sheet.save(out)
        print("wrote", out, sheet.size)
    return 0


if __name__ == "__main__":
    sys.exit(main())
