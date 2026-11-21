import math
from bk import Canvas
K = "#1a1020"
N_ = 32

def ray(cx, cy, ang, r0, r1, half):
    a = math.radians(ang)
    tip = (cx + math.cos(a) * r1, cy + math.sin(a) * r1)
    b1 = (cx + math.cos(a - math.radians(half)) * r0, cy + math.sin(a - math.radians(half)) * r0)
    b2 = (cx + math.cos(a + math.radians(half)) * r0, cy + math.sin(a + math.radians(half)) * r0)
    return [b1, tip, b2]

# ---------------- Solarion: radiant lion-dragon ----------------
def solarion(f):
    c = Canvas(N_, N_)
    fl = f
    # bat wings behind the shoulders, maroon with a lighter membrane
    for sx in (-1, 1):
        up = fl * 3
        pts = [(16 + sx * 6.0, 21.0), (16 + sx * 8.0, 13.0 - up), (16 + sx * 12.0, 8.0 - up), (16 + sx * 15.6, 6.0 - up),
               (16 + sx * 15.4, 12.0 - up * 0.6), (16 + sx * 13.4, 14.0 - up * 0.5), (16 + sx * 14.6, 17.4 - up * 0.3),
               (16 + sx * 11.6, 17.2 - up * 0.2), (16 + sx * 12.0, 21.6), (16 + sx * 8.6, 22.6)]
        c.put(c.P(pts), "V")
        for (tx, ty) in ((15.4, 6.6 - up), (14.0, 12.4 - up * 0.6), (13.0, 17.2 - up * 0.3)):
            c.pxs(list(c.L(int(16 + sx * 7), 20, int(16 + sx * tx), int(ty))), "w")
    # tail with a sun tuft
    c.put(c.chain([(22.0, 27.6, 2.8, 1.8), (25.6, 26.4, 2.4, 1.8), (28.0, 23.6 - fl, 1.8, 2.2)]), "G", shade=("D", "L"))
    c.put(c.P([(26.6, 22.4 - fl), (30.4, 22.4 - fl), (29.6, 17.6 - fl), (28.4, 19.4 - fl), (27.0, 17.8 - fl)]), "R")
    c.pxs([(28, 21 - fl), (29, 21 - fl), (28, 19 - fl)], "Y")
    # sun mane: rays all round the head
    rot = 15 * fl
    for i in range(12):
        ang = i * 30 + rot - 90
        c.put(c.P(ray(16, 9.4, ang, 6.4, 11.8 if i % 2 == 0 else 10.4, 12)), "O")
    c.put(c.E(16, 9.4, 8.4, 8.0), "O")
    for i in range(12):
        ang = i * 30 + rot - 90
        c.put(c.P(ray(16, 9.4, ang, 6.4, 10.0 if i % 2 == 0 else 8.8, 8)), "Y", ring=False)
    c.put(c.E(16, 9.4, 7.4, 7.0), "O", ring=False)
    # legs and feet
    for sx in (-1, 1):
        c.put(c.E(16 + sx * 4.6, 26.0, 3.2, 3.6), "G", shade=("D", "L"))
        c.put(c.E(16 + sx * 5.0, 28.6, 3.4, 1.3), "D")
        for k in (-1, 0, 1):
            c.px(int(16 + sx * 5.0 + k * 1.5 - (1 if sx > 0 else 0)), 29, "H")
    # torso with a sun-plate
    c.put(c.E(16, 20.0, 6.8, 6.6), "G", shade=("D", "L"))
    c.put(c.E(16, 20.4, 4.4, 5.2), "A", shade=("a", None))
    c.pxs([(16, 17), (15, 18), (16, 18), (17, 18), (14, 19), (15, 19), (16, 19), (17, 19), (18, 19), (15, 20), (16, 20), (17, 20), (16, 21)], "Y")
    for sx in (-1, 1):
        lift = fl if sx > 0 else 0
        c.put(c.E(16 + sx * 9.0, 20.0 - lift * 1.0, 2.5, 4.2), "G", shade=("D", None))
        c.put(c.E(16 + sx * 9.4, 24.0 - lift * 1.0, 2.4, 2.0), "G", shade=("D", None))
        for k in (-1, 1):
            c.px(int(16 + sx * 9.4 + k * 1.2 - (1 if sx > 0 else 0)), int(25.6 - lift), "H")
        c.put(c.E(16 + sx * 7.4, 15.4, 3.2, 2.6), "A", shade=("a", "H"))
    # horns and head
    for sx in (-1, 1):
        c.put(c.P([(16 + sx * 3.0, 5.6), (16 + sx * 5.6, 5.2), (16 + sx * 7.4, 0.6), (16 + sx * 4.4, 3.0)]), "H")
    c.put(c.E(16, 9.8, 6.0, 5.2), "L", shade=("G", "C"))
    c.put(c.E(16, 12.4, 3.8, 2.8), "C")
    c.eyes(11, 19, 8)
    c.pxs([(10, 6), (11, 6), (12, 7), (21, 6), (20, 6), (19, 7)], "D")
    c.pxs([(15, 11), (16, 11)], "N")
    c.pxs([(15, 13), (16, 13)], "M")
    c.pxs([(14, 14), (17, 14)], "H")
    c.outline()
    return c
SOL = {"G": "#f2b632", "D": "#c68a1a", "L": "#ffd96a", "C": "#fff0c0", "A": "#fff4d8", "a": "#d8c690", "R": "#e0401e", "O": "#ff8a24", "Y": "#ffe45a", "H": "#ffffff", "V": "#a8402a", "w": "#e0703a", "N": "#1a1020", "M": "#c2506a", "K": K, "W": "#ffffff"}

# ---------------- Citadrake: dragon with a fortress grown into its back ----------------
def citadrake(f):
    c = Canvas(N_, N_)
    fl = f
    # the fortress grown into the back: a wall behind the head and two tall towers over the shoulders
    c.put(c.R(7, 9, 24, 15), "S", shade=None)
    for y in (11, 13):
        c.pxs([(x, y) for x in range(7, 25)], "b")
    c.pxs([(x, 8) for x in (8, 9, 11, 12, 14, 15, 17, 18, 20, 21, 23)], "S")
    for x0 in (2, 24):
        c.put(c.R(x0, 4, x0 + 5, 17), "S", shade=None)
        for y in (7, 10, 13, 16):
            c.pxs([(x, y) for x in range(x0, x0 + 6)], "b")
        for x in range(x0, x0 + 6):
            c.px(x, 3, "S" if (x - x0) % 2 == 0 else ".")
        c.put(c.R(x0 + 2, 5, x0 + 3, 8), "N", ring=False)
        c.px(x0 + 2, 5, "E"); c.px(x0 + 3, 5, "E")
        pole = x0 + 2
        c.pxs([(pole, y) for y in range(0, 3)], "K")
        d = 1 if x0 > 10 else -1
        c.put(c.P([(pole + 0.6, 0.0), (pole + 0.6 + 4 * d + (0.6 if d < 0 else 0), 1.0 + fl * 0.8), (pole + 0.6, 2.2)]), "R")
    c.pxs([(28 + fl, 0), (30, 1 - fl)], "L")
    # tail on the left
    c.put(c.chain([(10.0, 27.4, 3.0, 1.9), (6.6 - fl, 26.0, 2.6, 1.8), (4.2 - fl, 23.4, 1.8, 2.2)]), "B", shade=("D", "L"))
    c.put(c.P([(2.4 - fl, 22.0), (5.4 - fl, 21.6), (3.4 - fl, 18.0)]), "H")
    for sx in (-1, 1):
        c.put(c.E(16 + sx * 4.8, 26.0, 3.4, 3.6), "B", shade=("D", "L"))
        c.put(c.E(16 + sx * 5.2, 28.6, 3.6, 1.3), "D")
        for k in (-1, 0, 1):
            c.px(int(16 + sx * 5.2 + k * 1.6 - (1 if sx > 0 else 0)), 29, "H")
    c.put(c.E(16, 21.0, 7.4, 6.6), "B", shade=("D", "L"))
    c.put(c.E(16, 22.0, 4.2, 5.4), "y")
    for y in (19, 21, 23, 25):
        c.pxs([(x, y) for x in range(13, 19)], "z")
    for sx in (-1, 1):
        c.put(c.E(16 + sx * 9.2, 21.0, 2.6, 4.2), "B", shade=("D", None))
        c.put(c.E(16 + sx * 9.6, 25.0, 2.4, 2.0), "B", shade=("D", None))
        for k in (-1, 1):
            c.px(int(16 + sx * 9.6 + k * 1.2 - (1 if sx > 0 else 0)), 26, "H")
    for sx in (-1, 1):
        c.put(c.P([(16 + sx * 3.0, 7.0), (16 + sx * 5.8, 6.4), (16 + sx * 8.6, 2.6), (16 + sx * 5.0, 4.6)]), "H")
        c.put(c.P([(16 + sx * 5.6, 11.0), (16 + sx * 8.8, 11.6), (16 + sx * 6.4, 13.8)]), "H")
    c.put(c.E(16, 10.8, 6.2, 5.0), "B", shade=("D", "L"))
    c.put(c.E(16, 13.2, 4.2, 2.6), "y")
    c.eyes(11, 19, 9)
    c.pxs([(10, 7), (11, 7), (12, 8), (21, 7), (20, 7), (19, 8)], "D")
    c.pxs([(15, 12), (16, 12)], "N")
    c.pxs([(14, 14), (15, 14), (16, 14), (17, 14)], "M")
    c.pxs([(13, 15), (18, 15)], "H")
    c.outline()
    return c
CIT = {"B": "#5c7a99", "D": "#3c5470", "L": "#86a4c2", "y": "#e8d9a0", "z": "#c0ae6a", "S": "#a5aab5", "b": "#6a7080", "H": "#d8dce4", "N": "#1a1020", "E": "#ffd23a", "R": "#d8402e", "M": "#c2506a", "K": K, "W": "#ffffff"}

# ---------------- Aurelith: celestial moth-angel ----------------
def aurelith(f):
    c = Canvas(N_, N_)
    fl = f
    b = fl  # floats up a pixel
    for sx in (-1, 1):
        up = fl * 3
        upper = [(16 + sx * 3.4, 12 - b), (16 + sx * 15.4, 1.2 - up), (16 + sx * 15.6, 12 - up * 0.5), (16 + sx * 3.8, 18 - b)]
        lower = [(16 + sx * 3.6, 16 - b), (16 + sx * 12.6, 16.5 - up * 0.3), (16 + sx * 10.0, 27 - up * 0.4), (16 + sx * 4.0, 23 - b)]
        c.put(c.P(lower), "Q", shade=("q", None))
        c.put(c.P(upper), "Q", shade=("q", None))
        # star field and golden edge
        for (dx, dy) in ((6, 6), (10, 4), (12, 9), (8, 11), (13, 5), (7, 15), (10, 19), (6, 21)):
            c.px(int(16 + sx * dx - (1 if sx > 0 else 0)), int(dy - (up if dy < 12 else up * 0.4)), "Y" if (dx + dy + fl) % 3 else "H")
        c.pxs([(int(16 + sx * 15.0 - (1 if sx > 0 else 0)), int(2 - up)), (int(16 + sx * 15.2 - (1 if sx > 0 else 0)), int(3 - up))], "G")
    # robe, floating (no feet)
    c.put(c.P([(11.6, 14 - b), (20.4, 14 - b), (23.6, 28.4 - b), (8.4, 28.4 - b)]), "R", shade=("r", "H"))
    c.pxs([(x, int(27 - b)) for x in range(9, 24)], "G")
    c.pxs([(15, y - b) for y in range(15, 27)], "G")
    c.pxs([(16, y - b) for y in range(15, 27)], "G")
    # sleeves and a held star
    for sx in (-1, 1):
        c.put(c.E(16 + sx * 5.2, 18.0 - b, 1.8, 3.4), "R", shade=("r", None))
        c.put(c.E(16 + sx * 2.4, 21.0 - b, 1.5, 1.3), "F")
    c.put(c.E(16, 20.4 - b, 2.2, 2.2), "Y")
    c.px(16, int(19 - b), "H")
    # halo behind the head, then the head
    halo = c.E(16, 3.6 - b, 6.6, 2.4) - c.E(16, 3.6 - b, 4.6, 1.1)
    c.put(halo, "G", ring=False)
    c.put(c.E(16, 9.0 - b, 5.0, 4.6), "F", shade=("r", "H"))
    c.eyes(11, 19, 8 - b)
    c.pxs([(15, 12 - b), (16, 12 - b)], "M")
    c.outline()
    return c
AUR = {"Q": "#2a2f7a", "q": "#1c2058", "Y": "#ffe45a", "H": "#ffffff", "G": "#ffd23a", "R": "#f4f0ff", "r": "#c9bde8", "F": "#fff7f2", "M": "#c2506a", "K": K, "W": "#6a5acd"}

# ---------------- Dreadmaw: shadow beast with a huge jaw ----------------
def dreadmaw(f):
    c = Canvas(N_, N_)
    j = f  # the jaw opens wider
    # smoke wisps
    for (x, y) in ((3, 12 - j), (29, 9 + j), (2, 20), (30, 18 - j), (5, 5 + j), (27, 3 - j)):
        c.put(c.E(x, y, 1.6, 1.6), "S", ring=False)
    # back spikes
    for tips in ([(5, 11), (9, 8), (3, 3)], [(27, 11), (23, 8), (29, 3)], [(12, 5), (15, 5), (13, 0.6)], [(17, 5), (20, 5), (19, 0.6)]):
        c.put(c.P(tips), "D")
    # body
    for sx in (-1, 1):
        c.put(c.E(16 + sx * 5.4, 28.0, 3.6, 1.6), "D")
        for k in (-1, 0, 1):
            c.px(int(16 + sx * 5.6 + k * 1.4 - (1 if sx > 0 else 0)), 29, "H")
    c.put(c.E(16, 24.0, 7.6, 5.4), "S", shade=("D", "L"))
    for sx in (-1, 1):
        c.put(c.E(16 + sx * 10.4, 22.0, 2.8, 4.4), "S", shade=("D", None))
        c.put(c.E(16 + sx * 10.8, 26.4, 2.6, 2.0), "S", shade=("D", None))
        for k in (-1, 0, 1):
            c.px(int(16 + sx * 10.8 + k * 1.3 - (1 if sx > 0 else 0)), 28, "H")
    # huge head
    c.put(c.E(16, 12.4, 10.6, 8.6), "S", shade=("D", "L"))
    # the jaw: a dark red maw with two rows of teeth
    mouth_top = 15
    mouth_bot = 21 + j
    c.put(c.E(16, (mouth_top + mouth_bot) / 2 + 0.5, 8.6, (mouth_bot - mouth_top) / 2 + 1.2), "R", ring=True)
    for x in range(9, 24):
        if x % 2 == 1:
            c.px(x, mouth_top + 1, "T"); c.px(x, mouth_top + 2, "T") if x % 4 == 1 else None
            c.px(x, mouth_bot - 1, "T"); c.px(x, mouth_bot - 2, "T") if x % 4 == 3 else None
    c.pxs([(x, int((mouth_top + mouth_bot) / 2) + 1) for x in range(12, 21)], "r")
    c.pxs([(x, int((mouth_top + mouth_bot) / 2) + 1) for x in (15, 16)], "M")  # the mouth letter, colored like the throat, so a yawn opens a dark mouth
    # many eyes
    c.eyes(9, 21, 8)
    for (x, y) in ((13, 5), (18, 5), (7, 11), (25, 11), (11, 11), (20, 11), (15, 3), (16, 3)):
        c.px(x, y, "E")
    c.pxs([(8, 6), (9, 6), (22, 6), (23, 6)], "D")
    c.outline()
    return c
DRE = {"S": "#3a2f4f", "D": "#1f1830", "L": "#5a4d78", "R": "#a02838", "r": "#6a1824", "M": "#6a1824", "T": "#f0ead8", "E": "#ff3b3b", "H": "#e8e2d0", "K": K, "W": "#ffe45a"}

# ---------------- Hollowking: swamp king with a crown of roots ----------------
def hollowking(f):
    c = Canvas(N_, N_)
    sw = f
    # scepter on the right
    c.pxs([(27, y) for y in range(7, 29)], "T")
    c.put(c.E(27.5, 5.2, 2.2, 2.2), "U", ring=True)
    c.px(27, 4, "G")
    # tattered cloak
    hem = [(5, 29)]
    for i, x in enumerate(range(5, 28, 3)):
        hem.append((x + 1.5, 26.4 + ((i + sw) % 2) * 1.6))
        hem.append((x + 3, 29.4))
    cloak = [(9, 14), (23, 14), (27, 22)] + hem[::-1] + [(5, 22)]
    c.put(c.P([(10, 13), (22, 13), (27.4, 29.4), (4.6, 29.4)]), "C", shade=("c", "e"))
    c.pxs([(5 + i * 3 + sw, 29) for i in range(0, 8)], "K")
    for (x, y) in ((8, 20), (11, 24), (21, 19), (24, 25), (16, 22), (14, 27)):
        c.px(x, y, "V")
    c.pxs([(15, y) for y in range(14, 28)], "c")
    # arms (bony) and a hand around the scepter
    c.put(c.E(24.4, 19.0, 1.6, 3.2), "F")
    c.put(c.E(26.8, 17.0, 1.7, 1.7), "F")
    c.put(c.E(7.6, 19.0, 1.6, 3.2), "F")
    # root crown
    root = [((12, 6), (8, 2 + sw), (6, 0 + sw)), ((14, 5), (13, 1), (14, -1)), ((18, 5), (19, 1), (18, -1)), ((20, 6), (24, 2 + sw), (26, 0 + sw)),
            ((9, 8), (5, 5), (3, 5 - sw)), ((23, 8), (27, 5), (29, 5 - sw))]
    for a, b_, e in root:
        for p, q in ((a, b_), (b_, e)):
            c.pxs(list(c.L(int(p[0]), int(p[1]), int(q[0]), int(q[1]))), "T")
    for (x, y) in ((6, 1 + sw), (26, 1 + sw), (13, 1), (19, 1), (4, 5 - sw), (28, 5 - sw)):
        c.px(x, max(0, y), "V")
    # head: a pale hollow face
    c.put(c.E(16, 10.4, 5.8, 5.6), "F", shade=("f", "H"))
    c.put(c.E(11.4, 9.6, 2.6, 2.6), "N", ring=False)
    c.put(c.E(20.6, 9.6, 2.6, 2.6), "N", ring=False)
    c.eyes(10, 20, 8)
    c.pxs([(15, 12), (16, 12), (15, 13), (16, 13)], "N")
    c.pxs([(15, 13), (16, 13)], "M")  # the mouth letter, colored like the nose slit, so a yawn opens a dark mouth
    # moss beard
    for x in (12, 14, 17, 19):
        c.pxs([(x, 15), (x, 16 + (x + sw) % 2)], "V")
    c.outline()
    return c
HOL = {"C": "#4a5a30", "c": "#363f22", "e": "#6a7a44", "T": "#7a5a34", "V": "#7fa84a", "F": "#c8d4b0", "f": "#9aa886", "H": "#e8f0d8", "N": "#14180e", "M": "#14180e", "U": "#2a4a2a", "G": "#9ff79a", "K": K, "W": "#d7ffd0"}

DESIGNS = [("solarion", solarion, SOL), ("citadrake", citadrake, CIT), ("aurelith", aurelith, AUR), ("dreadmaw", dreadmaw, DRE), ("hollowking", hollowking, HOL)]
