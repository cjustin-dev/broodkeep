#!/usr/bin/env python3
"""Puts the screenshots of sheet-habitat.mjs (sheets-habitat/<WxH>-<state>.png, full page, pixel ratio 2) into pictures per window size, at the
page's own CSS size (half the file size), STATES in order, PER_ROW to a row, each with its state name above it; a row is as tall as its tallest
page. Writes sheets-habitat/sheet-<WxH>-<n>.png (one file per group of states). Exit 0 only when every expected screenshot exists; 2 when one is
missing or unreadable (it is named)."""
import os
import sys
import tempfile

from PIL import Image, ImageDraw

OUT = os.environ.get("VERIFY_OUT") or os.path.join(tempfile.gettempdir(), "broodkeep-verify")
SHEETS = os.path.join(OUT, "sheets-habitat")
SIZES = ["320x568", "360x640", "390x844"]
GROUPS = {
    "cards": ["spots", "card-pond", "card-meadow", "card-herbs", "card-rocks", "card-young-rocks", "card-baby-trees", "card-tired-pond", "card-tired-meadow", "card-edge-pond", "card-nap", "card-sick"],
    "away": ["job-pond", "job-rocks", "job-start", "job-herbs", "haul-coin", "haul-both", "kid-spots", "kid-away", "kid-haul"],
}
PER_ROW = 4
LABEL_H = 22
GAP = 8


def main():
    wanted = [f"{s}-{st}" for s in SIZES for g in GROUPS.values() for st in g]
    missing = [w for w in wanted if not os.path.isfile(os.path.join(SHEETS, f"{w}.png"))]
    if missing:
        print("missing screenshots:", ", ".join(missing))
        return 2
    for s in SIZES:
        w = int(s.split("x")[0])
        for name, states in GROUPS.items():
            imgs = []
            for st in states:
                try:
                    img = Image.open(os.path.join(SHEETS, f"{s}-{st}.png")).convert("RGB")
                except Exception as e:  # a truncated or unreadable PNG is named, not a traceback
                    print(f"{s}-{st}: cannot read the picture: {e!r}")
                    return 2
                if img.size[0] != w * 2:
                    print(f"{s}-{st}: width {img.size[0]}, expected {w * 2}")
                    return 2
                imgs.append((st, img.resize((w, img.size[1] // 2), Image.LANCZOS)))
            rows = [imgs[i : i + PER_ROW] for i in range(0, len(imgs), PER_ROW)]
            height = GAP + sum(LABEL_H + max(im.size[1] for _, im in row) + GAP for row in rows)
            sheet = Image.new("RGB", (PER_ROW * (w + GAP) + GAP, height), (30, 30, 30))
            draw = ImageDraw.Draw(sheet)
            y = GAP
            for row in rows:
                for i, (st, im) in enumerate(row):
                    x = GAP + i * (w + GAP)
                    draw.text((x, y + 4), f"{s} {st} (page {im.size[1]})", fill=(255, 255, 255))
                    sheet.paste(im, (x, y + LABEL_H))
                y += LABEL_H + max(im.size[1] for _, im in row) + GAP
            out = os.path.join(SHEETS, f"sheet-{s}-{name}.png")
            sheet.save(out)
            print("wrote", out, sheet.size)
    return 0


if __name__ == "__main__":
    sys.exit(main())
