"""Every creature of the Sky field in one list (plan section 4): the kid, and each young with its four adults.

Order: Cinderling, then Scorchlet, Chirplet, Nectlet and Wisplet, each followed by its adults from tier 1 to 4.
`python3 sheet.py sky_all out.png` checks all of them and draws one sheet.
"""
import sky
import sky_chirplet
import sky_nectlet
import sky_scorchlet
import sky_wisplet

_every = [cr for mod in (sky, sky_scorchlet, sky_chirplet, sky_nectlet, sky_wisplet) for cr in mod.ROSTER]
_by_id = {cr.id: cr for cr in _every}

ORDER = [
    "cinderling",
    "scorchlet", "ashwing", "hearthwing", "sootsnarl", "dimwick",
    "chirplet", "gildcrest", "downwren", "peckjack", "slumpfinch",
    "nectlet", "paleveil", "honeyfuzz", "spitewing", "tatterwing",
    "wisplet", "galecrown", "softnimbus", "smogrump", "fogsag",
]
# Fail loudly instead of dropping or shadowing a creature: an id used in two modules, or a drawn creature missing from ORDER.
_twice = sorted({cr.id for cr in _every if [c.id for c in _every].count(cr.id) > 1})
assert not _twice, f"ids drawn in more than one module: {_twice}"
assert set(_by_id) == set(ORDER), f"drawn but not in ORDER: {sorted(set(_by_id) - set(ORDER))}; in ORDER but not drawn: {sorted(set(ORDER) - set(_by_id))}"
# A sad beak must start lower than a calm one. (It once did not: the frown's one-row shift was cancelled when the pattern was placed.)
for _cr in _every:
    _mouths = _cr.draw(0).mouths
    if "frown" in _mouths:
        assert _mouths["frown"]["dy"] > _mouths["neutral"]["dy"], f"{_cr.id}: the sad beak does not start lower than the calm one"
ROSTER = [_by_id[i] for i in ORDER]
