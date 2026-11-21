"""Every creature of the Land field in one list (plan section 4): the baby, the kid, and each young with its four adults.

Order: Blip, Pebblin, then Cragpup, Dugling, Frillet and Sporeling, each followed by its adults from tier 1 to 4.
`python3 sheet.py land_all out.png` checks all of them and draws one sheet.
"""
import baby
import land
import land_cragpup
import land_dugling
import land_frillet
import land_sporeling

_every = [cr for mod in (baby, land, land_cragpup, land_dugling, land_frillet, land_sporeling) for cr in mod.ROSTER]
_by_id = {cr.id: cr for cr in _every}

ORDER = [
    "blip", "pebblin",
    "cragpup", "gravelhorn", "cindermane", "scrapjaw", "gutterfang",
    "dugling", "moonlop", "barrowbun", "tuskmole", "mudlop",
    "frillet", "sunfrill", "plateback", "bogviper", "slugwyrm",
    "sporeling", "hollowbloom", "potterling", "needlecap", "mossheap",
]
ROSTER = [_by_id[i] for i in ORDER]

# Fail loudly instead of dropping or shadowing a creature: an id used in two modules, or a drawn creature missing from ORDER.
_twice = sorted({cr.id for cr in _every if [c.id for c in _every].count(cr.id) > 1})
assert not _twice, f"ids drawn in more than one module: {_twice}"
assert set(_by_id) == set(ORDER), f"drawn but not in ORDER: {sorted(set(_by_id) - set(ORDER))}; in ORDER but not drawn: {sorted(set(ORDER) - set(_by_id))}"
