#!/usr/bin/env python3
"""Puts the screenshots of sheet-home.mjs (sheets-home-h1/<WxH>-<state>.png, pixel ratio 2: the home's picture, and the whole page for Adult and Kid Mode) into pictures per window size, at the
page's own CSS size (half the file size), STATES in order, PER_ROW to a row, each with its state name above it. Writes sheets-home-h1/sheet-<WxH>-<group name>.png (one file per group of
states). Exit 0 only when every expected screenshot exists; 2 when one is missing or unreadable (it is named)."""
import os
import sys
import tempfile

from PIL import Image, ImageDraw

OUT = os.environ.get("VERIFY_OUT") or os.path.join(tempfile.gettempdir(), "broodkeep-verify")
SHEETS = os.path.join(OUT, "sheets-home-h1")
SIZES = ["320x568", "360x640", "390x844"]
GROUPS = {
    "states": ["awake", "kid", "young", "egg", "away", "dead", "calls", "asleep-walking", "asleep-in-bed", "kid-mode"],
    "camera": ["kitchen-end", "bedroom-end", "zoom-largest", "zoom-smallest"],
    "pages": ["page-adult", "page-kid"],
}
PER_ROW = {"states": 4, "camera": 4, "pages": 2}
LABEL_H = 22
GAP = 8


def main():
    wanted = [f"{s}-{st}" for s in SIZES for g in GROUPS.values() for st in g]
    missing = [w for w in wanted if not os.path.isfile(os.path.join(SHEETS, f"{w}.png"))]
    if missing:
        print("missing screenshots:", ", ".join(missing))
        return 2
    extra = sorted(f[:-4] for f in os.listdir(SHEETS) if f.endswith(".png") and not f.startswith("sheet-") and f[:-4] not in wanted)
    if extra:
        print("screenshots in no group (add them to GROUPS):", ", ".join(extra))
        return 2
    for s in SIZES:
        for name, states in GROUPS.items():
            imgs = []
            for st in states:
                try:
                    img = Image.open(os.path.join(SHEETS, f"{s}-{st}.png")).convert("RGB")
                except Exception as e:  # a truncated or unreadable PNG is named, not a traceback
                    print(f"{s}-{st}: cannot read the picture: {e!r}")
                    return 2
                imgs.append((st, img.resize((img.size[0] // 2, img.size[1] // 2), Image.LANCZOS)))
            per = PER_ROW[name]
            rows = [imgs[i : i + per] for i in range(0, len(imgs), per)]
            col_w = max(im.size[0] for _, im in imgs)
            height = GAP + sum(LABEL_H + max(im.size[1] for _, im in row) + GAP for row in rows)
            sheet = Image.new("RGB", (per * (col_w + GAP) + GAP, height), (30, 30, 30))
            draw = ImageDraw.Draw(sheet)
            y = GAP
            for row in rows:
                for i, (st, im) in enumerate(row):
                    x = GAP + i * (col_w + GAP)
                    draw.text((x, y + 4), f"{s} {st} ({im.size[0]}x{im.size[1]})", fill=(255, 255, 255))
                    sheet.paste(im, (x, y + LABEL_H))
                y += LABEL_H + max(im.size[1] for _, im in row) + GAP
            out = os.path.join(SHEETS, f"sheet-{s}-{name}.png")
            sheet.save(out)
            print("wrote", out, sheet.size)
    return 0


if __name__ == "__main__":
    sys.exit(main())
