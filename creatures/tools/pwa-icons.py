"""Draws the app icons from Blip, the baby every egg hatches into (needs Pillow).

Usage: python3 tools/pwa-icons.py                 writes the PNG files into public/
       python3 tools/pwa-icons.py --check         exit code 1 if a file in public/ is missing or its pixels differ from what this draws
       python3 tools/pwa-icons.py --sheet out.png a contact sheet of every icon on a light and a dark ground, for looking at

Blip's drawing and face come from tools/art/paradise (the same code that makes the game's pictures), scaled by a whole number so the
pixels stay square. The ground colour is the game's --bg in src/ui/app.css, and tests/pwa.test.ts checks that the manifest agrees.
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # --check and --sheet write nothing but their own output (not even __pycache__ under tools/art)
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE / "art" / "paradise"))
import baby  # noqa: E402
import lib  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

BG = "#231a38"  # --bg
SHADOW = "#181027"
LOOK = ("happy", 0)  # a smile and a blush read best when small

# file name, edge in pixels, scale of Blip's 20 pixel drawing, background ("solid": fills the square, None: see through)
# The maskable icon is cropped to a circle by some phones (anything outside the middle 80% may go), so Blip is drawn smaller there.
ICONS = [
    ("icon-192.png", 192, 6, "solid"),
    ("icon-512.png", 512, 16, "solid"),
    ("icon-maskable-512.png", 512, 13, "solid"),
    ("apple-touch-icon.png", 180, 6, "solid"),  # iPhones round the corners themselves, so no see through corners
    ("favicon.png", 48, 2, None),
]


def draw(size, k, ground):
    cr = baby.ROSTER[0]
    art = lib.render(cr.look(*LOOK).rows(), cr.palette, k)
    box = art.getbbox()  # the blob's own edges, so it sits in the middle whatever the transparent border of the drawing is
    art = art.crop(box)
    img = Image.new("RGBA", (size, size), BG if ground == "solid" else (0, 0, 0, 0))
    x = (size - art.width) // 2
    y = (size - art.height) // 2 - k  # a little above the middle, to leave room for the shadow
    if ground == "solid":
        d = ImageDraw.Draw(img)
        sw, sh = art.width * 7 // 10, k * 2  # a flat shadow under it, in whole pixels of the drawing
        sx = (size - sw) // 2
        sy = y + art.height - k
        d.rectangle([sx, sy, sx + sw - 1, sy + sh - 1], fill=SHADOW)
    img.alpha_composite(art, (x, y))
    return img


def sheet(path):
    tile = 512
    out = Image.new("RGB", (len(ICONS) * (tile + 16) + 16, 2 * (tile + 16) + 16), "#888888")
    for row, ground in enumerate(["#f2efe6", "#101010"]):
        for col, (name, size, k, bg) in enumerate(ICONS):
            cell = Image.new("RGBA", (tile, tile), ground)
            icon = draw(size, k, bg)
            cell.alpha_composite(icon.resize((tile, tile), Image.NEAREST) if size != tile else icon, (0, 0))
            out.paste(cell.convert("RGB"), (16 + col * (tile + 16), 16 + row * (tile + 16)))
    out.save(path)


def main(argv):
    if argv[:1] == ["--sheet"] and len(argv) == 2:
        sheet(argv[1])
        print("wrote", argv[1])
        return 0
    check = argv == ["--check"]
    if argv and not check:
        sys.exit(__doc__)
    wrong = []
    for name, size, k, bg in ICONS:
        img = draw(size, k, bg)
        path = ROOT / "public" / name
        if check:
            try:
                same = path.exists() and Image.open(path).convert("RGBA").tobytes() == img.tobytes()
            except Exception:  # a file that is cut short or is not a picture
                same = False
            if not same:
                wrong.append(name)
        else:
            img.save(path, optimize=True)
            print("wrote", path.relative_to(ROOT))
    if check:
        print(f"icons: {'all match' if not wrong else 'differ or missing: ' + ', '.join(wrong)}")
    return 1 if wrong else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
