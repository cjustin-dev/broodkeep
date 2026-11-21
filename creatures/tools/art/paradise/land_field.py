"""The Land field (plan section 3): a ruined hollow at dusk, 128 x 128, ported unchanged from the approved gritty sheet.

Usage: python3 land_field.py out.png [creature id]      (needs Pillow; run from tools/art/paradise/)

Without a creature id it writes the bare background, the picture the game will show behind a creature in the field. With one it
draws that creature standing on the rune slab, as a check of how each stage sits in the field.
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
    rnd = random.Random(11)

    def ell(cx, cy, rx, ry, fill, outline=None):
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill, outline=outline)

    def dot(x, y, col):
        if 0 <= x < FW and 0 <= y < FW:
            im.putpixel((x, y), hexrgb(col))

    # dusk sky with dithered seams
    bands = ["#1c1432", "#2c1d4a", "#51295c", "#8a3f62", "#c9694f", "#f0a05c"]
    for y in range(0, 74):
        i = min(len(bands) - 1, y // 13)
        for x in range(FW):
            col = bands[i]
            if y % 13 >= 10 and i + 1 < len(bands) and (x + y) % 2 == 0:
                col = bands[i + 1]
            dot(x, y, col)
    for _ in range(26):
        dot(rnd.randint(0, FW - 1), rnd.randint(0, 36), "#cfc6e8")
    # moon
    ell(98, 24, 11, 11, "#6a4a78")
    ell(98, 24, 9, 9, "#ece6f2")
    for cx, cy, r in [(95, 21, 2), (101, 27, 2), (99, 19, 1)]:
        ell(cx, cy, r, r, "#cbc4dc")
    # far ridges and a fog band
    d.polygon([(0, 70), (10, 56), (18, 62), (30, 48), (40, 60), (52, 52), (62, 64), (76, 50), (88, 62), (100, 54), (112, 63), (124, 52), (127, 58), (127, 80), (0, 80)], fill="#2c1f3e")
    d.polygon([(0, 78), (14, 68), (26, 74), (42, 64), (58, 74), (74, 66), (92, 76), (108, 68), (127, 74), (127, 84), (0, 84)], fill="#221730")
    for y in range(66, 80):
        for x in range(FW):
            if (x + y) % 2 == 0 and y % 3 != 0:
                dot(x, y, "#a8607c" if y < 73 else "#7a4a68")
    # ground: dark moss with texture
    d.rectangle([0, 80, FW, FW], fill="#2f3a2c")
    for y in range(80, FW):
        for x in range(FW):
            r = (x * 7 + y * 13) % 11
            if r == 0:
                dot(x, y, "#3f5237")
            elif r == 5 and y > 90:
                dot(x, y, "#242c22")
    d.line([(0, 80), (FW, 80)], fill="#4f6a45")
    # dead trees
    def dead_tree(x, base, h, lean):
        for i in range(h):
            w = max(1, 4 - i * 3 // h)
            tx = x + int(lean * i / h)
            d.rectangle([tx - w // 2, base - i, tx + w // 2, base - i], fill="#140f1c")
        top = x + lean
        for dx, dy, ln in [(-1, 0.55, 9), (1, 0.7, 8), (-1, 0.85, 6), (1, 0.95, 5)]:
            sy = base - int(h * dy)
            sx = x + int(lean * dy)
            d.line([(sx, sy), (sx + dx * ln, sy - ln // 2)], fill="#140f1c", width=1)
            d.line([(sx + dx * ln, sy - ln // 2), (sx + dx * (ln + 3), sy - ln // 2 - 3)], fill="#140f1c", width=1)
        ell(top, base - h, 1, 1, "#140f1c")
    dead_tree(16, 84, 46, -5)
    dead_tree(30, 84, 36, -3)
    # a broken stone arch, mossy
    stone, edge, moss = "#4a4658", "#1a1424", "#5f8a4a"
    for x0, top in [(92, 70), (112, 66)]:
        d.rectangle([x0, top, x0 + 6, 88], fill=stone, outline=edge)
        d.line([(x0 + 1, top + 1), (x0 + 1, 87)], fill="#7a768c")
        for yy in range(top + 4, 88, 6):
            d.line([(x0, yy), (x0 + 6, yy)], fill=edge)
        d.rectangle([x0, top, x0 + 6, top + 2], fill=moss)
    d.polygon([(92, 70), (98, 68), (104, 62), (110, 66), (112, 66), (112, 70), (106, 66), (100, 72)], fill=stone, outline=edge)
    d.line([(98, 68), (104, 62), (110, 66)], fill=moss)
    for x, y in [(94, 80), (117, 76), (118, 83), (95, 74)]:
        dot(x, y, moss)
    # glowing rune slab under the creature
    ell(64, 116, 30, 11, "#26202e")
    ell(64, 115, 29, 10, "#6e6b7c")
    ell(64, 115, 25, 8, "#585566")
    for x0, y0, x1, y1 in [(40, 112, 48, 118), (80, 110, 88, 114), (52, 122, 58, 124)]:
        d.line([(x0, y0), (x1, y1)], fill="#26202e")
    ring = [(64 + 26 * math.cos(a / 40 * 2 * math.pi), 115 + 8.4 * math.sin(a / 40 * 2 * math.pi)) for a in range(40)]
    for i, (x, y) in enumerate(ring):
        if i % 4 != 3:
            dot(round(x), round(y), "#5ff2d0")
    for x, y in [(58, 124), (70, 125), (46, 120), (82, 120)]:
        dot(x, y, "#9fffe8")
    # glowing mushrooms with a halo
    for mx, my in [(14, 108), (22, 112), (8, 116)]:
        for hy in range(-7, 8):
            for hx in range(-10, 11):
                dist = (hx * hx) / 100 + (hy * hy) / 49
                if dist <= 1 and rnd.random() < 0.55 * (1 - dist):
                    dot(mx + hx, my + hy, "#2f6a60")
        d.rectangle([mx - 1, my, mx + 1, my + 5], fill="#cfe9df", outline="#26202e")
        ell(mx, my, 5, 3, "#5ff2d0", "#1f5a52")
        dot(mx - 2, my - 1, "#d8fff4"); dot(mx + 1, my, "#d8fff4")
    # bones and a skull
    ell(112, 110, 5, 4, "#d8cfb0", "#26202e")
    d.rectangle([109, 112, 115, 114], fill="#d8cfb0", outline="#26202e")
    for x in (110, 114):
        d.rectangle([x, 108, x + 1, 110], fill="#1a1018")
    d.line([(100, 122), (112, 118)], fill="#d8cfb0", width=2)
    d.line([(106, 126), (118, 123)], fill="#d8cfb0", width=1)
    # a dark bog puddle with green wisps
    ell(106, 96, 14, 4, "#14262c", "#4a7a5a")
    d.line([(100, 95), (106, 95)], fill="#a89cc8")
    d.line([(103, 97), (110, 97)], fill="#6a6a98")
    for x, y in [(98, 97), (114, 96), (110, 94)]:
        dot(x, y, "#6aff9a")
    # cracks, tufts and wisps
    for x0, y0, x1, y1 in [(30, 96, 42, 100), (42, 100, 48, 108), (88, 100, 94, 108), (20, 124, 32, 120)]:
        d.line([(x0, y0), (x1, y1)], fill="#1c241a")
    for _ in range(44):
        x, y = rnd.randint(2, 124), rnd.randint(84, 126)
        dot(x, y, "#5f7a4a"); dot(x + 1, y - 1, "#5f7a4a")
    for x, y in [(30, 90), (60, 84), (52, 100), (92, 92), (122, 100), (70, 98)]:
        dot(x, y, "#9fffe8"); dot(x + 1, y, "#2f6a60")
    return im


def with_creature(cr, look="open", frame=0):
    """The field with a creature standing on the slab: feet at the same row for every size, centered on the slab."""
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
        import land_all
        by_id = {cr.id: cr for cr in land_all.ROSTER}
        if sys.argv[2] not in by_id:
            sys.exit(f"no creature {sys.argv[2]!r}; the ids are {', '.join(by_id)}")
        with_creature(by_id[sys.argv[2]]).save(out)
    else:
        background().save(out)
    print("wrote", out)
