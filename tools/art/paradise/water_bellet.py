"""The Bellet line of the Water field (plan section 4): the young Bellet (the "other" young) and its four adults, tier 1 to 4.

Stormbell (tier 1), Inkpot (2), Spinewad (3), Droopstar (4). Bodies only: lib.stamp_face() adds the faces.
"""
import math

from lib import SIZES, Anchor, Body, Canvas, Creature, mid_palette, with_face
from water import DRIZZLE

S = SIZES["adult"]

# ---------- palettes ----------
STORMBELL = with_face(
    {"B": "#8a6ad8", "D": "#5a3ea8", "d": "#3a2678", "L": "#c4b0f4", "t": "#b09cec", "g": "#7ff5ff", "q": "#e0fdff", "y": "#fff6a0"},
    iris="#fff6a0", arch="#fff6a0", mouth="#2a1450", tooth="#e0fdff", outline="#120a28",
)
INKPOT = with_face(
    {"B": "#d070a8", "D": "#9a4a7a", "d": "#6a2e54", "L": "#f0a0c8", "s": "#ffd8ec"},
    iris="#ffe090", arch="#2a0e24", mouth="#4a1a38", tooth="#ffe8f4", outline="#240c1e",
)
SPINEWAD = with_face(
    {"B": "#6a5aa8", "D": "#8272c8", "d": "#4a3c8a", "L": "#a090e0", "c": "#e0d8f8", "z": "#e0685a", "g": "#7ff5ff"},
    iris="#ff9a4a", arch="#14101e", mouth="#2a1018", tooth="#e8dcc8", outline="#0e0a16",
)
DROOPSTAR = with_face(
    {"B": "#f0b080", "D": "#c08050", "L": "#ffd8b0", "z": "#e8786a", "n": "#a8603a"},
    iris="#5a3a2a", arch="#3a2218", mouth="#8a3a3a", tooth="#fff0e0", outline="#3a2418",
)
BELLET = with_face(
    {**mid_palette(DRIZZLE, STORMBELL, "BDL"), "t": "#c8b8f0", "g": "#7ff5ff", "q": "#e0fdff"},
    iris="#2b2a55", arch="#2b2a55", mouth="#8a3a60", tooth="#f4e8f4", blush="#f4a0c8", outline="#2a1a4a",
)


# =================== young, "other": Bellet, a jellyfish sprout ===================
def bellet(f=0):
    c = Canvas(36, 36)
    for x in (7.5, 13.5, 22.5, 28.5):  # four short tentacles, swaying
        sway = (1 if x < 18 else -1) * f
        c.put(c.chain([(x, 26.5, 1.4, 1.8), (x + sway * 0.3, 29.6, 1.3, 1.8), (x + sway * 0.7, 32.4, 1.3, 1.7), (x + sway, 34.2, 1.0, 1.0)]), "t", ring=True, ringc="K", minshade=99)
    bell = c.E(18, 15.2, 14.6, 12.6) & c.R(0, 0, 35, 24)  # a dome with a flat bottom
    c.put(bell, "B", ring=True, ringc="K", shade=("D", "L"))
    for i in range(6):  # a scalloped skirt along the bottom of the bell
        c.put(c.E(6.4 + i * 4.64, 24.6, 2.6, 1.9), "L", ring=True, ringc="K", minshade=99)
    c.put(c.E(18, 9.0, 8.0, 4.0), "L")  # a soft highlight
    c.put(c.E(18, 3.8, 1.8, 1.8), "g", ring=True, ringc="K", minshade=99)  # a glowing nub on top
    c.pxs([(17, 3)], "q")
    c.outline("K")
    return Body(c, Anchor(8, 12, 20))


# =================== adult, "other" tier 1: Stormbell, a huge glowing jellyfish ===================
def stormbell(f=0):
    c = Canvas(S, S)
    for x in (8, 14.5, 20.5, 27.5, 33.5, 40):  # long ribbon tentacles, each tipped with a spark
        sw = (1.6 if x < 24 else -1.6) * (f - 0.5)
        c.put(c.chain([(x, 37.5, 2.0, 2.6), (x + sw, 41, 1.9, 2.4), (x - sw, 44, 1.8, 2.2), (x + sw, 46, 1.2, 1.2)]), "t", ring=True, ringc="K", minshade=99)
    for x in (14, 24, 34):  # frilly oral arms in the middle
        c.put(c.E(x, 39 + f, 2.8, 4.4), "L", ring=True, ringc="K", minshade=99)
    bell = c.E(24, 24.4, 21.0, 17.2) & c.R(0, 0, 47, 35)
    c.put(bell, "B", ring=True, ringc="K", shade=("D", "L"))
    for i in range(8):  # a scalloped skirt
        c.put(c.E(5.6 + i * 5.26, 35.6, 3.2, 2.2), "L", ring=True, ringc="K", minshade=99)
    for sx in (-1, 1):  # lightning veins through the bell, either side of the face
        base = 24 + sx * 17
        bolt = [(base, 12), (base - sx * 3, 17), (base, 18), (base - sx * 4, 24), (base - sx * 1, 25), (base - sx * 4, 31)]
        for a_, b_ in zip(bolt, bolt[1:]):
            c.put(c.L(*a_, *b_), "g")
        c.pxs([bolt[2], bolt[4]], "q")
    for x, tip in ((14, 3), (24, 1), (34, 3)):  # a crown of bolts on top
        c.put(c.P([(x - 3, 9), (x - 1, tip + 2 + f), (x, 7), (x + 3, tip + 4), (x + 2, 10)]), "y", ring=True, ringc="K", minshade=99)
    c.put(c.E(24, 12.6, 9.0, 3.6), "L")
    c.outline("K")
    return Body(c, Anchor(15, 20, 29))


# =================== adult, "other" tier 2: Inkpot, a round friendly octopus ===================
def inkpot(f=0):
    c = Canvas(S, S)
    arms = [[(14, 37), (9, 39.5), (6, 42), (9, 44)], [(19, 39), (16, 41.5), (17, 43), (21, 43.4)]]
    for pts in arms:
        for sx in (-1, 1):
            chain = [(24 + sx * (24 - x), y + (f * sx if i == 3 else 0), 3.0 - i * 0.35, 2.6 - i * 0.3) for i, (x, y) in enumerate(pts)]
            c.put(c.chain(chain), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
    c.put(c.E(24, 24.4, 18.4, 17.2), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 33.6, 11.4, 6.6), "L")  # a lighter belly
    c.pxs([(18, 36), (20, 38), (23, 37), (26, 38), (28, 36), (24, 40), (16, 33), (32, 33)], "s")  # suckers
    c.pxs([(12, 14), (13, 13), (14, 12), (36, 14), (35, 13), (34, 12)], "L")  # shine
    c.outline("K")
    return Body(c, Anchor(15, 21, 30))


# =================== adult, "other" tier 3: Spinewad, a grumpy sea urchin ===================
def spinewad(f=0):
    c = Canvas(S, S)
    for i, deg in enumerate(range(0, 360, 13)):  # spikes all round, the long ones swaying a little
        a = math.radians(deg + 90)
        reach = 20.4 + ((i + f) % 3 - 1) * 1.2
        cx, cy = 24, 27
        tip = (cx + reach * math.cos(a), cy + reach * 0.86 * math.sin(a))
        left = (cx + 11 * math.cos(a - 0.2), cy + 11 * 0.9 * math.sin(a - 0.2))
        right = (cx + 11 * math.cos(a + 0.2), cy + 11 * 0.9 * math.sin(a + 0.2))
        c.put(c.P([left, tip, right]), "d", ring=True, ringc="K", minshade=99)
        c.put(c.P([(cx + 12 * math.cos(a - 0.08), cy + 12 * 0.9 * math.sin(a - 0.08)), (cx + (reach - 1) * math.cos(a), cy + (reach - 1) * 0.86 * math.sin(a)), (cx + 12 * math.cos(a + 0.08), cy + 12 * 0.9 * math.sin(a + 0.08))]), "D", minshade=99)
    c.put(c.E(24, 27, 14.4, 13.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 34, 8.0, 4.6), "L")  # a pale underside
    for x, y in ((14, 21), (33, 20), (12, 30), (36, 30), (19, 38), (29, 38)):  # little pale tubes between the spikes
        c.pxs([(x, y), (x, y + 1)], "c")
    c.pxs([(31, 14), (32, 15), (32, 16)], "z")  # a scar
    c.outline("K")
    return Body(c, Anchor(16, 25, 32))


# =================== adult, "other" tier 4: Droopstar, a limp starfish ===================
def droopstar(f=0):
    c = Canvas(S, S)

    def arm(points, radii):
        return c.chain([(x, y, r, r * 0.95) for (x, y), r in zip(points, radii)])

    limbs = [
        [(16, 27), (10, 31), (7, 36 + f), (6, 41 + f)],  # the left arm hangs
        [(32, 27), (38, 31), (41, 36 + f), (42, 41 + f)],  # and the right
        [(20, 31), (17, 35), (15, 39), (14, 43)],  # two lie on the ground
        [(28, 31), (31, 35), (33, 39), (34, 43)],
        [(24, 15), (24, 10), (28 + f, 6), (33 + f, 5)],  # the top arm flops over to one side
    ]
    for pts in limbs:
        c.put(arm(pts, [4.6, 4.0, 3.2, 2.2]), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
        c.pxs([(round(x), round(y)) for x, y in pts[1:]], "z")
    c.put(c.E(24, 24, 10.6, 9.8), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 28, 6.4, 3.6), "L")
    c.pxs([(18, 17), (30, 17), (24, 14), (20, 30), (28, 30), (16, 31), (32, 31)], "z")
    c.outline("K")
    return Body(c, Anchor(15, 21, 28))


ROSTER = [
    Creature("bellet", "Bellet", "young", BELLET, bellet, role="caster"),
    Creature("stormbell", "Stormbell", "adult", STORMBELL, stormbell, role="caster"),
    Creature("inkpot", "Inkpot", "adult", INKPOT, inkpot, role="tank"),
    Creature("spinewad", "Spinewad", "adult", SPINEWAD, spinewad, role="fighter"),
    Creature("droopstar", "Droopstar", "adult", DROOPSTAR, droopstar, role="quick"),
]
