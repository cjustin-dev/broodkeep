"""The other three adults of the Cragpup line (plan section 4). Cragpup (young) and Gravelhorn (tier 1) are in land.py.

Cindermane (tier 2), Scrapjaw (3), Gutterfang (4). Bodies only: lib.stamp_face() adds the faces.
"""
import math

from lib import SIZES, Anchor, Body, Canvas, Creature, bands, polar, sym, with_face

S = SIZES["adult"]

# ---------- palettes ----------
CINDERMANE = with_face(
    {"B": "#8a6048", "D": "#583a2a", "L": "#b88a64", "c": "#c4786a", "R": "#e8582a", "r": "#ff9a3a", "y": "#ffd860", "n": "#c0505a", "T": "#f3f1e6"},
    iris="#ffc23a", arch="#2a1410", mouth="#4a1a1a", tooth="#f3f1e6", outline="#1a0e0c",
)
SCRAPJAW = with_face(
    {"B": "#8a7a60", "D": "#5a4e3a", "d": "#3e3426", "L": "#b8a888", "z": "#b8683a", "Z": "#7a3e22", "c": "#a86a5a"},
    iris="#e8c040", arch="#201a10", mouth="#3a1a14", tooth="#e8dcc0", outline="#16110c",
)
GUTTERFANG = with_face(
    {"B": "#a89aa0", "D": "#786a72", "L": "#d0c4c6", "p": "#e8a0a8", "n": "#c87a88"},
    iris="#d8d040", arch="#241a20", mouth="#4a1a2a", tooth="#f3f1e6", outline="#18121a",
)


# =================== adult, meat tier 2: Cindermane, an ember-maned wildcat ===================
def cindermane(f=0):
    c = Canvas(S, S)
    for i, deg in enumerate(range(-200, 21, 22)):  # a mane of flames; each tip flickers on the second drawing
        a = math.radians(deg)
        tip = 16.4 + ((i + f) % 3 - 1) * 1.4

        def pt(r, da, a=a):
            return polar(24, 19, a, r, da)

        c.put(c.P([pt(7, -0.3), pt(tip * 0.7, -0.2), pt(tip, 0), pt(tip * 0.7, 0.2), pt(7, 0.3)]), "R", ring=True, ringc="K", minshade=99)
        c.put(c.P([pt(7.5, -0.14), pt(tip * 0.7, -0.06), pt(tip * 0.88, 0), pt(tip * 0.7, 0.06), pt(7.5, 0.14)]), "r", minshade=99)
    c.put(c.chain([(35, 40, 3.4, 2.8), (39.6, 36.6, 3.0, 2.6), (42.4, 31.8, 2.5, 2.4), (43.0, 27.4, 2.1, 2.3)]), "B", ring=True, ringc="K", shade=("D", "L"), minshade=3)
    c.put(c.P([(41, 26), (42 + f, 19 - f), (44, 26)]), "R", ring=True, ringc="K", minshade=99)  # the ember at the tail tip
    c.put(c.P([(42, 26), (42.6 + f, 22 - f), (43.4, 26)]), "y", minshade=99)
    for x in (18, 30):
        c.put(c.E(x, 43.2, 4.6, 2.6), "D", ring=True, ringc="K")
    c.pxs(sym({(15, 45), (18, 45)}, S), "T")  # toes
    c.put(c.E(24, 34, 9.4, 9.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 35.4, 5.4, 6.6), "L")
    c.put(sym(c.E(14.2, 34, 2.8, 5.6 + f), S), "B", ring=True, ringc="K", shade=("D", None), minshade=3)
    c.put(sym(c.P([(16.5, 14), (17, 7.4), (21.5, 11)]), S), "B", ring=True, ringc="K", minshade=99)  # cat ears
    c.put(sym(c.P([(17.6, 12.4), (17.8, 9.4), (19.6, 11)]), S), "c", minshade=99)
    c.put(c.E(24, 19.4, 9.2, 8.0), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 23.4, 5.0, 3.2), "L")
    c.pxs([(23, 21), (24, 21)], "n")
    c.outline("K")
    return Body(c, Anchor(16, 17, 24))


# =================== adult, meat tier 3: Scrapjaw, a scruffy scavenger with an underbite ===================
def scrapjaw(f=0):
    c = Canvas(S, S)
    for x in (17, 31):
        c.put(c.E(x, 43.2, 5.0, 2.6), "D", ring=True, ringc="K")
    c.put(c.E(24, 34.4, 12.2, 10.0), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(sym(c.P([(12, 28), (9, 23), (15, 26)]), S), "D", ring=True, ringc="K", minshade=99)  # a ragged tuft on each shoulder
    c.put(sym(c.E(10.6, 36, 3.4, 7.2), S), "B", ring=True, ringc="K", shade=("D", "L"))
    c.pxs(sym({(x, y) for x in (8, 11) for y in (42, 43)}, S), "T")  # claws
    c.put(c.R(4, 41 - f, 12, 42 - f), "T", ring=True, ringc="K", minshade=99)  # a bone it found
    c.put(c.E(4, 41.5 - f, 1.8, 2.0), "T", ring=True, ringc="K", minshade=99)
    c.put(c.E(12.5, 41.5 - f, 1.8, 2.0), "T", ring=True, ringc="K", minshade=99)
    c.put(c.P([(15, 28), (33, 28), (32, 31), (16, 31)]), "z", ring=True, ringc="K", shade=("Z", None), minshade=3)  # a rag for a scarf
    c.put(c.P([(30, 30), (34 + f, 30), (35 + f, 38), (31, 36)]), "z", ring=True, ringc="K", minshade=99)
    c.put(c.P([(14.6, 16), (11, 4.5), (20.4, 12)]), "B", ring=True, ringc="K", minshade=99)
    c.put(c.P([(33.4, 16), (37 - f, 4.5 + f), (27.6, 12)]), "B", ring=True, ringc="K", minshade=99)
    c.put(c.P([(14.4, 14.4), (12.4, 8.2), (17.4, 12)]), "c", minshade=99)
    c.put(c.P([(33.6, 14.4), (35.6 - f, 8.2 + f), (30.6, 12)]), "c", minshade=99)
    c.pxs([(11, 8), (11, 9), (12, 9)], ".")  # a bite out of the left ear
    c.put(c.E(24, 20.4, 10.8, 8.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 25.6, 6.6, 4.4), "L")  # a long muzzle
    c.pxs([(22, 21), (23, 21), (24, 21), (25, 21)], "d")  # a dark nose
    for x, y in ((14, 21), (16, 18), (32, 19), (34, 22), (12, 36), (36, 38), (28, 33), (19, 34)):
        c.pxs([(x, y), (x + 1, y), (x, y + 1)], "d")  # patchy fur
    c.pxs([(19, 24), (19, 25), (19, 26), (28, 24), (28, 25), (28, 26)], "T")  # the underbite tusks point up
    c.pxs([(16, 22), (17, 23), (31, 16), (32, 17)], "c")  # old scars
    c.outline("K")
    return Body(c, Anchor(16, 17, 24))


# =================== adult, meat tier 4: Gutterfang, a skinny rat with one big fang ===================
def gutterfang(f=0):
    c = Canvas(S, S)
    tail = c.chain([(31, 43, 2.4, 1.5), (35, 43.8, 2.2, 1.3), (39, 42, 2.0, 1.3), (42, 39, 1.7, 1.5), (43.4, 35, 1.4, 1.6), (43.0 + f * 0.8, 31.4, 1.2, 1.5)])
    c.put(tail, "n", ring=True, ringc="K", minshade=99)
    for x in (20, 28):
        c.put(c.E(x, 44, 3.2, 1.8), "D", ring=True, ringc="K")
    c.put(c.E(24, 37.4, 6.6, 8.0), "B", ring=True, ringc="K", shade=("D", "L"))
    bands(c, (35, 37, 39, 41), "D")  # ribs
    c.put(sym(c.E(16.4, 38, 1.8, 5.2 + f), S), "B", ring=True, ringc="K", shade=("D", None), minshade=3)
    c.put(sym(c.E(15.4, 15.4 - f, 4.6, 4.8), S), "B", ring=True, ringc="K", shade=("D", None))  # big round rat ears
    c.put(sym(c.E(15.4, 15.8 - f, 2.8, 3.0), S), "p", minshade=99)
    c.put(c.E(24, 22.4, 9.0, 7.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 26.4, 5.2, 3.4), "L")  # a muzzle with no outline: an outlined one read as an open toothy mouth
    c.pxs([(23, 24), (24, 24)], "n")  # nose
    c.pxs([(20, 28), (20, 29), (20, 30)], "T")  # the one big fang
    c.outline("K")
    return Body(c, Anchor(17, 20, 26))


ROSTER = [
    Creature("cindermane", "Cindermane", "adult", CINDERMANE, cindermane, role="caster"),
    Creature("scrapjaw", "Scrapjaw", "adult", SCRAPJAW, scrapjaw, role="fighter"),
    Creature("gutterfang", "Gutterfang", "adult", GUTTERFANG, gutterfang, role="quick"),
]
