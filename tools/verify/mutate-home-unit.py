#!/usr/bin/env python3
# Mutation runner for the home's pure rules (Broodkeep, Home slices H1 and H2a, docs/home-plan.md): the floor plan and the paths (src/art/home.ts), the camera
# (src/art/camera.ts), the gestures (src/ui/gesture.ts), the creature's walk in the home (src/art/idle.ts), and the saved layout (the rules in src/art/homeLayout.ts, the
# shapes in src/data/home.ts, the migrate step in src/game/state.ts, the untouched test in src/sync/sync.ts).
#
# It works on a COPY of the repo (home-unit-copy/), never on the real tree. Each mutant is one exact text replace whose `old` must occur exactly once in its
# file. Only the home test files run per mutant (tests/home, camera, gesture, idle-home, home-layout, save and cloud-sync: a mutant counts only when ITS named test fails, so the rest
# of the suite cannot change the verdict). A mutant is CAUGHT only when the test named in `expect` (a substring of its full name, in `expect_file`) fails.
#
#   python3 mutate-home-unit.py --list   checks each `old` occurs once in the real files, prints the table, runs no tests
#   python3 mutate-home-unit.py          makes a fresh copy, runs the baseline, then every mutant, then checks the copy
#   python3 mutate-home-unit.py --only id1,id2   the same, for these mutants only
#
# Exit: 0 every mutant CAUGHT; 1 some mutant not CAUGHT (or an occurrence count is not 1); 2 baseline failed, the copy differs at the end, or an unknown or empty --only id.
import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REAL = os.path.abspath(os.path.join(HERE, "..", ".."))  # the repo this file is in
# Everything this runner makes (the copy, the logs) goes to VERIFY_OUT, never into the repo.
VERIFY_OUT = os.environ.get("VERIFY_OUT") or os.path.join(tempfile.gettempdir(), "broodkeep-verify")
COPY = os.path.join(VERIFY_OUT, "home-unit-copy")
ORIG = os.path.join(VERIFY_OUT, "home-unit-orig")
OUT = os.path.join(VERIFY_OUT, "home-unit-out")
T_HOME = "tests/home.test.ts"
T_CAM = "tests/camera.test.ts"
T_GES = "tests/gesture.test.ts"
T_IDLE = "tests/idle-home.test.ts"
T_LAYOUT = "tests/home-layout.test.ts"
T_SAVE = "tests/save.test.ts"
T_SYNC = "tests/cloud-sync.test.ts"
VITEST = ["npx", "vitest", "run", T_HOME, T_CAM, T_GES, T_IDLE, T_LAYOUT, T_SAVE, T_SYNC, "--cache=false", "--fsModuleCache=false", "--reporter=json"]
TEST_FILE = T_HOME
TIMEOUT_S = 600

F_HOME = "src/art/home.ts"
F_CAM = "src/art/camera.ts"
F_GES = "src/ui/gesture.ts"
F_IDLE = "src/art/idle.ts"
F_RULES = "src/art/homeLayout.ts"
F_DATA = "src/data/home.ts"
F_STATE = "src/game/state.ts"
F_SYNC = "src/sync/sync.ts"


def mut(id, file, old, new, expect, test):
    return dict(id=id, file=file, old=old, new=new, expect=expect, expect_file=test)


# Test titles (substrings of the full test names)
WALL = "has no floor in the wall rows, none on a partition outside its doorway"
SOLID = "takes the floor under every solid piece and none under a rug or a mat"
FOOT = "is 1 tile wide up to a kid"
CENTRE = "centres a picture on its footprint"
FITS = "fits a 2-wide footprint through a doorway column and not against furniture"
BACK = "reads a position back to the anchor it was made from"
NEAREST = "moves a position that is on furniture to the nearest free anchor"
NEAREST_EDGE = "starts from the nearest tile inside the home when the position is off the edge"
START = "starts a creature in the living room, and puts the bed's front"
ROUTE = "finds a way from the bedroom to the kitchen round the table"
TWOWIDE = "walks a 2-wide creature through the doorways too"
NOPATH = "answers null for a goal where the footprint does not fit"
WANDER = "wanders to a random reachable anchor"
ROOM = "names the room of a position"
FOOD = "puts food on the side the creature faces, then the other side"
BEHIND = "draws a piece of furniture behind a creature whose feet are at or below"
SPOTS = "works out the fixed spots in game pixels"

ZOOM_OPEN = "opens at the largest whole zoom that still shows the whole 192 pixel height"
ZOOM_CAP = "never opens beyond the largest zoom"
ZOOM_MAX = "goes up to 2.5 CSS pixels per game pixel"
SNAP = "settles a pinch on the nearest whole zoom"
EDGES = "stops the view at the edges: at zoom 2"
TOPBOT = "stops at the top and bottom when the view is lower than the home"
CENTRED = "centres a home that is smaller than the view"
FINGER = "moves the home with the finger"
READ = "reads a game pixel from a point of the picture"
UNDER = "keeps the game pixel under the pinch where it was"
WALLPINCH = "stops at the wall when the pinch is over the empty space beside the home"
CLAMPZ = "keeps the point under the pinch also at a fraction, and clamps the zoom"
FRAME = "centres the camera on a box, inside the home"
INVIEW = "says whether a whole box is in view"
KEYS = "pans by a fifth of the picture (128 device pixels) and zooms by one whole step"
KEYS4 = "move up and down by a fifth of the picture, and stop at the top and the bottom"
OWNWH = "stops the view at the edges by its own width and height"
OWNREAD = "reads a game pixel, and says what is in view, with the picture's own width and height"
OWNZOOM = "opens at the zoom its height allows, and the keys step by its width"

TAP8 = "is a tap at exactly 8 pixels and not at 9"
PANFIRST = "is a pan from the moment it goes past the slop, and the first step covers the whole distance"
PANTAP = "is never a tap once it has panned"
UNKNOWN = "answers nothing for a finger it does not know"
SETTLE = "settles when the system takes a panning finger away"
PINCH2 = "make a pinch the moment the second lands, and tell the Stage to end the first finger's hold"
SCALE = "scale the picture by the change of distance around the middle"
NOTAP2 = "never tap, even when both lift on the spot"
REST = "go on as a pan with the finger left, from where it is, with no jump"
THIRD = "ignore a third finger"
REPINCH = "start a new pinch from the two that are left"
ZERO = "do not divide by zero when the two fingers land on the same point"
QUIET = "answer nothing when nothing changed"

ENTER = "drops the hearts and sparkles of the other world, and calls off a walk"
ENTER_TILE = "puts the adult on its first tile"
MEAL_WALK = "calls off a walk it was on when the meal starts"
PAUSE_ENTER = "stands still for one second when entering the home calls off a walk"
PAUSE_WOKEN = "stands still for one second when it is woken on the way to the bed"
WAKE_SIZE = "stands up in front of the bed at the size it has when it wakes"
ZOOM_FLOOR = "or below 1"
ZOOM_MIN = "and down to 1"
BEDWALK = "walks to the bed along the floor at 20 pixels a second"
CALLEDOFF = "is called off when the creature wakes before it gets there"
MEAL_SIDE = "puts the food against the side the creature faces"
MEAL_BELOW = "puts the food on the tile below when both sides are walls"
# H2a (tests/home-layout.test.ts, tests/idle-home.test.ts, tests/save.test.ts, tests/cloud-sync.test.ts)
STARTER_PIN = "puts the nine pieces where H1 put them"
R1_EDGES = "refuses a piece across a partition, off the right edge, below the home and on a column of a partition"
R1_WALL = "refuses a piece that stands on the wall when it does not stand against it"
R1_WHOLE = "refuses a piece that is not on a whole tile"
R1_ROOMEND = "lets a four wide piece start on column 6 of the bedroom"
R2_OVERLAP = "refuses a dresser on the bed and a table on the sofa"
R2_TOUCH = "lets two solid pieces touch"
R2_FLAT = "lets a rug lie under the sofa and the mat lie on the rug"
R3_REFUSE = "refuses the egg's tile, a poop tile and the grave's block"
R3_TILES = "knows exactly the protected tiles"
R4_FRONT = "refuses a piece on either of them"
R5_DOOR = "refuses to close a doorway"
R5_NARROW = "refuses a passage that a one tile wide creature can use and a two tiles wide one cannot"
R5_POCKET = "refuses a piece that cuts a pocket of one place off"
R5_OPEN = "lets pieces away, and a piece that leaves every way open"
R6_BED = "refuses a layout with no bed"
R6_REST = "lets everything else be put away"
LAYOUT_OVER = "puts the saved pieces over the starter layout and keeps the rest where it was"
LAYOUT_SAME = "gives the very same layout for the same saved home"
LAYOUT_WHOLE = "falls back to the whole starter layout when one piece breaks a rule"
LAYOUT_COPY = "does not keep a layout it was given a second time with a changed piece under the same object"
LAYOUT_ALIAS = "does not share a piece with the saved home"
LAYOUT_NONE = "is what a missing home, an empty one and a home with only the starter places mean"
COERCE_BAD = "gives nothing for anything that is not a home, and for a home with one bad entry"
COERCE_KEEP = "keeps whole numbers and null, drops kinds it does not know and anything but col and row, and ignores inherited keys"
BED_DERIVED = "derives its left edge, the top of a lying creature and the front tile from the bed's tile"
BED_MOVED = "puts a lying creature, and the tile it stands on before it lies down, at the moved bed"
FLOOR_MOVED = "makes the tiles under a moved solid piece walls and the tiles it left free"
FLOOR_TRIAL = "tries a layout out and puts the old one back, also when the trial throws"
RESEAT_COVERED = "puts a creature that a piece now covers on the nearest free anchor"
RESEAT_BETWEEN = "puts a creature that is between two tiles on the tile it is nearest, and leaves one that is in the one-line room alone"
RESEAT_CALLOFF = "calls off a walk and a meal, and the food is gone at the next frame"
RESEAT_BED = "plans the walk to a bed that has moved again from where the creature stands"
RESEAT_SLEEPER = "stands a sleeping creature in front of the bed where it is now"
SAVE_KEEP = "is not in a new game or in a save from before Decorate mode, and one with it keeps it through a round trip"
SAVE_DROP = "drops a home that is not well formed, leaves the rest of the save alone, and never throws"
UNTOUCHED = "is a new egg that nothing has happened to"

# Not mutated, because no mutant of them can change what the code does for any input the home has (each argued from the code by a reviewer, 2026-11-25):
#  - `Math.round` for `Math.ceil` in footprintOf (the sizes are 16, 20, 24, 36 and 48: the same either way); `>` for `>=` in the clamp's "view as wide as the home" test
#    (equal widths give the same centre).
#  - the `|| this.mode === "pinch"` of the settle in gesture.ts (the mode is never "pinch" when the last finger lifts: lifting the second finger of a pinch makes it a pan first);
#    the clamp of the column in roomOf (a column off either end falls through to the bedroom or the kitchen anyway); the first line of findPath, the goal's own fit check (the walk
#    tree holds only the anchors that fit, and its start, which always fits in the game's calls, so the next check refuses the same goals); the snap to the bed's front at the
#    end of sleepHome (the last step of the path is the same spot).
#  - START_TILE and BED.front take a footprint of 1 or 2 alike (both fit at both): a footprint of 1 for startAnchor or bedFront changes nothing until that data moves.
#  - `if (!fits(start.col, start.row, f))` of problemWith (a reviewer, 2026-11-25): `startAnchor` is `nearestFree`, which searches the whole home and returns the first anchor where the
#    footprint fits, so the start fits unless NO anchor fits anywhere; the nine pieces cover at most 39 solid tiles and blocking every 2-wide place takes about 90 (5 a row, 6 rows, 3 rooms).
#  - the cache's `known.clear()` at 32 entries in layoutOf and the early `if (layout === LAYOUT) return;` of useLayout: the first only bounds memory (a cleared entry is made again, the
#    same layout by value), the second only skips work that gives the same floor; no test can see either through a result.
#  - the check of findPath that the goal was reached: without it pathTo loops for ever (a hung test run, not a failed test), and the home has no part that is cut off.
# id, file, old (exact, must occur once in the file), new, expect (substring of the test's full name), expect_file
MUTANTS = [
    # the floor plan
    mut("floor-wall-row-one", F_HOME, "if (col >= cols || row < WALL_ROWS) return false;", "if (col >= cols || row < WALL_ROWS - 1) return false;", WALL, T_HOME),
    mut("floor-partition-closed", F_HOME, "if (PARTITIONS.includes(col) && !DOOR_ROWS.includes(row)) return false;", "if (PARTITIONS.includes(col)) return false;", WALL, T_HOME),
    mut("floor-partition-open", F_HOME, "if (PARTITIONS.includes(col) && !DOOR_ROWS.includes(row)) return false;", "if (false) return false;", WALL, T_HOME),
    mut("floor-rug-blocks", F_HOME, "const solid = piecesOf(layout).filter((p) => p.solid);", "const solid = piecesOf(layout);", SOLID, T_HOME),
    mut("floor-furniture-ignored", F_HOME, "return !solid.some((p) => col >= p.col", "return !solid.some((p) => false && col >= p.col", SOLID, T_HOME),
    mut("floor-furniture-one-short", F_HOME, "col < p.col + p.cols && row >= p.row && row < p.row + p.rows", "col < p.col + p.cols - 1 && row >= p.row && row < p.row + p.rows", SOLID, T_HOME),
    mut("footprint-floor", F_HOME, "Math.ceil(size / TILE)", "Math.floor(size / TILE)", FOOT, T_HOME),
    mut("fits-first-tile-only", F_HOME, "for (let i = 0; i < f; i++) if", "for (let i = 0; i < 1; i++) if", FITS, T_HOME),
    mut("fits-past-the-right-wall", F_HOME, "col < COLS && row >= 0", "col <= COLS && row >= 0", FITS, T_HOME),
    mut("anchor-not-centred", F_HOME, "x: a.col * TILE + (footprintOf(size) * TILE - size) / 2,", "x: a.col * TILE,", CENTRE, T_HOME),
    mut("anchor-feet-at-top", F_HOME, "y: (a.row + 1) * TILE };", "y: a.row * TILE };", CENTRE, T_HOME),
    mut("nearest-not-clamped", F_HOME, "const start = { col: Math.max(0, Math.min(colsOf(ROOMS_BUILT) - 1, col)), row: Math.max(0, Math.min(ROWS - 1, row)) };", "const start = { col, row };", NEAREST_EDGE, T_HOME),
    mut("nearest-order-swapped", F_HOME, "  [1, 0],\n  [-1, 0],\n", "  [-1, 0],\n  [1, 0],\n", NEAREST_EDGE, T_HOME),
    mut("nearest-ignores-footprint", F_HOME, "if (fits(here.col, here.row, f)) return here;", "if (isFloor(here.col, here.row)) return here;", NEAREST_EDGE, T_HOME),
    mut("anchor-of-no-centring", F_HOME, "Math.round((x - (f * TILE - size) / 2) / TILE)", "Math.round(x / TILE)", NEAREST, T_HOME),
    mut("anchor-of-row-off-by-one", F_HOME, "Math.round(y / TILE) - 1, f)", "Math.round(y / TILE), f)", BACK, T_HOME),
    # paths
    mut("walk-ignores-footprint", F_HOME, "if (via.has(key) || !fits(next.col, next.row, f)) continue;", "if (via.has(key) || !isFloor(next.col, next.row)) continue;", TWOWIDE, T_HOME),
    mut("walk-through-walls", F_HOME, "if (via.has(key) || !fits(next.col, next.row, f)) continue;", "if (via.has(key)) continue;", ROUTE, T_HOME),
    mut("path-not-reversed", F_HOME, "return out.reverse();", "return out;", ROUTE, T_HOME),
    mut("path-from-the-wrong-tile", F_HOME, "const via = new Map<number, number>([[startKey, startKey]]);", "const via = new Map<number, number>([[startKey + 1, startKey]]);", ROUTE, T_HOME),
    mut("wander-rounds-up", F_HOME, "Math.floor(rand() * goals.length)", "Math.ceil(rand() * goals.length)", WANDER, T_HOME),
    mut("wander-unsorted", F_HOME, ".sort((a, b) => a - b)", "", WANDER, T_HOME),
    mut("wander-may-stay", F_HOME, ".filter((k) => k !== startKey)", "", WANDER, T_HOME),
    mut("wander-last-goal-missed", F_HOME, "Math.min(goals.length - 1, Math.floor(rand() * goals.length))", "Math.min(goals.length - 2, Math.floor(rand() * goals.length))", WANDER, T_HOME),
    # rooms, food, fixed spots
    mut("room-partition-swapped", F_HOME, '? "bedroom" : "kitchen"; // (a partition column', '? "kitchen" : "bedroom"; // (a partition column', ROOM, T_HOME),
    mut("room-by-rounding", F_HOME, "const col = Math.max(0, Math.min(colsOf(ROOMS_BUILT) - 1, Math.floor(x / TILE)));", "const col = Math.max(0, Math.min(colsOf(ROOMS_BUILT) - 1, Math.round(x / TILE)));", ROOM, T_HOME),
    mut("food-facing-ignored", F_HOME, "const order = facing === 1 ? [right, left] : [left, right];", "const order = [right, left];", FOOD, T_HOME),
    mut("food-right-side-of-a-1-wide", F_HOME, "const right = { col: a.col + f, row: a.row };", "const right = { col: a.col + 1, row: a.row };", FOOD, T_HOME),
    mut("food-no-tile-below", F_HOME, "[...order, { col: a.col, row: a.row + 1 }]", "[...order]", FOOD, T_HOME),
    mut("food-own-tile-not-flagged", F_HOME, "return { tile: a, own: true };", "return { tile: a, own: false };", FOOD, T_HOME),
    mut("behind-strict", F_HOME, "(p.row + p.rows) * TILE <= feet", "(p.row + p.rows) * TILE < feet", BEHIND, T_HOME),
    mut("behind-by-top-edge", F_HOME, "(p.row + p.rows) * TILE <= feet", "p.row * TILE <= feet", BEHIND, T_HOME),
    mut("bed-lying-not-centred", F_HOME, "x: bedNow().left + BED_WIDTH / 2 - size / 2,", "x: bedNow().left,", SPOTS, T_HOME),
    mut("bed-lying-too-high", F_HOME, "y: bedNow().y + 16 - size })", "y: bedNow().y - size })", SPOTS, T_HOME),
    mut("egg-not-centred-on-its-tile", F_HOME, "x: EGG_TILE.col * TILE + (TILE - 16) / 2,", "x: EGG_TILE.col * TILE,", SPOTS, T_HOME),
    mut("dead-not-in-the-middle", F_HOME, "DEAD_TILE.col * TILE + TILE / 2", "DEAD_TILE.col * TILE", SPOTS, T_HOME),
    mut("dead-feet-at-the-top", F_HOME, "(DEAD_TILE.row + 1) * TILE;", "DEAD_TILE.row * TILE;", SPOTS, T_HOME),
    mut("poop-not-centred", F_HOME, "x: t.col * TILE + (TILE - 8) / 2,", "x: t.col * TILE,", SPOTS, T_HOME),
    mut("poop-too-low", F_HOME, "y: (t.row + 1) * TILE - 10 }", "y: (t.row + 1) * TILE - 8 }", SPOTS, T_HOME),
    # the camera: zooms
    mut("zoom-open-rounds-up", F_CAM, "Math.floor(vp.h / world.h)", "Math.ceil(vp.h / world.h)", ZOOM_OPEN, T_CAM),
    mut("zoom-open-by-width", F_CAM, "Math.floor(vp.h / world.h)", "Math.floor(vp.w / world.h)", OWNZOOM, T_CAM),
    mut("zoom-open-no-cap", F_CAM, "Math.min(maxZoom(dpr), Math.max(MIN_ZOOM, Math.floor(vp.h / world.h)))", "Math.max(MIN_ZOOM, Math.floor(vp.h / world.h))", ZOOM_CAP, T_CAM),
    mut("zoom-open-no-floor", F_CAM, "Math.max(MIN_ZOOM, Math.floor(vp.h / world.h))", "Math.floor(vp.h / world.h)", ZOOM_FLOOR, T_CAM),
    mut("zoom-max-factor", F_CAM, "Math.round(2.5 * dpr)", "Math.round(2 * dpr)", ZOOM_MAX, T_CAM),
    mut("zoom-max-floors", F_CAM, "Math.round(2.5 * dpr)", "Math.floor(2.5 * dpr)", ZOOM_MAX, T_CAM),
    mut("zoom-min-two", F_CAM, "export const MIN_ZOOM = 1;", "export const MIN_ZOOM = 2;", ZOOM_MIN, T_CAM),
    mut("snap-floors", F_CAM, "Math.max(MIN_ZOOM, Math.round(zoom)));\nexport const clampZoom", "Math.max(MIN_ZOOM, Math.floor(zoom)));\nexport const clampZoom", SNAP, T_CAM),
    mut("snap-no-cap", F_CAM, "export const snapZoom = (zoom: number, dpr: number): number => Math.min(maxZoom(dpr), Math.max(MIN_ZOOM, Math.round(zoom)));", "export const snapZoom = (zoom: number, dpr: number): number => Math.max(MIN_ZOOM, Math.round(zoom));", SNAP, T_CAM),
    mut("snap-no-floor", F_CAM, "export const snapZoom = (zoom: number, dpr: number): number => Math.min(maxZoom(dpr), Math.max(MIN_ZOOM, Math.round(zoom)));", "export const snapZoom = (zoom: number, dpr: number): number => Math.min(maxZoom(dpr), Math.round(zoom));", SNAP, T_CAM),
    mut("clamp-zoom-no-cap", F_CAM, "export const clampZoom = (zoom: number, dpr: number): number => Math.min(maxZoom(dpr), Math.max(MIN_ZOOM, zoom));", "export const clampZoom = (zoom: number, dpr: number): number => Math.max(MIN_ZOOM, zoom);", CLAMPZ, T_CAM),
    mut("clamp-zoom-no-floor", F_CAM, "export const clampZoom = (zoom: number, dpr: number): number => Math.min(maxZoom(dpr), Math.max(MIN_ZOOM, zoom));", "export const clampZoom = (zoom: number, dpr: number): number => Math.min(maxZoom(dpr), zoom);", CLAMPZ, T_CAM),
    # the camera: edges
    mut("clamp-x-no-left-wall", F_CAM, "Math.min(world.w - halfW, Math.max(halfW, cam.x))", "Math.min(world.w - halfW, cam.x)", EDGES, T_CAM),
    mut("clamp-x-no-right-wall", F_CAM, "Math.min(world.w - halfW, Math.max(halfW, cam.x))", "Math.max(halfW, cam.x)", EDGES, T_CAM),
    mut("clamp-x-narrow-view-not-centred", F_CAM, "halfW * 2 >= world.w ? world.w / 2 :", "halfW * 2 >= world.w ? halfW :", CENTRED, T_CAM),
    mut("clamp-y-no-top", F_CAM, "Math.min(world.h - halfH, Math.max(halfH, cam.y))", "Math.min(world.h - halfH, cam.y)", TOPBOT, T_CAM),
    mut("clamp-y-no-bottom", F_CAM, "Math.min(world.h - halfH, Math.max(halfH, cam.y))", "Math.max(halfH, cam.y)", TOPBOT, T_CAM),
    mut("clamp-y-short-view-not-centred", F_CAM, "halfH * 2 >= world.h ? world.h / 2 :", "halfH * 2 >= world.h ? halfH :", CENTRED, T_CAM),
    mut("clamp-height-from-width", F_CAM, "const halfH = vp.h / cam.zoom / 2;\n  const x = halfW * 2", "const halfH = vp.w / cam.zoom / 2;\n  const x = halfW * 2", OWNWH, T_CAM),
    mut("clamp-width-from-height", F_CAM, "const halfW = vp.w / cam.zoom / 2;\n  const halfH = vp.h / cam.zoom / 2;\n  const x =", "const halfW = vp.h / cam.zoom / 2;\n  const halfH = vp.h / cam.zoom / 2;\n  const x =", OWNWH, T_CAM),
    # the camera: moving
    mut("read-x-times-zoom", F_CAM, "x: cam.x + (p.x - vp.w / 2) / cam.zoom,", "x: cam.x + (p.x - vp.w / 2) * cam.zoom,", READ, T_CAM),
    mut("read-y-not-centred", F_CAM, "y: cam.y + (p.y - vp.h / 2) / cam.zoom })", "y: cam.y + p.y / cam.zoom })", OWNREAD, T_CAM),
    mut("pan-x-wrong-way", F_CAM, "x: cam.x - dx / cam.zoom,", "x: cam.x + dx / cam.zoom,", FINGER, T_CAM),
    mut("pan-y-wrong-way", F_CAM, "y: cam.y - dy / cam.zoom,", "y: cam.y + dy / cam.zoom,", FINGER, T_CAM),
    mut("pan-ignores-zoom", F_CAM, "x: cam.x - dx / cam.zoom,", "x: cam.x - dx,", FINGER, T_CAM),
    mut("pinch-x-ignores-the-new-zoom", F_CAM, "x: under.x - (at.x - vp.w / 2) / next,", "x: under.x - (at.x - vp.w / 2) / cam.zoom,", UNDER, T_CAM),
    mut("pinch-y-ignores-the-new-zoom", F_CAM, "y: under.y - (at.y - vp.h / 2) / next,", "y: under.y - (at.y - vp.h / 2) / cam.zoom,", UNDER, T_CAM),
    mut("pinch-not-clamped-to-the-walls", F_CAM, "return clampCamera({ x: under.x - (at.x - vp.w / 2) / next, y: under.y - (at.y - vp.h / 2) / next, zoom: next }, vp, world);", "return { x: under.x - (at.x - vp.w / 2) / next, y: under.y - (at.y - vp.h / 2) / next, zoom: next };", WALLPINCH, T_CAM),
    mut("pinch-zoom-not-clamped", F_CAM, "const next = clampZoom(zoom, dpr);", "const next = zoom;", CLAMPZ, T_CAM),
    mut("frame-x-left-edge", F_CAM, "x: box.x + box.w / 2, y: box.y + box.h / 2,", "x: box.x, y: box.y + box.h / 2,", FRAME, T_CAM),
    mut("frame-y-top-edge", F_CAM, "x: box.x + box.w / 2, y: box.y + box.h / 2,", "x: box.x + box.w / 2, y: box.y,", FRAME, T_CAM),
    mut("view-left-edge-out", F_CAM, "box.x >= cam.x - halfW &&", "box.x > cam.x - halfW &&", INVIEW, T_CAM),
    mut("view-right-edge-out", F_CAM, "box.x + box.w <= cam.x + halfW &&", "box.x + box.w < cam.x + halfW &&", INVIEW, T_CAM),
    mut("view-top-edge-out", F_CAM, "box.y >= cam.y - halfH &&", "box.y > cam.y - halfH &&", OWNREAD, T_CAM),
    mut("view-bottom-edge-out", F_CAM, "box.y + box.h <= cam.y + halfH;", "box.y + box.h < cam.y + halfH;", OWNREAD, T_CAM),
    mut("view-height-from-width", F_CAM, "const halfH = vp.h / cam.zoom / 2;\n  return box.x >=", "const halfH = vp.w / cam.zoom / 2;\n  return box.x >=", OWNREAD, T_CAM),
    # the camera: keys
    mut("key-step-a-quarter", F_CAM, "const step = Math.round(vp.w / 5);", "const step = Math.round(vp.w / 4);", KEYS, T_CAM),
    mut("key-step-by-height", F_CAM, "const step = Math.round(vp.w / 5);", "const step = Math.round(vp.h / 5);", OWNZOOM, T_CAM),
    mut("key-left-goes-right", F_CAM, 'if (key === "ArrowLeft") return panBy(cam, step, 0, vp, world);', 'if (key === "ArrowLeft") return panBy(cam, -step, 0, vp, world);', KEYS, T_CAM),
    mut("key-right-goes-left", F_CAM, 'if (key === "ArrowRight") return panBy(cam, -step, 0, vp, world);', 'if (key === "ArrowRight") return panBy(cam, step, 0, vp, world);', KEYS, T_CAM),
    mut("key-up-goes-down", F_CAM, 'if (key === "ArrowUp") return panBy(cam, 0, step, vp, world);', 'if (key === "ArrowUp") return panBy(cam, 0, -step, vp, world);', KEYS4, T_CAM),
    mut("key-down-goes-up", F_CAM, 'if (key === "ArrowDown") return panBy(cam, 0, -step, vp, world);', 'if (key === "ArrowDown") return panBy(cam, 0, step, vp, world);', KEYS4, T_CAM),
    mut("key-equals-not-plus", F_CAM, 'if (key === "+" || key === "=")', 'if (key === "+")', KEYS, T_CAM),
    mut("key-underscore-not-minus", F_CAM, 'if (key === "-" || key === "_")', 'if (key === "-")', KEYS, T_CAM),
    mut("key-plus-two-steps", F_CAM, "snapZoom(cam.zoom + 1, dpr)", "snapZoom(cam.zoom + 2, dpr)", KEYS, T_CAM),
    mut("key-minus-two-steps", F_CAM, "snapZoom(cam.zoom - 1, dpr)", "snapZoom(cam.zoom - 2, dpr)", KEYS, T_CAM),
    mut("key-zoom-about-the-corner", F_CAM, 'if (key === "+" || key === "=") return zoomAbout(cam, snapZoom(cam.zoom + 1, dpr), { x: vp.w / 2, y: vp.h / 2 }, vp, world, dpr);', 'if (key === "+" || key === "=") return zoomAbout(cam, snapZoom(cam.zoom + 1, dpr), { x: 0, y: 0 }, vp, world, dpr);', KEYS, T_CAM),
    mut("key-other-keys-act", F_CAM, "  return null;\n}", "  return cam;\n}", KEYS, T_CAM),
    # gestures
    mut("slop-nine", F_GES, "export const SLOP = 8;", "export const SLOP = 9;", TAP8, T_GES),
    mut("slop-seven", F_GES, "export const SLOP = 8;", "export const SLOP = 7;", TAP8, T_GES),
    mut("pan-starts-at-the-slop", F_GES, 'dist(f.start, p) > SLOP) {\n      this.mode = "pan";', 'dist(f.start, p) >= SLOP) {\n      this.mode = "pan";', TAP8, T_GES),
    mut("tap-ends-at-the-slop", F_GES, "dist(f.start, p) <= SLOP;", "dist(f.start, p) < SLOP;", TAP8, T_GES),
    mut("first-pan-step-lost", F_GES, "this.last = f.start;", "this.last = p;", PANFIRST, T_GES),
    mut("pan-step-not-remembered", F_GES, "      this.last = p;\n      return dx === 0", "      return dx === 0", PANFIRST, T_GES),
    mut("pan-no-move-still-answers", F_GES, 'return dx === 0 && dy === 0 ? [] : [{ type: "pan", dx, dy }];', 'return [{ type: "pan", dx, dy }];', PANFIRST, T_GES),
    mut("pan-then-back-is-a-tap", F_GES, '    const wasTap = this.mode === "tap" && this.down_.size === 1 &&', "    const wasTap = this.down_.size === 1 &&", PANTAP, T_GES),
    mut("pan-never-settles", F_GES, 'const settle = this.mode === "pan" || this.mode === "pinch";', 'const settle = this.mode === "pinch";', PANTAP, T_GES),
    mut("second-finger-keeps-the-hold", F_GES, "this.pinchC = middle(a.now, b.now);\n      return true;", "this.pinchC = middle(a.now, b.now);\n      return false;", PINCH2, T_GES),
    mut("second-finger-is-not-a-pinch", F_GES, 'this.mode = "pinch";\n      this.pinchD', 'this.mode = "pan";\n      this.pinchD', PINCH2, T_GES),
    mut("third-finger-ends-the-hold", F_GES, "return false; // (a third finger changes nothing", "return true; // (a third finger changes nothing", THIRD, T_GES),
    mut("pinch-scale-upside-down", F_GES, "d / this.pinchD : 1", "this.pinchD / d : 1", SCALE, T_GES),
    mut("pinch-zero-not-guarded", F_GES, "this.pinchD > 0 && d > 0 ? d / this.pinchD : 1", "d / this.pinchD", ZERO, T_GES),
    mut("pinch-distance-not-remembered", F_GES, "      this.pinchD = d;\n      this.pinchC = c;\n", "      this.pinchC = c;\n", SCALE, T_GES),
    mut("pinch-middle-not-remembered", F_GES, "      this.pinchD = d;\n      this.pinchC = c;\n", "      this.pinchD = d;\n", SCALE, T_GES),
    mut("pinch-ignores-the-middle-moving", F_GES, "dx: c.x - this.pinchC.x, dy: c.y - this.pinchC.y };", "dx: 0, dy: 0 };", SCALE, T_GES),
    mut("pinch-still-answers", F_GES, "return scale === 1 && action.dx === 0 && action.dy === 0 ? [] : [action];", "return [action];", QUIET, T_GES),
    mut("one-finger-left-jumps", F_GES, '      this.mode = "pan";\n      this.last = rest.now;', '      this.mode = "pan";\n      this.last = rest.start;', REST, T_GES),
    mut("one-finger-left-not-a-pan", F_GES, '      this.mode = "pan";\n      this.last = rest.now;', '      this.last = rest.now;', REST, T_GES),
    mut("three-then-two-keeps-the-old-baseline", F_GES, "      const [a, b] = this.firstTwo();\n      this.pinchD = dist(a.now, b.now);\n      this.pinchC = middle(a.now, b.now);\n    }\n    return [];", "    }\n    return [];", REPINCH, T_GES),
    mut("cancel-of-an-unknown-finger-acts", F_GES, "if (!this.down_.delete(id)) return [];", "this.down_.delete(id);", UNKNOWN, T_GES),
    mut("up-of-an-unknown-finger-acts", F_GES, "if (!f) return { tap: false, actions: [] };", "if (!f) return { tap: true, actions: [] };", UNKNOWN, T_GES),
    mut("move-of-an-unknown-finger-acts", F_GES, "    if (!f) return [];\n    f.now = p;\n    if (this.mode", "    if (!f) return [{ type: \"end\" }];\n    f.now = p;\n    if (this.mode", UNKNOWN, T_GES),
    # the creature's walk in the home
    mut("enter-keeps-the-effects", F_IDLE, "  view.effects = []; // (a heart or a sparkle is a place in the old world: it would float at the same numbers in the new one)\n", "", ENTER, T_IDLE),
    mut("enter-not-on-the-start-tile", F_IDLE, "const at = anchorPos(startAnchor(view.size), view.size);\n    view.x = at.x;", "const at = anchorPos({ col: 14, row: 5 }, view.size);\n    view.x = at.x;", ENTER_TILE, T_IDLE),
    mut("enter-keeps-the-walk", F_IDLE, '  if (view.pose === "walk") setPose(view, "idle", 1);\n  if (view.world === "home") {', '  if (view.world === "home") {', PAUSE_ENTER, T_IDLE),
    mut("woken-walk-keeps-walking", F_IDLE, '    view.toBed = false;\n    view.path = [];\n    if (view.pose === "walk") setPose(view, "idle", 1);', '    view.toBed = false;\n    view.path = [];', PAUSE_WOKEN, T_IDLE),
    mut("wake-keeps-the-bed-place", F_IDLE, 'if (world === "home") wakeHome(view);', "", WAKE_SIZE, T_IDLE),
    mut("bed-walk-too-fast", F_IDLE, "followPath(view, 20 * dt)", "followPath(view, 40 * dt)", BEDWALK, T_IDLE),
    mut("bed-never-lies-down", F_IDLE, "    view.y = at.y;\n    setPose(view, \"sleep\");\n  }\n}", "    view.y = at.y;\n    setPose(view, \"idle\");\n  }\n}", BEDWALK, T_IDLE),
    mut("bed-walk-restarts-each-frame", F_IDLE, "    walkTo(view, first, findPath(from, bedFront(view.size), footprintOf(view.size)) ?? []);\n    view.toBed = true;", "    walkTo(view, first, findPath(from, bedFront(view.size), footprintOf(view.size)) ?? []);", BEDWALK, T_IDLE),
    mut("woken-walk-keeps-going-toBed", F_IDLE, "    view.toBed = false;\n    view.path = [];\n    if (view.pose === \"walk\")", "    view.path = [];\n    if (view.pose === \"walk\")", CALLEDOFF, T_IDLE),
    mut("woken-walk-keeps-its-path", F_IDLE, "    view.toBed = false;\n    view.path = [];\n    if (view.pose === \"walk\")", "    view.toBed = false;\n    if (view.pose === \"walk\")", CALLEDOFF, T_IDLE),
    mut("meal-turns-the-wrong-way", F_IDLE, "view.facing = tile.col < here.col ? -1 : 1;", "view.facing = tile.col < here.col ? 1 : -1;", MEAL_SIDE, T_IDLE),
    mut("meal-on-the-wrong-side", F_IDLE, "x: x + (view.facing === 1 ? view.size : -8), y: view.y - 8 };", "x: x + (view.facing === 1 ? -8 : view.size), y: view.y - 8 };", MEAL_SIDE, T_IDLE),
    mut("meal-in-the-air", F_IDLE, "x: x + (view.facing === 1 ? view.size : -8), y: view.y - 8 };", "x: x + (view.facing === 1 ? view.size : -8), y: view.y - 16 };", MEAL_SIDE, T_IDLE),
    mut("meal-below-not-used", F_IDLE, "if (!own && tile.row !== here.row) {", "if (false) {", MEAL_BELOW, T_IDLE),
    mut("meal-below-on-the-wrong-column", F_IDLE, "x: here.col * TILE + (f * TILE - 8) / 2,", "x: here.col * TILE,", MEAL_BELOW, T_IDLE),
    mut("meal-below-too-low", F_IDLE, "y: (tile.row + 1) * TILE - 8 };", "y: (tile.row + 1) * TILE };", MEAL_BELOW, T_IDLE),
    # the saved layout (H2a): the six rules, what a saved home means, the bed that follows its piece, the floor in force, the creature put on a free tile
    mut("starter-sofa-one-tile-over", F_DATA, "sofa: { col: 13, row: 1 },", "sofa: { col: 14, row: 1 },", STARTER_PIN, T_LAYOUT),
    mut("starter-bowl-one-row-up", F_DATA, "bowl: { col: 24, row: 5 },", "bowl: { col: 24, row: 4 },", STARTER_PIN, T_LAYOUT),
    mut("rule6-bed-away-allowed", F_RULES, 'if (layout.bed === null) return "the bed is put away";', "if (layout.bed === null) return null;", R6_BED, T_LAYOUT),
    mut("rule1-not-whole-tile", F_RULES, "if (!Number.isInteger(p.col) || !Number.isInteger(p.row))", "if (false)", R1_WHOLE, T_LAYOUT),
    mut("rule1-room-end-off-by-one", F_RULES, "p.col + p.cols - 1 <= r.to", "p.col + p.cols <= r.to", R1_ROOMEND, T_LAYOUT),
    mut("rule1-room-start-over-the-partition", F_RULES, "p.col >= r.from &&", "p.col >= r.from - 1 &&", R1_EDGES, T_LAYOUT),
    mut("rule1-below-the-home", F_RULES, "if (p.row + p.rows > ROWS)", "if (p.row + p.rows > ROWS + 1)", R1_EDGES, T_LAYOUT),
    mut("rule1-wall-for-all", F_RULES, "p.row < (SHAPES[p.kind].wall ? 1 : WALL_ROWS)", "p.row < 1", R1_WALL, T_LAYOUT),
    mut("rule1-wall-piece-on-row-zero", F_RULES, "p.row < (SHAPES[p.kind].wall ? 1 : WALL_ROWS)", "p.row < (SHAPES[p.kind].wall ? 0 : WALL_ROWS)", R1_WALL, T_LAYOUT),
    mut("rule2-overlap-columns-one-sided", F_RULES, "if (a.col < b.col + b.cols && b.col < a.col + a.cols &&", "if (a.col < b.col + b.cols &&", R2_TOUCH, T_LAYOUT),
    mut("rule2-overlap-rows-one-sided", F_RULES, "a.row < b.row + b.rows && b.row < a.row + a.rows) return", "a.row < b.row + b.rows) return", R2_TOUCH, T_LAYOUT),
    mut("rule2-touch-on-the-left-is-overlap", F_RULES, "if (a.col < b.col + b.cols &&", "if (a.col <= b.col + b.cols &&", R2_TOUCH, T_LAYOUT),
    mut("rule2-touch-on-the-right-is-overlap", F_RULES, "b.col < a.col + a.cols &&", "b.col <= a.col + a.cols &&", R2_TOUCH, T_LAYOUT),
    mut("rule2-touch-below-is-overlap", F_RULES, "b.row < a.row + a.rows) return", "b.row <= a.row + a.rows) return", R2_TOUCH, T_LAYOUT),
    mut("rule2-touch-above-is-overlap", F_RULES, "a.row < b.row + b.rows &&", "a.row <= b.row + b.rows &&", R2_TOUCH, T_LAYOUT),
    mut("rule2-overlap-never", F_RULES, "&& a.row < b.row + b.rows && b.row < a.row + a.rows) return", "&& false) return", R2_OVERLAP, T_LAYOUT),
    mut("rule2-flat-pieces-count", F_RULES, "const solid = placed.filter((p) => p.solid);", "const solid = placed;", R2_FLAT, T_LAYOUT),
    mut("rule3-protected-ignored", F_RULES, "if (isProtected(col, row)) return", "if (false) return", R3_REFUSE, T_LAYOUT),
    mut("rule3-only-the-first-column", F_RULES, "for (let col = a.col; col < a.col + a.cols; col++) {", "for (let col = a.col; col < a.col + 1; col++) {", R3_REFUSE, T_LAYOUT),
    mut("rule3-only-the-first-row", F_RULES, "for (let row = a.row; row < a.row + a.rows; row++) if (isProtected", "for (let row = a.row; row < a.row + 1; row++) if (isProtected", R3_REFUSE, T_LAYOUT),
    mut("protected-egg-row-off", F_DATA, "(col === EGG_TILE.col && row === EGG_TILE.row) ||", "(col === EGG_TILE.col && row === EGG_TILE.row + 1) ||", R3_TILES, T_LAYOUT),
    mut("protected-poop-ignored", F_DATA, "POOP_TILES.some((t) => t.col === col && t.row === row) ||", "false ||", R3_TILES, T_LAYOUT),
    mut("protected-grave-one-column-short", F_DATA, "col < MEMORIAL.col + MEMORIAL.cols &&", "col < MEMORIAL.col + MEMORIAL.cols - 1 &&", R3_TILES, T_LAYOUT),
    mut("protected-grave-one-row-short", F_DATA, "row < MEMORIAL.row + MEMORIAL.rows)", "row < MEMORIAL.row + MEMORIAL.rows - 1)", R3_TILES, T_LAYOUT),
    mut("rule4-front-one-tile", F_RULES, "if (!isFloor(bed.col + 1, bed.row + 2) || !isFloor(bed.col + 2, bed.row + 2))", "if (!isFloor(bed.col + 1, bed.row + 2))", R4_FRONT, T_LAYOUT),
    mut("rule4-front-other-tile", F_RULES, "if (!isFloor(bed.col + 1, bed.row + 2) || !isFloor(bed.col + 2, bed.row + 2))", "if (!isFloor(bed.col + 2, bed.row + 2))", R4_FRONT, T_LAYOUT),
    mut("rule5-one-wide-only", F_RULES, "for (const size of [24, 48]) {", "for (const size of [24]) {", R5_NARROW, T_LAYOUT),
    mut("rule5-two-wide-only", F_RULES, "for (const size of [24, 48]) {", "for (const size of [48]) {", R5_DOOR, T_LAYOUT),
    mut("rule5-reach-never-checked", F_RULES, "if (fits(col, row, f) && !reached.has(row * COLS + col))", "if (fits(col, row, f) && false)", R5_DOOR, T_LAYOUT),
    mut("rule5-every-tile-must-be-reached", F_RULES, "if (fits(col, row, f) && !reached.has(row * COLS + col))", "if (!reached.has(row * COLS + col))", R5_OPEN, T_LAYOUT),
    mut("layout-half-kept", F_RULES, "const result = problemWith(layout, rooms) === null ? layout : (mended(layout, rooms) ?? STARTER);", "const result = layout;", LAYOUT_WHOLE, T_LAYOUT),
    mut("layout-never-kept", F_RULES, "const result = problemWith(layout, rooms) === null ? layout : (mended(layout, rooms) ?? STARTER);", "const result = STARTER;", LAYOUT_OVER, T_LAYOUT),
    mut("layout-put-away-reads-as-starter", F_RULES, "layout[kind] = at === null ? null :", "layout[kind] = at === null ? STARTER[kind] :", LAYOUT_OVER, T_LAYOUT),
    mut("layout-new-object-each-time", F_RULES, "if (kept) return kept;", "if (false) return kept;", LAYOUT_SAME, T_LAYOUT),
    mut("layout-one-key-for-all", F_RULES, "const key = `${rooms}:${JSON.stringify(home.pieces)}`;", 'const key = "home";', LAYOUT_COPY, T_LAYOUT),
    mut("layout-shares-the-saved-cell", F_RULES, "{ col: at.col, row: at.row };\n  }", "at;\n  }", LAYOUT_ALIAS, T_LAYOUT),
    mut("layout-no-home-copies-starter", F_RULES, "if (!home) return STARTER;", "if (!home) return { ...STARTER };", LAYOUT_NONE, T_LAYOUT),
    mut("coerce-array-is-a-home", F_DATA, "if (typeof value !== \"object\" || value === null || Array.isArray(value)) return undefined;\n  const raw =", "if (typeof value !== \"object\" || value === null) return undefined;\n  const raw =", COERCE_BAD, T_LAYOUT),
    mut("coerce-pieces-array-is-a-home", F_DATA, "if (typeof raw !== \"object\" || raw === null || Array.isArray(raw)) return undefined;", "if (typeof raw !== \"object\" || raw === null) return undefined;", COERCE_BAD, T_LAYOUT),
    mut("coerce-inherited-key-counts", F_DATA, "if (!Object.hasOwn(raw, kind)) continue;", "if (!(kind in raw)) continue;", COERCE_KEEP, T_LAYOUT),
    mut("coerce-bad-entry-skipped", F_DATA, "else return undefined;\n  }\n  const walls = coerceWalls(", "else continue;\n  }\n  const walls = coerceWalls(", COERCE_BAD, T_LAYOUT),
    mut("coerce-keeps-extra-keys", F_DATA, "pieces[kind] = { col: at.col, row: at.row };", "pieces[kind] = at;", COERCE_KEEP, T_LAYOUT),
    mut("coerce-fraction-is-a-tile", F_DATA, "Number.isInteger((value as Placement).col) && Number.isInteger((value as Placement).row)", "Number.isFinite((value as Placement).col) && Number.isFinite((value as Placement).row)", COERCE_BAD, T_LAYOUT),
    mut("bed-left-not-8-in", F_DATA, "left: at.col * TILE + 8,", "left: at.col * TILE,", BED_DERIVED, T_LAYOUT),
    mut("bed-top-one-off", F_DATA, "y: at.row * TILE + 23,", "y: at.row * TILE + 24,", BED_DERIVED, T_LAYOUT),
    mut("bed-front-one-row-up", F_DATA, "front: { col: at.col + 1, row: at.row + 2 } }", "front: { col: at.col + 1, row: at.row + 1 } }", BED_DERIVED, T_LAYOUT),
    mut("bed-front-column-of-the-bed", F_DATA, "front: { col: at.col + 1, row: at.row + 2 } }", "front: { col: at.col, row: at.row + 2 } }", BED_DERIVED, T_LAYOUT),
    mut("bed-walk-to-the-starter-front", F_HOME, "nearestFree(bedNow().front.col, bedNow().front.row,", "nearestFree(bedOf(STARTER.bed as Placement).front.col, bedOf(STARTER.bed as Placement).front.row,", BED_MOVED, T_LAYOUT),
    mut("bed-lying-on-the-starter-bed", F_HOME, "({ x: bedNow().left + BED_WIDTH / 2 - size / 2, y: bedNow().y + 16 - size });", "({ x: bedOf(STARTER.bed as Placement).left + BED_WIDTH / 2 - size / 2, y: bedOf(STARTER.bed as Placement).y + 16 - size });", BED_MOVED, T_LAYOUT),
    mut("floor-not-remade-for-a-new-layout", F_HOME, "  LAYOUT = layout;\n  ROOMS_BUILT = rooms;\n  FLOOR = floorOf(layout, rooms);", "  LAYOUT = layout;\n  ROOMS_BUILT = rooms;", FLOOR_MOVED, T_LAYOUT),
    mut("layout-not-put-back-after-a-trial", F_HOME, "    return fn();\n  } finally {\n    useLayout(before, roomsBefore);\n  }", "    return fn();\n  } finally {\n  }", FLOOR_TRIAL, T_LAYOUT),
    mut("layout-not-put-back-after-a-throw", F_HOME, "  try {\n    return fn();\n  } finally {\n    useLayout(before, roomsBefore);\n  }", "  const result = fn();\n  useLayout(before, roomsBefore);\n  return result;", FLOOR_TRIAL, T_LAYOUT),
    mut("reseat-in-the-one-line-room", F_IDLE, 'if (view.world !== "home") return;\n  view.path = [];\n  view.toBed = false;', 'view.path = [];\n  view.toBed = false;', RESEAT_BETWEEN, T_IDLE),
    mut("reseat-keeps-the-path", F_IDLE, "  view.path = [];\n  view.toBed = false;\n  const at = anchorPos(view.pose", "  view.toBed = false;\n  const at = anchorPos(view.pose", RESEAT_CALLOFF, T_IDLE),
    mut("reseat-keeps-toBed", F_IDLE, "  view.path = [];\n  view.toBed = false;\n  const at = anchorPos(view.pose", "  view.path = [];\n  const at = anchorPos(view.pose", RESEAT_BED, T_IDLE),
    mut("reseat-sleeper-not-moved-to-the-bed", F_IDLE, 'view.pose === "sleep" ? bedFront(view.size) : anchorOf(view.x, view.y, view.size)', "anchorOf(view.x, view.y, view.size)", RESEAT_SLEEPER, T_IDLE),
    mut("reseat-sleeper-always-to-the-bed", F_IDLE, 'view.pose === "sleep" ? bedFront(view.size) : anchorOf(view.x, view.y, view.size)', "bedFront(view.size)", RESEAT_COVERED, T_IDLE),
    mut("reseat-meal-goes-on", F_IDLE, 'if (view.pose === "walk" || view.pose === "eat") setPose(view, "idle", 1);\n}', 'if (view.pose === "walk") setPose(view, "idle", 1);\n}', RESEAT_CALLOFF, T_IDLE),
    mut("reseat-walk-goes-on", F_IDLE, 'if (view.pose === "walk" || view.pose === "eat") setPose(view, "idle", 1);\n}', 'if (view.pose === "eat") setPose(view, "idle", 1);\n}', RESEAT_CALLOFF, T_IDLE),
    mut("reseat-stays-where-it-was", F_IDLE, "  view.x = at.x;\n  view.y = at.y;\n  if (view.pose === \"walk\" ||", "  if (view.pose === \"walk\" ||", RESEAT_COVERED, T_IDLE),
    mut("reseat-stops-without-a-pause", F_IDLE, 'if (view.pose === "walk" || view.pose === "eat") setPose(view, "idle", 1);\n}', 'if (view.pose === "walk" || view.pose === "eat") setPose(view, "idle");\n}', RESEAT_CALLOFF, T_IDLE),
    mut("save-keeps-a-bad-home", F_STATE, "  const home = coerceHome(value.home);\n  if (home) value.home = ownedWalls(home, value.owned);\n  else delete value.home;", "  const home = value.home;\n  if (home) value.home = ownedWalls(home, value.owned);\n  else delete value.home;", SAVE_DROP, T_SAVE),
    mut("save-drops-a-good-home", F_STATE, "  if (home) value.home = ownedWalls(home, value.owned);\n  else delete value.home;", "  delete value.home;", SAVE_KEEP, T_SAVE),
    mut("save-adds-an-empty-home", F_STATE, "  if (home) value.home = ownedWalls(home, value.owned);\n  else delete value.home;", "  value.home = home ? ownedWalls(home, value.owned) : { pieces: {} };", SAVE_KEEP, T_SAVE),
    mut("untouched-ignores-the-home", F_SYNC, "    save.home === undefined &&\n", "", UNTOUCHED, T_SYNC),
    mut("meal-keeps-the-walk", F_IDLE, "  view.y = at.y;\n  view.path = [];\n  const { tile, own } = foodTile", "  view.y = at.y;\n  const { tile, own } = foodTile", MEAL_WALK, T_IDLE),
]


def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def write(path, text):
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def short(text, width):
    text = " ".join(str(text).split())
    return text if len(text) <= width else text[: width - 3] + "..."


def short_file(name):
    for marker in ("/tests/", "/src/"):
        if marker in name:
            return name[name.index(marker) + 1 :]
    return name


def top_ignore(directory, names):
    if os.path.abspath(directory) == REAL:
        return {n for n in names if n in ("node_modules", "dist", ".git")}
    return set()


def fresh_copy():
    if os.path.lexists(COPY):
        shutil.rmtree(COPY)  # a symlink is removed, not followed
    shutil.copytree(REAL, COPY, ignore=top_ignore, symlinks=True)
    os.symlink(os.path.join(REAL, "node_modules"), os.path.join(COPY, "node_modules"))


def run_vitest(name):
    jpath = os.path.join(OUT, name + ".json")
    if os.path.exists(jpath):
        os.remove(jpath)
    with open(os.path.join(OUT, name + ".log"), "w", encoding="utf-8") as log:
        # its own process group, so a timeout or Ctrl-C kills vitest's node children too, not only the npx parent
        proc = subprocess.Popen(VITEST + ["--outputFile=" + jpath], cwd=COPY, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            rc = proc.wait(timeout=TIMEOUT_S)
        except BaseException:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()
            raise
    data = None
    if os.path.exists(jpath):
        with open(jpath, encoding="utf-8") as f:
            data = json.load(f)
    return rc, data


def failures(data):
    out = []
    for tr in data.get("testResults", []):
        got = False
        for a in tr.get("assertionResults", []):
            if a.get("status") == "failed":
                out.append((short_file(tr["name"]), a["fullName"]))
                got = True
        if tr.get("status") == "failed" and not got:
            out.append((short_file(tr["name"]), "<suite failed to load>"))
    return out


def verdict(m, rc, data):
    if data is None:
        return "ERROR", "no JSON report (exit %s)" % rc, []
    fails = failures(data)
    if rc not in (0, 1):
        return "ERROR", "vitest exit %s" % rc, fails
    if (rc == 1) != bool(fails):
        return "ERROR", "exit %s does not match %d failed tests" % (rc, len(fails)), fails
    want_file = m.get("expect_file", TEST_FILE)  # a mutant in a helper shared with startNewEgg is guarded by that test, in another file
    matched = [f for f in fails if f[0].endswith(want_file) and m["expect"] in f[1]]
    if matched:
        return "CAUGHT", "", fails
    if fails:
        return "CAUGHT-BY-OTHER", "named test did not fail", fails
    return "SURVIVED", "", fails


def occurrences(m):
    return read(os.path.join(REAL, m["file"])).count(m["old"])


def do_list():
    bad = 0
    print("%-32s %5s  %-22s %-22s %s" % ("id", "count", "file", "expect_file", "expect (title substring)"))
    for m in MUTANTS:
        n = occurrences(m)
        if n != 1:
            bad += 1
        print("%-32s %5d  %-22s %-22s %s" % (m["id"], n, m["file"], m.get("expect_file", TEST_FILE).split("/")[-1], m["expect"]))
    print("LIST total=%d bad=%d" % (len(MUTANTS), bad))
    return 0 if bad == 0 else 1


def do_run():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(ORIG, exist_ok=True)
    if not os.path.isdir(os.path.join(REAL, "node_modules")):
        print("node_modules missing in the real repo; cannot run vitest")
        return 2
    fresh_copy()
    print("copy made: %s (node_modules symlinked to the real repo)" % COPY)

    # Baseline: no mutation, must pass.
    try:
        rc, data = run_vitest("baseline")
    except Exception as e:  # a hung or missing vitest is a stop (exit 2), not a traceback
        print("BASELINE FAILED to run: %r" % (e,))
        return 2
    if rc != 0 or data is None or data.get("numFailedTests") != 0 or data.get("numPassedTests", 0) == 0:
        print("BASELINE FAILED: exit %s, failed %s, passed %s (see %s)" % (rc, data and data.get("numFailedTests"), data and data.get("numPassedTests"), os.path.join(OUT, "baseline.log")))
        return 2
    print("BASELINE ok: exit 0, %d tests passed" % data["numPassedTests"])

    results = []
    fatal = None
    for m in MUTANTS:
        path = os.path.join(COPY, m["file"])
        orig = read(path)
        n = orig.count(m["old"])
        if n != 1:
            results.append((m, "ERROR", "old occurs %d times in the copy" % n, []))
            continue
        write(os.path.join(ORIG, m["file"].replace("/", "__")), orig)
        try:
            write(path, orig.replace(m["old"], m["new"], 1))
            rc, data = run_vitest(m["id"])
            v, note, fails = verdict(m, rc, data)
        except Exception as e:  # a runner problem is an ERROR, the loop goes on
            v, note, fails = "ERROR", "runner exception: %r" % (e,), []
        finally:
            write(path, orig)
            if read(path) != orig:
                fatal = "restore failed for " + m["file"]
        results.append((m, v, note, fails))
        print("%-32s %s" % (m["id"], v), flush=True)
        if fatal:
            break
    if fatal:
        print("FATAL:", fatal)
        return 2

    # The copy must match the real tree again.
    same = True
    for sub in ("src", "tests"):
        d = subprocess.run(["diff", "-r", os.path.join(REAL, sub), os.path.join(COPY, sub)], capture_output=True, text=True)
        if d.returncode != 0:
            same = False
            print("DIFF in %s (rc %d):\n%s" % (sub, d.returncode, d.stdout[:2000] + d.stderr[:500]))
    print("COPY CHECK: src and tests %s the real repo" % ("identical to" if same else "DIFFER from"))

    print()
    print("%-32s %-17s %-55s %s" % ("id", "verdict", "expect (title substring)", "failed titles (shortened)"))
    counts = {"CAUGHT": 0, "CAUGHT-BY-OTHER": 0, "SURVIVED": 0, "ERROR": 0}
    for m, v, note, fails in results:
        counts[v] += 1
        shown = [short(t, 70) for _, t in fails[:2]]
        if len(fails) > 2:
            shown.append("(+%d more)" % (len(fails) - 2))
        extra = (" [" + note + "]") if note else ""
        print("%-32s %-17s %-55s %s%s" % (m["id"], v, short(m["expect"], 55), " | ".join(shown), extra))
    print()
    print("SUMMARY caught=%d other=%d survived=%d error=%d of %d" % (counts["CAUGHT"], counts["CAUGHT-BY-OTHER"], counts["SURVIVED"], counts["ERROR"], len(MUTANTS)))
    if not same:
        return 2
    return 0 if counts["CAUGHT"] == len(MUTANTS) else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--list", action="store_true", help="check the occurrences and print the mutants; run no tests")
    ap.add_argument("--only", help="run only these mutants (comma separated ids), after the same baseline; the summary counts only them (an unknown or empty id stops the run, exit 2)")
    args = ap.parse_args()
    if args.only is not None:
        ids = [i.strip() for i in args.only.split(",")]
        known = {m["id"] for m in MUTANTS}
        bad = [i for i in ids if i not in known]  # (an empty id is never known)
        if bad:
            print("unknown or empty mutant id: %s" % bad)
            return 2
        MUTANTS[:] = [m for m in MUTANTS if m["id"] in ids]
    if args.list:
        return do_list()
    return do_run()


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda signum, frame: sys.exit(143))  # SystemExit runs the restore in each `finally`
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("interrupted: the copy's current file was restored in its finally")
        sys.exit(130)
