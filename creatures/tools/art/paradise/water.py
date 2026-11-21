"""The Water line (plan section 4). Bodies only: lib.stamp_face() adds the faces.

Kid Drizzle (24 px), young Lanternfin (36 px) and adult Murkfang (48 px) are the drawings from the blend sheet. The lure bulb
is the letter Q because U is the tear.
"""
from lib import Anchor, Body, Canvas, Creature, mid_palette, pattern_from, with_face


def mirror(pts, w):
    return [(w - x, y) for x, y in pts]


# =================== adult, Murkfang (palette first: Lanternfin's is halfway to it) ===================
S = 48
MURKFANG = with_face(
    {"B": "#2f5f78", "D": "#1f4258", "d": "#17303f", "L": "#528ea8", "F": "#a8456a", "f": "#7a2f4e", "Q": "#7ff5ff", "q": "#d8fdff", "g": "#9affef", "k": "#6fb0c8", "R": "#e0707a"},
    iris="#fff6a0", arch="#fff6a0", mouth="#4a1424", tooth="#f3f1e6", outline="#10161e", tear="#7ff5ff",
)


# =================== kid: Drizzle, a pale aqua blob with a glowing bulb ===================
DRIZZLE = with_face(
    {"B": "#8fd6dc", "D": "#5aa8b8", "L": "#caf2f2", "O": "#2f6a7c", "Q": "#7ff5ff", "F": "#f09ab8", "k": "#5aa8b8"},
    iris="#2b2a55", arch="#2b2a55", mouth="#8a3a50", blush="#f4a0b8", tooth="#ff9db8",
)


def drizzle(f=0):
    c = Canvas(24, 24)
    c.put(c.P([(15, 17), (23, 15 + f), (23, 21), (17, 22)]), "F", ring=True, ringc="O")  # the tail fin flicks
    for pts in ([(6, 9), (4, 4), (9, 7)], mirror([(6, 9), (4, 4), (9, 7)], 24)):
        c.put(c.P(pts), "F", ring=True, ringc="O")
    for x in (8, 16):
        c.put(c.E(x, 21.3, 3, 1.5), "D", ring=True, ringc="O")
    c.put(c.E(12, 13.5, 9.6, 8.6), "B", ring=True, ringc="O", shade=("D", "L"))
    c.put(c.E(12, 17.8, 5.4, 3.4), "L")
    c.pxs([(12, 5), (12, 4), (13 - f, 3)], "k")  # the lure sways
    c.put(c.E(13.5 - f, 2.2, 1.6, 1.6), "Q", ring=True, ringc="O")
    c.outline("O")
    return Body(c, Anchor(5, 9, 15))


# =================== young, seafood: Lanternfin, a mid-teal angler with a small mouth ===================
LANTERNFIN = mid_palette(DRIZZLE, MURKFANG)


def lanternfin(f=0):
    c = Canvas(36, 36)
    crest = [(8, 13), (7, 7), (11, 10), (13, 5), (15, 11)]
    for pts in (crest, mirror(crest, 36)):
        c.put(c.P(pts), "F", ring=True, ringc="K", shade=("f", None))
    fin = [(7, 22), (2, 19 + f), (3, 23), (1, 26), (5, 27), (7, 26)]
    for pts in (fin, mirror(fin, 36)):
        c.put(c.P(pts), "F", ring=True, ringc="K", shade=("f", None))
    c.put(c.chain([(27.5, 30, 3.4, 2.6), (30.5, 28, 2.8, 2.3), (32.3, 25, 2.1, 2), (32.8, 22, 1.4, 1.5)]), "B", ring=True, ringc="K", minshade=3)
    for x in (12, 24):
        c.put(c.E(x, 32, 4.2, 1.8), "D", ring=True, ringc="K")
    c.put(c.E(18, 20.5, 13.5, 12), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(18, 26.5, 7.5, 4.2), "L")
    c.pxs([(18, 9), (19, 8), (19, 7), (20, 6), (20 + f, 5)], "k")  # the lure sways
    c.put(c.E(21 + f, 3.4, 2.4, 2.4), "Q", ring=True, ringc="K")
    c.outline("K")
    return Body(c, Anchor(8, 14, 25))


# =================== adult, seafood tier 1: Murkfang, a deep-sea angler with a huge jaw ===================
def jaw(ry, corner=0):
    """The mouth as a pattern: a cavity ry tall with teeth along the top and, when open, the bottom. corner -1 lifts, 1 droops."""
    s = Canvas(S, S)
    cy = 34 + (ry - 4.6) * 0.4
    cav = s.put(s.E(24, cy, 12.6, ry), "M")
    big = ry > 3
    cols = {xx for xx, _ in cav}
    for x in range(min(cols), max(cols), 3 if big else 6):  # teeth stay on columns the cavity has, so the mouth stays centered
        top = [y for (xx, y) in cav if xx == x]
        bottom = [y for (xx, y) in cav if xx == x + 1]
        if top and x + 1 in cols:
            s.pxs([(x, min(top)), (x + 1, min(top)), (x, min(top) + 1)], "T")
        if bottom and big and x + 2 in cols:
            s.pxs([(x + 1, max(bottom)), (x + 2, max(bottom)), (x + 2, max(bottom) - 1)], "T")
    if corner:
        for x in (10, 11, 36, 37):
            s.px(x, int(cy) + corner * (2 if x in (10, 37) else 1), "K")
    return pattern_from(s, 30)


MURKFANG_MOUTHS = {"neutral": jaw(4.6), "smile": jaw(5.4, -1), "frown": jaw(2.6, 1), "flat": jaw(1.8), "yawn": jaw(6.0)}


def murkfang(f=0):
    c = Canvas(S, S)
    crest = [(9, 21), (8, 11 + f), (13, 16), (15, 8), (18, 15), (20, 20)]
    for pts in (crest, mirror(crest, S)):
        c.put(c.P(pts), "F", ring=True, ringc="K", shade=("f", None))
    fin = [(9, 29 - f * 2), (2, 24 - f * 2), (3, 29), (1, 32), (4, 34), (2, 38), (9, 37)]
    for pts in (fin, mirror(fin, S)):
        c.put(c.P(pts), "F", ring=True, ringc="K", shade=("f", None))
    tail = [(37, 40, 4.2, 3.2), (41.5, 37, 3.4, 2.8), (43.5 + f * 0.5, 33, 2.7, 2.5), (44.5 + f * 0.5, 28.5 - f, 2, 2.2), (43 + f * 0.5, 25 - f, 1.3, 1.6)]
    c.put(c.chain(tail), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
    for x in (15, 33):
        c.put(c.E(x, 43.8, 5.6, 2.3), "D", ring=True, ringc="K")
    c.put(c.E(24, 27, 17, 14), "B", ring=True, ringc="K", shade=("D", "L"))
    c.pxs([(10, 24), (13, 30), (35, 30), (38, 24), (24, 16), (20, 17), (28, 17), (7, 31), (40, 31)], "g")
    stalk = [(24, 13), (24, 12), (24, 11), (25, 11), (25, 10), (26, 10), (26, 9), (27 + f, 9), (27 + f, 8), (28 + f, 8), (28 + f, 7)]
    c.pxs(stalk, "k")
    c.put(c.E(28 + f, 4.6, 3.3, 3.3), "Q", ring=True, ringc="K")
    c.put(c.E(28 + f, 4.6, 1.5, 1.5), "q")
    c.outline("K")
    return Body(c, Anchor(12, 19, 30), MURKFANG_MOUTHS)


ROSTER = [
    Creature("drizzle", "Drizzle", "kid", DRIZZLE, drizzle, role="caster", outline="O"),
    Creature("lanternfin", "Lanternfin", "young", LANTERNFIN, lanternfin, role="caster"),
    Creature("murkfang", "Murkfang", "adult", MURKFANG, murkfang, role="fighter"),
]
