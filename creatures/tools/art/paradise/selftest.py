"""Does lib.problems() catch what it is meant to catch? Breaks a good creature on purpose, one defect at a time.

Usage: python3 selftest.py            (exit code 1 if any case fails; the field emitter cases need Pillow and are skipped without it)

Edge cases, one test each:
  good creatures     every real creature (all three fields: Land, Water and Sky) passes (no false alarms)
  cut off            a body colour on the top, bottom, left and right edge; the outline letter on the edge is fine;
                     a body colour one pixel in from the edge is fine
  missing letter     a letter the palette does not have
  floating pixel     a pixel with no neighbour; a pixel that only touches diagonally still floats; a detached island of
                     two pixels floats too
  face outside       the anchor puts the eyes where there is no body; an anchor off the picture is reported
  same drawing       the second drawing equals the first
  one face           the second drawing moves the anchor; it carries a different custom mouth
  wrong size         a kid-sized picture on a young; an adult-sized picture on a kid
  face letters       I, W, A, P, U and M in a body, one each
  odd mouth          a 3 wide mouth on an even canvas, and a custom mouth that is not in the middle, are reported, not a crash
  blank drawing      an empty canvas, and a zero-size canvas, are reported, not a crash
  pattern file       odd-width mouth, a mouth with no rows, ragged and wrong-size pieces, a look that names a missing part,
                     a foreign letter in an eye, a mouth or a brow, a missing look, a missing style
  field emitter      (emit_ts.field_source) a 128 x 128 picture comes out as 128 rows of 128 letters, the same every time; a
                     picture one pixel narrow or short, a see-through (RGBA) picture, and one with 63 colors stop with exit 3;
                     one with exactly 62 colors is fine
"""
import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lib  # noqa: E402
import land  # noqa: E402
import land_all  # noqa: E402
import sky_all  # noqa: E402
import water_all  # noqa: E402
from lib import Anchor, Body, Canvas, Creature  # noqa: E402

BASE = land.ROSTER[0]  # Pebblin: kid, 24 x 24, outline "O"
FAILS = []


def wrap(cr, change, stage=None, palette=None):
    """cr with change(body, frame) applied to every body it draws."""
    def draw(f):
        b = cr.draw(f)
        change(b, f)
        return b
    return Creature(cr.id, cr.name, stage or cr.stage, palette or cr.palette, draw, cr.role, cr.outline)


def expect(name, found, *needles):
    """found is a list of problem lines; each needle must appear in one of them."""
    text = "\n".join(found)
    missing = [n for n in needles if n not in text]
    if missing:
        FAILS.append(f"{name}: expected {missing}, got {found[:3] or 'no problems'}")
    else:
        print("ok  ", name)


def expect_clean(name, found):
    if found:
        FAILS.append(f"{name}: expected no problems, got {found[:3]}")
    else:
        print("ok  ", name)


def run(name, cr, *needles):
    expect(name, lib.problems(cr), *needles)


# ---------- good creatures ----------
for mod in (land_all, water_all, sky_all):
    for cr in mod.ROSTER:
        expect_clean(f"good: {cr.id}", lib.problems(cr))
expect_clean("good: face-patterns.json", lib.validate_patterns())

# ---------- cut off ----------
EDGE_LINES = {  # three pixels in a row along each edge, so they are not also lone pixels
    "top": [(11, 0), (12, 0), (13, 0)],
    "bottom": [(11, 23), (12, 23), (13, 23)],
    "left": [(0, 11), (0, 12), (0, 13)],
    "right": [(23, 11), (23, 12), (23, 13)],
}
for edge, pts in EDGE_LINES.items():
    run(f"cut off at the {edge}", wrap(BASE, lambda b, f, pts=pts: b.canvas.pxs(pts, "B")), f"cut off at the {edge}")


on_edge = wrap(BASE, lambda b, f: b.canvas.pxs([(11, 0), (12, 0), (13, 0), (11, 1), (12, 1), (13, 1)], "O"))
expect_clean("an outline letter on the edge is fine", [p for p in lib.problems(on_edge) if "cut off" in p])
one_in = wrap(BASE, lambda b, f: b.canvas.pxs([(1, 13), (2, 13), (3, 13)], "B"))
expect_clean("a body colour one pixel in from the edge is fine", lib.problems(one_in))

# ---------- missing letter ----------
run("missing palette letter", wrap(BASE, lambda b, f: b.canvas.px(12, 13, "Z")), "not in the palette ['Z']")

# ---------- floating pixels ----------
run("lone pixel", wrap(BASE, lambda b, f: b.canvas.px(1, 1, "O")), "floating pixels [(1, 1)]")
run("two lone pixels on a diagonal", wrap(BASE, lambda b, f: b.canvas.pxs([(1, 1), (2, 2)], "O")), "floating pixels [(1, 1), (2, 2)]")


def diagonal_only_cell():
    """An empty cell that touches the body at a corner only, in both drawings."""
    rows = [BASE.body(f).canvas.rows() for f in (0, 1)]
    flat, diag = ((1, 0), (-1, 0), (0, 1), (0, -1)), ((1, 1), (-1, -1), (1, -1), (-1, 1))
    for y in range(22, 0, -1):
        for x in range(1, 23):
            if all(r[y][x] == "." and all(r[y + dy][x + dx] == "." for dx, dy in flat) and any(r[y + dy][x + dx] != "." for dx, dy in diag) for r in rows):
                return x, y
    sys.exit("selftest: no diagonal-only cell found")


DX, DY = diagonal_only_cell()
run("a pixel that touches the body only at a corner", wrap(BASE, lambda b, f: b.canvas.px(DX, DY, "O")), f"floating pixels [({DX}, {DY})]")
run("detached island of two", wrap(BASE, lambda b, f: b.canvas.pxs([(21, 1), (22, 1)], "O")), "floating pixels [(21, 1), (22, 1)]")

# ---------- face outside the body ----------
run("face outside the body", wrap(BASE, lambda b, f: setattr(b, "anchor", Anchor(3, 2, None))), "face pixels outside the body")
run("anchor off the picture", wrap(BASE, lambda b, f: setattr(b, "anchor", Anchor(30, 9, None))), "lands off the picture")

# ---------- same drawing ----------
same = Creature("same", "Same", "kid", BASE.palette, lambda f: BASE.draw(0), outline="O")
run("second drawing is the same", same, "the second drawing is the same as the first")

# ---------- the two drawings must share one face ----------
HOLLOW = next(cr for cr in land_all.ROSTER if cr.id == "hollowbloom")  # the one Land creature with custom mouths


def move_anchor(b, f):
    if f == 1:
        b.anchor = Anchor(b.anchor.x, b.anchor.y + 1, b.anchor.mouth)


def change_mouth(b, f):
    if f == 1:
        b.mouths = {**b.mouths, "flat": {"dy": 0, "rows": ["MMMMMMMM"]}}


run("second drawing moves the anchor", wrap(BASE, move_anchor), "the two drawings have different faces")
run("second drawing has another custom mouth", wrap(HOLLOW, change_mouth), "the two drawings have different faces")

# ---------- wrong size ----------
run("kid picture on a young", wrap(BASE, lambda b, f: None, stage="young"), "a young is 36 x 36")
run("adult picture on a kid", wrap(land.ROSTER[2], lambda b, f: None, stage="kid"), "a kid is 24 x 24")

# ---------- face letters in a body ----------
for ch in "IWAPUM":
    run(f"body uses {ch}", wrap(BASE, lambda b, f, ch=ch: b.canvas.px(12, 13, ch)), f"the body uses face letters ['{ch}']")

# ---------- odd mouth ----------
odd = wrap(BASE, lambda b, f: setattr(b, "mouths", {"neutral": {"dy": 0, "rows": ["MMM"]}}))
run("odd-width mouth", odd, "is not centered")
off_centre = wrap(BASE, lambda b, f: setattr(b, "mouths", {"neutral": {"x": 9, "dy": 0, "rows": ["MM"]}}))
run("custom mouth off centre", off_centre, "is not centered")
centred = wrap(BASE, lambda b, f: setattr(b, "mouths", {"neutral": {"x": 11, "dy": 0, "rows": ["MM"]}}))
expect_clean("a custom mouth in the middle is fine", lib.problems(centred))

# ---------- blank drawing ----------
blank = Creature("blank", "Blank", "kid", BASE.palette, lambda f: Body(Canvas(24, 24), Anchor(5, 9, 15)), outline="O")
run("blank drawing", blank, "the second drawing is the same as the first", "face pixels outside the body")


for w, h in ((0, 0), (24, 0), (0, 24)):
    zero = Creature("zero", "Zero", "kid", BASE.palette, lambda f, w=w, h=h: Body(Canvas(w, h), Anchor(5, 9, 15)), outline="O")
    run(f"zero-size canvas {w} x {h}", zero, "a kid is 24 x 24")


# ---------- the pattern file ----------
def pattern_case(name, change, *needles):
    saved = lib.PATTERNS
    lib.PATTERNS = copy.deepcopy(saved)
    try:
        change(lib.PATTERNS)
        expect(name, lib.validate_patterns(), *needles)
    finally:
        lib.PATTERNS = saved


pattern_case("pattern: odd-width mouth", lambda p: p["young"]["mouths"]["smile"].update(rows=["MMM"]), "young mouth smile: rows must be one even width")
pattern_case("pattern: ragged mouth rows", lambda p: p["adult"]["mouths"]["flat"].update(rows=["MMMM", "MM"]), "adult mouth flat")
pattern_case("pattern: wrong-size eyes", lambda p: p["kid"]["eyes"].update(open=["II"]), "kid eyes open: not 4 x 4")
pattern_case("pattern: look names a missing eye", lambda p: p["young"]["looks"]["sad"].update(eyes="nope"), "young look sad: no eyes nope")
pattern_case("pattern: look names a missing brow", lambda p: p["adult"]["looks"]["sad"].update(brows="nope"), "adult look sad: no brows nope")
pattern_case("pattern: look names a missing mouth", lambda p: p["kid"]["looks"]["happy"].update(mouth="nope"), "kid look happy: no mouth nope")
pattern_case("pattern: foreign letter in an eye", lambda p: p["young"]["eyes"].update(open=[".ZZZ.", "ZWKZZ", "ZZKZZ", ".ZZZ."]), "young eyes open: a letter that is not a face letter")
pattern_case("pattern: a look the library does not know", lambda p: p["kid"]["looks"].update(extra=copy.deepcopy(p["kid"]["looks"]["open"])), "kid: looks differ from LOOKS")
pattern_case("pattern: a look missing from young", lambda p: p["young"]["looks"].pop("yawn"), "young: looks differ from LOOKS")
pattern_case("pattern: a missing style", lambda p: p.pop("adult"), "no style adult")
pattern_case("pattern: a mouth with no rows", lambda p: p["kid"]["mouths"]["flat"].update(rows=[]), "kid mouth flat: rows must be one even width")
pattern_case("pattern: ragged tear", lambda p: p["young"]["tear"].update(rows=["U", "UU"]), "young tear: rows of different widths")
pattern_case("pattern: ragged blush", lambda p: p["kid"]["blush"].update(rows=["PP", "P"]), "kid blush: rows of different widths")
pattern_case("pattern: ragged brows", lambda p: p["adult"]["brows"]["angry"].update(rows=["KK", "K"]), "adult brows angry: rows of different widths")
pattern_case("pattern: foreign letter in a mouth", lambda p: p["adult"]["mouths"]["flat"].update(rows=["ZZZZ"]), "adult mouth flat: a letter that is not a face letter")
pattern_case("pattern: foreign letter in a brow", lambda p: p["adult"]["brows"]["angry"].update(rows=["DD"]), "adult brows angry: a letter that is not a face letter")
pattern_case("pattern: foreign letter in a tear", lambda p: p["kid"]["tear"].update(rows=["D", "D"]), "kid tear: a letter that is not a face letter")
pattern_case("pattern: a look with no mouth key", lambda p: p["kid"]["looks"]["happy"].pop("mouth"), "kid look happy: no mouth None")

# ---------- field emitter ----------
try:
    from PIL import Image  # noqa: E402
except ImportError:
    Image = None
    print("skip field emitter cases (no Pillow)")
if Image:
    import emit_ts  # noqa: E402

    def exits_3(name, fn):
        try:
            fn()
        except SystemExit as e:
            if e.code == 3:
                print("ok  ", name)
            else:
                FAILS.append(f"{name}: exited with {e.code!r}, wanted 3")
        else:
            FAILS.append(f"{name}: expected exit 3, nothing stopped it")

    def striped(colors, size=(128, 128), mode="RGB"):
        """A picture whose pixels use exactly `colors` different colors, in rows."""
        im = Image.new(mode, size)
        for i in range(size[0] * size[1]):
            n = i % colors
            im.putpixel((i % size[0], i // size[0]), (n, n // 2, 7) + ((255,) if mode == "RGBA" else ()))
        return im

    two = striped(2)
    text = emit_ts.field_source("land", two)
    rows = [line.strip().strip('",') for line in text.splitlines() if line.startswith('    "')]
    if len(rows) == 128 and all(len(r) == 128 for r in rows) and text == emit_ts.field_source("land", striped(2)):
        print("ok   field: 128 rows of 128 letters, the same every time")
    else:
        FAILS.append("field: wrong shape, or a different file for the same picture")
    exits_3("field: one pixel narrow", lambda: emit_ts.field_source("land", striped(2, (127, 128))))
    exits_3("field: one pixel short", lambda: emit_ts.field_source("land", striped(2, (128, 127))))
    exits_3("field: see-through (RGBA)", lambda: emit_ts.field_source("land", striped(2, mode="RGBA")))
    exits_3("field: 63 colors", lambda: emit_ts.field_source("land", striped(63)))
    try:
        full = emit_ts.field_source("land", striped(62))
        letters = {ch for line in full.splitlines() if line.startswith('    "') for ch in line.strip().strip('",')}
        if len(letters) == 62:
            print("ok   field: 62 colors is fine, each with its own letter")
        else:
            FAILS.append(f"field: 62 colors gave {len(letters)} different letters")
    except SystemExit:
        FAILS.append("field: 62 colors should be fine")

print()
if FAILS:
    print("\n".join("FAIL " + f for f in FAILS))
    sys.exit(1)
print("self-test: all cases pass")
