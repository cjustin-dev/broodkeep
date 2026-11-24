#!/usr/bin/env python3
"""Puts the screenshots of sheet-board.mjs (sheets-board/<WxH>-<state>.png, pixel ratio 2: a room page in full, a panel as the window shows it) into pictures per window size, at the
page's own CSS size (half the file size), STATES in order, PER_ROW to a row, each with its state name above it; a row is as tall as its tallest
page. Writes sheets-board/sheet-<WxH>-<group name>.png (one file per group of states). Exit 0 only when every expected screenshot exists; 2 when one is
missing or unreadable (it is named)."""
import os
import sys
import tempfile

from PIL import Image, ImageDraw

OUT = os.environ.get("VERIFY_OUT") or os.path.join(tempfile.gettempdir(), "broodkeep-verify")
SHEETS = os.path.join(OUT, "sheets-board")
SIZES = ["320x568", "360x640", "390x844"]
GROUPS = {
    "panels": ["items-default", "items-scrolled", "items-undo-pending", "req-three", "req-types-b", "req-stale", "req-longest", "req-done", "req-empty", "req-undo-pending"],
    "rooms": ["room-adult-board", "room-kid-board"],
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
    # A state that sheet-board.mjs shot and GROUPS does not list would be left out of every picture without a word.
    extra = sorted(f[:-4] for f in os.listdir(SHEETS) if f.endswith(".png") and not f.startswith("sheet-") and f[:-4] not in wanted)
    if extra:
        print("screenshots in no group (add them to GROUPS):", ", ".join(extra))
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
                    draw.text((x, y + 4), f"{s} {st} (shot {im.size[1]} high)", fill=(255, 255, 255))
                    sheet.paste(im, (x, y + LABEL_H))
                y += LABEL_H + max(im.size[1] for _, im in row) + GAP
            out = os.path.join(SHEETS, f"sheet-{s}-{name}.png")
            sheet.save(out)
            print("wrote", out, sheet.size)
    return 0


if __name__ == "__main__":
    sys.exit(main())
