"""Pieces shared by the Sky drawings: a beak that can be stamped as a mouth, so it lowers when the creature is sad and opens when
it is happy (the same trick Ashwing uses in sky.py, but placed relative to the beak's top row).

The beak (and the claws drawn with the same letter) use the letter T, which lib.with_face() sets from the palette's tooth= colour, so a
beak is always the creature's tooth colour. A palette entry "T" would be overwritten without a message."""
from lib import SIZES, Canvas, pattern_from

S = SIZES["adult"]


def beak(top, half=4, droop=0, opened=False, size=S, anchor=None):
    """One beak as a mouth pattern. `top` is its top row, `half` half its width at the top, `droop` how much lower it hangs. `anchor` is the
    mouth row of the body (the Anchor), which the pattern is placed against: it is `top` unless the beak is drawn lower than usual."""
    s = Canvas(size, size)
    mid = size // 2
    s.put(s.P([(mid - half, top), (mid + half, top), (mid + half - 1, top + 3 + droop), (mid, top + 7 + droop), (mid - half + 1, top + 3 + droop)]), "T", ring=True, ringc="K", shade=("t", None), minshade=99)
    if opened:
        y = top + 3
        s.pxs([(mid - 2 + i, y) for i in range(half)], "M")
        s.pxs([(mid - 2, y + 1), (mid - 1, y + 2), (mid, y + 2), (mid + 1, y + 1)], "T")
    return pattern_from(s, top if anchor is None else anchor)


def beak_mouths(top, half=4, size=S):
    """The five mouth looks a beak needs, by name. The body's anchor puts the mouth row at `top`, so the beak stays where drawn."""
    return {
        "neutral": beak(top, half, size=size),
        "flat": beak(top, half, size=size),
        "smile": beak(top, half, opened=True, size=size),
        "frown": beak(top + 1, half, droop=1, size=size, anchor=top),
        "yawn": beak(top, half, opened=True, size=size),
    }
