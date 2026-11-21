"""The Dugling line of the Land field (plan section 4): young Dugling (fed carrots) and its four adults, tier 1 to 4.

Moonlop (tier 1), Barrowbun (2), Tuskmole (3), Mudlop (4). Bodies only: lib.stamp_face() adds the faces.
"""
from lib import FACE_LETTERS, SIZES, Anchor, Body, Canvas, Creature, bands, mid_palette, sym, with_face
from land import PEBBLIN

S, Y = SIZES["adult"], SIZES["young"]

# ---------- palettes ----------
MOONLOP = with_face(
    {"B": "#8f97ae", "D": "#5d6482", "L": "#bcc3d6", "C": "#e9e5d6", "c": "#c9c3ae", "H": "#e8c86a", "h": "#b08f3c", "g": "#d9a3c0"},
    iris="#ffd24a", arch="#2a2a44", mouth="#4a2a38", tooth="#f3f1e6", outline="#14121c",
)
BARROWBUN = with_face(
    {"B": "#c98b5c", "D": "#935c3a", "d": "#6b4a30", "L": "#e6b88a", "C": "#f0dcb8", "g": "#6aa84f", "m": "#6b4a30", "n": "#d98b8b", "p": "#e6a0a0", "h": "#eadfc4"},
    iris="#3a2514", arch="#3a2514", mouth="#6a2a24", tooth="#fff4e8", outline="#1a1018",
)
TUSKMOLE = with_face(
    {"B": "#7e6c78", "D": "#54465a", "d": "#32282f", "L": "#a8939f", "n": "#d98a98", "N": "#a85a6a", "H": "#eadfc4", "h": "#b3a27c"},
    iris="#e8a040", arch="#1c1418", mouth="#3a1a24", tooth="#eadfc4", outline="#140e12",
)
MUDLOP = with_face(
    {"B": "#bba47e", "D": "#8a7656", "L": "#dccaa4", "m": "#5e4a32", "p": "#c89a8a"},
    iris="#4a3a2a", arch="#2a2018", mouth="#4a2a24", tooth="#e8dcc0", outline="#16110c",
)
# halfway from Pebblin to Barrowbun, the plain tan every Dugling adult grows out of; only the letters Dugling draws
DUGLING = {k: v for k, v in mid_palette(PEBBLIN, BARROWBUN).items() if k in "BDLph" + FACE_LETTERS}
DUGLING.update(B="#cc9460", D="#946238", L="#ecc08e")  # warmer than the halfway tan, so it is not mistaken for Pebblin


# =================== young: Dugling, a long-eared digger with big claws and one fang ===================
def dugling(f=0):
    c = Canvas(Y, Y)
    ear = c.chain([(11.2, 9, 2.7, 3.0), (10.2, 6, 2.3, 3.0), (9.5 - f * 1.0, 3.4 + f * 0.6, 1.8, 2.3)])
    c.put(sym(ear, Y), "B", ring=True, ringc="K", shade=("D", None), minshade=3)
    c.put(sym(c.chain([(11.1, 8.6, 1.2, 2.0), (10.2, 5.8 + f * 0.4, 1.0, 2.0)]), Y), "p", minshade=99)
    for x in (12.5, 23.5):
        c.put(c.E(x, 32.4, 4.2, 1.6), "D", ring=True, ringc="K")
    c.put(c.E(18, 27.4, 8.6, 6.3), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(18, 28.6, 5.0, 4.2), "L")
    c.put(sym(c.E(7.6, 28 - f, 3.6, 3.4), Y), "B", ring=True, ringc="K", shade=("D", "L"))  # forepaws: the big digging claws
    for x in (4, 6, 8, 10):
        for xx in (x, 35 - x):
            c.pxs([(xx, 30 - f), (xx, 31 - f)], "h")
    c.put(c.E(18, 16.6, 11.2, 9.2), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(18, 21.4, 6.2, 3.6), "L")
    c.pxs([(15, 22), (15, 23)], "T")  # the one fang
    c.outline("K")
    return Body(c, Anchor(8, 13, 20))


# =================== adult, carrot tier 1: Moonlop, a crescent-horned stag-hare ===================
def moonlop(f=0):
    c = Canvas(S, S)
    ear = c.chain([(14.6, 17.4, 2.6, 2.3), (12.2, 14.0, 2.5, 2.8), (10.0, 10.4, 2.3, 2.9), (8.4, 6.8 - f * 1.2, 1.9, 2.4), (7.6, 4.4 - f * 1.4, 1.3, 1.8)])
    c.put(sym(ear, S), "B", ring=True, ringc="K", shade=("D", None), minshade=3)
    c.put(sym(c.chain([(12.0, 14.2, 1.2, 1.8), (10.0, 10.6, 1.1, 2.0), (8.6, 7.2 - f * 1.2, 0.9, 1.5)]), S), "g", minshade=99)
    horn = c.chain([(20.4, 12.4, 2.6, 2.4), (18.4, 9.6, 2.3, 2.5), (17.0, 6.8, 2.0, 2.5), (17.4, 4.4 - f * 0.4, 1.5, 2.0), (19.0, 3.6 - f * 0.4, 1.2, 1.4)])
    c.put(sym(horn, S), "H", ring=True, ringc="K", shade=("h", None), minshade=3)
    for x in (17, 31):
        c.put(c.E(x, 43.2, 5.4, 2.6), "D", ring=True, ringc="K")
    c.pxs(sym({(14, 45), (17, 45)}, S), "T")  # toes
    c.put(c.E(24, 32.4, 11.2, 10.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 33.6, 6.4, 7.4), "C")
    bands(c, (31, 34, 37), "c")
    c.put(sym(c.E(11.8, 34.0 - f * 3, 3.6, 6.0), S), "B", ring=True, ringc="K", shade=("D", "L"))  # forelimbs lift on the second drawing
    c.pxs(sym({(x, y) for x in (8, 10, 13) for y in (int(39.5 - f * 3), int(40.5 - f * 3))}, S), "T")  # claws
    c.put(c.E(24, 19.2, 10.6, 8.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 23.6, 6.4, 3.8), "C")
    c.put(c.E(24, 12.6, 2.6, 1.8), "H", minshade=99)  # a small gold gem on the brow
    c.outline("K")
    return Body(c, Anchor(16, 18, 24))


# =================== adult, carrot tier 2: Barrowbun, a round warm digger on its own mound ===================
def barrowbun(f=0):
    c = Canvas(S, S)
    c.put(c.E(24, 43.6, 19, 2.4), "m", ring=True, ringc="K", shade=("d", None), minshade=3)
    c.pxs([(10, 42), (13, 41), (35, 41), (38, 42)], "m")
    leaf = [[(23, 11), (20, 6 - f), (24, 8)], [(25, 11), (28, 6 - f), (24, 8)], [(24, 10), (23, 4), (25, 4)]]
    for pts in leaf:
        c.put(c.P(pts), "g", ring=True, ringc="K", minshade=99)
    c.put(sym(c.E(15.5, 11.4, 3.0, 3.2), S), "B", ring=True, ringc="K", shade=("D", None))
    c.put(sym(c.E(15.5, 11.8, 1.4, 1.8), S), "p", minshade=99)
    for x in (17, 31):
        c.put(c.E(x, 42, 4.6, 2.2), "D", ring=True, ringc="K")
    c.put(c.E(24, 30.5, 15.6, 12.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 34, 9.4, 8.2), "C")
    c.put(sym(c.E(10.4, 33.4 - f, 3.6, 4.8), S), "B", ring=True, ringc="K", shade=("D", "L"))
    c.pxs(sym({(x, y) for x in (8, 11) for y in (int(37.6 - f), int(38.6 - f))}, S), "h")  # claws
    c.put(c.E(24, 19.6, 11.6, 9.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 23.8, 6.6, 3.8), "C")
    c.pxs([(23, 21), (24, 21), (23, 22), (24, 22)], "n")
    c.outline("K")
    return Body(c, Anchor(16, 18, 24))


# =================== adult, carrot tier 3: Tuskmole, a grumpy hunched mole with tusks ===================
def tuskmole(f=0):
    c = Canvas(S, S)
    for x in (16, 32):
        c.put(c.E(x, 43.2, 5.6, 2.6), "D", ring=True, ringc="K")
    c.put(c.E(24, 30, 17.4, 11.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.pxs([(12, 27), (13, 28), (34, 28), (35, 27), (20, 36), (28, 37), (16, 33), (32, 33)], "d")  # dirt on the hide
    c.put(sym(c.E(8.8, 34.4 + f, 5.4, 7.2), S), "B", ring=True, ringc="K", shade=("D", "L"))  # spade hands
    c.pxs(sym({(x, y) for x in (4, 6, 9, 11) for y in (41 + f, 42 + f, 43 + f)}, S), "H")  # claws
    c.put(c.E(24, 20.8, 9.8, 8.0), "B", ring=True, ringc="K", shade=("D", "L"))
    tusk = c.chain([(19.6, 28.6, 2.0, 2.4), (18.0, 26.2, 1.8, 2.4), (17.0, 23.8, 1.4, 2.2)])
    c.put(sym(tusk, S), "H", ring=True, ringc="K", shade=("h", None), minshade=3)
    c.put(c.E(24, 24.6, 5.8, 4.0), "L")
    c.put(c.E(24, 22.6, 3.4, 2.2), "n", shade=("N", None), minshade=3)  # a big pink mole nose
    c.outline("K")
    return Body(c, Anchor(17, 17, 26))


# =================== adult, carrot tier 4: Mudlop, a skinny muddy rabbit that sulks ===================
def mudlop(f=0):
    c = Canvas(S, S)
    ear = c.chain([(15.4, 15.5, 2.2, 2.8), (12.8, 19.5, 2.0, 3.6), (10.8 + f * 0.6, 25, 1.9, 4.0), (9.8 + f * 0.8, 30.6, 1.6, 3.0)])
    c.put(sym(ear, S), "B", ring=True, ringc="K", shade=("D", None), minshade=3)
    c.put(sym(c.chain([(12.6, 20.6, 0.9, 2.4), (10.8 + f * 0.6, 26, 0.9, 3.0)]), S), "p", minshade=99)
    for x in (19, 29):
        c.put(c.E(x, 43.6, 3.8, 2.0), "D", ring=True, ringc="K")
    c.put(c.E(24, 36, 6.8, 8.4), "B", ring=True, ringc="K", shade=("D", "L"))
    bands(c, (33, 35, 37), "D")  # ribs
    c.put(sym(c.E(15.4, 36.5, 2.0, 5.8), S), "B", ring=True, ringc="K", shade=("D", None), minshade=3)
    c.put(c.E(24, 21.6, 9.6, 8.0), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 25.6, 5.2, 3.2), "L")
    for blob in ((19.5, 40.5, 2.4, 1.6), (28, 34, 2.0, 1.4), (30, 18, 2.2, 1.6)):
        c.put(c.E(*blob), "m", minshade=99)  # splashes of mud
    c.pxs([(24 + f, 43), (25 + f, 44)], "m")
    c.outline("K")
    return Body(c, Anchor(17, 21, 26))


ROSTER = [
    Creature("dugling", "Dugling", "young", DUGLING, dugling, role="quick"),
    Creature("moonlop", "Moonlop", "adult", MOONLOP, moonlop, role="caster"),
    Creature("barrowbun", "Barrowbun", "adult", BARROWBUN, barrowbun, role="tank"),
    Creature("tuskmole", "Tuskmole", "adult", TUSKMOLE, tuskmole, role="fighter"),
    Creature("mudlop", "Mudlop", "adult", MUDLOP, mudlop, role="quick"),
]
