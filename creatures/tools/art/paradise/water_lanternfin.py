"""The Lanternfin line of the Water field (plan section 4): the seafood young Lanternfin and its adults, tier 1 to 4.

Murkfang (tier 1, in water.py), Puffglow (2), Rustgill (3), Wilteel (4). Bodies only: lib.stamp_face() adds the faces.
The line keeps Murkfang's family: teal bodies, magenta fins and a cyan glow (Q and q).
"""
import math

from lib import SIZES, Anchor, Body, Canvas, Creature, with_face
from water import mirror

S = SIZES["adult"]

# ---------- palettes ----------
PUFFGLOW = with_face(
    {"B": "#4f9aa8", "D": "#34707f", "d": "#1f4a58", "L": "#9ad8d8", "F": "#c8587a", "f": "#8a3a58", "Q": "#7ff5ff", "q": "#d8fdff", "g": "#9affef", "k": "#8fd0d4"},
    iris="#2b2a55", arch="#2b2a55", mouth="#8a3a50", tooth="#f3f1e6", blush="#f4a0b8", outline="#14222c",
)
RUSTGILL = with_face(
    {"B": "#3f6a7a", "D": "#2a4654", "d": "#1a2e38", "L": "#78a8b4", "F": "#a8456a", "f": "#7a2f4e", "R": "#d0763a", "r": "#8a4424", "k": "#78a8b4"},
    iris="#ffd25a", arch="#ffd25a", mouth="#3a1018", tooth="#f3f1e6", outline="#0e1a22",
)
WILTEEL = with_face(
    {"B": "#52707c", "D": "#3a5662", "d": "#283e48", "L": "#86a6b0", "F": "#94607a", "f": "#6e4560", "Q": "#6aaab8", "q": "#a8d8e0", "k": "#6e90a0"},
    iris="#3a3a5a", arch="#2a2a46", mouth="#7a3a4a", tooth="#e8e6dc", outline="#18242c", tear="#9adcf4",
)


# =================== adult, seafood tier 2: Puffglow, a round pufferfish with glowing spots ===================
def puffglow(f=0):
    c = Canvas(S, S)
    tail = [(40, 21), (46, 15 - f), (46, 31 + f), (40, 29)]  # the tail fan flicks
    c.put(c.P(tail), "F", ring=True, ringc="K", shade=("f", None))
    for i in range(20):  # short spines all round, but none on the underside (it stands on its feet) or the tail
        a = math.radians(i * 18 + 4)
        if math.sin(a) > 0.8 or (math.cos(a) > 0.8 and abs(math.sin(a)) < 0.5):
            continue
        tip = (24 + 21.2 * math.cos(a), 26 + 19.0 * math.sin(a))
        left = (24 + 16.4 * math.cos(a - 0.14), 26 + 14.6 * math.sin(a - 0.14))
        right = (24 + 16.4 * math.cos(a + 0.14), 26 + 14.6 * math.sin(a + 0.14))
        c.put(c.P([left, tip, right]), "k", ring=True, ringc="K", minshade=99)
    for x in (5.2, 42.8):  # little side fins
        c.put(c.E(x, 30, 4.6, 2.8), "F", ring=True, ringc="K", shade=("f", None))
    for x in (15, 33):
        c.put(c.E(x, 44.2, 5.2, 2.2), "D", ring=True, ringc="K")
    c.put(c.E(24, 26, 18.4, 16.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 35, 10.6, 5.6), "L")  # a pale belly
    for x, y in ((9, 22), (39, 22), (11, 34), (37, 34), (7, 28), (41, 28), (19, 40), (29, 40), (13, 15), (35, 15)):  # glowing spots
        c.pxs([(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)], "g")
        c.px(x, y, "q")
    c.pxs([(24, 9), (24, 8), (25, 7), (26, 6), (27 + f, 5)], "k")  # a small lure on top
    c.put(c.E(28 + f, 4.6, 2.6, 2.6), "Q", ring=True, ringc="K")
    c.outline("K")
    return Body(c, Anchor(15, 21, 30))


# =================== adult, seafood tier 3: Rustgill, a scarred underbite piranha ===================
def rustgill(f=0):
    c = Canvas(S, S)
    fin = [(13, 14), (15, 6), (19, 11), (24, 4), (28, 11), (33, 6), (35, 14)]  # a spiky back fin
    c.put(c.P(fin), "F", ring=True, ringc="K", shade=("f", None))
    tail = [(38, 21), (46, 13 + f), (46, 35 - f), (38, 30)]
    c.put(c.P(tail), "F", ring=True, ringc="K", shade=("f", None))
    for x in (14, 34):
        c.put(c.E(x, 44.2, 4.6, 2.2), "D", ring=True, ringc="K")
    c.put(c.E(24, 25.6, 17.6, 15), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 37.4, 10.6, 5.4), "D", ring=True, ringc="K")  # the jaw sticks out below the mouth
    for x in (16, 31):  # two upward fangs
        c.put(c.P([(x, 36), (x + 1.4, 30.4), (x + 2.8, 36)]), "T", ring=True, ringc="K", minshade=99)
    for dx in (-1, 1):  # rusty gill slashes
        x0 = 24 + dx * 14
        for k in range(3):
            c.pxs([(x0, 24 + k * 3), (x0 - dx, 25 + k * 3), (x0 - 2 * dx, 26 + k * 3)], "R")
    c.pxs([(32, 13), (33, 14), (34, 15), (35, 16)], "L")  # an old scar across one brow
    c.pxs([(11, 33), (12, 34), (12, 33)], "r")
    c.outline("K")
    return Body(c, Anchor(15, 21, 29))


def dense(pts, step=1.5):
    """A chain's points resampled every `step` pixels, so a thin long body has no gaps between its blobs."""
    out = []
    for (x0, y0, rx0, ry0), (x1, y1, rx1, ry1) in zip(pts, pts[1:]):
        n = max(1, math.ceil(math.hypot(x1 - x0, y1 - y0) / step))
        out += [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, rx0 + (rx1 - rx0) * i / n, ry0 + (ry1 - ry0) * i / n) for i in range(n)]
    return out + [pts[-1]]


# =================== adult, seafood tier 4: Wilteel, a thin limp eel ===================
def wilteel(f=0):
    c = Canvas(S, S)
    # a long thin body: down from the head, then coiled along the floor with the tail tip curled up
    body = [(29, 30, 4.8, 4.4), (33, 36, 4.0, 3.8), (34.5, 41.2, 3.6, 3.2), (28, 43.2, 3.4, 2.4), (20, 43.4, 3.2, 2.3), (12, 42.8, 3.0, 2.3), (7, 39.6, 2.6, 2.8), (6, 34.4 - f, 1.8, 2.4)]
    c.put(c.chain(dense(body)), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
    c.pxs([(33, 35), (35, 40), (26, 42), (18, 42), (11, 41)], "L")  # a few pale flecks along it
    for pts in ([(13, 19), (6, 26 + f), (5, 34), (11, 30)], mirror([(13, 19), (6, 26 + f), (5, 34), (11, 30)], S)):  # limp fins hang off the head
        c.put(c.P(pts), "F", ring=True, ringc="K", shade=("f", None))
    stalk = [(24, 12), (24, 11), (24, 10), (25, 9), (27, 8), (29, 8), (31, 8), (33, 9), (35, 10), (36, 11), (36, 12), (36, 13)]
    c.pxs(stalk, "k")  # the lure droops over to one side, dim
    c.put(c.E(36, 15.6 + f, 2.4, 2.4), "Q", ring=True, ringc="K")
    c.put(c.E(24, 22, 11.6, 10), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 27.6, 6.6, 3.6), "L")
    c.outline("K")
    return Body(c, Anchor(15, 22, 29))


ROSTER = [
    Creature("puffglow", "Puffglow", "adult", PUFFGLOW, puffglow, role="tank"),
    Creature("rustgill", "Rustgill", "adult", RUSTGILL, rustgill, role="fighter"),
    Creature("wilteel", "Wilteel", "adult", WILTEEL, wilteel, role="quick"),
]
