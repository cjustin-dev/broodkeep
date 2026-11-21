from bk import Canvas
K = "#1a1020"
W_, H_ = 28, 28

# ---------------- Pyrefang: flame-maned wolf, upright ----------------
def pyrefang(f):
    c = Canvas(W_, H_)
    fl = f
    # flame tail on the right
    c.put(c.chain([(19.5, 22.2, 2.6, 2.0), (22.5, 20.4, 2.4, 2.2), (24.0, 17.6, 2.0, 2.4)]), "G", shade=("D", "L"))
    c.put(c.P([(22.0, 16.5), (26.0, 16.5), (24.6 + fl, 11.0), (23.0, 13.0), (21.6 - fl, 11.6)]), "R")
    c.put(c.P([(22.8, 16.0), (25.2, 16.0), (24.0 + fl, 12.4), (22.8, 13.8)]), "O", ring=False)
    # mane of flames behind the head and shoulders
    mane = [
        [(14, 0.2 + fl), (9.5, 7), (18.5, 7)],
        [(7.4 - fl, 1.6), (5, 8.5), (12, 8)],
        [(20.6 + fl, 1.6), (23, 8.5), (16, 8)],
        [(3.0, 6.2 + fl), (3.4, 13), (9, 10)],
        [(25.0, 6.2 + fl), (24.6, 13), (19, 10)],
        [(1.6 + fl, 12.2), (4, 18), (8, 13)],
        [(26.4 - fl, 12.2), (24, 18), (20, 13)],
    ]
    for t in mane:
        c.put(c.P(t), "R")
    c.put(c.E(14, 11.0, 9.6, 5.2), "R")
    for t in mane:
        cx = sum(p[0] for p in t) / 3; cy = sum(p[1] for p in t) / 3
        inner = [(14 + (p[0] - 14) * 0.78, 9 + (p[1] - 9) * 0.78) for p in t]
        c.put(c.P(inner), "O")
    c.put(c.E(14, 10.6, 8.0, 4.4), "O")
    c.pxs([(14, 2 + fl), (9, 4), (19, 4), (4, 9 + fl), (24, 9 + fl)], "Y")
    # legs and feet
    for sx in (-1, 1):
        c.put(c.E(14 + sx * 3.6, 22.4, 2.8, 3.2), "G", shade=("D", "L"))
        c.put(c.E(14 + sx * 4.0, 24.6, 3.0, 1.3), "D")
        c.pxs([(int(14 + sx * 4.0 - 2), 25), (int(14 + sx * 4.0), 25), (int(14 + sx * 4.0 + 1), 25)], "H")
    # torso
    c.put(c.E(14, 17.0, 5.8, 5.6), "G", shade=("D", "L"))
    c.put(c.E(14, 17.6, 3.2, 4.4), "C")
    # arms, one raised on frame 1
    for sx in (-1, 1):
        raise_ = fl if sx < 0 else 0
        c.put(c.E(14 + sx * 7.4, 16.8 - raise_ * 1.5, 2.1, 3.8), "G", shade=("D", None))
        c.put(c.E(14 + sx * 7.8, 20.4 - raise_ * 2.0, 2.2, 1.9), "G", shade=("D", None))
        for k in (-1, 0, 1):
            c.px(int(14 + sx * 7.8 + k * 1.2 - (1 if sx > 0 else 0)), int(22.2 - raise_ * 2.0), "H")
    # ears and head
    for sx in (-1, 1):
        c.put(c.P([(14 + sx * 2.2, 5.6), (14 + sx * 6.0, 5.4), (14 + sx * 5.6, 0.2)]), "G")
        c.put(c.P([(14 + sx * 3.4, 5.2), (14 + sx * 5.4, 5.0), (14 + sx * 5.2, 2.0)]), "P", ring=False)
    c.put(c.E(14, 8.8, 6.0, 4.8), "G", shade=("D", "L"))
    c.put(c.E(14, 11.0, 3.4, 2.6), "C")
    c.eyes(8, 18, 7)
    c.pxs([(7, 5), (8, 5), (9, 6), (20, 6), (19, 5), (18, 5)], "D")
    c.pxs([(13, 9), (14, 9)], "N")
    c.pxs([(13, 12), (14, 12)], "M")
    c.pxs([(12, 13), (15, 13)], "H")
    c.outline()
    return c
PYR = {"G": "#6b7a99", "D": "#4a5675", "L": "#8f9fbd", "C": "#d9e0ee", "N": "#1a1020", "R": "#e0401e", "O": "#ff8a24", "Y": "#ffe45a", "P": "#e8a0b0", "H": "#ffffff", "M": "#c2506a", "K": K, "W": "#ffffff"}

# ---------------- Bastion: stone tortoise with a tower on its back ----------------
def bastion(f):
    c = Canvas(W_, H_)
    fl = f
    # the tower, standing on the right shoulder
    c.put(c.R(18, 5, 25, 15), "S", shade=None)
    for y in (8, 11, 14):
        c.pxs([(x, y) for x in range(18, 26)], "H")
    for x in (20, 23):
        c.pxs([(x, y) for y in (6, 7, 9, 10, 12, 13)], "H")
    c.pxs([(18, 4), (19, 4), (21, 4), (22, 4), (24, 4), (25, 4)], "S")  # crenellations
    c.pxs([(18, 3), (19, 3), (24, 3), (25, 3)], "S")
    c.put(c.R(21, 6, 22, 9), "N", ring=False)  # window
    c.px(21, 6, "E"); c.px(22, 6, "E")
    c.px(21, 0, "K")
    c.pxs([(21, 1), (21, 2)], "K")
    flag = [(22, 0), (26, 1 + fl), (22, 2 + fl * 1)]
    c.put(c.P(flag), "R")
    # shell
    c.put(c.E(14, 18.0, 12.2, 8.2), "S", shade=("H", "L"))
    for (x, y) in ((5, 15), (9, 12), (19, 14), (22, 17), (4, 20), (24, 21), (14, 11)):
        c.pxs([(x, y), (x + 1, y)], "H")
    c.pxs([(6, 14), (7, 14), (20, 12), (21, 12), (5, 18), (23, 19)], "V")
    # belly plate
    c.put(c.E(14, 19.6, 7.2, 5.4), "T", shade=("d", None))
    for y in (17, 20, 23):
        c.pxs([(x, y) for x in range(9, 20)], "d")
    c.pxs([(14, y) for y in range(15, 24)], "d")
    # legs
    for sx in (-1, 1):
        c.put(c.E(14 + sx * 6.4, 23.7, 3.4, 2.1), "T", shade=("d", None))
    # arms
    for sx in (-1, 1):
        c.put(c.E(14 + sx * 10.8, 19.6 + fl * 0.0, 2.4, 3.6), "T", shade=("d", None))
    # head with a stone brow
    c.put(c.E(14, 10.6 + fl * 0.8, 5.0, 4.4), "T", shade=("d", "l"))
    c.put(c.R(9, 8 + fl, 18, 8 + fl), "S", ring=False)
    c.eyes(9, 17, 9 + fl)
    c.pxs([(13, 13 + fl), (14, 13 + fl)], "M")
    c.outline()
    return c
BAS = {"S": "#8a8f99", "H": "#5a5f6e", "L": "#b5bac4", "V": "#6fae4e", "T": "#9fb38a", "d": "#74876a", "l": "#bccfa6", "N": "#1a1020", "E": "#ffd23a", "R": "#d8402e", "M": "#c2506a", "K": K, "W": "#ffffff"}

# ---------------- Lumiwing: glowing moth with patterned wings ----------------
def lumiwing(f):
    c = Canvas(W_, H_)
    fl = f
    for sx in (-1, 1):
        up = fl * 3
        upper = [(14 + sx * 3.0, 9.5), (14 + sx * 13.2, 1.4 - up * 0.6 + 0.6), (14 + sx * 13.9, 10.6 - up * 0.5), (14 + sx * 8.4, 14.6 - up * 0.3), (14 + sx * 3.0, 14.0)]
        lower = [(14 + sx * 3.0, 15.0), (14 + sx * 11.6, 14.2 - up * 0.2), (14 + sx * 10.4, 22.0 - up * 0.2), (14 + sx * 6.0, 24.2), (14 + sx * 3.0, 20.0)]
        c.put(c.P(lower), "Q")
        c.put(c.P(upper), "Q")
        # a pale vein line along each wing, then eye-spots
        c.pxs(list(c.L(int(14 + sx * 4), 12, int(14 + sx * 12), int(4 - up * 0.5))), "q")
        c.pxs(list(c.L(int(14 + sx * 4), 17, int(14 + sx * 10), int(19 - up * 0.2))), "q")
        ux, uy = 14 + sx * 9.2, 8.4 - up * 0.45
        c.put(c.E(ux, uy, 2.6, 2.6), "A", ring=True)
        c.put(c.E(ux, uy, 1.3, 1.3), "Y", ring=False)
        lx, ly = 14 + sx * 7.8, 19.0 - up * 0.2
        c.put(c.E(lx, ly, 1.8, 1.8), "A", ring=True)
        c.px(int(lx - (1 if sx > 0 else 0)), int(ly), "Y")
        c.pxs([(int(14 + sx * 13.0 - (1 if sx > 0 else 0)), int(2 - up * 0.5 + 1)), (int(14 + sx * 13.4 - (1 if sx > 0 else 0)), int(9 - up * 0.5))], "Y")
    for sx in (-1, 1):
        c.put(c.E(14 + sx * 1.8, 25.0, 1.3, 1.0), "C")
    c.put(c.E(14, 21.6, 2.6, 3.4), "C", shade=("v", "L"))
    c.put(c.E(14, 16.4, 3.8, 4.4), "C", shade=("v", "L"))
    c.pxs([(12, 15), (13, 17), (15, 15), (16, 17), (14, 19)], "L")
    for sx in (-1, 1):
        c.put(c.E(14 + sx * 4.6, 16.6, 1.0, 2.0), "C")
    for sx in (-1, 1):
        tx, ty = 14 + sx * 6 + fl * sx, 1 + fl
        c.pxs(list(c.L(14 + sx * 2, 5, tx, ty + 1)), "K")
        c.put(c.E(tx + 0.5, ty + 0.5, 1.4, 1.4), "G", ring=True)
    c.put(c.E(14, 9.4, 5.4, 4.6), "C", shade=("v", "L"))
    c.pxs([(9, 12), (10, 13), (18, 13), (19, 12)], "L")
    c.eyes(9, 17, 8)
    c.pxs([(13, 12), (14, 12)], "M")
    c.outline()
    return c
LUM = {"q": "#8fe8e0", "C": "#fff1c4", "v": "#e0cc94", "L": "#ffffff", "Q": "#35b8b0", "V": "#1f8f8a", "A": "#e8a02a", "Y": "#fff7b0", "G": "#9ff7ee", "M": "#c2506a", "K": K, "W": "#1f6f78"}

# ---------------- Thornback: spiky armored lizard ----------------
def thornback(f):
    c = Canvas(W_, H_)
    sw = f
    # tail, swishing
    c.put(c.chain([(19.0, 23.0, 3.0, 2.0), (22.4 + sw, 22.4, 2.6, 1.8), (25.0 + sw, 20.4, 1.9, 1.7)]), "G", shade=("D", "L"))
    for (x, y) in ((21, 19), (23 + sw, 18), (25 + sw, 17)):
        c.put(c.P([(x, y + 1.6), (x + 2.2, y + 1.6), (x + 1.2, y - 1.8)]), "H")
    # back spikes behind the shoulders and head
    for tips in ([(5.0, 5.0), (7.2, 12.5), (11.0, 10.0)], [(9.5, 1.2), (10.5, 9.0), (14, 6.5)], [(18.5, 1.2), (17.5, 9.0), (14, 6.5)], [(23.0, 5.0), (20.8, 12.5), (17.0, 10.0)]):
        c.put(c.P(tips), "H")
    # legs
    for sx in (-1, 1):
        c.put(c.E(14 + sx * 4.4, 22.8, 3.0, 3.0), "G", shade=("D", "L"))
        c.put(c.E(14 + sx * 4.8, 24.8, 3.0, 1.2), "D")
        c.pxs([(int(14 + sx * 4.8 - 2), 25), (int(14 + sx * 4.8), 25), (int(14 + sx * 4.8 + 1), 25)], "H")
    # torso with belly plates
    c.put(c.E(14, 17.6, 6.6, 5.6), "G", shade=("D", "L"))
    c.put(c.E(14, 18.4, 3.8, 4.6), "B", ring=False)
    for y in (16, 18, 20):
        c.pxs([(x, y) for x in range(11, 17)], "D")
    # shoulder spikes
    for sx in (-1, 1):
        c.put(c.P([(14 + sx * 6.0, 14.8), (14 + sx * 9.6, 13.6), (14 + sx * 8.0, 10.8)]), "H")
    # arms
    for sx in (-1, 1):
        c.put(c.E(14 + sx * 8.0, 18.0, 2.2, 3.4), "G", shade=("D", None))
        c.put(c.E(14 + sx * 8.2, 21.2, 2.0, 1.6), "G", shade=("D", None))
        for k in (-1, 1):
            c.px(int(14 + sx * 8.2 + k * 1.2 - (1 if sx > 0 else 0)), 22, "H")
    # head: broad, with brow ridges and little horns
    for sx in (-1, 1):
        c.put(c.P([(14 + sx * 3.2, 5.2), (14 + sx * 5.2, 5.0), (14 + sx * 5.6, 1.8)]), "H")
    c.put(c.E(14, 9.4, 6.2, 4.6), "G", shade=("D", "L"))
    c.put(c.E(14, 11.8, 4.2, 2.4), "B")
    c.eyes(8, 18, 7)
    c.pxs([(7, 6), (8, 6), (19, 6), (20, 6)], "D")
    c.pxs([(13, 10), (14, 10)], "N")
    c.pxs([(11, 13), (12, 13), (13, 13), (14, 13), (15, 13), (16, 13)], "M")
    c.pxs([(11, 14), (16, 14)], "H")
    c.outline()
    return c
THO = {"G": "#2f6a2f", "D": "#1f4a22", "L": "#4e9a46", "B": "#c9d28a", "H": "#e8e2c8", "N": "#1a1020", "M": "#8a3a4a", "K": K, "W": "#ffffff"}

# ---------------- Gloomtoad: swamp toad with a lantern of cold light ----------------
def gloomtoad(f):
    c = Canvas(W_, H_)
    sway = f
    cx = 12.4
    # pole, hook and a hanging lantern of cold light
    c.pxs([(26, y) for y in range(2, 25)], "O")
    c.pxs([(25, 2), (24, 2), (23, 2)], "O")
    lx = 20 + sway  # left edge of the lantern
    c.pxs([(lx + 2, 3), (lx + 2, 4)], "O")
    c.put(c.E(lx + 2.5, 9.0, 5.0, 5.2), "J", ring=False)
    c.put(c.E(lx + 2.5, 9.0, 3.6, 3.8), "U", ring=False)
    c.put(c.R(lx, 6, lx + 4, 6), "K", ring=False)
    c.put(c.R(lx, 7, lx + 4, 11), "c", ring=False)
    c.put(c.R(lx + 1, 8, lx + 3, 10), "Y", ring=False)
    c.put(c.R(lx, 12, lx + 4, 12), "K", ring=False)
    c.pxs([(lx, 6), (lx + 4, 6), (lx - 1, 7), (lx + 5, 7), (lx - 1, 11), (lx + 5, 11)], "K") if False else None
    for y in range(7, 12):
        c.px(lx - 1, y, "K"); c.px(lx + 5, y, "K")
    c.pxs([(lx + 2, 5)], "K")
    # body
    for sx in (-1, 1):
        c.put(c.E(cx + sx * 6.4, 24.4, 3.4, 1.7), "G", shade=("D", None))
    c.put(c.E(cx, 18.8, 9.6, 6.4), "G", shade=("D", "L"))
    c.put(c.E(cx, 20.8, 6.0, 4.2), "T")
    for (x, y) in ((5, 15), (7, 17), (19, 16), (21, 19), (4, 20), (20, 22), (10, 24), (15, 24)):
        c.px(x, y, "D")
    # right arm holds the pole
    c.put(c.E(21.6, 19.4, 1.9, 2.8), "G", shade=("D", None))
    c.put(c.E(24.2, 16.8, 1.9, 1.7), "G", shade=("D", None))
    c.put(c.E(4.4, 20.0, 1.9, 2.8), "G", shade=("D", None))
    # head
    for sx in (-1, 1):
        c.put(c.E(cx + sx * 4.8, 8.0, 3.6, 3.3), "G", shade=("D", "L"))
    c.put(c.E(cx, 12.0, 7.8, 4.6), "G", shade=("D", "L"))
    c.eyes(6, 18, 6)
    mouth = [(6, 12), (7, 13)] + [(x, 14) for x in range(8, 17)] + [(17, 13), (18, 12)]
    c.pxs(mouth, "M")
    if f:
        c.pxs([(x, 15) for x in range(9, 16)], "M")
    c.pxs([(11, 10), (13, 10)], "N")
    c.outline()
    return c
GLO = {"G": "#3d5a56", "D": "#2a403d", "L": "#5c827c", "T": "#9db8a8", "O": "#6a4a2a", "J": "#2a6a78", "U": "#46b8c8", "c": "#c8f4ff", "Y": "#ffffff", "N": "#1a1020", "M": "#7a3a4a", "K": K, "W": "#9ff7ee"}

DESIGNS = [("pyrefang", pyrefang, PYR), ("bastion", bastion, BAS), ("lumiwing", lumiwing, LUM), ("thornback", thornback, THO), ("gloomtoad", gloomtoad, GLO)]
