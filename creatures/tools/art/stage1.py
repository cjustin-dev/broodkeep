from bk import Canvas

K = "#1a1020"
# ===================== In-training: 16 x 16, feet end at row 13 (outline row 14, row 15 empty) =====================
def pip(f):
    c = Canvas(16, 16)
    u = f
    for sx in (-1, 1):
        c.put(c.E(8 + sx * 3.2, 12.6, 2.1, 1.2), "B", shade=("D", None))
    c.put(c.E(8, 10.4, 3.7, 2.8), "B", shade=("D", "L"))
    c.put(c.E(8, 10.8, 2.0, 1.8), "T")
    for sx in (-1, 1):
        c.put(c.E(8 + sx * 4.6, 10.4 - u * 1.2, 1.0, 1.5), "B")
    for sx in (-1, 1):  # leaf ears: a rounded leaf leaning out, flopping outward on frame 1
        if f == 0:
            leaf = [(8 + sx * 3.4, 4.6, 1.7, 1.9), (8 + sx * 4.4, 2.9, 1.7, 1.9), (8 + sx * 5.2, 1.7, 1.2, 1.1)]
        else:
            leaf = [(8 + sx * 4.2, 4.8, 1.9, 1.7), (8 + sx * 5.9, 4.0, 1.9, 1.6), (8 + sx * 7.0, 3.6, 1.2, 1.1)]
        c.put(c.chain(leaf), "A")
        c.px(int(8 + sx * (4.0 if f == 0 else 5.0) - (1 if sx < 0 else 0)), 3 if f == 0 else 4, "B")
    c.put(c.E(8, 7.4 - u, 5.5, 4.4), "B", shade=("D", "L"))
    c.eyes(4, 10, 6 - u)
    c.px(7, 9 - u, "M"); c.px(8, 9 - u, "M")
    c.px(2, 8 - u, "P"); c.px(13, 8 - u, "P")
    c.outline()
    return c
PIP = {"B": "#8ad65a", "D": "#5fa840", "L": "#b8ee8c", "T": "#eaf7b8", "A": "#4f9a3a", "P": "#f2a0a8", "M": "#c2506a", "K": K, "W": "#ffffff"}

def nubbin(f):
    c = Canvas(16, 16)
    for sx in (-1, 1):  # horns first, the head overlaps their roots
        c.put(c.P([(8 + sx * 1.4, 5.5), (8 + sx * 4.4, 5.5), (8 + sx * 3.6, 1.4)]), "H")
        c.px(int(8 + sx * 3.0 - (1 if sx < 0 else 0)), 4, "I")
    c.put(c.E(8, 8.6, 6.1, 4.9), "N", shade=("D", "L"))
    c.put(c.E(5.2, 12.4, 2.1, 1.2), "N", shade=("D", None))
    c.put(c.E(10.8, 12.4, 2.1, 1.2), "N", shade=("D", None))
    c.put(c.E(8, 11.4, 3.4, 2.0), "T")
    for sx in (-1, 1):
        fy = 11.0 if f == 0 else 5.2
        if f == 1:
            c.put(c.L(8 + sx * 5, 9, 8 + sx * 6, 6), "N")
        c.put(c.E(8 + sx * 6.0, fy, 1.8, 1.8), "N", ring=True, shade=("D", "L"))
    c.eyes(4, 10, 6)
    c.pxs([(3, 5), (4, 5), (11, 5), (12, 5)], "D")
    c.pxs([(7, 9), (8, 9)], "M")
    c.outline()
    return c
NUB = {"I": "#d8cdb0", "N": "#e8a86b", "D": "#c27d44", "L": "#f6c690", "T": "#f9e0b8", "H": "#f4ecd8", "M": "#c2506a", "K": K, "W": "#ffffff"}

def smudge(f):
    c = Canvas(16, 16)
    w = f
    head = [(8, 7.2, 5.4, 3.8), (4.4, 6.2, 2.7, 2.5), (11.8, 6.0 - w * 0.4, 2.9, 2.7), (6.8, 3.8, 2.4, 2.1), (10.2, 3.6 - w * 0.6, 2.1, 1.9)]
    c.put(c.chain(head), "S", shade=("D", "L"))
    tail = [(8, 11.2, 3.2, 2.0), (8.0 + w * 0.8, 12.8, 2.3, 1.3), (10.4 + w * 1.4, 13.5, 1.6, 0.9), (12.4 + w * 1.6, 12.9 - w * 0.4, 0.9, 0.8)]
    c.put(c.chain(tail), "S", shade=("D", None))
    c.pxs([(2, 3 + w), (13, 1 + w)], "L")
    c.eyes(4, 10, 5)
    c.pxs([(5, 9), (6, 8), (7, 8), (8, 8), (9, 8), (10, 9)], "M")
    c.outline()
    return c
SMU = {"S": "#7a7094", "D": "#5f5678", "L": "#9a92b4", "M": "#c2506a", "K": K, "W": "#ffffff"}

# ===================== Rookies: 22 x 22, feet end at row 19 =====================
def fennix(f):
    c = Canvas(22, 22)
    t = f
    # big bushy tail curving up on the right, with an ember at the tip
    c.put(c.chain([(15.4, 17.4, 2.4, 2.0), (18.0, 15.4, 2.6, 2.6), (19.2, 12.0, 2.5, 3.0), (18.6 - t, 9.4 - t, 1.9, 2.2)]), "O", shade=("D", "L"))
    c.pxs([(18 - t, 6 - t), (17 - t, 7 - t), (19 - t, 7 - t)], "R")
    c.pxs([(18 - t, 7 - t), (18 - t, 8 - t)], "Y")
    c.pxs([(19 - t, 5 - t)], "Y")
    for sx in (-1, 1):
        c.put(c.E(11 + sx * 3.0, 18.6, 2.4, 1.3), "D")
    c.put(c.E(11, 15.4, 4.5, 4.0), "O", shade=("D", "L"))
    c.put(c.E(11, 16.0, 2.6, 3.0), "C")
    for sx in (-1, 1):
        c.put(c.E(11 + sx * 5.2, 15.2, 1.4, 2.2), "O", shade=("D", None))
    for sx in (-1, 1):  # ears: big and pointed, with a cream inside
        tip = 5.6 + sx * 0.0 + (0.8 * f * sx)
        c.put(c.P([(11 + sx * 1.8, 6.0), (11 + sx * 6.6, 6.4), (11 + sx * 5.4 + (0.6 * f), 0.8)]), "O")
        c.put(c.P([(11 + sx * 3.2, 5.6), (11 + sx * 5.2, 5.8), (11 + sx * 4.8, 2.6)]), "C")
    c.put(c.E(11, 9.0, 6.6, 5.0), "O", shade=("D", "L"))
    c.put(c.E(11, 11.4, 3.5, 2.4), "C")
    c.eyes(5, 15, 7)
    c.pxs([(10, 10), (11, 10)], "N")
    c.pxs([(10, 12), (11, 12)], "M")
    c.outline()
    return c
FEN = {"O": "#f08a24", "D": "#c0601a", "L": "#ffb55a", "C": "#fbe8c8", "N": "#3a2418", "R": "#ff4b2a", "Y": "#ffd23a", "M": "#c2506a", "K": K, "W": "#ffffff"}

def shellby(f):
    c = Canvas(22, 22)
    b = f
    c.put(c.E(11, 13.0, 8.8, 6.4), "S", shade=("H", "L"))
    c.pxs([(11, 8), (10, 9), (12, 9), (11, 10)], "H")
    c.pxs([(5, 12), (6, 13), (5, 14), (16, 12), (15, 13), (16, 14)], "H")
    c.pxs([(8, 8), (9, 7), (10, 7), (12, 7), (13, 7), (14, 8), (7, 9)], "V")
    c.pxs([(9, 6), (13, 6), (11, 6)], "V")
    c.put(c.E(11, 15.6, 5.4, 3.3), "T")
    for sx in (-1, 1):
        c.put(c.E(11 + sx * 7.4, 15.6, 1.7, 2.1), "G", shade=("D", None))
    for sx in (-1, 1):  # feet in front of the shell, one steps up on frame 1
        lift = 1.0 if (f == 1 and sx > 0) else 0.0
        c.put(c.E(11 + sx * 5.2, 17.7 - lift, 2.6, 1.2), "G", ring=True, shade=("D", None))
    c.put(c.E(21.0 - 4.0, 17.8, 1.4, 1.0), "G")  # tail tip
    c.put(c.E(11, 8.6 + b * 0.8, 5.0, 4.3), "G", shade=("D", "L"))
    c.eyes(5, 15, 6 + b)
    c.pxs([(10, 10 + b), (11, 10 + b)], "M")
    c.outline()
    return c
SHE = {"G": "#5fa84a", "D": "#417a31", "L": "#8fd16a", "S": "#9b7b4a", "H": "#7a5c33", "V": "#6fae4e", "T": "#e8d9a0", "M": "#c2506a", "K": K, "W": "#ffffff"}

def gruntle(f):
    c = Canvas(22, 22)
    p = f  # fists pump
    c.put(c.chain([(15.8, 17.6, 1.8, 1.4), (17.6, 16.6, 1.5, 1.3)]), "R", shade=None)  # little tail
    for sx in (-1, 1):
        c.put(c.E(11 + sx * 3.4, 18.6, 2.5, 1.3), "D")
    c.put(c.E(11, 15.2, 5.3, 4.4), "R", shade=("D", "L"))
    c.put(c.E(11, 16.0, 3.0, 3.0), "T")
    for sx in (-1, 1):  # strong arms and big fists
        fy = 15.6 - p * 3.4
        c.put(c.E(11 + sx * 6.2, 14.6 - p * 1.4, 1.7, 2.6), "R", shade=("D", None))
        c.put(c.E(11 + sx * 6.8, fy + 1.4, 2.2, 2.0), "R", shade=("D", "L"))
    for sx in (-1, 1):  # horns
        c.put(c.P([(11 + sx * 3.2, 5.2), (11 + sx * 6.0, 5.6), (11 + sx * 7.6, 0.8), (11 + sx * 5.6, 2.8)]), "H")
    c.put(c.E(11, 9.0, 6.6, 5.0), "R", shade=("D", "L"))
    c.put(c.E(11, 11.8, 3.8, 2.4), "T")
    c.eyes(5, 15, 7)
    c.pxs([(4, 5), (5, 5), (6, 6), (16, 6), (15, 5), (17, 5)], "D")  # angry brows
    c.pxs([(10, 12), (11, 12)], "M")
    c.pxs([(8, 12), (13, 12)], "H")  # small tusks
    c.outline()
    return c
GRU = {"R": "#b8482c", "D": "#8a3220", "L": "#d8703e", "T": "#e8b078", "H": "#f4ecd8", "M": "#c2506a", "K": K, "W": "#ffffff"}

def mothlet(f):
    c = Canvas(22, 22)
    fl = f
    for sx in (-1, 1):
        if fl == 0:
            pts = [(11 + sx * 3.2, 9.0), (11 + sx * 9.8, 4.2), (11 + sx * 10.6, 10.5), (11 + sx * 8.4, 16.0), (11 + sx * 3.4, 15.5)]
        else:
            pts = [(11 + sx * 3.2, 8.0), (11 + sx * 8.4, 0.8), (11 + sx * 10.6, 7.5), (11 + sx * 8.0, 13.5), (11 + sx * 3.4, 14.5)]
        wing = c.put(c.P(pts), "Q", shade=("V", "F"))
        mx = 11 + sx * 7.4
        my = (pts[0][1] + pts[3][1]) / 2
        c.put(c.E(mx, my, 1.7, 1.7), "A", ring=False)
        c.px(int(mx - 0.5 * sx - (1 if sx > 0 else 0) + 0), int(my), "F")
    for sx in (-1, 1):
        c.put(c.E(11 + sx * 2.2, 19.0, 1.4, 1.0), "V")
    c.put(c.E(11, 15.2, 3.4, 4.2), "F", shade=("V", "L"))
    c.pxs([(9, 14), (10, 16), (12, 15), (13, 17), (11, 18)], "L")
    for sx in (-1, 1):
        c.put(c.L(11 + sx * 2, 5, 11 + sx * 4 + fl * sx, 1), "K")
        c.px(11 + sx * 4 + fl * sx, 1, "A")
    c.put(c.E(11, 9.8, 5.2, 4.4), "F", shade=("V", "L"))
    c.pxs([(5, 12), (6, 13), (15, 13), (16, 12)], "L")
    c.eyes(5, 15, 7)
    c.pxs([(10, 11), (11, 11)], "M")
    c.outline()
    return c
MOT = {"F": "#fdf3fa", "V": "#d6bfe8", "L": "#ffffff", "Q": "#b79cf0", "A": "#7e55cf", "M": "#c2506a", "K": K, "W": "#ffffff"}

def grumblot(f):
    c = Canvas(22, 22)
    pf = f
    for sx in (-1, 1):
        c.put(c.E(11 + sx * 6.0, 18.4, 3.0, 1.5), "G", shade=("D", None))
    c.put(c.E(11, 14.4, 8.4, 5.6 + pf * 0.4), "G", shade=("D", "L"))
    c.put(c.E(11, 16.0, 5.6, 3.4 + pf * 0.5), "T")
    for x, y in ((5, 12), (7, 10), (15, 10), (17, 12), (4, 15), (18, 15), (9, 17), (13, 16)):
        c.px(x, y, "D")  # warts
    for sx in (-1, 1):
        c.put(c.E(11 + sx * 8.0, 17.0, 1.6, 2.0), "G", shade=("D", None))
    # bulging eye bumps on top
    for sx in (-1, 1):
        c.put(c.E(11 + sx * 4.8, 6.6, 3.4, 3.0), "G", shade=("D", "L"))
    c.put(c.E(11, 9.0, 7.6, 4.2), "G", shade=("D", "L"))
    c.eyes(4, 16, 5)
    # wide downturned mouth
    c.pxs([(6, 12), (7, 11), (8, 11), (9, 11), (10, 11), (11, 11), (12, 11), (13, 11), (14, 11), (15, 12)], "M")
    if f: c.pxs([(8, 12), (9, 12), (10, 12), (11, 12), (12, 12), (13, 12)], "M")
    c.outline()
    return c
GRB = {"G": "#7f8f4e", "D": "#5d6b36", "L": "#a3b46a", "T": "#d9d49a", "M": "#8a3a4a", "K": K, "W": "#ffffff"}

DESIGNS = [
    ("pip", pip, PIP), ("nubbin", nubbin, NUB), ("smudge", smudge, SMU),
    ("fennix", fennix, FEN), ("shellby", shellby, SHE), ("gruntle", gruntle, GRU),
    ("mothlet", mothlet, MOT), ("grumblot", grumblot, GRB),
]
