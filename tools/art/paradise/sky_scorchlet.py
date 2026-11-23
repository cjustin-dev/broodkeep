"""The Scorchlet line of the Sky field (plan section 4): the chicken young Scorchlet (drawn in sky.py) and its adults, tier 1 to 4.

Ashwing (tier 1, in sky.py), Hearthwing (2), Sootsnarl (3), Dimwick (4). Bodies only: lib.stamp_face() adds the faces. The beak is a
mouth pattern (sky_parts.beak_mouths), so it can open and lower. All four are beaked drakes with an ember belly: Hearthwing has small
round wings, Sootsnarl ragged bat wings like Ashwing's, and Dimwick limp cloth wings and a nearly dead ember.
"""
from lib import SIZES, Anchor, Body, Canvas, Creature, with_face
from sky import mirror
from sky_parts import beak_mouths
from water_lanternfin import dense

S = SIZES["adult"]

# ---------- palettes ----------
HEARTHWING = with_face(
    {"B": "#8a5f86", "D": "#5e3e66", "d": "#3e2848", "L": "#b48ab0", "V": "#c0503a", "w": "#8a3028", "n": "#ecd8b4", "E": "#ff8a3a", "e": "#ffe090", "t": "#c8a060", "H": "#a47ab0"},
    iris="#ff9a3a", arch="#ffb070", mouth="#3a1018", tooth="#f6e6c0", blush="#ff9a8a", outline="#1c1020",
)
SOOTSNARL = with_face(
    {"B": "#5a4c58", "D": "#3a3040", "d": "#241c2a", "L": "#80728a", "V": "#7a3434", "w": "#4a2028", "n": "#bcb09a", "E": "#d0652c", "e": "#f0a860", "t": "#8a7c5c", "H": "#6a5c74", "z": "#9a9096"},
    iris="#ff5a2a", arch="#ff7a4a", mouth="#2a1018", tooth="#e0d4b0", outline="#100a14",
)
DIMWICK = with_face(
    {"B": "#8c829c", "D": "#665c76", "d": "#483f56", "L": "#b4acc0", "V": "#80606e", "w": "#5c4452", "n": "#c8c0b0", "E": "#a86454", "e": "#d8a888", "t": "#a09478", "H": "#7c7290"},
    iris="#a87868", arch="#5a4a5a", mouth="#4a2a30", tooth="#e8dcc0", tear="#9adcf4", outline="#241c2c",
)


# =================== adult, chicken tier 2: Hearthwing, a round friendly drake with a glowing belly ===================
def hearthwing(f=0):
    c = Canvas(S, S)
    wing = [(15, 29), (8, 24 - f * 2), (4, 30 - f), (5, 37), (11, 37)]  # small wings, flapping a little
    for pts in (wing, mirror(wing, S)):
        c.put(c.P(pts), "V", ring=True, ringc="K", shade=("w", None), minshade=99)
    for x in (17, 31):
        c.put(c.E(x, 42.2, 4.6, 3.2), "B", ring=True, ringc="K", shade=("D", None))
        for dx in (-2, 0, 2):
            c.px(x + dx - 1, 45, "T")
    for sp in ([(16, 14), (12, 6), (20, 11)], mirror([(16, 14), (12, 6), (20, 11)], S)):  # short round horns
        c.put(c.P(sp), "H", ring=True, ringc="K", shade=("D", None), minshade=99)
    c.put(c.E(24, 32.6, 13.6, 11.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 34.4, 8.6, 8.4), "E")  # a big glowing belly
    c.put(c.E(24, 35, 4.8, 5.4), "e")
    c.put(c.E(24, 20.4, 12.6, 10.8), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 15.8, 9.8, 3.8), "H")
    c.outline("K")
    return Body(c, Anchor(15, 17, 22), beak_mouths(22))


# =================== adult, chicken tier 3: Sootsnarl, a scruffy grumpy wyvern with a chipped horn ===================
def sootsnarl(f=0):
    c = Canvas(S, S)
    drop = 6 * f  # the wings beat down on the second drawing
    wing = [(18, 24), (9, 11 + drop // 2), (3, 2 + drop), (6, 12 + drop // 2), (2, 20 + drop // 2), (7, 20 + drop // 2), (4, 28), (10, 26), (9, 33), (13, 28)]  # torn at the edges
    for pts in (wing, mirror(wing, S)):
        c.put(c.P(pts), "V", ring=True, ringc="K", shade=("w", None), minshade=99)
    for flip in (False, True):
        for a, b in [((18, 24), (9, 11 + drop // 2)), ((9, 11 + drop // 2), (3, 2 + drop)), ((9, 11 + drop // 2), (2, 20 + drop // 2))]:
            pa = (S - a[0], a[1]) if flip else a
            pb = (S - b[0], b[1]) if flip else b
            c.pxs(sorted(c.L(pa[0], pa[1], pb[0], pb[1])), "n")
    c.put(c.P([(17, 13), (8, 7), (12, 15)]), "H", ring=True, ringc="K", shade=("D", None), minshade=99)  # one horn whole
    c.put(c.P([(31, 13), (35, 10), (31, 15)]), "H", ring=True, ringc="K", minshade=99)  # and one chipped to a stub
    for x in (19, 29):
        c.put(c.E(x, 42, 3.4, 3.4), "B", ring=True, ringc="K", shade=("D", None))
        for dx in (-2, 0, 2):
            c.px(x + dx - 1, 45, "T")
    c.put(c.E(24, 31, 10.4, 11.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 33, 5.4, 6.8), "E")  # a dull ember
    c.put(c.E(24, 33.6, 2.4, 4.2), "e")
    for x, y in ((16, 27), (32, 29), (15, 36), (33, 37), (20, 40), (28, 41)):  # soot smudges
        c.pxs([(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)], "d")
    for x in (14.5, 33.5):  # shoulder spikes, a bit crooked
        c.put(c.P([(x - 3, 27), (x + (1 if x < 24 else -1), 19), (x + 3, 27)]), "H", ring=True, ringc="K", minshade=99)
    c.put(c.E(24, 17, 9.4, 8), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 15.4, 7.6, 3.2), "H")
    c.pxs([(30, 12), (31, 13), (32, 14), (33, 15)], "z")  # an old scar
    c.pxs([(16, 20), (17, 21), (15, 21)], "z")  # scruffy chin tufts
    c.outline("K")
    return Body(c, Anchor(15, 14, 19), beak_mouths(19))


# =================== adult, chicken tier 4: Dimwick, a thin drooping wyvern with a nearly dead ember ===================
def dimwick(f=0):
    c = Canvas(S, S)
    tail = [(29, 40.6, 3.6, 2.6), (35, 42.6, 3.2, 2.2), (40.6, 41.6, 2.6, 2.0), (44, 37.6 - f, 1.8, 2.4), (44.2, 33 - f, 1.4, 2.0)]
    c.put(c.chain(dense(tail)), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)  # a limp tail on the ground
    wing = [(19, 27), (12, 27), (6, 33 + f), (4, 42), (8, 44), (10, 38), (13, 44), (17, 38), (18, 33)]  # wings hang down like wet cloth
    for pts in (wing, mirror(wing, S)):
        c.put(c.P(pts), "V", ring=True, ringc="K", shade=("w", None), minshade=99)
    for x in (20, 28):
        c.put(c.E(x, 43, 2.8, 2.6), "B", ring=True, ringc="K", shade=("D", None))
    c.put(c.E(24, 33.4, 7.2, 11.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 35, 2.6, 4.2), "E")  # the ember has nearly gone out
    c.px(24, 35, "e")
    for sp in ([(17, 16), (9, 16 + f), (12, 22)], mirror([(17, 16), (9, 16 + f), (12, 22)], S)):  # drooping horns
        c.put(c.P(sp), "H", ring=True, ringc="K", shade=("D", None), minshade=99)
    c.put(c.E(24, 21, 9.0, 8.2), "B", ring=True, ringc="K", shade=("D", "L"))
    c.outline("K")
    return Body(c, Anchor(15, 18, 23), beak_mouths(23, half=3))


ROSTER = [
    Creature("hearthwing", "Hearthwing", "adult", HEARTHWING, hearthwing, role="tank"),
    Creature("sootsnarl", "Sootsnarl", "adult", SOOTSNARL, sootsnarl, role="fighter"),
    Creature("dimwick", "Dimwick", "adult", DIMWICK, dimwick, role="quick"),
]
