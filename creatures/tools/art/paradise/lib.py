"""Shared pieces for drawing the Paradise creatures (plan: ../../../docs/paradise-plan.md).

A creature's draw function draws the BODY ONLY and returns a Body: the canvas, the face anchor and, when the creature has a
mouth that is part of its look (a big toothed jaw, a beak that opens), its own mouth patterns. stamp_face() then adds the
eyes, brows, tear, blush and mouth for one look from src/data/face-patterns.json, the same file the game reads, so a sheet
made here shows what the game shows.

Face letters (reserved, see the json): I iris, W gloss, K pupil and brows, A lid and happy arch, M mouth, T tooth,
P blush, U tear. A body drawing must not use I, W, A, P, U or M (the game finds the mouth row of a lying creature by its M). K and T are allowed in a body (outline, a jaw, claws).
"""
import json
import math
import sys
from collections import namedtuple
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from bk import Canvas  # noqa: E402,F401  (re-exported for the creature files)

PATTERN_FILE = HERE.parents[2] / "src" / "data" / "face-patterns.json"
PATTERNS = json.loads(PATTERN_FILE.read_text())["styles"]

FACE_LETTERS = "IWKAMTPU"
BODY_FORBIDDEN = "IWAPUM"
SIZES = {"baby": 20, "kid": 24, "young": 36, "adult": 48}
STYLE = {"baby": "kid", "kid": "kid", "young": "young", "adult": "adult"}
LOOKS = ["open", "half", "closed", "up", "happy", "yawn", "sad"]

# Where a face goes: the left eye's top left pixel, and the top row of the mouth (None: this creature has no mouth to stamp).
Anchor = namedtuple("Anchor", "x y mouth")


class Body:
    """What a draw function returns. mouths: optional {mouth name: {"dy", "rows", optional "x"}} replacing the style's own."""

    def __init__(self, canvas, anchor, mouths=None):
        self.canvas, self.anchor, self.mouths = canvas, anchor, mouths or {}


class Creature:
    """One creature. draw(frame) returns a Body; frame 0 is the standing drawing, 1 the second drawing."""

    def __init__(self, id, name, stage, palette, draw, role="fighter", outline="K"):
        self.id, self.name, self.stage, self.palette, self.draw, self.role, self.outline = id, name, stage, palette, draw, role, outline

    @property
    def style(self):
        return STYLE[self.stage]

    def body(self, frame=0):
        return self.draw(frame)

    def look(self, look="open", frame=0):
        """A fresh Canvas with the face for this look stamped on."""
        b = self.draw(frame)
        stamp_face(b.canvas, self.style, look, b.anchor, b.mouths)
        return b.canvas


def mirror(pts, w):
    """Polygon points reflected across the middle of a picture w wide."""
    return [(w - x, y) for x, y in pts]


def polar(cx, cy, a, r, da=0.0):
    """The point r away from (cx, cy) in direction a + da (radians; 0 is right, -pi/2 is up)."""
    return (cx + r * math.cos(a + da), cy + r * math.sin(a + da))


def bands(c, ys, letter, xs=(21, 22, 25, 26)):
    """Short horizontal marks, one pair per row and side of the middle: ribs, belly stripes, wrinkles."""
    for y in ys:
        c.pxs([(x, y) for x in xs], letter)


def sym(cells, w):
    """A set of cells together with its reflection across the middle of a picture w wide."""
    return cells | {(w - 1 - x, y) for x, y in cells}


# ---------- the face patterns ----------
def put_face(c, x, y, ch):
    """One pixel of a face piece. Canvas.px drops pixels off the picture silently; a face piece must not vanish that way."""
    if not (0 <= x < c.w and 0 <= y < c.h):
        raise ValueError(f"a face piece lands off the picture at ({x}, {y})")
    c.px(x, y, ch)


def paste(c, rows, x0, y0):
    for dy, row in enumerate(rows):
        for dx, ch in enumerate(row):
            if ch != ".":
                put_face(c, x0 + dx, y0 + dy, ch)


def paste_pair(c, part, ax, ay):
    """A mirrored piece (brows, tear, blush): placed at the left eye, reflected across the picture for the right."""
    for dy, row in enumerate(part["rows"]):
        for dx, ch in enumerate(row):
            if ch != ".":
                x, y = ax + part["dx"] + dx, ay + part["dy"] + dy
                put_face(c, x, y, ch)
                put_face(c, c.w - 1 - x, y, ch)


def mouth_origin(c, pattern):
    """The left column of a mouth pattern: its own "x", or centered. Either way the mouth must sit in the middle."""
    width = max(len(r) for r in pattern["rows"])
    left = pattern["x"] if "x" in pattern else (c.w - width) // 2
    if left * 2 + width != c.w:
        raise ValueError(f"a {width} wide mouth at x {left} is not centered on a {c.w} wide picture")
    return left


def stamp_face(c, style, look, anchor, custom_mouths=None):
    p = PATTERNS[style]
    spec = p["looks"][look]
    ew = p["eye"]["w"]
    for ex in (anchor.x, c.w - ew - anchor.x):  # the right eye is the left one moved over, not reflected
        paste(c, p["eyes"][spec["eyes"]], ex, anchor.y)
    if spec.get("brows"):
        paste_pair(c, p["brows"][spec["brows"]], anchor.x, anchor.y)
    if spec.get("tear"):
        paste_pair(c, p["tear"], anchor.x, anchor.y)
    if spec.get("blush") and p["blush"]:
        paste_pair(c, p["blush"], anchor.x, anchor.y)
    if anchor.mouth is not None:
        pattern = (custom_mouths or {}).get(spec["mouth"]) or p["mouths"][spec["mouth"]]
        paste(c, pattern["rows"], mouth_origin(c, pattern), anchor.mouth + pattern.get("dy", 0))


def pattern_from(canvas, mouth_row):
    """A custom mouth pattern from whatever was drawn on a scratch canvas: its bounding box, placed where it was drawn."""
    cells = [(x, y) for y, row in enumerate(canvas.rows()) for x, ch in enumerate(row) if ch != "."]
    x0, x1 = min(x for x, _ in cells), max(x for x, _ in cells)
    y0, y1 = min(y for _, y in cells), max(y for _, y in cells)
    rows = ["".join(canvas.g[y][x] for x in range(x0, x1 + 1)) for y in range(y0, y1 + 1)]
    return {"x": x0, "dy": y0 - mouth_row, "rows": rows}


def validate_patterns():
    """Problems in face-patterns.json itself (empty list: fine)."""
    out = []
    for style, p in PATTERNS.items():
        ew, eh = p["eye"]["w"], p["eye"]["h"]
        for name, rows in p["eyes"].items():
            if len(rows) != eh or any(len(r) != ew for r in rows):
                out.append(f"{style} eyes {name}: not {ew} x {eh}")
        parts = [(f"brows {n}", b) for n, b in p["brows"].items()] + [("tear", p["tear"])] + ([("blush", p["blush"])] if p["blush"] else [])
        for label, part in parts:
            if any(len(r) != len(part["rows"][0]) for r in part["rows"]):
                out.append(f"{style} {label}: rows of different widths")
        for name, m in p["mouths"].items():
            if not m["rows"] or any(len(r) % 2 for r in m["rows"]) or len({len(r) for r in m["rows"]}) > 1:
                out.append(f"{style} mouth {name}: rows must be one even width")
        for name, spec in p["looks"].items():
            if spec.get("eyes") not in p["eyes"]:
                out.append(f"{style} look {name}: no eyes {spec.get('eyes')}")
            if spec.get("brows") and spec["brows"] not in p["brows"]:
                out.append(f"{style} look {name}: no brows {spec['brows']}")
            if spec.get("mouth") not in p["mouths"]:
                out.append(f"{style} look {name}: no mouth {spec.get('mouth')}")
        pieces = [(f"eyes {n}", r) for n, r in p["eyes"].items()] + [(f"mouth {n}", m["rows"]) for n, m in p["mouths"].items()] + [(label, part["rows"]) for label, part in parts]
        for label, rows in pieces:
            if set("".join(rows)) - set(FACE_LETTERS + "."):
                out.append(f"{style} {label}: a letter that is not a face letter")
        if set(p["looks"]) != set(LOOKS):
            out.append(f"{style}: looks differ from LOOKS in lib.py")
    for style in sorted(set(STYLE.values()) - set(PATTERNS)):
        out.append(f"no style {style}")
    return out


# ---------- checks on a creature ----------
def detached(rows):
    """The cells (top to bottom, left to right) of every piece that is not joined, up down left or right, to the biggest piece."""
    h, w = len(rows), len(rows[0])
    seen, pieces = set(), []
    for y in range(h):
        for x in range(w):
            if rows[y][x] == "." or (x, y) in seen:
                continue
            piece, stack = [], [(x, y)]
            seen.add((x, y))
            while stack:
                cx, cy = stack.pop()
                piece.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and rows[ny][nx] != "." and (nx, ny) not in seen:
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            pieces.append(piece)
    pieces.sort(key=len, reverse=True)
    return sorted((cell for piece in pieces[1:] for cell in piece), key=lambda cell: (cell[1], cell[0]))


def problems(cr):
    """What is wrong with this creature's drawings (empty list: fine). Every look, both drawings."""
    out = []
    size = SIZES[cr.stage]
    bodies = [cr.body(f) for f in (0, 1)]
    if bodies[0].canvas.rows() == bodies[1].canvas.rows():
        out.append(f"{cr.id}: the second drawing is the same as the first")
    if bodies[0].anchor != bodies[1].anchor or bodies[0].mouths != bodies[1].mouths:
        out.append(f"{cr.id}: the two drawings have different faces (the game keeps one face per creature)")
    for f, b in enumerate(bodies):
        c = b.canvas
        if (c.w, c.h) != (size, size):
            out.append(f"{cr.id}/{f}: {c.w} x {c.h}, a {cr.stage} is {size} x {size}")
        used = {ch for r in c.rows() for ch in r}
        if used & set(BODY_FORBIDDEN):
            out.append(f"{cr.id}/{f}: the body uses face letters {sorted(used & set(BODY_FORBIDDEN))}")
    for f in (0, 1):
        body_rows = bodies[f].canvas.rows()
        for look in LOOKS:
            tag = f"{cr.id}/{look}/{f}"
            try:
                rows = cr.look(look, f).rows()
            except ValueError as e:  # a mouth that cannot be centered: report it, keep checking
                out.append(f"{tag}: {e}")
                continue
            h, w = len(rows), len(rows[0])
            missing = sorted({ch for r in rows for ch in r if ch != "." and ch not in cr.palette})
            if missing:
                out.append(f"{tag}: letters not in the palette {missing}")
            edge = [s for s, cells in (("left", [r[0] for r in rows]), ("right", [r[-1] for r in rows]), ("top", list(rows[0])), ("bottom", list(rows[-1])))
                    if any(ch not in "." + cr.outline for ch in cells)]
            if edge:
                out.append(f"{tag}: cut off at the {'+'.join(edge)} edge")
            lone = detached(rows)
            if lone:
                out.append(f"{tag}: floating pixels {lone[:8]}")
            outside = [(x, y) for y in range(h) for x in range(w) if rows[y][x] != "." and body_rows[y][x] == "."]
            if outside:
                out.append(f"{tag}: face pixels outside the body {outside[:6]}")
    return out


# ---------- palettes ----------
def lerp_hex(a, b, t=0.5):
    ca = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    cb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#%02x%02x%02x" % tuple(round(x + (y - x) * t) for x, y in zip(ca, cb))


def with_face(pal, **letters):
    """A copy of a palette with the face letters filled in where missing. Pass iris="#..." and so on to set one."""
    defaults = {"I": "#2b2255", "W": "#ffffff", "K": "#1a1020", "A": "#1a1020", "M": "#8a3a50", "T": "#f3f1e6", "P": "#ff9db8", "U": "#8fd8ff"}
    names = {"iris": "I", "gloss": "W", "outline": "K", "arch": "A", "mouth": "M", "tooth": "T", "blush": "P", "tear": "U"}
    out = {**defaults, **pal}
    for k, v in letters.items():
        out[names[k]] = v
    return out


def mid_palette(baby, adult, keys="BDL"):
    """A young creature's palette: the adult's, with the body tones halfway to the kid's."""
    out = dict(adult)
    for k in keys:
        if k in baby and k in adult:
            out[k] = lerp_hex(baby[k], adult[k])
    return out


# ---------- pictures ----------
def render(rows, pal, k, bg=None):
    from PIL import Image, ImageDraw
    im = Image.new("RGBA", (len(rows[0]) * k, len(rows) * k), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch != ".":
                d.rectangle([x * k, y * k, x * k + k - 1, y * k + k - 1], fill=pal.get(ch, "#ff00ff"))  # a missing letter shows as magenta
    return im


CELL_BG = (44, 36, 58, 255)
SHEET_BG = (28, 22, 40)


def strip(cr, looks, k=4, gap=6, cell=None):
    """One creature in a row of looks [(look, frame), ...], each in a cell the size of the biggest creature, standing on its floor."""
    from PIL import Image
    cell = (cell or SIZES["adult"]) * k
    img = Image.new("RGB", (len(looks) * cell + (len(looks) - 1) * gap, cell), SHEET_BG)
    for i, (look, frame) in enumerate(looks):
        art = render(cr.look(look, frame).rows(), cr.palette, k)
        bg = Image.new("RGB", (cell, cell), CELL_BG[:3])
        bg.paste(art, ((cell - art.width) // 2, cell - art.height), art)
        img.paste(bg, (i * (cell + gap), 0))
    return img


SHEET_LOOKS = [("open", 0), ("open", 1), ("happy", 0), ("sad", 0), ("closed", 0)]


def sheet(creatures, k=4, looks=None, cell=None, gap=6):
    """Rows of creatures stacked, one per creature."""
    from PIL import Image
    strips = [strip(cr, looks or SHEET_LOOKS, k, gap, cell) for cr in creatures]
    img = Image.new("RGB", (strips[0].width, sum(s.height for s in strips) + gap * (len(strips) - 1)), SHEET_BG)
    y = 0
    for s in strips:
        img.paste(s, (0, y))
        y += s.height + gap
    return img
