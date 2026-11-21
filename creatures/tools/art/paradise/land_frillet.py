"""The Frillet line of the Land field (plan section 4): young Frillet (fed worms) and its four adults, tier 1 to 4.

Sunfrill (tier 1), Plateback (2), Bogviper (3), Slugwyrm (4). Bodies only: lib.stamp_face() adds the faces.
"""
import math

from lib import FACE_LETTERS, SIZES, Anchor, Body, Canvas, Creature, bands, mid_palette, sym, with_face
from land import PEBBLIN

S, Y = SIZES["adult"], SIZES["young"]

# ---------- palettes ----------
SUNFRILL = with_face(
    {"B": "#5f9a48", "D": "#3d6c32", "L": "#e8e0a0", "F": "#f0b838", "f": "#d8742a", "Y": "#ffe27a", "H": "#f0e8c8"},
    iris="#ffd23a", arch="#1c2a14", mouth="#4a1a14", tooth="#f3f1e6", outline="#12180c",
)
PLATEBACK = with_face(
    {"B": "#4f9a86", "D": "#336c5e", "L": "#bfe0c0", "F": "#e8a040", "f": "#b8702a", "H": "#eadfc4"},
    iris="#ffe27a", arch="#10241e", mouth="#3a1a1a", tooth="#f3f1e6", outline="#0e1a16",
)
BOGVIPER = with_face(
    {"B": "#6a7e40", "D": "#445a2c", "d": "#27331a", "L": "#a0b468", "g": "#78a040"},
    iris="#ffe040", arch="#12180c", mouth="#3a1018", tooth="#f3f1e6", outline="#0c1008",
)
SLUGWYRM = with_face(
    {"B": "#b79ab8", "D": "#8a6a8e", "d": "#6a4e6e", "L": "#d8c4dc", "S": "#9ad0d8", "s": "#6aa8b8", "w": "#9a7a9e", "H": "#cbb8a0"},
    iris="#a8a0c8", arch="#2a1a2e", mouth="#5a2a3a", tooth="#e8dcc8", outline="#1a1020",
)
FRILLET = {k: v for k, v in mid_palette(PEBBLIN, SUNFRILL).items() if k in "BDLFf" + FACE_LETTERS}  # halfway from Pebblin to Sunfrill


def rays(c, cx, cy, rx, ry, degs, letter, f=0, glint=None):
    """Lines from the middle of a fan out to its rim, over the fan's own color. glint: (letter, every n pixels)."""
    for k, deg in enumerate(degs):
        a = math.radians(deg)
        cells = sorted(c.L(int(cx), int(cy), int(cx + math.cos(a) * rx), int(cy + math.sin(a) * ry)), key=lambda p: (p[0] - cx) ** 2 + (p[1] - cy) ** 2)
        for i, (x, y) in enumerate(cells):
            c.px(x, y, glint[0] if glint and i > 6 and (i + k + f) % glint[1] == 0 else letter)


# =================== young: Frillet, a small frilled lizard ===================
def frillet(f=0):
    c = Canvas(Y, Y)
    c.put(c.E(18, 16.6, 14.2 + f * 0.8, 11.0 + f * 0.4), "F", ring=True, ringc="K", shade=("f", None))
    rays(c, 18, 17, 12.6 + f * 0.8, 9.6, range(200, 341, 20), "f")
    c.put(c.chain([(25.5, 29.6, 3.4, 2.8), (29.6, 29.4, 2.8, 2.4), (32.4, 27.2, 2.2, 2.1), (33.2 + f * 0.4, 23.8 - f * 1.0, 1.6, 1.8)]), "B", ring=True, ringc="K", minshade=3)
    for x in (13, 23):
        c.put(c.E(x, 32.4, 3.6, 1.6), "D", ring=True, ringc="K")
    c.put(c.E(18, 27.6, 6.6, 6.2), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(18, 28.6, 3.8, 4.6), "L")
    c.put(sym(c.E(11.2, 27.4, 2.0, 3.2), Y), "B", ring=True, ringc="K", shade=("D", None), minshade=3)
    c.put(c.E(18, 17, 9.6, 8.0), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(18, 21.2, 5.2, 3.0), "L")
    c.outline("K")
    return Body(c, Anchor(10, 14, 21))


# =================== adult, worm tier 1: Sunfrill, a regal lizard with a huge sun-fan frill ===================
def sunfrill(f=0):
    c = Canvas(S, S)
    c.put(c.E(24, 21, 21, 17.5), "F", ring=True, ringc="K", shade=("f", None))
    rays(c, 24, 23, 19.5, 16.2, range(190, 351, 12), "f", f=f, glint=("Y", 5))  # the rays shimmer on the second drawing
    c.put(c.chain([(34, 40.5, 4.2, 3.0), (38.6, 38.4, 3.4, 2.8), (41.8, 34.6, 2.7, 2.6), (43.2 + f * 0.8, 30.2 - f * 1.2, 2.0, 2.4)]), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
    for x in (17.5, 30.5):
        c.put(c.E(x, 43.2, 5.2, 2.6), "D", ring=True, ringc="K")
    c.pxs(sym({(14, 45), (17, 45)}, S), "H")  # toes
    c.put(c.E(24, 33.6, 9.6, 9.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 34.8, 5.6, 7.8), "L")
    bands(c, (31, 34, 37, 40), "Y")
    c.put(sym(c.E(12.6, 33.4 - f * 2, 3.2, 4.8), S), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 19.8, 9.8, 8.2), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 24.4, 5.6, 3.2), "L")
    for pts in ([(20, 12), (21, 7), (23, 11)], [(23, 11), (24, 5), (25, 11)], [(25, 11), (27, 7), (28, 12)]):
        c.put(c.P(pts), "F", ring=True, ringc="K", minshade=99)  # a gold crest
    c.outline("K")
    return Body(c, Anchor(16, 17, 24))


# =================== adult, worm tier 2: Plateback, a small stegosaur with a fan of plates ===================
def plateback(f=0):
    c = Canvas(S, S)
    plates = [((8, 16), 11), ((40, 16), 11), ((15, 9), 11), ((33, 9), 11), ((24, 5), 12)]  # broad plates, the middle one drawn last so it is on top
    for i, ((tx, ty), width) in enumerate(plates):
        ty += f if i % 2 else 0  # alternate plates twitch on the second drawing
        c.put(c.P([(tx - width / 2, 27), (tx - width / 2 + 1, ty + 5), (tx, ty), (tx + width / 2 - 1, ty + 5), (tx + width / 2, 27)]), "F", ring=True, ringc="K", minshade=99)
        c.pxs(sorted(c.L(tx, 26, tx, ty + 4)), "f")
    c.put(c.chain([(36, 41.4, 4.0, 2.8), (40.6, 39.2, 3.2, 2.6), (43.4, 36, 2.4, 2.4)]), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
    for pts in ([(42, 34), (44.6, 29.4), (45.8, 35)], [(41, 38), (46, 38), (44, 41)]):
        c.put(c.P(pts), "F", ring=True, ringc="K", minshade=99)
    for x in (16.6, 31.4):
        c.put(c.E(x, 43.2, 5.2, 2.6), "D", ring=True, ringc="K")
    c.pxs(sym({(13, 45), (16, 45)}, S), "H")  # toes
    c.put(c.E(24, 33, 13.2, 10.2), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 35, 7.8, 7.2), "L")
    c.put(sym(c.E(11, 34.6, 3.4, 4.6), S), "B", ring=True, ringc="K", shade=("D", "L"))
    for x in (9.6, 12.8, 35.2, 38.4):
        c.px(int(x), 38 + f, "H")
    c.put(c.E(24, 21.6, 9.8, 8.2), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 25.4, 5.6, 3.2), "L")
    c.outline("K")
    return Body(c, Anchor(16, 19, 25))


# =================== adult, worm tier 3: Bogviper, a bog snake in three coils ===================
def bogviper(f=0):
    c = Canvas(S, S)
    c.put(c.chain([(37, 43.4, 3.4, 2.0), (41, 42.6, 2.6, 1.8), (44.4 + f * 0.6, 40.6 - f * 1.4, 1.8, 1.6)]), "B", ring=True, ringc="K", minshade=3)  # the tail tip
    c.put(c.E(24, 41.4, 16.4, 4.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 36.4, 13.4, 4.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 31.2, 10.6, 4.6), "B", ring=True, ringc="K", shade=("D", "L"))
    for y, xs in ((41, range(12, 37, 5)), (36, range(15, 34, 5)), (31, range(18, 31, 4))):
        for x in xs:
            c.pxs([(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)], "d")
    c.pxs([(10, 40), (11, 40), (38, 39), (24, 44), (25, 44), (30, 35)], "g")  # bog moss on the coils
    c.put(c.E(24, 21.4, 12.8, 8.6 + f * 0.4), "D", ring=True, ringc="K", shade=("d", None))  # a hood that flares
    c.put(c.E(24, 19.4, 9.6, 7.8), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 23.6, 5.6, 3.0), "L")
    c.pxs([(20, 13), (21, 13), (26, 13), (27, 13), (23, 12), (24, 12)], "g")
    c.outline("K")
    return Body(c, Anchor(16, 16, 22))


# =================== adult, worm tier 4: Slugwyrm, a limp half-slug wyrm in its own slime ===================
def slugwyrm(f=0):
    c = Canvas(S, S)
    c.put(c.E(24, 43.8, 20.6, 2.2), "S", ring=True, ringc="K", shade=("s", None), minshade=3)
    wing = [(14, 27), (7, 30 + f), (5, 38 + f), (10, 35), (14, 33)]
    c.put(c.P(wing), "w", ring=True, ringc="K", minshade=99)
    c.put(c.P([(48 - x, y) for x, y in wing]), "w", ring=True, ringc="K", minshade=99)
    c.put(c.E(24, 35.6, 17.6, 8.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 38, 11, 5.4), "L")
    for y, xs in ((34, (13, 18, 30, 35)), (37, (11, 15, 33, 37)), (40, (14, 20, 28, 34))):
        for x in xs:
            c.pxs([(x, y), (x + 1, y)], "d")  # wrinkles
    for pts in ([(18, 18), (14, 13 + f), (20, 16)], [(30, 18), (34, 13 + f), (28, 16)]):
        c.put(c.P(pts), "H", ring=True, ringc="K", minshade=99)  # horn nubs that droop
    c.put(c.E(24, 24.4 + f * 0.6, 9.4, 7.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 28.4 + f * 0.6, 5.4, 2.8), "L")
    c.outline("K")
    return Body(c, Anchor(17, 22, 28))


ROSTER = [
    Creature("frillet", "Frillet", "young", FRILLET, frillet, role="quick"),
    Creature("sunfrill", "Sunfrill", "adult", SUNFRILL, sunfrill, role="caster"),
    Creature("plateback", "Plateback", "adult", PLATEBACK, plateback, role="tank"),
    Creature("bogviper", "Bogviper", "adult", BOGVIPER, bogviper, role="fighter"),
    Creature("slugwyrm", "Slugwyrm", "adult", SLUGWYRM, slugwyrm, role="tank"),
]
