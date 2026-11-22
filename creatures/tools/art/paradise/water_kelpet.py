"""The Kelpet line of the Water field (plan section 4): the young Kelpet (seaweed) and its four adults, tier 1 to 4.

Coralback (tier 1), Bubblebelly (2), Brinetusk (3), Limpseal (4). Bodies only: lib.stamp_face() adds the faces.
"""
from lib import SIZES, Anchor, Body, Canvas, Creature, mid_palette, sym, with_face
from water import DRIZZLE

S = SIZES["adult"]

# ---------- palettes ----------
CORALBACK = with_face(
    {"B": "#4e8f6a", "D": "#2f5e48", "L": "#86c4a0", "S": "#8a6a3a", "s": "#5a4220", "h": "#c4a060", "c": "#e8607a", "C": "#ffa08a", "y": "#ffd860", "g": "#3f9a4a", "G": "#256a34"},
    iris="#ffe080", arch="#142a1e", mouth="#3a1a14", tooth="#f3f1e6", outline="#0f1a14",
)
BUBBLEBELLY = with_face(
    {"B": "#6a86a8", "D": "#46607f", "L": "#9ab4cc", "b": "#d8f0ff", "z": "#8aa6c4", "n": "#4a5a78"},
    iris="#2a2a40", arch="#1a2438", mouth="#5a2a3a", tooth="#f3f1e6", outline="#121a2a",
)
BRINETUSK = with_face(
    {"B": "#8a6a5a", "D": "#5a4036", "d": "#3e2c26", "L": "#b89a86", "w": "#cdb09a", "n": "#3a2420", "T": "#f0e8d0", "z": "#c87a6a"},
    iris="#f0c040", arch="#1e140e", mouth="#3a1a14", tooth="#f0e8d0", outline="#170f0c",
)
LIMPSEAL = with_face(
    {"B": "#9aa4b4", "D": "#6a7488", "L": "#c8d0dc", "z": "#5a6478", "n": "#4a5268", "p": "#c8a0a8"},
    iris="#c8c8e8", arch="#1c2030", mouth="#4a2a38", tooth="#f3f1e6", outline="#161a26",
)
KELPET = with_face(
    {**mid_palette(DRIZZLE, CORALBACK), "S": "#8a6a3a", "s": "#5a4220", "h": "#c4a060", "g": "#3f9a4a", "G": "#256a34"},
    iris="#2b2a55", arch="#1a2a22", mouth="#6a3a3a", tooth="#f3f1e6", blush="#f4a0b8", outline="#14241c",
)


# =================== young, seaweed: Kelpet, a sea-turtle pup with a kelp tuft ===================
def kelpet(f=0):
    c = Canvas(36, 36)
    c.put(c.E(18, 19.5, 16.4, 13.4), "S", ring=True, ringc="K", shade=("s", "h"))  # the shell, wider than the head
    c.put(c.R(11, 8, 11, 12), "s")  # scute lines on the dome
    c.put(c.R(25, 8, 25, 12), "s")
    c.put(c.R(12, 8, 12, 12), "h")
    c.put(c.R(26, 8, 26, 12), "h")
    c.pxs([(3, 17), (4, 17), (4, 21), (5, 21), (31, 17), (32, 17), (30, 21), (31, 21), (3, 25), (4, 25), (31, 25), (32, 25)], "s")
    for pts in ([(16, 8), (12, 4 + f), (14, 3), (18, 6)], [(20, 8), (24 - f, 3), (26, 4), (21, 8)], [(17, 9), (17, 3 - f), (20, 2), (19, 9)]):
        c.put(c.P(pts), "g", ring=True, ringc="K", minshade=99)  # a kelp tuft growing on the shell, swaying
    c.pxs([(15, 6), (19, 4), (23, 4)], "G")
    c.put(c.E(18, 29.6, 10.2, 5.0), "B", ring=True, ringc="K", shade=("D", "L"))  # the small body under the big head
    c.put(sym(c.P([(8, 26), (2, 28 + f), (1, 31 + f), (4, 33), (9, 31)]), 36), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)  # paddle flippers
    for x in (13, 23):
        c.put(c.E(x, 33.0, 3.4, 1.7), "D", ring=True, ringc="K")  # hind feet
    c.put(c.E(18, 20.6, 12.6, 9.8), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(18, 24.6, 7.2, 4.4), "L")
    c.pxs([(17, 22), (18, 22)], "D")  # nostrils
    c.outline("K")
    return Body(c, Anchor(8, 16, 24))


# =================== adult, seaweed tier 1: Coralback, an armored sea turtle with a coral shell ===================
def coralback(f=0):
    c = Canvas(S, S)
    c.put(c.E(24, 22.4, 22.4, 16.4), "S", ring=True, ringc="K", shade=("s", "h"))  # the great shell
    for x in (14, 24, 34):  # scute lines, and a rim along the bottom
        c.put(c.R(x, 9, x, 17), "s")
        c.put(c.R(x + 1, 9, x + 1, 17), "h")
    c.put(c.R(7, 16, 41, 16), "s")
    c.pxs([(4, 22), (5, 22), (5, 27), (6, 27), (42, 22), (43, 22), (41, 27), (42, 27)], "s")
    # coral growing on the crown: three branches, each tip a little brighter
    for pts, tip in (([(15, 10), (11, 4), (13, 2), (17, 4), (18, 10)], (12, 3)), ([(21, 8), (22, 2 - f), (26, 2 - f), (27, 8)], (24, 3)), ([(30, 10), (31, 4), (35, 2), (37, 4), (33, 10)], (35, 3))):
        c.put(c.P(pts), "c", ring=True, ringc="K", minshade=99)
        c.pxs([tip, (tip[0] + 1, tip[1])], "C")
    c.pxs([(15, 7), (16, 7), (24, 5), (25, 5), (33, 6), (34, 6)], "y")
    c.put(c.E(24, 36.6, 14.0, 8.4), "B", ring=True, ringc="K", shade=("D", "L"))  # the body under the head
    c.put(c.E(24, 38.6, 8.6, 5.6), "L")
    c.put(sym(c.P([(12, 30), (3, 26 + f), (1, 31), (2, 37 + f), (7, 40), (13, 37)]), S), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)  # flippers
    c.pxs(sym({(4, 33), (5, 36), (6, 38)}, S), "D")
    for x in (16, 32):
        c.put(c.E(x, 44.4, 5.2, 2.4), "D", ring=True, ringc="K")  # hind feet
    c.put(c.E(24, 24.4, 14.2, 10.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 28.4, 8.6, 5.2), "L")
    c.pxs([(23, 25), (24, 25)], "D")  # nostrils
    c.outline("K")
    return Body(c, Anchor(16, 20, 28))


# =================== adult, seaweed tier 2: Bubblebelly, a round friendly manatee ===================
def bubblebelly(f=0):
    c = Canvas(S, S)
    c.put(c.E(24, 45.0, 10.4 + f, 2.3), "D", ring=True, ringc="K")  # the paddle tail
    c.put(c.E(24, 27.6, 19.6, 17.0), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 36.6, 13.4, 8.0), "L")  # the belly
    for y in (38, 41):
        c.pxs([(18, y), (19, y), (29, y), (30, y)], "z")  # belly creases
    c.put(sym(c.E(6.4, 35, 3.8, 5.8 + f), S), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)  # small flippers
    c.put(c.E(24, 32.2, 9.6, 5.8), "L")  # the snout
    c.pxs([(21, 29), (22, 29), (25, 29), (26, 29)], "n")  # nostrils
    c.pxs([(14, 31), (13, 33), (14, 35), (34, 31), (35, 33), (34, 35)], "n")  # whisker dots
    for cx, cy, r in ((17, 11, 3.3), (24, 8, 3.8), (31, 11, 3.0)):  # a crown of bubbles
        c.put(c.E(cx, cy, r, r), "b", ring=True, ringc="K", minshade=99)
    c.pxs([(16, 10), (23, 7), (30, 10)], "L")
    c.outline("K")
    return Body(c, Anchor(15, 22, 30))


# =================== adult, seaweed tier 3: Brinetusk, a grumpy walrus with long tusks ===================
def brinetusk(f=0):
    c = Canvas(S, S)
    c.put(c.E(24, 43.4, 12.6 + f, 2.8), "D", ring=True, ringc="K")  # the tail flukes
    c.put(c.E(24, 33.4, 18.6, 12.6), "B", ring=True, ringc="K", shade=("D", "L"))
    for y in (35, 38, 41):
        c.pxs([(16, y), (17, y), (18, y), (29, y), (30, y), (31, y)], "D")  # blubber folds
    c.put(sym(c.E(7.6, 36, 4.4, 8.4 + f), S), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)  # heavy flippers
    c.pxs(sym({(5, 42), (7, 43), (9, 43)}, S), "T")  # claws
    c.put(c.E(24, 20.4, 14.0, 11.0), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(19.6, 26.4, 6.2, 4.6), "w")  # the whisker pads
    c.put(c.E(28.4, 26.4, 6.2, 4.6), "w")
    c.pxs([(16, 26), (15, 28), (17, 29), (32, 26), (33, 28), (31, 29), (21, 24), (22, 24), (25, 24), (26, 24)], "n")  # whisker roots and nostrils
    for x in (20, 28):  # the tusks hang over the chest, one of them chipped
        end = 40 if x == 20 else 38
        c.put(c.R(x - 1, 29, x, end), "T", ring=True, ringc="K", minshade=99)
    c.pxs([(31, 17), (32, 18), (33, 19)], "z")  # an old scar over the eye
    c.outline("K")
    return Body(c, Anchor(16, 18, 27))


# =================== adult, seaweed tier 4: Limpseal, a thin slumped seal ===================
def limpseal(f=0):
    c = Canvas(S, S)
    flukes = [(15, 46 - f), (24, 41), (33, 46 - f), (28, 47), (20, 47)]
    c.put(c.P(flukes), "D", ring=True, ringc="K", minshade=99)  # the tail flukes lie limp on the floor
    c.put(c.E(24, 33.4, 9.8, 12.4), "B", ring=True, ringc="K", shade=("D", "L"))  # a thin body
    for y in (31, 34, 37, 40):
        c.pxs([(20, y), (21, y), (27, y), (28, y)], "D")  # ribs
    c.put(c.E(24, 37.4, 5.0, 7.4), "L")
    c.put(sym(c.E(13.6, 36.4, 2.6, 7.6 + f), S), "B", ring=True, ringc="K", shade=("D", None), minshade=3)  # flippers hanging down
    c.pxs(sym({(11, 41), (13, 42), (15, 41)}, S), "p")
    c.put(c.E(24, 18.4, 11.6, 9.8), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 23.4, 6.4, 3.8), "L")  # the muzzle
    c.pxs([(22, 21), (23, 21), (24, 21), (25, 21)], "n")  # nose
    c.pxs([(15, 23), (14, 24), (13, 25), (33, 23), (34, 24), (35, 25)], "n")  # drooping whiskers
    c.pxs([(17, 13), (28, 12), (31, 16), (14, 17), (22, 11), (33, 21), (16, 28)], "z")  # seal spots
    c.pxs([(21, 44), (28, 43), (18, 38), (30, 36)], "z")
    c.outline("K")
    return Body(c, Anchor(15, 16, 24))


ROSTER = [
    Creature("kelpet", "Kelpet", "young", KELPET, kelpet, role="tank"),
    Creature("coralback", "Coralback", "adult", CORALBACK, coralback, role="tank"),
    Creature("bubblebelly", "Bubblebelly", "adult", BUBBLEBELLY, bubblebelly, role="caster"),
    Creature("brinetusk", "Brinetusk", "adult", BRINETUSK, brinetusk, role="fighter"),
    Creature("limpseal", "Limpseal", "adult", LIMPSEAL, limpseal, role="quick"),
]
