"""The baby (plan section 4): Blip, a round jelly blob. Every egg hatches into it, so it belongs to no field.

20 px, the kid face style (4 x 4 glossy eyes, blush). Bodies only: lib.stamp_face() adds the faces.
"""
from lib import Anchor, Body, Canvas, Creature, with_face

BLIP = with_face(
    {"B": "#f4b6c8", "D": "#d98aa5", "L": "#fcd9e4", "O": "#8a3a5c", "H": "#fff0f4"},
    iris="#2b2255", arch="#2b2255", mouth="#a83a58", blush="#e8607a", tooth="#fff4e8",
)


def blip(f=0):
    c = Canvas(20, 20)
    sq = f  # the second drawing is squashed: wider and shorter, like jelly landing
    c.put(c.E(10, 11.6 + 1.0 * sq, 8.6 + 0.4 * sq, 7.4 - 1.0 * sq), "B", ring=True, ringc="O", shade=("D", "L"))
    c.pxs([(4, 6 + 2 * sq), (5, 5 + 2 * sq), (6, 5 + 2 * sq), (4, 7 + 2 * sq)], "H")  # a shine on the jelly: it moves with the top of the squashed body
    c.pxs([(9, 3), (10, 2), (11, 3)] if not f else [(9, 4), (10, 3), (11, 4)], "O")  # a tiny curl on top that bobs
    c.px(10, 3 + sq, "B")
    c.outline("O")
    return Body(c, Anchor(4, 7, 12))


ROSTER = [Creature("blip", "Blip", "baby", BLIP, blip, role="fighter", outline="O")]
