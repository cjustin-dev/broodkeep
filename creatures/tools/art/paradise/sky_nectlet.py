"""The Nectlet line of the Sky field (plan section 4): the syrup young Nectlet (a fuzzy moth) and its four adults, tier 1 to 4.

Paleveil (tier 1), Honeyfuzz (2), Spitewing (3), Tatterwing (4). Bodies only: lib.stamp_face() adds the faces. Insects, so no beaks:
the mouth is stamped as usual. A face mirrors about the centre column, so every head sits on x = 24 (x = 18 for the young).
"""
import math

from lib import SIZES, Anchor, Body, Canvas, Creature, with_face
from sky import mirror
from water_lanternfin import dense

S = SIZES["adult"]

# ---------- palettes ----------
PALEVEIL = with_face(
    {"B": "#d4ece4", "D": "#9cc4bc", "d": "#6a948e", "L": "#f4fffa", "c": "#f4ecd8", "C": "#c8bca0", "g": "#5ac8f0", "G": "#2a7ab8", "y": "#ffe070", "v": "#9cc4bc"},
    iris="#3a3a6a", arch="#3a3a6a", mouth="#8a4a5a", tooth="#fffaf0", blush="#ff9aa8", outline="#2e4a52",
)
NECTLET = with_face(
    {"B": "#d8d4ec", "D": "#a8a0cc", "d": "#7a729e", "L": "#f4f0ff", "c": "#f4ecd8", "C": "#c8bca0", "g": "#8ad0f0", "G": "#4a8ab8", "v": "#a8a0cc"},
    iris="#2b2a55", arch="#2b2a55", mouth="#8a4a5a", tooth="#fffaf0", blush="#ff9aa8", outline="#3a3258",
)
HONEYFUZZ = with_face(
    {"B": "#f0b838", "D": "#c08418", "d": "#8a5a0c", "L": "#ffe08a", "k": "#3a2a1a", "w": "#c8e8f4", "v": "#8ab8cc", "z": "#5a3a1a"},
    iris="#2b2a55", arch="#3a2a1a", mouth="#8a3a20", tooth="#fff0d0", blush="#ff9a7a", outline="#2a1c10",
)
SPITEWING = with_face(
    {"B": "#e8d040", "D": "#b09a20", "d": "#7a6a10", "L": "#fff080", "k": "#2a2418", "w": "#dce4c4", "v": "#8a9a70", "z": "#3a2a20"},
    iris="#e83a2a", arch="#ff6a4a", mouth="#3a1010", tooth="#f0e8c0", outline="#16120a",
)
TATTERWING = with_face(
    {"B": "#c88a5a", "D": "#96602e", "d": "#6a4020", "L": "#e8b888", "O": "#d89a58", "o": "#f0c890", "v": "#8a5a30", "n": "#a8784a"},
    iris="#4a3a30", arch="#3a2a20", mouth="#8a4a40", tooth="#f4e4d0", tear="#9adcf4", outline="#34200f",
)


# =================== young, syrup: Nectlet, a fuzzy little moth with feathery feelers ===================
def nectlet(f=0):
    c = Canvas(36, 36)
    wing = [(12, 17), (5, 8 + f), (1, 18), (4, 27), (11, 25)]  # soft wings that flutter
    for pts in (wing, mirror(wing, 36)):
        c.put(c.P(pts), "B", ring=True, ringc="K", shade=("D", "L"), minshade=99)
    for x in (6.4, 29.6):  # an eye spot on each wing
        c.put(c.E(x, 18.6, 2.4, 2.4), "g", ring=True, ringc="G", minshade=99)
    for sx in (1, -1):  # feathery feelers
        pts = [(18 - sx * 3, 9), (18 - sx * 5, 5), (18 - sx * 8, 3), (18 - sx * 10, 4)]
        for a, b in zip(pts, pts[1:]):
            c.pxs(sorted(c.L(*a, *b)), "d")
        c.pxs([(18 - sx * 6, 6), (18 - sx * 7, 4), (18 - sx * 9, 5)], "D")
    for x in (14, 22):
        c.put(c.E(x, 33.2, 2.6, 1.4), "d", ring=True, ringc="K")
    c.put(c.E(18, 26.4, 8.2, 7.4), "c", ring=True, ringc="K", shade=("C", None))
    for x in (11, 14, 17, 20, 23, 26):  # a fuzzy collar
        c.put(c.E(x, 21.6, 2.4, 2.0), "c", ring=True, ringc="K", minshade=99)
    c.put(c.E(18, 14.8, 8.4, 7.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.outline("K")
    return Body(c, Anchor(8, 13, 19))


# =================== adult, syrup tier 1: Paleveil, a huge pale moth with glowing wing eyes ===================
def paleveil(f=0):
    c = Canvas(S, S)
    hind = [(19, 28), (9, 30), (5, 37), (5, 45), (10, 41), (14, 38)]  # the lower wings end in long tails
    fore = [(19, 20), (8, 5 - f * 2), (1, 12), (1, 24), (8, 30), (19, 31)]
    for pts in (hind, mirror(hind, S)):
        c.put(c.P(pts), "L", ring=True, ringc="K", shade=("D", None), minshade=99)
    for pts in (fore, mirror(fore, S)):
        c.put(c.P(pts), "B", ring=True, ringc="K", shade=("D", "L"), minshade=99)
    for x in (9, 39):  # a glowing eye on each wing
        c.put(c.E(x, 17, 4.6, 4.6), "G", ring=True, ringc="K", minshade=99)
        c.put(c.E(x, 17, 3.0, 3.0), "g")
        c.put(c.E(x, 17, 1.2, 1.2), "y")
    for x in (6, 42):
        c.px(x, 26, "v")
        c.px(x, 27, "v")
    c.put(c.E(24, 31, 6.8, 11.4), "c", ring=True, ringc="K", shade=("C", None))
    for x in (19, 22, 25, 28):  # a fuzzy collar
        c.put(c.E(x, 24.6, 2.6, 2.2), "c", ring=True, ringc="K", minshade=99)
    for sx in (1, -1):  # feathery feelers
        pts = [(24 - sx * 4, 11), (24 - sx * 6, 7), (24 - sx * 10, 4), (24 - sx * 14, 2)]
        for a, b in zip(pts, pts[1:]):
            c.pxs(sorted(c.L(*a, *b)), "d")
        c.pxs([(24 - sx * 7, 5), (24 - sx * 9, 3), (24 - sx * 12, 5)], "D")
    c.put(c.E(24, 17, 8.8, 7.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.outline("K")
    return Body(c, Anchor(16, 15, 21))


# =================== adult, syrup tier 2: Honeyfuzz, a round fuzzy bumblebee with striped fur and a small stinger ===================
def honeyfuzz(f=0):
    c = Canvas(S, S)
    for x in (13, 35):  # pale wings at the back
        c.put(c.E(x, 14 + f, 5.6, 9.4), "w", ring=True, ringc="K", shade=("v", None), minshade=99)
    c.put(c.P([(38, 38), (45, 42), (39, 44)]), "k", ring=True, ringc="K", minshade=99)  # the stinger
    for i in range(14):  # fuzz all round the body
        a = math.radians(i * 25.7 + 8)
        if math.sin(a) > 0.9:
            continue
        c.put(c.E(24 + 15.6 * math.cos(a), 30.4 + 13.4 * math.sin(a), 2.2, 2.0), "B", ring=True, ringc="K", minshade=99)
    for x in (17, 31):
        c.put(c.E(x, 44.2, 3.0, 1.4), "k", ring=True, ringc="K")
    body = c.E(24, 30.4, 15.6, 13.4)
    c.put(body, "B", ring=True, ringc="K", shade=("D", "L"))
    for y0, y1 in ((32, 34), (38, 40)):  # dark stripes
        c.put(body & c.R(0, y0, 47, y1), "k")
    c.put(c.E(24, 18, 11.0, 9.2), "B", ring=True, ringc="K", shade=("D", "L"))
    for sx in (1, -1):  # little ball-tipped feelers
        c.pxs(sorted(c.L(24 - sx * 5, 10, 24 - sx * 9, 3)), "k")
        c.put(c.E(24 - sx * 9.4, 2.6, 1.4, 1.4), "k")
    c.outline("K")
    return Body(c, Anchor(15, 16, 23))


# =================== adult, syrup tier 3: Spitewing, a grumpy scrappy wasp ===================
def spitewing(f=0):
    c = Canvas(S, S)
    wing = c.P([(17, 20), (5, 6 - f * 2), (1, 15), (5, 22), (9, 26), (17, 25)]) - c.E(6, 20, 3.0, 2.4)  # torn
    for sh in (wing, c.P([(31, 20), (43, 6 - f * 2), (47, 15), (43, 22), (39, 26), (31, 25)]) - c.E(42, 20, 3.0, 2.4)):
        c.put(sh, "w", ring=True, ringc="K", shade=("v", None), minshade=99)
    c.put(c.P([(22, 42), (24, 46), (26, 42)]), "z", ring=True, ringc="K", minshade=99)  # the stinger
    abdomen = c.E(24, 37.2, 8.4, 6.6)
    c.put(abdomen, "B", ring=True, ringc="K", shade=("D", "L"))
    for y0, y1 in ((34, 35), (38, 39)):
        c.put(abdomen & c.R(0, y0, 47, y1), "k")
    c.put(c.E(24, 30.4, 2.8, 2.4), "d", ring=True, ringc="K")  # a thin waist
    thorax = c.E(24, 22.4, 9.8, 7.6)
    c.put(thorax, "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(thorax & c.R(0, 26, 47, 27), "k")
    for x in (17, 31):  # scrappy legs
        c.put(c.L(x, 28, x - (3 if x < 24 else -3), 33), "k")
    c.put(c.E(24, 12.4, 9.0, 7.4), "B", ring=True, ringc="K", shade=("D", "L"))
    for sx in (1, -1):  # jagged feelers
        pts = [(24 - sx * 4, 6), (24 - sx * 7, 3), (24 - sx * 9, 5), (24 - sx * 12, 1)]
        for a, b in zip(pts, pts[1:]):
            c.pxs(sorted(c.L(*a, *b)), "k")
    c.pxs([(29, 9), (30, 10), (31, 11)], "z")  # a scar
    c.outline("K")
    return Body(c, Anchor(16, 11, 16))


# =================== adult, syrup tier 4: Tatterwing, a limp butterfly with torn wings ===================
def tatterwing(f=0):
    c = Canvas(S, S)
    wing = [(19, 19), (7 - f, 20 + f), (3 - 2 * f, 30 + 2 * f), (4 - f, 41), (10, 45), (13, 38), (16, 44), (19, 36), (20, 28)]  # the wings hang down and sway
    bites = [(3.2, 34, 3.4, 3.6), (9.6, 45.6, 3.2, 2.4), (14, 40, 1.8, 2.2)]  # chewed along the edge, and one hole
    for pts, holes in ((wing, bites), (mirror(wing, S), [(S - x, y, rx, ry) for x, y, rx, ry in bites])):
        shape = c.P(pts)
        for cx, cy, rx, ry in holes:
            shape = shape - c.E(cx, cy, rx, ry)
        c.put(shape, "O", ring=True, ringc="K", shade=("o", None), minshade=99)
    for sx in (1, -1):  # veins
        for x1, y1 in ((5, 33), (8, 41), (14, 43)):
            c.pxs(sorted(c.L(24 - sx * 5, 22 + (y1 - 33) // 3, 24 - sx * (24 - x1), y1)), "v")
    for x in (22, 26):
        c.put(c.L(x, 40, x + (-1 if x < 24 else 1), 45), "d")
    c.put(c.E(24, 31, 5.4, 11.8), "n", ring=True, ringc="K", shade=("d", None), minshade=3)
    for sx in (1, -1):  # feelers hang down
        pts = [(24 - sx * 3, 11, 0, 0), (24 - sx * 7, 7, 0, 0), (24 - sx * 12, 8, 0, 0), (24 - sx * 14, 13 + f, 0, 0)]
        for p in dense(pts, 1):
            c.px(round(p[0]), round(p[1]), "d")
    c.put(c.E(24, 18, 8.6, 7.8), "B", ring=True, ringc="K", shade=("D", "L"))
    c.outline("K")
    return Body(c, Anchor(16, 16, 22))


ROSTER = [
    Creature("nectlet", "Nectlet", "young", NECTLET, nectlet, role="caster"),
    Creature("paleveil", "Paleveil", "adult", PALEVEIL, paleveil, role="caster"),
    Creature("honeyfuzz", "Honeyfuzz", "adult", HONEYFUZZ, honeyfuzz, role="tank"),
    Creature("spitewing", "Spitewing", "adult", SPITEWING, spitewing, role="fighter"),
    Creature("tatterwing", "Tatterwing", "adult", TATTERWING, tatterwing, role="quick"),
]
