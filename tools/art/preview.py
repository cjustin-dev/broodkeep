"""Draw a contact sheet (PNG) of the creatures in one stage file, both drawings side by side. Needs Pillow.

Usage: python3 preview.py stage1 out.png [scale=10] [columns=3]
"""
import importlib
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))


def render(rows, pal, k):
    w = max(len(r) for r in rows)
    im = Image.new("RGB", (w * k, len(rows) * k), (40, 30, 60))
    px = im.load()
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == ".":
                continue
            col = (pal.get(c) or "#ff00ff").lstrip("#")  # a letter missing from the palette shows as magenta
            rgb = tuple(int(col[i:i + 2], 16) for i in (0, 2, 4))
            for dy in range(k):
                for dx in range(k):
                    px[x * k + dx, y * k + dy] = rgb
    return im


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    mod = importlib.import_module(argv[0])
    out = argv[1]
    k = int(argv[2]) if len(argv) > 2 else 10
    cols = int(argv[3]) if len(argv) > 3 else 3
    items = []
    for name, fn, pal in mod.DESIGNS:
        frames = []
        for f in (0, 1):
            c = fn(f)
            problems = c.check()
            if problems:
                print(f"{name} frame {f}: {problems}")
            frames.append(c.rows())
        items.append((name, frames, pal))
    w = max(len(frames[0][0]) for _, frames, _ in items)  # the biggest picture sets the cell size
    h = max(len(frames[0]) for _, frames, _ in items)
    cw, ch = (2 * w) * k + 6, h * k + 24
    rows_n = (len(items) + cols - 1) // cols
    img = Image.new("RGB", (cols * (cw + 10) + 10, rows_n * (ch + 10) + 10), (30, 20, 50))
    d = ImageDraw.Draw(img)
    for i, (name, frames, pal) in enumerate(items):
        ox, oy = 10 + (i % cols) * (cw + 10), 10 + (i // cols) * (ch + 10)
        d.text((ox, oy), name, fill=(255, 255, 255))
        x = ox
        for fr in frames:
            im = render(fr, pal, k)
            img.paste(im, (x, oy + 14))
            x += im.width + 6
    img.save(out)
    print(f"wrote {out}")


if __name__ == "__main__":
    main(sys.argv[1:])
