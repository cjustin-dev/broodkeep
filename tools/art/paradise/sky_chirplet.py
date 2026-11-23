"""The Chirplet line of the Sky field (plan section 4): the corn young Chirplet (a songbird chick) and its four adults, tier 1 to 4.

Gildcrest (tier 1), Downwren (2), Peckjack (3), Slumpfinch (4). Bodies only: lib.stamp_face() adds the faces. The beak is a mouth
pattern (sky_parts.beak_mouths). The line is golden with teal feathers, so it is far from the purple drakes.
"""
import math

from lib import SIZES, Anchor, Body, Canvas, Creature, with_face
from sky import mirror
from sky_parts import beak_mouths
from water_lanternfin import dense

S = SIZES["adult"]

# ---------- palettes ----------
GILDCREST = with_face(
    {"B": "#e8b838", "D": "#b07a20", "d": "#7a4e14", "L": "#ffe48a", "g": "#2fb0a8", "G": "#1a7a82", "y": "#fff6a0", "o": "#e07a28", "t": "#c86418"},
    iris="#2b2a55", arch="#4a2a10", mouth="#8a3a20", tooth="#fff0d0", blush="#ff9a7a", outline="#3a2410",
)
CHIRPLET = with_face(
    {"B": "#f0c860", "D": "#c8944a", "d": "#8a5a28", "L": "#fff0b8", "g": "#3ab8b0", "G": "#1a7a82", "o": "#e8883a", "t": "#c86418"},
    iris="#2b2a55", arch="#4a2a10", mouth="#8a3a20", tooth="#fff0d0", blush="#ff9a7a", outline="#4a2c14",
)
DOWNWREN = with_face(
    {"B": "#c88a52", "D": "#96602e", "d": "#6a4020", "L": "#f0d0a0", "g": "#e0a868", "o": "#e07a28", "t": "#b06820"},
    iris="#3a2210", arch="#4a2810", mouth="#8a3a28", tooth="#fff0d8", blush="#ff9a8a", outline="#3a2010",
)
PECKJACK = with_face(
    {"B": "#4a5870", "D": "#303c52", "d": "#1e2638", "L": "#6a7a96", "z": "#8a96ae", "t": "#7a6c48", "o": "#5a4a3a"},
    iris="#ffd040", arch="#ffe070", mouth="#2a1218", tooth="#e0d4b0", outline="#0e1220",
)
SLUMPFINCH = with_face(
    {"B": "#c8c0a0", "D": "#9a9278", "d": "#6e6850", "L": "#e8e2c8", "g": "#8aaaa8", "G": "#5e807e", "o": "#a08a68", "t": "#9a7c54"},
    iris="#54503c", arch="#4a4630", mouth="#8a5a50", tooth="#f0ead0", tear="#9adcf4", outline="#38341f",
)


# =================== young, corn: Chirplet, a round golden songbird chick ===================
def chirplet(f=0):
    c = Canvas(36, 36)
    for x in (13, 23):
        c.put(c.E(x, 33.0, 3.6, 1.8), "o", ring=True, ringc="K")
    for x in (5.2, 30.8):  # stubby wings that flutter
        c.put(c.E(x, 23.5 + f, 3.4, 5.4), "D", ring=True, ringc="K", shade=("d", None), minshade=3)
    for pts in ([(15, 11), (13, 4), (18, 9)], [(17, 10), (18, 2), (20, 10)], [(18, 9), (23, 4), (21, 11)]):  # a little tuft
        c.put(c.P(pts), "g", ring=True, ringc="K", minshade=99)
    c.put(c.E(18, 22.4, 12.6, 10.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(18, 27.4, 7.4, 4.8), "L")
    c.outline("K")
    return Body(c, Anchor(9, 17, 21), beak_mouths(21, half=3, size=36))


# =================== adult, corn tier 1: Gildcrest, a golden crested songbird with long tail plumes ===================
def gildcrest(f=0):
    c = Canvas(S, S)
    for sx in (1, -1):  # two long tail plumes trailing out behind, with an eye at the tip
        pts = [(24 - sx * 4, 36, 3.2, 2.6), (24 - sx * 10, 40, 3.2, 2.4), (24 - sx * 15, 43, 2.8, 2.0), (24 - sx * 19.4, 44.0, 2.2, 1.6)]
        c.put(c.chain(dense(pts)), "g", ring=True, ringc="K", shade=("G", None), minshade=3)
        c.put(c.E(24 - sx * 19.6, 44, 1.2, 1.0), "y")
    for x in (21, 27):  # thin legs and toes
        c.put(c.L(x, 40, x, 44), "o")
        c.pxs([(x - 2, 45), (x - 1, 45), (x, 45), (x + 1, 45)], "o")
    c.put(c.E(24, 30, 11.6, 12.0), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 33, 6.6, 8.2), "L")
    for pts in ([(14, 22), (9, 28 + f), (9, 38), (14, 40), (15, 30)], mirror([(14, 22), (9, 28 + f), (9, 38), (14, 40), (15, 30)], S)):  # wings folded like teal leaves
        c.put(c.P(pts), "g", ring=True, ringc="K", shade=("G", None), minshade=99)
    c.put(c.E(24, 16, 10.0, 8.8), "B", ring=True, ringc="K", shade=("D", "L"))
    for pts in ([(19, 10), (15, 3 + f), (22, 8)], [(24, 8), (24, 1), (26, 8)], mirror([(19, 10), (15, 3 + f), (22, 8)], S)):  # a tall crest
        c.put(c.P(pts), "g", ring=True, ringc="K", minshade=99)
    c.pxs([(24, 3), (24, 4)], "y")
    c.outline("K")
    return Body(c, Anchor(15, 15, 19), beak_mouths(19, half=3))


# =================== adult, corn tier 2: Downwren, a round fluffy wren with a head tuft ===================
def downwren(f=0):
    c = Canvas(S, S)
    cx, cy, rx, ry = 24, 27.8, 16.6, 14.8
    for i in range(16):  # fluff all round: scallops on the outline
        a = math.radians(i * 22.5 + 11)
        if math.sin(a) > 0.86:
            continue
        c.put(c.E(cx + rx * math.cos(a), cy + ry * math.sin(a), 2.6, 2.4), "B", ring=True, ringc="K", minshade=99)
    for x in (18, 30):
        c.put(c.E(x, 43.6, 3.4, 1.6), "o", ring=True, ringc="K")
    for pts in ([(19, 14), (16, 6 + f), (22, 12)], [(23, 13), (24, 4), (26, 12)], [(27, 14), (32, 6 + f), (29, 12)]):  # a fluffy tuft
        c.put(c.P(pts), "g", ring=True, ringc="K", minshade=99)
    c.put(c.E(cx, cy, rx, ry), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 34.4, 10.2, 7.6), "L")
    for x in (8.6, 39.4):  # little round wings
        c.put(c.E(x, 31 + f, 3.2, 5.6), "D", ring=True, ringc="K", minshade=3)
    c.outline("K")
    return Body(c, Anchor(15, 22, 26), beak_mouths(26, half=3))


# =================== adult, corn tier 3: Peckjack, a grumpy scruffy crow with torn feathers ===================
def peckjack(f=0):
    c = Canvas(S, S)
    c.put(c.P([(16, 35), (12, 45), (18, 41), (21, 46), (24, 42), (27, 46), (30, 41), (36, 45), (32, 35)]), "D", ring=True, ringc="K", minshade=99)  # ragged tail
    for pts in ([(14, 22), (6, 29 + f), (5, 41), (10, 36), (12, 43), (16, 34)], mirror([(14, 22), (6, 29 + f), (5, 41), (10, 36), (12, 43), (16, 34)], S)):
        c.put(c.P(pts), "D", ring=True, ringc="K", shade=("d", None), minshade=99)  # wings, torn along the bottom
    for x in (20, 28):
        c.put(c.L(x, 39, x, 44), "o")
        c.pxs([(x - 2, 45), (x - 1, 45), (x, 45), (x + 1, 45)], "T")  # claws
    c.put(c.E(24, 29.6, 12.4, 12.0), "B", ring=True, ringc="K", shade=("D", "L"))
    for x, y in ((14, 33), (34, 33), (17, 38), (31, 38)):  # chest feathers sticking out
        c.put(c.P([(x - 2, y), (x + (1 if x < 24 else -1), y - 4), (x + 2, y)]), "L", ring=True, ringc="K", minshade=99)
    c.put(c.E(24, 17, 10.0, 8.6), "B", ring=True, ringc="K", shade=("D", "L"))
    for pts in ([(16, 12), (12, 5), (20, 10)], [(22, 10), (22, 2), (26, 9)], [(28, 10), (33, 5), (32, 13)]):  # a scruffy head
        c.put(c.P(pts), "B", ring=True, ringc="K", shade=("D", None), minshade=99)
    c.pxs([(30, 14), (31, 15), (32, 16)], "z")  # an old scar
    c.outline("K")
    return Body(c, Anchor(15, 15, 20), beak_mouths(20, half=4))


# =================== adult, corn tier 4: Slumpfinch, a thin limp finch ===================
def slumpfinch(f=0):
    c = Canvas(S, S)
    c.put(c.P([(21, 40), (19 - f, 46), (24, 43), (29 + f, 46), (27, 40)]), "D", ring=True, ringc="K", minshade=99)  # the tail hangs limp and sways
    for x in (20, 28):
        c.put(c.L(x, 41, x, 44), "o")
        c.pxs([(x - 1, 45), (x, 45), (x + 1, 45)], "o")
    c.put(c.E(24, 31.4, 8.6, 12.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 34, 4.6, 7.6), "L")
    wing = [(17, 25), (13 - f, 29), (11 - 2 * f, 38 + f), (13 - f, 44), (15, 38), (16, 31)]
    for pts in (wing, mirror(wing, S)):  # wings hang down and sway
        c.put(c.P(pts), "g", ring=True, ringc="K", shade=("G", None), minshade=99)
    feather = [(23, 12, 2.0, 1.6), (28, 10, 2.0, 1.6), (33, 12.6, 1.8, 1.6), (35, 18, 1.6, 2.0), (34.6 + f, 23, 1.2, 1.6)]  # one limp feather droops off the head
    c.put(c.chain(dense(feather)), "g", ring=True, ringc="K", shade=("G", None), minshade=3)
    c.put(c.E(24, 19.6, 9.2, 8.2), "B", ring=True, ringc="K", shade=("D", "L"))
    c.outline("K")
    return Body(c, Anchor(15, 18, 22), beak_mouths(22, half=3))


ROSTER = [
    Creature("chirplet", "Chirplet", "young", CHIRPLET, chirplet, role="quick"),
    Creature("gildcrest", "Gildcrest", "adult", GILDCREST, gildcrest, role="quick"),
    Creature("downwren", "Downwren", "adult", DOWNWREN, downwren, role="tank"),
    Creature("peckjack", "Peckjack", "adult", PECKJACK, peckjack, role="fighter"),
    Creature("slumpfinch", "Slumpfinch", "adult", SLUMPFINCH, slumpfinch, role="quick"),
]
