"""Tiny pixel-art toolkit for drawing Broodkeep creatures (see ../../docs/art-direction.md).
Shapes are sets of cells. put() paints a shape with an optional 1px dark ring (so limbs and parts read
against the body) and optional edge shading (dark on the bottom/right edge, light on the top/left)."""

class Canvas:
    def __init__(s, w, h):
        s.w, s.h = w, h
        s.g = [["."] * w for _ in range(h)]

    # ---- shapes (return sets of cells) ----
    def E(s, cx, cy, rx, ry):
        out = set()
        for y in range(s.h):
            for x in range(s.w):
                dx = (x + 0.5 - cx) / rx
                dy = (y + 0.5 - cy) / ry
                if dx * dx + dy * dy <= 1.0:
                    out.add((x, y))
        return out

    def R(s, x0, y0, x1, y1):
        return {(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)}

    def P(s, pts):  # filled polygon, pixel centers, even-odd
        out = set()
        n = len(pts)
        for y in range(s.h):
            for x in range(s.w):
                px, py = x + 0.5, y + 0.5
                inside = False
                j = n - 1
                for i in range(n):
                    xi, yi = pts[i]; xj, yj = pts[j]
                    if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                        inside = not inside
                    j = i
                if inside:
                    out.add((x, y))
        return out

    def L(s, x0, y0, x1, y1):  # 1px line
        out = set()
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx + dy
        while True:
            out.add((x0, y0))
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy: err += dy; x0 += sx
            if e2 <= dx: err += dx; y0 += sy
        return out

    # ---- painting ----
    def put(s, cells, c, ring=False, shade=None, ringc="K", minshade=5):
        cells = {(x, y) for (x, y) in cells if 0 <= x < s.w and 0 <= y < s.h}
        if ring:
            for (x, y) in cells:
                for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
                    if (nx, ny) not in cells and 0 <= nx < s.w and 0 <= ny < s.h:
                        s.g[ny][nx] = ringc
        ys = [y for _, y in cells]; xs = [x for x, _ in cells]
        small = (not ys) or min(max(ys) - min(ys) + 1, max(xs) - min(xs) + 1) < minshade
        for (x, y) in cells:
            ch = c
            if shade and not small:
                dark, light = shade
                if (x, y + 1) not in cells or (x + 1, y) not in cells:
                    ch = dark
                elif light and ((x, y - 1) not in cells or (x - 1, y) not in cells):
                    ch = light
            s.g[y][x] = ch
        return cells

    def px(s, x, y, c):
        if 0 <= x < s.w and 0 <= y < s.h:
            s.g[y][x] = c

    def pxs(s, pts, c):
        for x, y in pts:
            s.px(x, y, c)

    def outline(s, c="K"):
        add = []
        for y in range(s.h):
            for x in range(s.w):
                if s.g[y][x] == ".":
                    for nx, ny in ((x+1, y), (x-1, y), (x, y+1), (x, y-1)):
                        if 0 <= nx < s.w and 0 <= ny < s.h and s.g[ny][nx] not in (".",):
                            add.append((x, y)); break
        for x, y in add:
            s.g[y][x] = c

    def eyes(s, lx, rx, y):
        """two 2x2 eyes: WW over WK, left block at column lx, right block at rx"""
        for ex in (lx, rx):
            s.px(ex, y, "W"); s.px(ex+1, y, "W"); s.px(ex, y+1, "W"); s.px(ex+1, y+1, "K")

    def rows(s):
        return ["".join(r) for r in s.g]

    def check(s):
        rows = s.rows()
        eyes = []
        for y, r in enumerate(rows):
            below = rows[y+1] if y + 1 < len(rows) else ""
            for x in range(len(r) - 1):
                if r[x] == "W" and r[x+1] == "W" and below[x:x+1] == "W" and below[x+1:x+2] == "K":
                    eyes.append((x, y))
        whites = sum(r.count("W") for r in rows)
        problems = []
        if len(eyes) != 2: problems.append(f"{len(eyes)} eyes")
        if whites != 6: problems.append(f"{whites} W pixels (want 6)")
        if rows[-1].strip("."): problems.append("bottom row not empty")
        return problems

    def chain(s, pts):
        """union of ellipses [(cx, cy, rx, ry), ...]"""
        out = set()
        for cx, cy, rx, ry in pts:
            out |= s.E(cx, cy, rx, ry)
        return out
