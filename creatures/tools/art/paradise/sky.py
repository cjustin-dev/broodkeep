"""The Sky line (plan section 4). Bodies only: lib.stamp_face() adds the faces.

Kid Cinderling (24 px), young Scorchlet (36 px) and adult Ashwing (48 px) are the drawings from the blend sheet. The wing is
the letter V because W is the eye gloss.
"""
from lib import Anchor, Body, Canvas, Creature, mid_palette, pattern_from, with_face


def mirror(pts, w):
    return [(w - x, y) for x, y in pts]


S = 48
ASHWING = with_face(
    {"B": "#4b4160", "D": "#2f2745", "L": "#6f6390", "V": "#8a3350", "w": "#5e2038", "n": "#d8cfb0", "E": "#ff7a2f", "e": "#ffd070", "t": "#a89c78", "H": "#6a5e86"},
    iris="#ff6a3a", arch="#ff9a5a", mouth="#3a1018", tooth="#e6dcb8", outline="#140f1c",
)

# =================== kid: Cinderling, a pale lavender bird with tiny wings and an ember belly ===================
CINDERLING = with_face(
    {"B": "#a99bd0", "D": "#7a68a8", "L": "#d4c8ec", "O": "#3a2c58", "F": "#ff9a4a", "G": "#ffd070", "w": "#a8506a"},
    iris="#2b2255", arch="#2b2255", mouth="#6a2a3a", blush="#ff9a5a", tooth="#e6dcb8",
)


def cinderling(f=0):
    c = Canvas(24, 24)
    wing = [(6, 12), (3, 6 + f), (2, 11), (2, 16), (5, 17)]  # little bat wings that stick out past a smaller body; they flap
    for pts in (wing, mirror(wing, 24)):
        c.put(c.P(pts), "w", ring=True, ringc="O")
    c.px(3, 7 + f, "T")
    c.px(20, 7 + f, "T")
    c.put(c.P([(9, 7), (10, 2), (12, 5), (13, 1), (14, 5), (15, 2), (16, 7)]), "F", ring=True, ringc="O", minshade=99)
    for x in (8, 16):
        c.put(c.E(x, 21.3, 3, 1.5), "F", ring=True, ringc="O")
    c.put(c.E(12, 14.2, 8.6, 8), "B", ring=True, ringc="O", shade=("D", "L"))
    c.put(c.E(12, 19.6, 4.2, 2.6), "F")  # ember belly
    c.put(c.E(12, 19.8, 2.2, 1.4), "G")
    c.outline("O")
    c.pxs([(11, 14), (12, 14), (11, 15), (12, 15)], "T")  # tiny beak
    return Body(c, Anchor(6, 9, None))


# =================== young, chicken: Scorchlet, a mid-purple drake with bat wings and a beak ===================
SCORCHLET = mid_palette(CINDERLING, ASHWING)


def scorchlet(f=0):
    c = Canvas(36, 36)
    wing = [(14, 24), (7, 16), (3, 9 + 3 * f), (3, 18 + f), (2, 25), (7, 26), (12, 28)]  # the wings beat down on the second drawing
    for pts in (wing, mirror(wing, 36)):
        c.put(c.P(pts), "V", ring=True, ringc="K", shade=("w", None), minshade=99)
    for flip in (False, True):
        for a, b in [((14, 24), (7, 16)), ((7, 16), (3, 9 + 3 * f)), ((7, 16), (2, 25))]:
            pa = (36 - a[0], a[1]) if flip else a
            pb = (36 - b[0], b[1]) if flip else b
            c.pxs(sorted(c.L(pa[0], pa[1], pb[0], pb[1])), "n")
    for pts in ([(11, 9), (7, 4), (13, 11)], [(16, 8), (18, 1), (20, 8)], mirror([(11, 9), (7, 4), (13, 11)], 36)):
        c.put(c.P(pts), "H", ring=True, ringc="K", minshade=99)
    for x in (14, 22):
        c.put(c.E(x, 31.6, 3, 2.2), "B", ring=True, ringc="K")
    c.put(c.E(18, 25.5, 8, 8.2), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(18, 26.5, 3.8, 5.6), "E")
    c.put(c.E(18, 27, 1.8, 3.4), "e")
    c.put(c.E(18, 14.5, 10, 8.6), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(18, 13.2, 8.2, 3.4), "H")
    c.put(c.P([(15, 17), (21, 17), (20, 20), (18, 22), (16, 20)]), "T", ring=True, ringc="K", shade=("t", None), minshade=99)  # beak
    c.outline("K")
    return Body(c, Anchor(10, 11, None))


# =================== adult, chicken tier 1: Ashwing, a drake with ember wings and a hooked beak ===================
def beak(top, mid=0, opened=False):
    """The beak as a mouth pattern, so it can lower when sad and open when happy."""
    s = Canvas(S, S)
    s.put(s.P([(20, top), (28, top), (27, top + 3 + mid), (24, top + 7 + mid), (21, top + 3 + mid)]), "T", ring=True, ringc="K", shade=("t", None), minshade=99)
    if opened:
        s.pxs([(22, 22), (23, 22), (24, 22), (25, 22), (26, 22)], "M")
        s.pxs([(22, 23), (23, 24), (24, 24), (25, 23)], "T")
    return pattern_from(s, 19)


ASHWING_MOUTHS = {"neutral": beak(19), "flat": beak(19), "smile": beak(19, opened=True), "frown": beak(20, 1), "yawn": beak(19, opened=True)}


def ashwing(f=0):
    c = Canvas(S, S)
    drop = 7 * f  # the wings beat down on the second drawing
    wrist = (9, 10 + drop // 2)
    tips = [(3, 1 + drop), (2, 19 + drop // 2), (9, 27 + drop // 3)]
    wing = [(18, 23), wrist, tips[0], (5, 11 + drop // 2), tips[1], (7, 18 + drop // 2), tips[2], (13, 24 + drop // 3)]
    for pts in (wing, mirror(wing, S)):
        c.put(c.P(pts), "V", ring=True, ringc="K", shade=("w", None), minshade=99)
    for flip in (False, True):
        for a, b in [((18, 23), wrist)] + [(wrist, t) for t in tips]:
            pa = (S - a[0], a[1]) if flip else a
            pb = (S - b[0], b[1]) if flip else b
            c.pxs(sorted(c.L(pa[0], pa[1], pb[0], pb[1])), "n")
    spikes = [[(17, 13), (8, 7), (12, 15)], [(18, 9), (11, 1), (15, 11)]]
    for sp in spikes:
        for pts in (sp, mirror(sp, S)):
            c.put(c.P(pts), "H", ring=True, ringc="K", shade=("D", None), minshade=99)
    for x in (19, 29):
        c.put(c.E(x, 42, 3.2, 3.4), "B", ring=True, ringc="K", shade=("D", None))
        for dx in (-2, 0, 2):
            c.px(x + dx - 1, 45, "T")
    c.put(c.E(24, 31, 9.8, 11.4), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 32.5, 4.8, 7.4), "E")
    c.put(c.E(24, 33, 2.2, 4.6), "e")
    for yy in (29, 32, 35):
        c.pxs([(20, yy), (21, yy + 1), (26, yy + 1), (27, yy)], "D")
    for x in (14.5, 33.5):  # shoulder spikes
        c.put(c.P([(x - 3, 27), (x, 20), (x + 3, 27)]), "H", ring=True, ringc="K", minshade=99)
    c.put(c.E(24, 17, 9, 7.8), "B", ring=True, ringc="K", shade=("D", "L"))
    c.put(c.E(24, 15.8, 7.6, 3.6), "H")
    c.outline("K")
    return Body(c, Anchor(15, 14, 19), ASHWING_MOUTHS)


ROSTER = [
    Creature("cinderling", "Cinderling", "kid", CINDERLING, cinderling, role="quick", outline="O"),
    Creature("scorchlet", "Scorchlet", "young", SCORCHLET, scorchlet, role="quick"),
    Creature("ashwing", "Ashwing", "adult", ASHWING, ashwing, role="caster"),
]
