"""Every creature of the Water field in one list (plan section 4): the kid, and each young with its four adults.

Order: Drizzle, then Lanternfin, Kelpet, Scuttlet and Bellet, each followed by its adults from tier 1 to 4.
`python3 sheet.py water_all out.png` checks all of them and draws one sheet.
"""
import water
import water_bellet
import water_kelpet
import water_lanternfin
import water_scuttlet

_every = [cr for mod in (water, water_lanternfin, water_kelpet, water_scuttlet, water_bellet) for cr in mod.ROSTER]
_by_id = {cr.id: cr for cr in _every}

ORDER = [
    "drizzle",
    "lanternfin", "murkfang", "puffglow", "rustgill", "wilteel",
    "kelpet", "coralback", "bubblebelly", "brinetusk", "limpseal",
    "scuttlet", "rampclaw", "shellsnug", "chipclaw", "softshell",
    "bellet", "stormbell", "inkpot", "spinewad", "droopstar",
]
# Fail loudly instead of dropping or shadowing a creature: an id used in two modules, or a drawn creature missing from ORDER.
_twice = sorted({cr.id for cr in _every if [c.id for c in _every].count(cr.id) > 1})
assert not _twice, f"ids drawn in more than one module: {_twice}"
assert set(_by_id) == set(ORDER), f"drawn but not in ORDER: {sorted(set(_by_id) - set(ORDER))}; in ORDER but not drawn: {sorted(set(ORDER) - set(_by_id))}"
ROSTER = [_by_id[i] for i in ORDER]
