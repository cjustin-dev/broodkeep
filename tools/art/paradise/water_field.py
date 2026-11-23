"""The Water field (plan section 3): a sunken ruin with a glowing pearl shell for the creature to stand on, 128 x 128.

Usage: python3 water_field.py out.png [creature id]      (needs Pillow; run from tools/art/paradise/)

Without a creature id it writes the bare background, the picture the game will show behind a creature in the field. With one it
draws that creature standing on the shell, as a check of how each stage sits in the field.
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
    rnd = random.Random(23)

    def ell(cx, cy, rx, ry, fill, outline=None):
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=fill, outline=outline)

    def dot(x, y, col):
        if 0 <= x < FW and 0 <= y < FW:
            im.putpixel((x, y), hexrgb(col))

    # open water: bright near the surface, deeper and darker toward the floor, with dithered seams
    bands = ["#4fb4b8", "#3a9aa8", "#2a7e98", "#1f6486", "#184c74", "#123a62"]
    for y in range(0, 84):
        i = min(len(bands) - 1, y // 14)
        for x in range(FW):
            col = bands[i]
            if y % 14 >= 11 and i + 1 < len(bands) and (x + y) % 2 == 0:
                col = bands[i + 1]
            dot(x, y, col)
    # light shafts falling from the surface, a dithered lighter streak that fades with depth
    for x0 in (14, 46, 78, 104):
        for y in range(0, 60):
            left = x0 + y // 2
            width = 5 + y // 14
            for x in range(left, left + width):
                if (x + y) % 2 == 0 and y < 58 - (x - left) * 2:
                    dot(x, y, "#8fdcd4" if y < 30 else "#5cc0c4")
    for x in range(FW):  # the surface shimmer
        dot(x, 0, "#d8fff4" if x % 6 < 3 else "#8fdcd4")
        dot(x, 1, "#8fdcd4" if (x // 3) % 2 else "#4fb4b8")
    # a few small fish far away, drifting in a school
    for fx, fy in [(24, 40), (31, 44), (20, 48), (36, 38), (90, 30), (98, 34), (84, 36)]:
        d.polygon([(fx, fy), (fx + 3, fy - 1), (fx + 5, fy), (fx + 3, fy + 1)], fill="#123a62")
        dot(fx + 6, fy - 1, "#123a62"); dot(fx + 6, fy + 1, "#123a62")
    # far ruins: broken columns and a drowned arch in the murk, with a haze band
    d.polygon([(0, 74), (6, 58), (12, 58), (14, 70), (24, 66), (26, 48), (32, 48), (34, 64), (46, 70), (56, 60), (64, 62), (74, 54), (80, 54), (84, 66), (98, 62), (102, 46), (108, 46), (110, 60), (122, 64), (127, 56), (127, 84), (0, 84)], fill="#1a4a6e")
    d.polygon([(0, 80), (16, 72), (36, 78), (60, 70), (84, 78), (106, 72), (127, 78), (127, 86), (0, 86)], fill="#163e62")
    for y in range(66, 84):
        for x in range(FW):
            if (x + y) % 2 == 0 and y % 3 != 0:
                dot(x, y, "#3a8aa0" if y < 74 else "#2a6e8c")
    # the sea floor: dark sand with ripples and speckle
    d.rectangle([0, 84, FW, FW], fill="#1f4a58")
    for y in range(84, FW):
        for x in range(FW):
            r = (x * 7 + y * 13) % 11
            if r == 0:
                dot(x, y, "#2f6674")
            elif r == 5 and y > 94:
                dot(x, y, "#173a46")
        if y % 9 == 4:
            for x in range(FW):
                if (x // 5 + y // 9) % 2 == 0:
                    dot(x, y, "#2a5c6a")
    d.line([(0, 84), (FW, 84)], fill="#4a8a94")
    # a toppled column and a standing broken arch of stone, with coral growing on them
    stone, edge, coral = "#52707e", "#0e2230", "#e0607a"
    for x0, top in [(94, 72), (112, 66)]:
        d.rectangle([x0, top, x0 + 6, 90], fill=stone, outline=edge)
        d.line([(x0 + 1, top + 1), (x0 + 1, 89)], fill="#8aaab6")
        for yy in range(top + 4, 90, 6):
            d.line([(x0, yy), (x0 + 6, yy)], fill=edge)
        d.rectangle([x0, top, x0 + 6, top + 2], fill=coral)
    d.polygon([(94, 72), (100, 70), (106, 64), (112, 68), (114, 68), (114, 72), (108, 68), (102, 74)], fill=stone, outline=edge)
    d.line([(100, 70), (106, 64), (112, 68)], fill=coral)
    for x, y in [(96, 82), (119, 78), (120, 85), (97, 76), (115, 74)]:
        dot(x, y, coral); dot(x, y + 1, "#f09a8a")
    # the toppled column lies along the floor on the left
    d.rectangle([2, 94, 30, 101], fill=stone, outline=edge)
    d.line([(3, 95), (29, 95)], fill="#8aaab6")
    for xx in (8, 14, 21):
        d.line([(xx, 94), (xx, 101)], fill=edge)
    d.rectangle([0, 92, 3, 103], fill="#3c5866", outline=edge)
    for x, y in [(10, 93), (18, 93), (26, 94)]:
        dot(x, y, coral)
    # the glowing pearl shell under the creature: a wide open scallop, a bright rim and a ring of motes
    ell(64, 116, 30, 11, "#1a2a3c")
    ell(64, 115, 29, 10, "#cdb8d8")
    ell(64, 115, 25, 8, "#ecdcec")
    ridge = "#b296c4"
    for k in range(-5, 6):
        d.line([(64, 108), (64 + k * 5, 123)], fill=ridge)
    d.arc([36, 105, 92, 125], 20, 160, fill="#8a70a8")
    ring = [(64 + 26 * math.cos(a / 40 * 2 * math.pi), 115 + 8.4 * math.sin(a / 40 * 2 * math.pi)) for a in range(40)]
    for i, (x, y) in enumerate(ring):
        if i % 4 != 3:
            dot(round(x), round(y), "#7ff5ff")
    for x, y in [(58, 124), (70, 125), (46, 120), (82, 120)]:
        dot(x, y, "#d8fff4")
    # a glowing pearl on the shell's lip, in front
    ell(44, 122, 3, 3, "#f4e8f4", "#1a2a3c")
    dot(43, 121, "#ffffff"); dot(44, 121, "#ffffff")
    ell(86, 121, 2, 2, "#f4e8f4", "#1a2a3c")
    dot(85, 120, "#ffffff")
    # sea anemones that glow, with a soft halo on the sand
    for mx, my in [(112, 108), (120, 112), (104, 116)]:
        for hy in range(-7, 8):
            for hx in range(-10, 11):
                dist = (hx * hx) / 100 + (hy * hy) / 49
                if dist <= 1 and rnd.random() < 0.55 * (1 - dist):
                    dot(mx + hx, my + hy, "#5a3a78")
        d.rectangle([mx - 1, my, mx + 1, my + 5], fill="#e8d0e4", outline="#1a2a3c")
        ell(mx, my, 5, 3, "#f07ac8", "#7a2a68")
        dot(mx - 2, my - 1, "#ffe0f4"); dot(mx + 1, my, "#ffe0f4")
    # kelp swaying on the left
    for kx, h in [(8, 42), (15, 34), (36, 40)]:
        for i in range(h):
            sway = round(2.4 * math.sin(i / 5.0 + kx))
            dot(kx + sway, 100 - i, "#0e3a38")
            dot(kx + sway + 1, 100 - i, "#2a8a5a" if i % 4 else "#4ab878")
            if i % 9 == 4:
                dot(kx + sway + 2, 100 - i, "#4ab878"); dot(kx + sway + 3, 99 - i, "#4ab878")
    # an urn and some bones of old ships on the sand
    d.rectangle([46, 98, 54, 105], fill="#c8885a", outline=edge)
    d.rectangle([48, 95, 52, 98], fill="#c8885a", outline=edge)
    d.line([(47, 100), (53, 100)], fill="#8a5a3a")
    d.line([(100, 124), (112, 120)], fill="#d8cfb0", width=2)
    d.line([(8, 122), (20, 119)], fill="#d8cfb0", width=1)
    # bubbles rising, and sand sparkles
    for bx, by, r in [(20, 24, 2), (24, 14, 1), (60, 30, 2), (66, 20, 1), (100, 44, 2), (118, 22, 1), (40, 56, 1)]:
        ell(bx, by, r, r, "#8fdcd4" if r == 1 else "#3a9aa8", "#d8fff4")
    for _ in range(40):
        x, y = rnd.randint(2, 124), rnd.randint(88, 126)
        dot(x, y, "#4a8a94"); dot(x + 1, y - 1, "#4a8a94")
    for x, y in [(30, 90), (60, 86), (52, 102), (92, 94), (124, 102), (70, 100)]:
        dot(x, y, "#d8fff4")
    return im


def with_creature(cr, look="open", frame=0):
    """The field with a creature standing on the shell: feet at the same row for every size, centered on the shell."""
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
        import water_all
        by_id = {cr.id: cr for cr in water_all.ROSTER}
        if sys.argv[2] not in by_id:
            sys.exit(f"no creature {sys.argv[2]!r}; the ids are {', '.join(by_id)}")
        with_creature(by_id[sys.argv[2]]).save(out)
    else:
        background().save(out)
    print("wrote", out)
