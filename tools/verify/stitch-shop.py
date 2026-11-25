#!/usr/bin/env python3
"""Puts the screenshots of sheet-shop.mjs (sheets-shop/<WxH>-<state>.png, full page, pixel ratio 2) into pictures per window size, at the
page's own CSS size (half the file size), STATES in order, PER_ROW to a row, each with its state name above it; a row is as tall as its tallest
page. Writes sheets-shop/sheet-<WxH>-<group name>.png (one file per group of states). Exit 0 only when every expected screenshot exists; 2 when one is
missing or unreadable (it is named)."""
import os
import sys
import tempfile

from PIL import Image, ImageDraw

OUT = os.environ.get("VERIFY_OUT") or os.path.join(tempfile.gettempdir(), "broodkeep-verify")
SHEETS = os.path.join(OUT, "sheets-shop")
SIZES = ["320x568", "360x640", "390x844"]
GROUPS = {
    "rooms": ["room-plain", "room-longname", "room-switch-standin", "room-all-owned", "room-kid-owned", "room-kid-plain", "room-hat-worn", "room-hat-kid", "room-play-owned", "room-play-kid", "room-play-pieces", "room-play-door"],
    "panels": ["shop-rich", "shop-rich-dusk", "shop-rich-bed", "shop-rich-mat", "shop-rich-knit", "shop-rich-crown", "shop-longname-fisher", "shop-hats-owned", "shop-hat-worn", "shop-rich-playroom", "shop-room-exact", "shop-room-bought", "shop-room-owned", "shop-poor-end", "shop-poor", "shop-mixed", "shop-owned-walls", "shop-owned-all", "shop-just-bought", "shop-after-buy"],
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
