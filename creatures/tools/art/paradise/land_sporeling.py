"""The Sporeling line of the Land field (plan section 4): young Sporeling (fed anything else) and its four adults, tier 1 to 4.

Hollowbloom (tier 1), Potterling (2), Needlecap (3), Mossheap (4). Bodies only: lib.stamp_face() adds the faces.
"""
import math

from lib import SIZES, Anchor, Body, Canvas, Creature, polar, sym, with_face

S, Y = SIZES["adult"], SIZES["young"]

# ---------- palettes ----------
SPORELING = with_face(
    {"B": "#e8dcc0", "D": "#bfae8a", "L": "#f6eedc", "C": "#c4725a", "c": "#8a4a3c", "s": "#f0e0c8", "g": "#6aa84f"},
    iris="#3a2a3a", arch="#2a1a2a", mouth="#7a3a40", tooth="#fff4e8", outline="#1a1018",
)
HOLLOWBLOOM = with_face(
    {"B": "#3d8058", "D": "#2a5a3c", "L": "#62a06a", "G": "#3f8a48", "F": "#a03a78", "Y": "#ffe27a", "H": "#d8c878", "h": "#a8984a"},
    iris="#2a0a30", arch="#2a1030", mouth="#3a0a30", tooth="#fff08a", outline="#10081a",
)
POTTERLING = with_face(
    {"R": "#c8643a", "r": "#8a3e24", "Q": "#e07a4a", "g": "#5aa84a", "Y": "#f8d848", "o": "#e8902a", "D": "#6a2e1c", "C": "#f2cfa4"},
    iris="#2a1408", arch="#2a1408", mouth="#5a2418", tooth="#fff4e8", outline="#1a0e0a",
)
NEEDLECAP = with_face(
    {"B": "#6a8a5a", "D": "#455f3e", "L": "#9ab57e", "n": "#f0e8c0", "F": "#e8688a", "Y": "#ffe27a"},
    iris="#ffd060", arch="#1a1a10", mouth="#3a1a1a", tooth="#f0e8c0", outline="#0e1410",
)
MOSSHEAP = with_face(
    {"B": "#5a7a3a", "D": "#3a5a2a", "d": "#2a4420", "L": "#8aa85a", "t": "#6a4a30", "r": "#c4504a", "s": "#f0e0c8"},
    iris="#e8e8a0", arch="#1a2410", mouth="#2a1a14", tooth="#e8e0c0", outline="#0c140a",
)


# =================== young: Sporeling, a mushroom sprout ===================
def sporeling(f=0):
    c = Canvas(Y, Y)
    for x in (13, 23):
        c.put(c.E(x, 32.4, 3.2, 1.5), "D", ring=True, ringc="K")
    c.put(c.E(18, 23, 10.2, 10.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(sym(c.E(8.2, 26 + f, 1.8, 2.6), Y), "B", ring=True, ringc="K", shade=("D", None), minshade=3)
    cap = {(x, y) for x, y in c.E(18, 15.2 + f, 13.4, 11.2) if y <= 14 + f}
    c.put(cap, "C", ring=True, ringc="K", shade=("c", None))
    for x, y, rx, ry in ((10, 9, 1.9, 1.6), (24, 7.4, 2.1, 1.7), (18, 11.4, 1.5, 1.3), (28.6, 11.6, 1.4, 1.2), (6.6, 12.4, 1.2, 1.0)):
        c.put(c.E(x, y + f, rx, ry), "s", minshade=99)
    c.put(c.P([(18, 5 + f), (15, 2.4 + f), (19, 3.6 + f)]), "g", ring=True, ringc="K", minshade=99)  # a sprout on top
    c.outline("K")
    return Body(c, Anchor(10, 19, 26))


# the glowing fangs are longer than the standard ones: two T rows, one more than the style's own, growing upward from the line,
# which stays on the row the style puts it on (neutral: the second row of the mouth). Asleep (flat) the fangs are one row.
HOLLOWBLOOM_MOUTHS = {
    "neutral": {"dy": -1, "rows": ["T......T", "T......T", "MMMMMMMM"]},
    "flat": {"dy": -1, "rows": ["T......T", "MMMMMMMM"]},
}


# =================== adult, other tier 1: Hollowbloom, a flower sprite with glowing fangs ===================
def hollowbloom(f=0):
    c = Canvas(S, S)
    for k in range(9):
        a = -math.pi / 2 + k * 2 * math.pi / 9 + f * 0.12  # the petals turn a little on the second drawing

        def pt(r, da, a=a):
            return polar(24, 19, a, r, da)

        c.put(c.P([pt(6, -0.42), pt(12.4, -0.42), pt(17, 0), pt(12.4, 0.42), pt(6, 0.42)]), "F", ring=True, ringc="K", minshade=99)
        x, y = pt(11.5, 0)
        c.px(int(x), int(y), "Y")
    leaf = [(18.5, 32), (11, 28), (6, 33), (9, 38), (15, 37)]
    c.put(c.E(24, 35, 5.6, 9.0), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(sym(c.P(leaf), S), "G", ring=True, ringc="K", minshade=99)
    for x in (20, 28):
        c.put(c.E(x, 43.4, 3.4, 2.2), "D", ring=True, ringc="K")
    c.pxs([(23, 33), (24, 33), (23, 34), (24, 34)], "Y")  # a glowing seed in the chest
    c.put(c.E(24, 19, 8.8, 7.4), "H", ring=True, ringc="K", shade=("h", None))
    c.outline("K")
    return Body(c, Anchor(17, 17, 23), HOLLOWBLOOM_MOUTHS)


# =================== adult, other tier 2: Potterling, a flower-pot creature ===================
def potterling(f=0):
    c = Canvas(S, S)
    c.put(c.R(23, 12, 25, 21), "g", ring=True, ringc="K", minshade=99)  # the stem
    c.put(sym(c.P([(24, 17), (18, 12 - f), (14, 15), (19, 18)]), S), "g", ring=True, ringc="K", minshade=99)
    for k in range(6):
        a = k * math.pi / 3 + f * 0.4
        c.put(c.E(24 + 4.4 * math.cos(a), 10 + 4.4 * math.sin(a), 2.7, 2.7), "Y", ring=True, ringc="K", minshade=99)
    c.put(c.E(24, 10, 2.6, 2.6), "o", minshade=99)
    for x in (18, 30):
        c.put(c.E(x, 44, 4.0, 1.6), "D", ring=True, ringc="K")
    c.put(c.P([(11, 24), (37, 24), (34, 44), (14, 44)]), "R", ring=True, ringc="K", shade=("r", None))
    c.put(c.E(24, 31.2, 9.6, 6.0), "C")  # a pale plate on the pot for the face to sit on
    c.put(c.R(9, 20, 38, 25), "Q", ring=True, ringc="K", shade=("R", None), minshade=3)
    c.put(sym(c.P([(13, 30), (7, 28 - f), (5, 33), (8, 37), (13, 35)]), S), "g", ring=True, ringc="K", minshade=99)
    c.pxs([(34, 30), (35, 31), (34, 32), (35, 33)], "r")  # a crack
    c.outline("K")
    return Body(c, Anchor(16, 28, 34))


# =================== adult, other tier 3: Needlecap, a prickly cactus ===================
def needlecap(f=0):
    c = Canvas(S, S)
    for x in (19, 29):
        c.put(c.E(x, 43.6, 4.4, 2.0), "D", ring=True, ringc="K")
    arm = [(15, 32), (7, 32), (7, 19 - f), (11, 19 - f), (11, 28), (15, 28)]
    c.put(c.E(24, 27.6, 11, 15.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(sym(c.P(arm), S), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
    for x in (14, 33, 18, 29, 9, 38):  # needles in short columns, kept off the face
        for y in range(18, 40, 4):
            if (x == 9 and y > 28) or (x == 38 and y > 28) or (x in (14, 33) and y < 24) or (x in (18, 29) and y < 30):
                continue
            c.pxs([(x - 1, y), (x + 1, y), (x, y - 1)], "n")
            c.px(x, y, "D")
    for x in (19, 21, 27, 29):
        c.put(c.P([(x - 1.5, 14), (x, 7), (x + 1.5, 14)]), "n", ring=True, ringc="K", minshade=99)  # a cap of spines
    c.put(c.E(24, 9.6, 3.0, 2.6), "F", ring=True, ringc="K", minshade=99)
    c.pxs([(23, 9), (24, 9)], "Y")
    c.outline("K")
    return Body(c, Anchor(16, 20, 26))


# =================== adult, other tier 4: Mossheap, a shaggy heap of moss ===================
def mossheap(f=0):
    c = Canvas(S, S)
    c.put(c.E(24, 34, 19, 8.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 29, 14.4, 12), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 21, 8.4, 5.2), "B", ring=True, ringc="K", shade=("D", "L"))
    for x in range(7, 41, 3):  # the shaggy fringe, 7 to 40 so it mirrors about the middle
        c.pxs([(x, y) for y in range(43, 45 + (x // 3) % 2)], "D")
    for x, y in ((12, 33), (36, 36), (20, 24), (30, 26), (16, 38), (30, 40), (24, 19)):
        c.pxs([(x, y), (x + 1, y), (x, y - 1)], "L")
    for x, y in ((14, 40), (33, 32), (22, 41), (10, 36)):
        c.pxs([(x, y), (x + 1, y + 1)], "d")
    for tip in ((3, 27 + 2 * f), (3, 33 - f)):
        c.pxs(sorted(c.L(9, 34, *tip)), "t")
        c.pxs(sorted(c.L(S - 1 - 9, 34, S - 1 - tip[0], tip[1])), "t")
    c.put(c.E(14, 19.6, 2.8, 1.6), "r", ring=True, ringc="K", minshade=99)
    c.pxs([(13, 20), (14, 20), (13, 21), (14, 21)], "s")
    c.pxs([(14, 18), (15, 18)], "s")
    c.outline("K")
    return Body(c, Anchor(17, 28, 33))


ROSTER = [
    Creature("sporeling", "Sporeling", "young", SPORELING, sporeling, role="caster"),
    Creature("hollowbloom", "Hollowbloom", "adult", HOLLOWBLOOM, hollowbloom, role="caster"),
    Creature("potterling", "Potterling", "adult", POTTERLING, potterling, role="tank"),
    Creature("needlecap", "Needlecap", "adult", NEEDLECAP, needlecap, role="fighter"),
    Creature("mossheap", "Mossheap", "adult", MOSSHEAP, mossheap, role="tank"),
]
