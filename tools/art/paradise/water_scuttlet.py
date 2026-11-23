"""The Scuttlet line of the Water field (plan section 4): the young Scuttlet (shrimp) and its four adults, tier 1 to 4.

Rampclaw (tier 1), Shellsnug (2), Chipclaw (3), Softshell (4). Bodies only: lib.stamp_face() adds the faces.
"""
import math

from lib import SIZES, Anchor, Body, Canvas, Creature, mid_palette, sym, with_face
from water import DRIZZLE

S = SIZES["adult"]

# ---------- palettes ----------
SHELLSNUG = with_face(
    {"B": "#e8904a", "D": "#a85a2a", "d": "#6a3418", "L": "#ffc27a", "s": "#f0d8c0", "S": "#c8a088", "h": "#fff0e0", "p": "#e08a9a", "c": "#f4e4c8"},
    iris="#3a2a1a", arch="#3a1c0c", mouth="#6a2a24", tooth="#f4e4c8", outline="#2a140a",
)
CHIPCLAW = with_face(
    {"B": "#9a6a4a", "D": "#684430", "d": "#46301f", "L": "#c4906a", "n": "#ddd6c6", "N": "#a8a090", "g": "#4f8a3a", "c": "#e8dcc0", "z": "#c8584a"},
    iris="#e8c040", arch="#1e140e", mouth="#2e1410", tooth="#e8dcc0", outline="#17100a",
)
SOFTSHELL = with_face(
    {"B": "#f0c0b8", "D": "#c8908a", "L": "#ffe4dc", "h": "#9a98b0", "H": "#c4c2d4", "d": "#6a6880", "r": "#e89aa0"},
    iris="#4a3a5a", arch="#3a2a3a", mouth="#8a3a4a", tooth="#f4e4e0", outline="#2a2434",
)
RAMPCLAW = with_face(
    {"B": "#d4503a", "D": "#8e2e22", "d": "#5e1c16", "L": "#f08a62", "t": "#2fb0a8", "y": "#ffd860", "c": "#f4e4c8", "w": "#e8a890"},
    iris="#ffe060", arch="#2a0e0a", mouth="#3a1010", tooth="#f4e4c8", outline="#1c0a08",
)
SCUTTLET = with_face(
    {**mid_palette(DRIZZLE, RAMPCLAW, "BDL"), "B": "#f0907c", "D": "#c85a4c", "L": "#ffc4ae", "t": "#2fb0a8", "c": "#f4e4c8"},
    iris="#2b2a55", arch="#3a1a1a", mouth="#8a3a40", tooth="#f4e4c8", blush="#ff7a8a", outline="#4a1e1a",
)


# =================== young, shrimp: Scuttlet, a pink shrimp-crab with big claws ===================
def scuttlet(f=0):
    c = Canvas(36, 36)
    for x0, y0, x1, y1 in ((14, 12, 10, 3 + f), (22, 12, 26, 3 + f)):
        c.put(c.L(x0, y0, x1, y1), "D")  # feelers
    c.put(c.E(18, 33.4, 6.0, 2.0), "D", ring=True, ringc="K")  # the tail fan folded under
    for x in (9, 12):
        c.pxs(sym({(x, 30), (x - 1, 31), (x - 1, 32)}, 36), "D")  # little legs
    arm = c.E(7.4, 24, 2.6, 4.0)
    claw = c.E(5.6, 14.4 - f, 4.6, 6.6) - c.P([(4, 7 - f), (8.4, 14 - f), (2.4, 14 - f)])  # a raised pincer with a notch
    c.put((claw | arm) | sym(claw | arm, 36), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
    c.put(c.E(18, 23, 10.8, 9.4), "B", ring=True, ringc="K", shade=("D", "L"))  # the carapace
    c.put(c.E(18, 27.6, 6.6, 4.2), "L")
    c.put(c.R(17, 14, 18, 15), "D")  # a ridge over the brow
    c.outline("K")
    return Body(c, Anchor(9, 16, 25))


# =================== adult, shrimp tier 1: Rampclaw, an armored lobster king ===================
def rampclaw(f=0):
    c = Canvas(S, S)
    for x0, y0, x1, y1 in ((20, 13, 9, 3 + f), (28, 13, 39, 3 + f), (21, 13, 14, 4), (27, 13, 34, 4)):
        c.put(c.L(x0, y0, x1, y1), "y")  # long whip feelers
    c.put(c.E(24, 44.6, 9.0, 2.6), "D", ring=True, ringc="K")  # the tail fan
    c.pxs(sym({(18, 44), (16, 45), (14, 44)}, S), "d")
    for dx in (0, 3, 6):
        c.pxs(sym({(13 - dx, 39 + dx // 2), (11 - dx, 41 + dx // 2), (10 - dx, 43 + dx // 2)}, S), "D")  # walking legs
    arm = c.E(13.6, 33.4, 3.8, 5.2)
    claw = c.E(8.6, 20 - f * 1.2, 7.4, 9.8) - c.P([(8.6, 18 - f), (4.4, 6 - f), (13.4, 6 - f)])  # a huge pincer, open at the top
    both = (claw | arm)
    c.put(both | sym(both, S), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
    for y in (15, 19, 23):
        c.pxs(sym({(x, y) for x in range(3, 7)}, S), "t")  # teal armor stripes on the claws
    c.pxs(sym({(5, 10 - f), (6, 11 - f), (12, 10 - f), (11, 11 - f)}, S), "c")  # pale claw tips
    c.put(c.E(24, 31, 13.6, 11.6), "B", ring=True, ringc="K", shade=("D", "L"))  # the carapace
    for y in (35, 38, 41):
        c.put(c.R(14, y, 34, y), "d")  # plates
    c.put(sym(c.P([(14, 24), (10, 15), (18, 22)]), S), "D", ring=True, ringc="K", minshade=99)  # shoulder spikes
    c.put(c.P([(21, 22), (24, 11), (27, 22)]), "L", ring=True, ringc="K", minshade=99)  # the rostrum, a crown spike
    c.put(c.E(24, 35.4, 7.4, 4.6), "w")
    c.outline("K")
    return Body(c, Anchor(16, 23, 30))


# =================== adult, shrimp tier 2: Shellsnug, a round hermit crab in a spiral shell ===================
def shellsnug(f=0):
    c = Canvas(S, S)
    c.put(c.E(35.4, 9.6, 6.0, 5.4), "s", ring=True, ringc="K", shade=("S", "h"))  # the tip of the spire
    c.put(c.E(23, 21.4, 19.4, 17.4), "s", ring=True, ringc="K", shade=("S", "h"))  # the shell
    for deg in range(1200):  # one spiral line, three and a bit turns from the middle out
        r = 1.4 + deg * 0.0119
        c.px(round(23 + r * math.cos(math.radians(deg)) * 1.02), round(20.4 + r * math.sin(math.radians(deg)) * 0.92), "S")
    c.pxs([(33, 9), (34, 9), (36, 11), (35, 8)], "S")  # the spire's own curl
    c.pxs([(12, 10), (13, 10), (36, 21), (35, 21), (8, 24), (40, 28), (28, 12)], "p")  # pink speckles
    c.pxs([(17, 8), (18, 7), (29, 6), (30, 7)], "h")
    c.put(c.E(24, 33.0, 15.0, 5.2), "d", ring=True, ringc="K", minshade=99)  # the dark mouth of the shell
    c.put(c.E(24, 35.4, 14.2, 9.2), "B", ring=True, ringc="K", shade=("D", "L"))  # the crab, snug in the opening
    c.put(c.E(24, 38.6, 8.8, 5.0), "L")
    for sx in (-1, 1):  # round little claws
        cx = 24 + sx * 17
        c.put(c.E(cx, 38.4 - f, 4.4, 4.2), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
        c.pxs([(cx, 36 - f), (cx + sx, 36 - f)], "d")
    for x in (14, 19, 29, 34):
        c.put(c.E(x, 44.6, 2.6, 1.6), "D", ring=True, ringc="K")  # stubby legs
    c.outline("K")
    return Body(c, Anchor(14, 31, 37))


# =================== adult, shrimp tier 3: Chipclaw, a scrappy crab with a chipped claw ===================
def chipclaw(f=0):
    c = Canvas(S, S)
    for sx, dy in ((-1, 0), (-1, 4), (1, 0), (1, 4)):  # spidery legs, two on each side
        x0 = 24 + sx * 15
        pts = [(x0, 34 + dy), (x0 + sx * 3, 38 + dy), (x0 + sx * 5, 43 + dy // 2), (x0 + sx * 6, 45)]
        for (a, b), (e, g) in zip(pts, pts[1:]):
            c.put(c.L(a, b, e, g), "D")
    big = c.E(8.4, 19 - f, 6.4, 8.6) - c.P([(8.4, 16 - f), (4.4, 5 - f), (13, 5 - f)])  # the good claw
    small = c.E(40.0, 21 + f, 5.0, 6.4) - c.P([(40, 18 + f), (36.5, 11 + f), (44, 14 + f)])  # the chipped one: one prong is gone
    arm_l = c.E(13, 30, 3.6, 4.4)
    arm_r = c.E(36, 31, 3.2, 4.0)
    c.put(big | arm_l, "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
    c.put(small | arm_r, "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
    c.pxs([(5, 9 - f), (6, 10 - f), (12, 9 - f)], "c")  # claw tips
    c.pxs([(43, 15 + f), (42, 16 + f)], "c")
    c.pxs([(37, 11 + f), (38, 12 + f), (37, 13 + f)], "z")  # the fresh chip
    c.put(c.E(24, 31.4, 18.6, 10.6), "B", ring=True, ringc="K", shade=("D", "L"))  # a wide flat carapace
    c.put(c.E(24, 36.4, 11.6, 5.6), "L")
    for x, y in ((9, 33), (37, 31), (39, 27), (31, 38), (17, 38), (23, 39)):  # barnacles, kept off the face
        c.pxs([(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)], "n")
        c.pxs([(x + 1, y + 1)], "N")
    c.pxs([(13, 35), (14, 36), (14, 37), (15, 38), (33, 34), (32, 35), (32, 36)], "d")  # cracks
    for x, h in ((17, 4), (20, 6), (23, 3), (27, 5)):  # a little seaweed it never cleans off
        c.put(c.L(x, 21, x + (1 if h % 2 else -1), 21 - h), "g")
    c.outline("K")
    return Body(c, Anchor(16, 25, 31))


# =================== adult, shrimp tier 4: Softshell, a limp molting shrimp half out of its old shell ===================
def softshell(f=0):
    c = Canvas(S, S)
    c.put(c.E(24, 28, 17.4, 16.6), "h", ring=True, ringc="K", shade=("d", "H"))  # the old shell, split open
    c.put(sym(c.E(6.4, 40.6 + f, 3.0, 5.4), S), "h", ring=True, ringc="K", shade=("d", "H"), minshade=3)  # its empty claws hang low
    c.pxs([(22, 11), (23, 12), (24, 11), (25, 12), (26, 11), (24, 13), (23, 14)], "d")  # the crack along the top
    for pts in ([(15, 20), (9, 14), (4, 17), (3, 25), (3, 32 + f)], [(33, 20), (39, 14), (44, 17), (45, 25), (45, 32 + f)]):  # long limp antennae
        for a, b in zip(pts, pts[1:]):
            c.put(c.L(*a, *b), "D")
    for cy, rx, ry in ((43.6, 6.4, 2.6), (40.0, 7.6, 3.2), (35.6, 9.0, 4.0)):  # the soft body hangs down in segments
        c.put(c.E(24, cy, rx, ry), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
    c.pxs([(20, 45), (22, 46), (26, 46), (28, 45)], "r")  # a soft tail fan
    c.put(c.E(24, 24.6, 12.8, 10.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 28.6, 7.0, 4.4), "L")
    c.outline("K")
    return Body(c, Anchor(16, 21, 28))


ROSTER = [
    Creature("scuttlet", "Scuttlet", "young", SCUTTLET, scuttlet, role="quick"),
    Creature("rampclaw", "Rampclaw", "adult", RAMPCLAW, rampclaw, role="fighter"),
    Creature("shellsnug", "Shellsnug", "adult", SHELLSNUG, shellsnug, role="tank"),
    Creature("chipclaw", "Chipclaw", "adult", CHIPCLAW, chipclaw, role="fighter"),
    Creature("softshell", "Softshell", "adult", SOFTSHELL, softshell, role="quick"),
]
