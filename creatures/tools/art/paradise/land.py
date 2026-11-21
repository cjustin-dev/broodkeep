"""The Land line (plan section 4). Bodies only: lib.stamp_face() adds the faces.

Kid Pebblin (24 px), young Cragpup (36 px) and adult Gravelhorn (48 px) are the drawings from the blend sheet.
"""
from lib import Anchor, Body, Canvas, Creature, mid_palette, with_face


def mirror(pts, w):
    return [(w - x, y) for x, y in pts]


# =================== kid: Pebblin, a tan pup with small horn ears ===================
PEBBLIN = with_face(
    {"B": "#d9bb92", "D": "#b08e66", "L": "#efdcc0", "O": "#6e4f38", "H": "#f2e8cf", "p": "#c9a674"},
    iris="#33284f", arch="#33284f", mouth="#8a4030", blush="#f0a090", tooth="#fff4e8",
)


def pebblin(f=0):
    c = Canvas(24, 24)
    ear = [(6, 7), (7 - f, 2 + f), (10, 6)]  # the ear tips flick in on the second drawing
    for pts in (ear, mirror(ear, 24)):
        c.put(c.P(pts), "H", ring=True, ringc="O")
    for x in (8, 16):
        c.put(c.E(x, 21.2, 3, 1.6), "D", ring=True, ringc="O")
    c.put(c.E(12, 13.5, 9.6, 8.2), "B", ring=True, ringc="O", shade=("D", "L"))
    belly = c.put(c.E(12, 17.8, 5, 3.4), "L")
    for x, y in belly:
        if y in (18, 20):
            c.px(x, y, "p")
    c.outline("O")
    return Body(c, Anchor(5, 9, 15))


# =================== young, meat: Cragpup, a stone-shouldered horned cub ===================
CRAGPUP = mid_palette(PEBBLIN, with_face(
    {"B": "#7d6652", "D": "#4d3c30", "d": "#3a2c24", "L": "#a68a6c", "b": "#c8a878", "p": "#a98850", "H": "#eadfc4", "h": "#b3a27c",
     "S": "#8c909a", "s": "#5b5f6c", "R": "#c4563a", "c": "#d99a86"},
    iris="#ffc23a", arch="#2a1a14", mouth="#4a1a1a", tooth="#f2e8cf", outline="#1a1018",
))


def cragpup(f=0):
    c = Canvas(36, 36)
    for flip in (False, True):
        pts = [(10, 9, 2.2, 2.6), (8.4, 6.4, 1.8, 2.4), (7.4, 4, 1.2, 1.8)]
        if flip:
            pts = [(36 - x, y, rx, ry) for x, y, rx, ry in pts]
        c.put(c.chain(pts), "H", ring=True, ringc="K", shade=("h", None), minshade=3)
    for x in (12, 24):
        c.put(c.E(x, 31.6, 4.4, 2.2), "D", ring=True, ringc="K")
    c.put(c.E(18, 26, 9.2, 7.4), "B", ring=True, ringc="K", shade=("D", "L"))
    belly = c.put(c.E(18, 27.5, 5.4, 5.2), "b")
    for yy in (26, 29):
        for x in range(13, 24):
            if (x, yy) in belly:
                c.px(x, yy, "p")
    for x in (8, 28):  # the stone shoulder pads bob up on the second drawing
        c.put(c.E(x, 23 - f, 3.6, 3), "S", ring=True, ringc="K", shade=("s", None))
    c.put(c.E(18, 14.5, 12, 10.5), "B", ring=True, ringc="K", shade=("D", "L"))
    c.pxs([(7, 16), (8, 17), (9, 18)], "c")  # a young scar
    c.outline("K")
    return Body(c, Anchor(8, 12, 21))


# =================== adult, meat tier 1: Gravelhorn, a stone-shouldered horned brute ===================
S = 48
MID = S - 1
GRAVELHORN = with_face(
    {"B": "#7d6652", "D": "#4d3c30", "d": "#3a2c24", "L": "#a68a6c", "b": "#c8a878", "p": "#a98850", "H": "#eadfc4", "h": "#b3a27c", "S": "#8c909a", "s": "#5b5f6c",
     "R": "#c4563a", "c": "#d99a86"},
    iris="#ffc23a", arch="#2a1a14", mouth="#4a1a1a", tooth="#f2e8cf", outline="#1a1018",
)


def gravelhorn(f=0):
    c = Canvas(S, S)
    plates = [(10, 24), (8, 15 - f), (15, 19), (17, 9 - f), (22, 15), (24, 6 - f), (28, 15), (31, 9 - f), (33, 19), (40, 15 - f), (38, 24)]
    c.put(c.P(plates), "S", ring=True, ringc="K", shade=("s", None))
    for flip in (False, True):
        pts = [(14, 14, 3.0, 3.4), (11.8, 11, 2.6, 3.2), (10.2, 8, 2.2, 2.8), (9.6, 5.4, 1.5, 2.2)]
        if flip:
            pts = [(S - x, y, rx, ry) for x, y, rx, ry in pts]
        c.put(c.chain(pts), "H", ring=True, ringc="K", shade=("h", None), minshade=3)
    for x in (7.5, 40.5):  # arms, they flex up on the second drawing
        dy = f * 4
        c.put(c.E(x, 33 - dy, 4.4, 6.6), "B", ring=True, ringc="K", shade=("D", "L"))
        for cx in (-2, 0, 2):
            c.put({(int(x + cx - (1 if cx <= 0 else 0)), int(39.5 - dy)), (int(x + cx - (1 if cx <= 0 else 0)), int(40.5 - dy))}, "T", minshade=99)
    for x in (16, 32):
        c.put(c.E(x, 43.2, 5.6, 2.6), "D", ring=True, ringc="K")
        for cx in (-2, 1):
            c.px(int(x + cx - 1), 45, "T")
    c.put(c.E(24, 32, 14.6, 11.6), "B", ring=True, ringc="K", shade=("D", "L"))
    belly = c.put(c.E(24, 34, 8.6, 8.4), "b")
    for yy in (31, 34, 37):
        for x in range(15, 34):
            if (x, yy) in belly:
                c.px(x, yy, "p")
    for x in (11, 37):  # stone shoulder armor with a crack
        c.put(c.E(x, 26, 6.2, 5.2), "S", ring=True, ringc="K", shade=("s", None))
    c.pxs([(10, 24), (11, 25), (11, 26), (12, 27)], "K")
    c.pxs([(MID - 10, 25), (MID - 11, 26), (MID - 11, 27)], "K")
    c.put(c.E(24, 17.5, 10, 8.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.R(14, 14, 33, 15), "d")  # the heavy brow ridge
    c.put(c.E(24, 22, 6.6, 4.2), "L")
    c.pxs([(22, 20), (25, 20)], "K")  # nostrils
    c.pxs([(15, 19), (16, 20), (17, 21), (18, 22)], "c")  # an old scar
    c.outline("K")
    return Body(c, Anchor(16, 17, 23))


ROSTER = [
    Creature("pebblin", "Pebblin", "kid", PEBBLIN, pebblin, role="tank", outline="O"),
    Creature("cragpup", "Cragpup", "young", CRAGPUP, cragpup, role="fighter"),
    Creature("gravelhorn", "Gravelhorn", "adult", GRAVELHORN, gravelhorn, role="tank"),
]
