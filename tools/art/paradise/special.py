"""The special (plan section 4, "The special"): Dustpuff, a dust bunny of lint. A baby or kid that nobody looked after for four awake hours
turns into it, and it grows no further. It belongs to no field.

24 px, the size of a kid, with the kid face style (4 x 4 glossy eyes, blush). Body only: lib.stamp_face() adds the faces.
"""
from lib import Anchor, Body, Canvas, Creature, with_face

DUSTPUFF = with_face(
    {"B": "#b7afc8", "D": "#8d84a6", "L": "#d8d3e5", "O": "#483f5c", "H": "#f1edf7", "p": "#9d94b4"},
    iris="#3a2d5a", arch="#3a2d5a", mouth="#6b4467", blush="#e59ab0", tooth="#fff4e8",
)

# Specks of grit in the fur, kept clear of the eyes (rows 9 to 12), the blush (row 13) and the mouth (rows 15 to 18, the widest look is the yawn).
SPECKS = [(4, 17), (19, 17), (10, 19), (14, 20), (7, 19), (17, 19)]


def dustpuff(f=0):
    c = Canvas(24, 24)
    sq = f  # the second drawing is squashed a little: wider and shorter, like a puff of dust settling
    # Two strands of lint, each ending in a fluff, drawn first so the head covers where they start. On the second drawing they flick the other way.
    for strand, ball in (
        (c.L(9, 8, 8 - sq, 4), c.E(7.6 - 1.2 * sq, 3.2, 1.9, 1.7)),
        (c.L(15, 8, 16 + sq, 5), c.E(17.2 + 1.2 * sq, 4.4, 1.5, 1.4)),
    ):
        c.put(strand | ball, "H", ring=True, ringc="O")
    # The clump: a round body with a lump at each side and two on the floor for feet.
    lumps = [
        (12, 14.2 + 0.4 * sq, 9.4 + 0.4 * sq, 7.6 - 0.8 * sq),
        (5.5, 13.4 + 0.4 * sq, 3.6, 3.3 - 0.4 * sq),
        (18.5, 13.4 + 0.4 * sq, 3.6, 3.3 - 0.4 * sq),
        (8, 20.4, 3.6, 2.4),
        (16, 20.4, 3.6, 2.4),
    ]
    c.put(c.chain(lumps), "B", ring=True, ringc="O", shade=("D", "L"))
    # Scruffy tufts of fur on the edge (they poke out one pixel, and shift on the second drawing).
    c.pxs([(1, 15 + sq), (2, 9), (22, 15 + sq), (21, 9), (11, 6 + sq), (13, 6 + sq), (3, 19), (20, 19)], "B")
    c.pxs(SPECKS, "p")
    c.outline("O")
    return Body(c, Anchor(5, 9, 15))


ROSTER = [Creature("dustpuff", "Dustpuff", "kid", DUSTPUFF, dustpuff, role="quick", outline="O")]
