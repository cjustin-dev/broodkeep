"""The Wisplet line of the Sky field (plan section 4): the "other" young Wisplet (a cloud sprout) and its four adults, tier 1 to 4.

Galecrown (tier 1), Softnimbus (2), Smogrump (3), Fogsag (4). Bodies only: lib.stamp_face() adds the faces. This is the one line with
no animal body: each creature is a cloud made of overlapping ellipses with a flat bottom to stand on.
"""
from lib import SIZES, Anchor, Body, Canvas, Creature, with_face
from water_lanternfin import dense

S = SIZES["adult"]

# ---------- palettes ----------
GALECROWN = with_face(
    {"B": "#5a6a8c", "D": "#3a4766", "d": "#262f48", "L": "#8a9ab8", "y": "#ffe060", "Y": "#ffb830", "g": "#fff6b0"},
    iris="#ffe060", arch="#ffd040", mouth="#1a1830", tooth="#fff6c0", outline="#10162a",
)
WISPLET = with_face(
    {"B": "#d4dcf0", "D": "#a4b0d4", "d": "#7886b0", "L": "#f4f8ff", "y": "#ffd860", "Y": "#e8a830"},
    iris="#2b2a55", arch="#2b2a55", mouth="#8a4a6a", tooth="#fffaf0", blush="#ff9ab4", outline="#3a4470",
)
SOFTNIMBUS = with_face(
    {"B": "#f4f0fa", "D": "#cfc8e4", "d": "#a89cc8", "L": "#ffffff", "r": "#ffb0c4", "R": "#e8809c"},
    iris="#4a3a6a", arch="#4a3a6a", mouth="#c0607c", tooth="#ffffff", blush="#ff8aa8", outline="#5a4e80",
)
SMOGRUMP = with_face(
    {"B": "#8a8c96", "D": "#5e6070", "d": "#3c3e4c", "L": "#b8bac4", "z": "#2a2c36"},
    iris="#ff7a3a", arch="#ff9a5a", mouth="#1a1210", tooth="#e0d4b8", outline="#1a1614",
)
FOGSAG = with_face(
    {"B": "#c4d0dc", "D": "#9aaabc", "d": "#6e8098", "L": "#e8f0f8", "f": "#a8b8c8"},
    iris="#4a5a74", arch="#4a5a74", mouth="#7a5a6a", tooth="#f0f4f8", tear="#8ad0f0", outline="#3a4658",
)


def cloud(c, parts, floor):
    """A cloud: the ellipses (cx, cy, rx, ry) joined, with the bottom cut flat at row `floor`."""
    shape = c.E(*parts[0])
    for p in parts[1:]:
        shape = shape | c.E(*p)
    return shape & c.R(0, 0, c.w - 1, floor)


def bolt(c, x, top, height=11):
    """A zigzag lightning bolt whose tip is at row `top`, as a polygon."""
    b = top + height
    return c.P([(x - 3, b), (x, top + 4), (x - 1, top + 4), (x + 2, top), (x + 1, top + 5), (x + 2, top + 5), (x - 1, b + 1)])


# =================== young, other: Wisplet, a cloud sprout ===================
def wisplet(f=0):
    c = Canvas(36, 36)
    for x in (12, 24):
        c.put(c.E(x, 31.2, 3.4, 1.8), "D", ring=True, ringc="K")
    body = cloud(c, [(18, 24, 11.2, 7.4), (10, 22, 5.4, 5.2), (26.2, 21.4, 5.8, 5.6), (18, 17 - f, 7, 6.4), (11.6, 17.4 - f, 4.4, 4.2), (24.4, 16.4 - f, 4.8, 4.6)], 31)
    c.put(body, "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.P([(16, 10), (19, 4), (18, 4), (21, 1 + f), (20, 6), (21, 6), (18, 11)]), "y", ring=True, ringc="K", minshade=99)  # a bolt sprouting on top
    c.outline("K")
    return Body(c, Anchor(9, 17, 22))


# =================== adult, other tier 1: Galecrown, a huge thundercloud with a lightning crown ===================
def galecrown(f=0):
    c = Canvas(S, S)
    for x in (14, 34):
        c.put(c.E(x, 42.4, 5.6, 2.6), "D", ring=True, ringc="K")
    body = cloud(c, [(24, 30, 19, 11), (11, 28, 8, 7.6), (37, 28, 8, 7.6), (17, 21, 10, 9.6), (31, 21, 10, 9.6), (24, 17, 11, 9.4)], 41)
    c.put(body, "B", ring=True, ringc="K", shade=("D", "L"))
    for x, top in ((16, 4 + f), (24, 1), (32, 4 + f)):  # a crown of three bolts
        c.put(bolt(c, x, top, 9), "y", ring=True, ringc="K", shade=("Y", None), minshade=99)
    for sx in (1, -1):  # lightning flickering inside the cloud
        pts = [(24 - sx * 15, 24), (24 - sx * 13, 28), (24 - sx * 16, 29), (24 - sx * 13, 34)]
        for a, b in zip(pts, pts[1:]):
            c.pxs(sorted(c.L(*a, *b)), "g")
    c.outline("K")
    return Body(c, Anchor(15, 22, 28))


# =================== adult, other tier 2: Softnimbus, a round friendly cloud with rosy cheeks ===================
def softnimbus(f=0):
    c = Canvas(S, S)
    for x in (15, 33):
        c.put(c.E(x, 43.2, 5.0, 2.4), "D", ring=True, ringc="K")
    body = cloud(c, [(24, 28, 17, 14), (10, 22, 8, 8), (38, 22, 8, 8), (18, 14, 9, 8.4), (30, 14, 9, 8.4), (24, 12.4 - f * 1.6, 8, 7)], 42)
    c.put(body, "B", ring=True, ringc="K", shade=("D", "L"))
    for x in (12.6, 35.4):  # rosy cheeks
        c.put(c.E(x, 27.6, 3.0, 2.2), "r")
        c.px(round(x), 28, "R")
    c.outline("K")
    return Body(c, Anchor(15, 22, 29))


# =================== adult, other tier 3: Smogrump, a grumpy smoke cloud ===================
def smogrump(f=0):
    c = Canvas(S, S)
    for x, rx in ((15, 4.0), (32, 4.4)):
        c.put(c.E(x, 42.4, rx, 2.4), "d", ring=True, ringc="K")
    body = cloud(c, [(24, 28, 16, 12.4), (11.4, 24, 7, 7), (36.6, 25.6, 7.4, 6.6), (18, 17, 8, 7.6), (31, 16.6, 7.4, 7), (24.6, 13.4, 6, 5.6), (8, 30.6, 4.6, 4.4), (41, 31, 4.2, 4.2), (13.6, 15.6, 4.2, 4.0), (35.6, 16.8, 4.4, 4.2)], 41)
    c.put(body, "B", ring=True, ringc="K", shade=("D", "L"))
    smoke = [(27, 9, 1.8, 1.6), (29, 6.6 - f, 1.5, 1.4), (27, 4.2 - f, 1.3, 1.3), (29, 2.6 - f, 1.1, 1.1)]  # a thin wisp of smoke drifts up
    c.put(c.chain(dense(smoke, 1.1)), "L", ring=True, ringc="K", minshade=3)
    for x, y in ((14, 24), (32, 32), (18, 35), (36, 21), (24, 38), (11, 31)):  # soot smudges
        c.pxs([(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)], "z")
    c.pxs([(31, 12), (32, 13), (33, 14)], "L")
    c.outline("K")
    return Body(c, Anchor(15, 21, 27))


# =================== adult, other tier 4: Fogsag, a thin drooping fog wisp ===================
def fogsag(f=0):
    c = Canvas(S, S)
    body = [(29, 30, 4.8, 4.4), (33, 36, 4.0, 3.8), (34.5, 41.2, 3.6, 3.2), (28, 43.2, 3.4, 2.4), (20, 43.4, 3.2, 2.3), (12, 42.8, 3.0, 2.3), (7, 39.6, 2.6, 2.8), (6, 34.4 - f, 1.8, 2.4)]
    c.put(c.chain(dense(body)), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)  # the fog trails off along the ground
    c.pxs([(33, 35), (35, 40), (26, 42), (18, 42), (11, 41)], "L")
    head = cloud(c, [(24, 22, 10.4, 8.4), (24, 15.6, 8.4, 6.8)], 31)
    c.put(head, "B", ring=True, ringc="K", shade=("D", "L"))
    c.outline("K")
    return Body(c, Anchor(15, 19, 25))


ROSTER = [
    Creature("wisplet", "Wisplet", "young", WISPLET, wisplet, role="tank"),
    Creature("galecrown", "Galecrown", "adult", GALECROWN, galecrown, role="fighter"),
    Creature("softnimbus", "Softnimbus", "adult", SOFTNIMBUS, softnimbus, role="caster"),
    Creature("smogrump", "Smogrump", "adult", SMOGRUMP, smogrump, role="tank"),
    Creature("fogsag", "Fogsag", "adult", FOGSAG, fogsag, role="quick"),
]
