"""The Sky field (plan section 3): a floating island ruin in a bright morning sky, 128 x 128, with a golden sun disc for the creature
to stand on.

Usage: python3 sky_field.py out.png [creature id]      (needs Pillow; run from tools/art/paradise/)

Without a creature id it writes the bare background, the picture the game will show behind a creature in the field. With one it
draws that creature standing on the sun disc, as a check of how each stage sits in the field.
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lib  # noqa: E402

FW = 128


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def background():
    im = Image.new("RGB", (FW, FW))
    d = ImageDraw.Draw(im)
    rnd = random.Random(31)

    def ell(cx, cy, rx, ry, fill, outline=None):
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill, outline=outline)

    def dot(x, y, col):
        if 0 <= x < FW and 0 <= y < FW:
            im.putpixel((x, y), hexrgb(col))

    # a bright morning sky: deep blue overhead, paler and warmer toward the horizon, with dithered seams
    bands = ["#3f74d0", "#5a8ae0", "#78a4ec", "#9cc0f2", "#c4d8f4", "#f2e2d0"]
    for y in range(0, 90):
        i = min(len(bands) - 1, y // 15)
        for x in range(FW):
            col = bands[i]
            if y % 15 >= 12 and i + 1 < len(bands) and (x + y) % 2 == 0:
                col = bands[i + 1]
            dot(x, y, col)
    # the sun, with a dithered glow
    for y in range(0, 52):
        for x in range(0, 54):
            if (x - 24) ** 2 + (y - 22) ** 2 < 22 ** 2 and (x + y) % 2 == 0:
                dot(x, y, "#c4daf6" if (x - 24) ** 2 + (y - 22) ** 2 > 15 ** 2 else "#e0ecf8")
    ell(24, 22, 12, 12, "#ffe890")
    ell(24, 22, 9, 9, "#fff6c0")
    # far floating islands with tiny ruins, pale in the haze
    for cx, cy, w in [(94, 46, 14), (116, 62, 9), (70, 58, 8)]:
        d.polygon([(cx - w, cy), (cx + w, cy), (cx + w - 3, cy + 5), (cx + 2, cy + w // 2 + 6), (cx - w + 4, cy + 4)], fill="#7a98c8")
        d.rectangle([cx - w, cy - 2, cx + w, cy], fill="#92b4d8")
        d.rectangle([cx - 2, cy - 7, cx, cy - 2], fill="#6a88b8")
        d.rectangle([cx + 3, cy - 5, cx + 4, cy - 2], fill="#6a88b8")
    # birds
    for bx, by in [(52, 34), (58, 38), (46, 40), (104, 26), (110, 30)]:
        dot(bx, by, "#2a4a8a"); dot(bx + 1, by + 1, "#2a4a8a"); dot(bx + 2, by, "#2a4a8a"); dot(bx - 1, by - 1, "#2a4a8a"); dot(bx + 3, by - 1, "#2a4a8a")

    def puff(cx, cy, w, h):
        """A cloud: a shadowed underside, a white top, and a few round bumps."""
        ell(cx, cy + 2, w, h, "#b8c8e8")
        ell(cx, cy, w, h, "#ffffff")
        for k, (dx, dy, r) in enumerate([(-0.45, -0.5, 0.55), (0.1, -0.8, 0.6), (0.5, -0.3, 0.5)]):
            ell(cx + dx * w, cy + dy * h, r * w * 0.6, r * h * 0.9, "#ffffff")
        ell(cx, cy + h * 0.45, w * 0.8, h * 0.3, "#dde6f6")

    puff(40, 56, 20, 7)
    puff(106, 36, 14, 5)
    puff(20, 74, 16, 6)
    puff(84, 80, 24, 8)
    # the sea of cloud below, where the island floats
    d.rectangle([0, 86, FW, FW], fill="#e6ecf8")
    for y in range(86, FW):
        for x in range(FW):
            r = (x * 5 + y * 11) % 13
            if r == 0:
                dot(x, y, "#f8fbff")
            elif r == 6 and y > 96:
                dot(x, y, "#c8d4ec")
    d.line([(0, 86), (FW, 86)], fill="#ffffff")
    # the island: a grassy dome with a stone rim, rising out of the clouds
    ell(64, 120, 78, 40, "#7a6a4e")
    ell(64, 119, 76, 38, "#8fd070")
    for y in range(80, FW):
        for x in range(FW):
            if ((x - 64) / 76) ** 2 + ((y - 119) / 38) ** 2 < 1:
                r = (x * 7 + y * 13) % 11
                if r == 0:
                    dot(x, y, "#a0dc82")
                elif r == 5 and y > 100:
                    dot(x, y, "#78c05e")
    d.arc([-12, 81, 140, 157], 200, 340, fill="#c8e8a0")
    # drifting stones above the island
    for sx, sy, sw in [(18, 64, 5), (112, 74, 6), (96, 56, 3)]:
        d.polygon([(sx - sw, sy), (sx + sw, sy), (sx + sw - 2, sy + sw), (sx, sy + sw + 3), (sx - sw + 2, sy + sw)], fill="#c8b890", outline="#6a5a40")
        d.line([(sx - sw + 1, sy + 1), (sx + sw - 1, sy + 1)], fill="#e8dcb4")
    # a broken sun temple: two pillars and half an arch, in warm sandstone with gold
    stone, edge, gold = "#d8c8a0", "#5a4a30", "#ffd860"
    for x0, top in [(92, 76), (112, 70)]:
        d.rectangle([x0, top, x0 + 6, 96], fill=stone, outline=edge)
        d.line([(x0 + 1, top + 1), (x0 + 1, 95)], fill="#f0e4c0")
        for yy in range(top + 4, 96, 6):
            d.line([(x0, yy), (x0 + 6, yy)], fill=edge)
        d.rectangle([x0, top, x0 + 6, top + 2], fill=gold)
    d.polygon([(92, 76), (98, 74), (104, 68), (110, 72), (112, 72), (112, 76), (106, 72), (100, 78)], fill=stone, outline=edge)
    d.line([(98, 74), (104, 68), (110, 72)], fill=gold)
    for x, y in [(94, 88), (115, 84), (116, 91), (95, 82)]:
        dot(x, y, gold)
    # a fallen column in the grass on the left, with a gold band
    d.rectangle([4, 100, 32, 107], fill=stone, outline=edge)
    d.line([(5, 101), (31, 101)], fill="#f0e4c0")
    for xx in (10, 16, 23):
        d.line([(xx, 100), (xx, 107)], fill=edge)
    d.rectangle([2, 98, 5, 109], fill="#bca878", outline=edge)
    d.line([(26, 100), (26, 107)], fill=gold)
    # the sun disc under the creature: pale stone with a gold inlay ring, gold points round the rim and a ring of glowing motes
    ell(64, 116, 30, 11, "#5a4a30")
    ell(64, 115, 29, 10, "#d8cdb0")
    ell(64, 115, 25, 8, "#ece4cc")
    d.ellipse([64 - 21, 115 - 6.6, 64 + 21, 115 + 6.6], outline="#e8b83c")
    for k in range(16):
        a = k / 16 * 2 * math.pi
        tip = (64 + 29.6 * math.cos(a), 115 + 10.4 * math.sin(a))
        b1 = (64 + 25.2 * math.cos(a - 0.14), 115 + 8.2 * math.sin(a - 0.14))
        b2 = (64 + 25.2 * math.cos(a + 0.14), 115 + 8.2 * math.sin(a + 0.14))
        d.polygon([b1, tip, b2], fill="#e8b83c")
    ring = [(64 + 18 * math.cos(a / 40 * 2 * math.pi), 115 + 5.4 * math.sin(a / 40 * 2 * math.pi)) for a in range(40)]
    for i, (x, y) in enumerate(ring):
        if i % 4 != 3:
            dot(round(x), round(y), "#fff6b0")
    for x, y in [(58, 124), (70, 125), (46, 120), (82, 120)]:
        dot(x, y, "#fff6b0")
    # flowers and tufts of grass
    for fx, fy, col in [(14, 118, "#ff8fb3"), (24, 123, "#ffffff"), (112, 112, "#ffd25a"), (118, 121, "#ff8fb3"), (100, 124, "#ffffff"), (40, 100, "#ffd25a")]:
        dot(fx, fy, col); dot(fx + 1, fy, col); dot(fx, fy + 1, "#4f9a3a")
    for _ in range(40):
        x, y = rnd.randint(2, 124), rnd.randint(92, 126)
        if ((x - 64) / 76) ** 2 + ((y - 119) / 38) ** 2 < 0.9 and ((x - 64) / 32) ** 2 + ((y - 116) / 13) ** 2 > 1:  # not on the disc
            dot(x, y, "#5aa84a"); dot(x + 1, y - 1, "#5aa84a")
    for x, y in [(30, 92), (60, 88), (52, 104), (92, 100), (122, 104), (70, 100)]:
        dot(x, y, "#fff6b0")
    return im


def with_creature(cr, look="open", frame=0):
    """The field with a creature standing on the sun disc: feet at the same row for every size, centered on the disc."""
    im = background()
    art = lib.render(cr.look(look, frame).rows(), cr.palette, 1)
    size = lib.SIZES[cr.stage]
    im.paste(art, (64 - size // 2, 118 - size), art)
    return im


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = sys.argv[1]
    if len(sys.argv) > 2:
        import sky_all
        by_id = {cr.id: cr for cr in sky_all.ROSTER}
        if sys.argv[2] not in by_id:
            sys.exit(f"no creature {sys.argv[2]!r}; the ids are {', '.join(by_id)}")
        with_creature(by_id[sys.argv[2]]).save(out)
    else:
        background().save(out)
    print("wrote", out)
