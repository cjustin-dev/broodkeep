#!/usr/bin/env python3
"""Mutation runner for the SCREEN side of Decorate mode (Broodkeep, Home slices H2b and H2c, docs/home-plan.md sections 12 and 14): the button, the tray, selecting, carrying a piece, the
keys, the Feeding Mat, the creature standing still, and the wallpaper of each room (selecting a wall, its outline, the swatches, the wall of each room and of the partitions).

Works only on a copy of the repo at $VERIFY_OUT/decorate-ui-copy (never the real repo).
Each mutant is one or more exact text replaces in the copy. The copy is rebuilt, served by
`vite preview` on port 4183 (the only port this runner uses; 4180-4189 are reserved for the mutation runners), and
the browser checker decorate-browser.mjs runs with only the check ids that the mutant must break, at 360x640@2 (the mouse check at 1024x768@1).

Usage:
  python3 mutate-decorate-ui.py    --check-targets   verify each `old` occurs exactly once in the copy; print the table
  python3 mutate-decorate-ui.py                      clean baseline, every mutant, final clean rebuild
  python3 mutate-decorate-ui.py --only id1,id2       the same baselines, then only these mutants (an unknown or empty id stops the run, exit 2)

Exit codes: 0 every mutant CAUGHT and the final checks pass; 1 some mutant not caught, or a final check
failed; 2 the run stopped (copy out of sync, clean build failed its own checks, build or serve broke).

The edge cases it handles are the home runner's (mutate-home-ui.py): an `old` that occurs 0 or 2+ times is ERROR and not applied; a build that
breaks, a checker that hangs (killed by process group), a served page that is not the build just made, a server already answering on the port, a
checker exit 1 whose FAIL lines name only other ids (CAUGHT-BY-OTHER), exit 1 with no FAIL line (ERROR), exit 0 (SURVIVED); Ctrl-C or SIGTERM
restores the file under edit and stops the servers; the final clean rebuild must equal the first one and the copy's src/ must equal the real src/.
"""

import argparse
import hashlib
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
REAL = os.path.abspath(os.path.join(HERE, "..", ".."))  # the repo this file is in
# Everything this runner makes (the copy, the logs) goes to VERIFY_OUT, never into the repo.
VERIFY_OUT = os.environ.get("VERIFY_OUT") or os.path.join(tempfile.gettempdir(), "broodkeep-verify")
COPY = os.path.join(VERIFY_OUT, "decorate-ui-copy")
CHECKER = os.path.join(HERE, "decorate-browser.mjs")
LOGS = os.path.join(VERIFY_OUT, "mutate-decorate-ui-logs")
PORT = 4183  # ports 4180-4189 are the mutation runners'; this one uses 4183 only
SIZE = "360x640@2"
DESKTOP = "1024x768@1"
TALL = "390x844@3"  # (a window with spare height: the stage centres the picture in it, so a taller dock moves the picture)
BUILD_TIMEOUT = 600
BASELINE_TIMEOUT = 1500
MUTANT_TIMEOUT = 240

ALL_IDS = ["decorate-open", "decorate-still", "decorate-select", "decorate-move", "decorate-tray", "decorate-mat", "decorate-fit", "decorate-gestures", "decorate-mouse", "decorate-walls"]

STAGE = "src/ui/Stage.tsx"
BAR = "src/ui/DecorateBar.tsx"
GAME = "src/ui/game.ts"
EDIT = "src/art/homeEdit.ts"
IDLE = "src/art/idle.ts"
ROOM = "src/art/room.ts"
CSS = "src/ui/app.css"
DATA = "src/data/home.ts"


# edits: (file, old, new), applied in order. `old` must occur exactly once in that file of the copy.
# expect: check ids that must FAIL for the mutant to count as caught. kid_only: the checker runs --modes kid. size: the one window the checker runs
# at for this mutant (default SIZE, 360x640@2).
def M(id, expect, what, edits, **kw):
    return dict(id=id, expect=expect, kid_only=kw.get("kid_only", False), what=what, edits=edits, **({"size": kw["size"]} if "size" in kw else {}))


# Not mutated, because the page cannot tell the difference (each argued from the code):
#  - the `else endHold()` of the frame loop, or the early `return` of onPointerDown's Decorate branch, ALONE: each keeps the 450 ms pet hold from starting, so removing one leaves the creature
#    unpetted (the mutant below removes both).
#  - the `&& !stay` of the idle case in `updateView` (src/art/idle.ts), tried on 2026-11-25 and SURVIVED the browser check: without it `chooseNext` still starts a walk, but the `stay`
#    branch at the top of the next frame calls it off before the creature moves, so the page shows one frame of walk pose and no movement, below what a comparison of the creature's box
#    after 12 s can see. The unit mutant `still-chooses-its-next-step` asserts it directly (caught).
#  - `reseat(this.view)` in startDecor, and the `lifting.current = null` of the frame loop when the mode ends: no check starts Decorate mode with the creature between two tiles, and
#    the mode only ends by Done, which lifts every finger first.
MUTANTS = [
    # the button, Done, and the words
    M("button-stays-in-decorate-mode", ["decorate-open"], "the Decorate button is still on the picture while the mode is on",
      [(STAGE, "{inHome && !scene && !game.decor && (", "{inHome && !scene && (")]),
    M("button-too-small", ["decorate-open"], "the Decorate button is 30 CSS pixels",
      [(CSS, ".btn.decorate-btn {\n  grid-area: 1 / 1;\n  justify-self: end;\n  align-self: start;\n  z-index: 2;\n  width: 48px;\n  min-height: 48px;\n  height: 48px;",
        ".btn.decorate-btn {\n  grid-area: 1 / 1;\n  justify-self: end;\n  align-self: start;\n  z-index: 2;\n  width: 30px;\n  min-height: 30px;\n  height: 30px;")]),
    M("button-at-the-bottom", ["decorate-open"], "the Decorate button sits on the picture's bottom right corner, with the Find button",
      [(CSS, "align-self: start;\n  z-index: 2;\n  width: 48px;", "align-self: end;\n  z-index: 2;\n  width: 48px;")]),
    M("done-does-nothing", ["decorate-open"], "Done does not end the mode",
      [(BAR, "onClick={() => game.endDecor()}", "onClick={() => undefined}")]),
    M("words-ignore-the-mode", ["decorate-open"], "the picture's words do not change in Decorate mode",
      [(STAGE, 'if (game.decor && game.view.world === "home") {', "if (false) {")]),
    # selecting
    M("outline-never-drawn", ["decorate-select"], "a selected piece has no outline",
      [(STAGE, "        } else if (selected && layout[selected]) drawOutline(c, selected, layout[selected], VALID_COLOR);", "        }")]),
    M("outline-edge-not-dark", ["decorate-select"], "an outline's outer edge is white, not dark",
      [(ROOM, '[["#1a1020", 0], [color, 1], [color, 2]] as const', '[["#ffffff", 0], [color, 1], [color, 2]] as const')]),
    M("outline-one-line", ["decorate-select"], "an outline has one coloured line, not two",
      [(ROOM, '[["#1a1020", 0], [color, 1], [color, 2]] as const', '[["#1a1020", 0], [color, 1]] as const')]),
    M("tap-on-floor-keeps-the-selection", ["decorate-select"], "a tap on bare floor does not let go of the piece",
      [(STAGE, "          if (room) game.selectWall(room);\n          else game.select(null);", "          if (room) game.selectWall(room);")]),
    M("escape-does-not-let-go", ["decorate-select", "decorate-tray"], "Escape does not let go of the piece",
      [(STAGE, "        e.preventDefault();\n        game.select(null);\n        return;", "        e.preventDefault();\n        return;")]),
    M("bin-enabled-for-the-bed-kid", ["decorate-select"], "Kid Mode: the bin is not disabled with the bed selected",
      [(BAR, 'disabled={adult ? undefined : selected === null || selected === "bed"}', "disabled={adult ? undefined : selected === null}")], kid_only=True),
    M("bin-enabled-for-the-bed-adult", ["decorate-select"], "Adult Mode: the bin is not aria-disabled with the bed selected",
      [(BAR, 'aria-disabled={adult && (selected === null || selected === "bed") ? true : undefined}', "aria-disabled={adult && selected === null ? true : undefined}")]),
    M("bed-refusal-says-nothing", ["decorate-select"], "Adult Mode: the bin on the bed says nothing",
      [(BAR, '    if (selected === "bed") {\n      game.say("The bed has to stay: your creature sleeps in it.");\n      return;\n    }\n', "")]),
    # carrying
    M("refused-drop-is-written", ["decorate-move"], "a piece put down on a spot the rules refuse stays there",
      [(EDIT, "return moved(layout, held.kind, held.at);\n}", "return { ...layout, [held.kind]: held.at };\n}")]),
    M("jitter-moves-the-piece", ["decorate-move"], "a finger that stays within the slop still carries the piece, one tile, as soon as it crosses a tile line",
      [(STAGE, 'const tile = tracker.current.mode === "tap" ? null : tileUnder(e);', "const tile = tileUnder(e);")]),
    M("tap-puts-the-piece-down", ["decorate-move"], "a finger that never left the slop puts the piece down on the tile it lifted on (the piece moved by the last jitter)",
      [(STAGE, "        if (result.tap) return;\n", "")]),
    M("carry-jumps-to-the-finger", ["decorate-move"], "a carried piece's corner goes to the finger's tile, not keeping the grip",
      [(EDIT, "const at = { col: col - held.grip.col, row: row - held.grip.row };", "const at = { col, row };")]),
    M("refused-outline-white", ["decorate-move"], "a refused spot has the same white outline as an allowed one",
      [(STAGE, "carried.valid ? VALID_COLOR : INVALID_COLOR", "VALID_COLOR")]),
    M("carried-piece-left-where-it-was", ["decorate-move"], "the piece is drawn at its old place as well while it is carried",
      [(STAGE, "carried ? { ...layout, [carried.kind]: null } : undefined", "undefined")]),
    M("carried-piece-not-drawn", ["decorate-move"], "the carried piece is not drawn at the finger",
      [(STAGE, "          drawPiece(c, lookOf(game.save), carried.kind, carried.at);\n", "")]),
    M("picture-pans-under-a-carried-piece", ["decorate-move"], "the picture also pans under a finger that carries a piece",
      [(STAGE, "      return; // (the finger carries a piece: the home does not pan under it)\n", "")]),
    M("layout-never-written", ["decorate-move", "decorate-tray"], "the layout is never put into the save",
      [(GAME, "save.home = homeOf(layout, save.home?.walls);", "void homeOf(layout, save.home?.walls);")]),
    # the tray, and the keys
    M("tray-reversed", ["decorate-tray"], "the tray lists the pieces back to front",
      [(EDIT, "KINDS.filter((kind) => layout[kind] === null", "[...KINDS].reverse().filter((kind) => layout[kind] === null")]),
    M("tray-thumbnails-blank", ["decorate-tray", "decorate-mat", "decorate-fit"], "a tray button's picture is not drawn",
      [(BAR, "    drawPiece(ctx, thumbLook, kind, { col: 0, row: 0 });\n", "")]),
    M("dock-above-the-picture", ["decorate-fit"], "the dock is above the picture, so a taller tray pushes the picture down the page",
      [(CSS, ".dock {\n  min-height: 150px;", ".dock {\n  order: -1;\n  min-height: 150px;")]),
    M("bin-row-taller-than-the-nav", ["decorate-fit"], "the bin and Done are 120 pixels tall, so the dock with two pieces in the tray is taller than the one it replaces and the picture moves up",
      [(CSS, "  min-height: 64px; /* with up to five pieces in the tray", "  min-height: 120px; /* with up to five pieces in the tray")], size=TALL),
    M("stage-keeps-the-picture-low", ["decorate-fit"], "the stage puts its picture at the bottom, so a taller dock moves it up by the whole growth, not half",
      [(CSS, "  place-content: center; /* the one cell is as big as the picture", "  place-content: end center; /* the one cell is as big as the picture")], size=TALL),
    M("tray-in-eight-columns", ["decorate-fit"], "the tray has eight columns, so its buttons are 29 pixels wide",
      [(CSS, ".tray.pieces {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(5, minmax(0, 1fr));", ".tray.pieces {\n  grid-auto-flow: row;\n  grid-template-columns: repeat(8, minmax(0, 1fr));")]),
    M("piece-out-of-the-tray-not-selected", ["decorate-tray"], "a piece out of the tray is not selected",
      [(GAME, "this.setLayout({ ...layout, [kind]: at });\n    this.select(kind);\n", "this.setLayout({ ...layout, [kind]: at });\n")]),
    M("piece-out-of-the-tray-lands-far", ["decorate-tray"], "a piece out of the tray lands on the farthest spot, not the nearest",
      [(EDIT, "spots.sort((a, b) => a.d - b.d ||", "spots.sort((a, b) => b.d - a.d ||")]),
    M("piece-out-of-the-tray-ignores-the-view", ["decorate-tray"], "a piece out of the tray lands near the home's middle, wherever the picture is",
      [(STAGE, "        game.viewMiddle = { col: cam.x / TILE, row: cam.y / TILE };\n", "")]),
    M("focus-stays-on-the-tray", ["decorate-tray"], "the keyboard focus does not go back to the picture after a piece comes out",
      [(BAR, "    focusPicture(); // (the arrow keys move the piece that was just put out)\n", "")]),
    M("arrows-pan-with-a-piece-selected", ["decorate-tray", "decorate-mouse"], "the arrow keys pan the picture even with a piece selected",
      [(STAGE, "if (step && game.selectedPiece) {", "if (false && step && game.selectedPiece) {")]),
    M("arrow-steps-ignore-the-rules", ["decorate-tray"], "an arrow key moves a piece into the wall's top row",
      [(GAME, "const next = kind && from ? moved(layout, kind, { col: from.col + dcol, row: from.row + drow }) : null;", "const next = kind && from ? { ...layout, [kind]: { col: from.col + dcol, row: from.row + drow } } : null;")]),
    # the Feeding Mat
    M("mat-taken-when-not-owned", ["decorate-mat"], "a touch takes the Feeding Mat although it is not owned",
      [(STAGE, 'lift(layoutOf(game.save.home), game.save.owned.includes("feeding-mat"), tile.col, tile.row)', "lift(layoutOf(game.save.home), true, tile.col, tile.row)")]),
    M("tray-offers-the-unowned-mat", ["decorate-mat"], "the tray offers the Feeding Mat although it is not owned",
      [(EDIT, '(kind !== "mat" || matOwned));', "true);")]),
    M("mat-over-the-bowl", ["decorate-mat"], "a finger on the bowl takes the mat under it",
      [(EDIT, "[...over.filter((p) => p.solid).reverse(), ...over.filter((p) => !p.solid).reverse()][0]", "[...over.filter((p) => !p.solid).reverse(), ...over.filter((p) => p.solid).reverse()][0]")]),
    # fingers
    M("second-finger-keeps-the-piece", ["decorate-gestures"], "a second finger does not put the carried piece back",
      [(STAGE, "        lifting.current = null; // ...and puts back the piece the first was carrying: the two fingers pinch\n", "")]),
    M("cancel-keeps-the-piece", ["decorate-gestures"], "a cancelled finger leaves the piece carried",
      [(STAGE, "    if (lifting.current?.id === e.pointerId) lifting.current = null; // the piece goes back\n", "")]),
    M("creature-is-petted-in-decorate-mode", ["decorate-gestures"], "the creature is petted by a long hold while the mode is on",
      [(STAGE, "        return; // the creature is not touched while decorating\n", ""),
       (STAGE, "      else endHold(); // (a pet hold begun before Decorate mode started ends with it)\n", "")]),
    M("right-button-carries", ["decorate-mouse"], "the mouse's right button carries a piece too",
      [(STAGE, 'if (e.pointerType === "mouse" && e.button !== 0) return; // only the main mouse button', "")], size=DESKTOP),
    # the creature stands still
    M("creature-free-in-decorate-mode", ["decorate-still"], "the creature may still walk while the mode is on",
      [(GAME, "    this.view.still = true;\n", "")]),
    M("sleepy-creature-walks-to-bed", ["decorate-still"], "a sleepy creature walks to its bed in Decorate mode",
      [(IDLE, "      if (!stay) sleepHome(view, dt);", "      sleepHome(view, dt);")]),

    # a wallpaper for each room (H2c)
    M("wall-tap-selects-nothing", ["decorate-walls"], "a tap on a room's bare wall lets go instead of selecting the wall",
      [(STAGE, "          if (room) game.selectWall(room);\n          else game.select(null);", "          game.select(null);")]),
    M("floor-tap-keeps-the-wall", ["decorate-walls"], "a tap on bare floor does not let go of a selected wall",
      [(STAGE, "          if (room) game.selectWall(room);\n          else game.select(null);", "          if (room) game.selectWall(room);\n          else if (!game.selectedWall) game.select(null);")]),
    M("partition-tap-goes-right", ["decorate-walls"], "a wall tile of a partition belongs to the room on its right",
      [(DATA, "return (ROOMS.filter((r) => r.to < col).pop() as RoomSpan).id;", "return (ROOMS.find((r) => r.from > col) as RoomSpan).id;")]),
    M("wall-words-say-nothing", ["decorate-walls"], "the picture's words do not name a selected wall",
      [(STAGE, ": wall ? `The ${roomNames[wall]} wall is selected. Pick a wallpaper below.` : \"Nothing is selected.\"}`;", ": \"Nothing is selected.\"}`;")]),
    M("wall-outline-never-drawn", ["decorate-walls"], "a selected wall has no outline",
      [(STAGE, "        else if (game.selectedWall) drawWallOutline(c, game.selectedWall, VALID_COLOR);\n", "")]),
    M("wall-outline-in-the-living-room", ["decorate-walls"], "the outline is always round the living room's wall",
      [(STAGE, "drawWallOutline(c, game.selectedWall, VALID_COLOR)", "drawWallOutline(c, \"living\", VALID_COLOR)")]),
    M("wall-outline-red", ["decorate-walls"], "a selected wall's outline is the red of a refused spot",
      [(STAGE, "drawWallOutline(c, game.selectedWall, VALID_COLOR)", "drawWallOutline(c, game.selectedWall, INVALID_COLOR)")]),
    M("wall-outline-a-tile-short", ["decorate-walls"], "a selected wall's outline stops a tile before the end of the wall",
      [(ROOM, "outlineRect(ctx, span.x0, 0, span.x1 - span.x0, WALL_ROWS * TILE, color);", "outlineRect(ctx, span.x0, 0, span.x1 - span.x0 - TILE, WALL_ROWS * TILE, color);")]),
    M("select-wall-keeps-the-piece", ["decorate-walls"], "a tap on a wall leaves the piece selected too",
      [(GAME, "    this.decor.wall = room;\n    this.decor.selected = null;\n", "    this.decor.wall = room;\n")]),
    M("select-piece-keeps-the-wall", ["decorate-walls"], "a tap on a piece leaves the wall selected too",
      [(GAME, "    this.decor.selected = kind;\n    this.decor.wall = null;\n", "    this.decor.selected = kind;\n")]),
    M("swatches-keep-the-furniture-tray", ["decorate-walls"], "with a wall selected the dock shows the furniture tray instead of the wallpapers",
      [(BAR, "{room === null && tray.length > 0 && (", "{tray.length > 0 && (")]),
    M("swatches-without-the-plain-wall", ["decorate-walls"], "there is no swatch for the plain wall",
      [(BAR, "[null, ...save.owned.filter(isWallId)]", "[...save.owned.filter(isWallId)]")]),
    M("swatches-offer-the-unowned", ["decorate-walls"], "the swatches offer every wallpaper, owned or not",
      [(BAR, "[null, ...save.owned.filter(isWallId)]", "[null, ...(Object.keys(walls) as string[])]")]),
    M("swatch-names-the-living-room", ["decorate-walls"], "every swatch says it is for the living room's wall",
      [(BAR, "on the ${roomNames[room]} wall`}", "on the ${roomNames.living} wall`}")]),
    M("swatch-never-pressed", ["decorate-walls"], "no swatch is marked as the wall the room shows",
      [(BAR, "aria-pressed={wallOfRoom(save.wall, save.home, room) === id}", "aria-pressed={false}")]),
    M("swatch-pressed-by-own-entry-only", ["decorate-walls"], "a room with no entry of its own shows the plain swatch as pressed, even when the whole home has a wallpaper",
      [(BAR, "aria-pressed={wallOfRoom(save.wall, save.home, room) === id}", "aria-pressed={(save.home?.walls?.[room] ?? null) === id}")]),
    M("swatch-does-nothing", ["decorate-walls"], "a swatch does not give the room the wallpaper",
      [(BAR, "                game.setWall(room, id);\n", "")]),
    M("swatch-keeps-the-focus", ["decorate-walls"], "the keyboard focus stays on the swatch, so Escape does not let go of the wall",
      [(BAR, "                focusPicture(); // (Escape lets go of the wall)\n", "")]),
    M("swatch-always-plain", ["decorate-walls"], "every swatch is drawn in the plain wall's colours",
      [(BAR, "const c = id !== null && Object.hasOwn(walls, id) ? walls[id as keyof typeof walls] : plainWall;", "const c = plainWall;")]),
    M("swatch-colours-swapped", ["decorate-walls"], "a swatch draws the stripe colour as the wall and the wall colour as the stripe",
      [(BAR, '"--wall-base": c.base, "--wall-stripe": c.stripe, "--wall-board": c.board', '"--wall-base": c.stripe, "--wall-stripe": c.base, "--wall-board": c.board')]),
    M("swatch-baseboard-is-the-wall", ["decorate-walls"], "a swatch's baseboard is the wall's colour",
      [(BAR, '"--wall-board": c.board', '"--wall-board": c.base')]),
    M("bin-enabled-with-a-wall-kid", ["decorate-walls"], "Kid Mode: the bin is not disabled while a wall is selected",
      [(BAR, 'disabled={adult ? undefined : selected === null || selected === "bed"}', 'disabled={adult ? undefined : (selected === null && room === null) || selected === "bed"}')], kid_only=True),
    M("bin-enabled-with-a-wall-adult", ["decorate-walls"], "Adult Mode: the bin is not aria-disabled while a wall is selected",
      [(BAR, 'aria-disabled={adult && (selected === null || selected === "bed") ? true : undefined}', 'aria-disabled={adult && ((selected === null && room === null) || selected === "bed") ? true : undefined}')]),
    M("wall-paints-the-living-room-everywhere", ["decorate-walls"], "every room's wall is painted in the living room's wallpaper",
      [(ROOM, "const wall = wallColours(look.walls[span.id]);", "const wall = wallColours(look.walls.living);")]),
    M("wall-paint-not-clipped", ["decorate-walls"], "each room's wall is painted across the whole home, so the last room covers the others",
      [(ROOM, "    ctx.clip();\n", "")]),
    M("partition-in-the-room-on-the-right", ["decorate-walls"], "a partition is drawn in the wallpaper of the room on its right",
      [(ROOM, "look.walls[wallRoomOf(col, 0) as RoomId]", "look.walls[wallRoomOf(col + 1, 0) as RoomId]")]),
    M("wall-is-never-written", ["decorate-walls"], "a swatch changes nothing in the save",
      [(GAME, "      save.home = homeOf(layoutOf(save.home), { ...save.home?.walls, [room]: id });\n", "      void homeOf(layoutOf(save.home), { ...save.home?.walls, [room]: id });\n")]),
    M("wall-forgets-the-other-rooms", ["decorate-walls"], "a new wall replaces the walls of the other rooms",
      [(GAME, "{ ...save.home?.walls, [room]: id }", "{ [room]: id }")]),
    M("moving-a-piece-forgets-the-walls", ["decorate-walls"], "a piece put away takes the rooms' walls out of the save",
      [(GAME, "save.home = homeOf(layout, save.home?.walls);", "save.home = homeOf(layout);")]),
    M("reload-forgets-the-walls", ["decorate-walls"], "a saved game read back from the device has no walls",
      [(DATA, "return walls ? { pieces, walls } : { pieces };", "return { pieces };")]),
    M("select-piece-keeps-the-wall-on-a-tap", ["decorate-walls"], "a tap on a piece leaves a selected wall selected (only letting go of everything clears it), so the dock shows swatches, not the tray",
      [(GAME, "    this.decor.selected = kind;\n    this.decor.wall = null;\n", "    this.decor.selected = kind;\n    if (kind === null) this.decor.wall = null;\n")]),
    M("wall-outline-starts-a-tile-late", ["decorate-walls"], "a selected wall's outline starts a tile after the start of the wall",
      [(ROOM, "outlineRect(ctx, span.x0, 0, span.x1 - span.x0, WALL_ROWS * TILE, color);", "outlineRect(ctx, span.x0 + TILE, 0, span.x1 - span.x0 - TILE, WALL_ROWS * TILE, color);")]),
    M("swatch-on-a-shown-wall-writes", ["decorate-walls"], "a swatch for the wallpaper the room already shows is written into the save",
      [(GAME, "|| wallOfRoom(this.save.wall, this.save.home, room) === id) return false;", ") return false;")]),
    M("rooms-do-not-follow-the-whole-wall", ["decorate-walls"], "a room with no wallpaper of its own shows the plain wall, not the whole home's",
      [(DATA, "? (home.walls[room] ?? null) : whole);", "? (home.walls[room] ?? null) : null);")]),
    M("reload-forgets-the-plain-wall", ["decorate-walls"], "a saved game read back has lost the rooms with the plain wall (they follow the whole home)",
      [(DATA, "id === null || owned.includes(id)", "id !== null && owned.includes(id)")]),
]

class Infra(Exception):
    """A build, serve or fetch failed for one mutant (ERROR), or for the clean build (stop)."""


class Stop(Exception):
    """The run cannot go on: exit 2."""


ACTIVE = []  # servers started and not yet stopped; stopped in main's finally


def _on_term(signum, frame):
    raise KeyboardInterrupt


def stop_group(proc, grace=5):
    """Stop a process and anything in its process group (it was started with start_new_session)."""
    def send(sig):
        try:
            os.killpg(proc.pid, sig)
        except ProcessLookupError:
            pass
    send(signal.SIGTERM)
    try:
        proc.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        send(signal.SIGKILL)
        proc.wait()
    send(signal.SIGKILL)  # children the leader left behind (no-op when none are left)


def run_group(cmd, cwd, log_path, timeout):
    """Run cmd in its own process group. Returns the exit code, or the string 'timeout' (the group is stopped)."""
    with open(log_path, "w", encoding="utf-8") as out:
        proc = subprocess.Popen(cmd, cwd=cwd, stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        return proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        stop_group(proc)
        return "timeout"
    except KeyboardInterrupt:
        stop_group(proc)
        raise


def read_bytes(p):
    with open(p, "rb") as f:
        return f.read()


def write_bytes(p, b):
    with open(p, "wb") as f:
        f.write(b)


def read_text(p):
    with open(p, encoding="utf-8", newline="") as f:
        return f.read()


def write_text(p, s):
    with open(p, "w", encoding="utf-8", newline="") as f:
        f.write(s)


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def dist_manifest(dist):
    rows = []
    for root, _dirs, files in os.walk(dist):
        for name in files:
            p = os.path.join(root, name)
            rows.append((os.path.relpath(p, dist), sha256_bytes(read_bytes(p))))
    return sorted(rows)


def ensure_copy():
    """Make the copy the first time: the repo without node_modules, dist and .git, and node_modules symlinked to the real one."""
    if os.path.isdir(COPY):
        return
    print(f"creating copy {COPY}", flush=True)
    shutil.copytree(REAL, COPY, ignore=shutil.ignore_patterns("node_modules", "dist", ".git"))
    os.symlink(os.path.join(REAL, "node_modules"), os.path.join(COPY, "node_modules"))


# What the build reads. The copy is made once, so each of these must still equal the real one before and after a run.
BUILD_INPUTS = ["src", "public", "index.html", "vite.config.ts", "pwa-manifest.ts", "package.json"]


def copy_matches_real():
    """(True, '') when every build input of the copy equals the real one (diff -r prints nothing); else (False, the diff)."""
    ok, text = True, ""
    for name in BUILD_INPUTS:
        r = subprocess.run(["diff", "-r", os.path.join(REAL, name), os.path.join(COPY, name)], capture_output=True, text=True)
        if r.returncode != 0 or r.stdout != "":
            ok = False
            text += r.stdout + r.stderr
    return ok, text


def build(label):
    log_path = os.path.join(LOGS, f"build-{label}.log")
    rc = run_group(["npx", "vite", "build"], COPY, log_path, BUILD_TIMEOUT)
    if rc != 0:
        raise Infra(f"vite build ({label}) exit {rc}, log {log_path}")
    dist = os.path.join(COPY, "dist")
    if not os.path.isfile(os.path.join(dist, "index.html")):
        raise Infra(f"vite build ({label}) wrote no dist/index.html")
    with open(log_path, encoding="utf-8", errors="replace") as f:
        warn_lines = sum(1 for line in f if "warn" in line.lower())
    print(f"build {label}: ok ({warn_lines} output lines mention warn)", flush=True)
    return dist_manifest(dist)


def http_get(url):
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return r.read()
    except OSError as e:
        raise Infra(f"GET {url}: {e}")


class Server:
    """vite preview of the copy's dist on PORT, in its own process group."""

    def __init__(self, label):
        self.label = label
        self.base = f"http://127.0.0.1:{PORT}"
        self.proc = None

    def start(self):
        try:
            socket.create_connection(("127.0.0.1", PORT), timeout=1).close()  # any listener counts, whatever it answers to "/"
        except OSError:
            pass  # nothing listens on the port: good
        else:
            # a server already on the port (left by an earlier run killed with SIGKILL): it would answer for the new one and never be stopped
            raise Stop(f"something already answers on {self.base}: stop it first (find it with `ss -ltnp | grep {PORT}`)")
        log_path = os.path.join(LOGS, f"preview-{self.label}.log")
        out = open(log_path, "w", encoding="utf-8")
        try:
            self.proc = subprocess.Popen(
                ["npx", "vite", "preview", "--outDir", "dist", "--host", "127.0.0.1",
                 "--port", str(PORT), "--strictPort"],
                cwd=COPY, stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
        finally:
            out.close()  # the child keeps its own copy of the descriptor
        ACTIVE.append(self)
        deadline = time.time() + 60
        while time.time() < deadline:
            if self.proc.poll() is not None:
                raise Infra(f"vite preview exited early, log {log_path}")
            try:
                with urllib.request.urlopen(self.base + "/", timeout=2) as r:
                    if r.status == 200:
                        if self.proc.poll() is not None:  # our own process died while something else answered
                            raise Infra(f"vite preview exited while the port answered, log {log_path}")
                        return
            except OSError:
                pass
            time.sleep(0.5)
        raise Infra(f"vite preview not answering after 60 s, log {log_path}")

    def stop(self):
        if self.proc is not None:
            stop_group(self.proc)
            self.proc = None
        if self in ACTIVE:
            ACTIVE.remove(self)


def verify_serving(base, dist):
    """The server must serve the build in dist: the index and every js/css it names must match dist byte for byte."""
    index = http_get(base + "/")
    if index != read_bytes(os.path.join(dist, "index.html")):
        raise Infra("served / differs from dist/index.html (the server is not serving this build)")
    refs = re.findall(r'(?:src|href)="(/[^"]+\.(?:js|css))"', index.decode("utf-8", "replace"))
    if not refs:
        raise Infra("index.html names no js or css asset")
    for ref in refs:
        local = os.path.join(dist, ref.lstrip("/"))
        if not os.path.isfile(local):
            raise Infra(f"{ref} is named by index.html but is not in dist")
        if http_get(base + ref) != read_bytes(local):
            raise Infra(f"served {ref} differs from dist (the server is not serving this build)")
    return len(refs)


def run_checker(base, ids, modes, timeout, log_path, size=SIZE):
    cmd = ["node", CHECKER, "--base", base, "--only", ",".join(ids), "--sizes", size]
    if modes:
        cmd += ["--modes", modes]
    rc = run_group(cmd, HERE, log_path, timeout)
    with open(log_path, encoding="utf-8", errors="replace") as f:
        return rc, f.read()


def verdict(rc, text, expect):
    if rc == "timeout":
        return "ERROR", "checker timed out"
    if rc == 0:
        return "SURVIVED", "checker exit 0"
    fails = re.findall(r"^FAIL (\S+)", text, re.M)
    if rc == 1:
        named = "FAIL " + ",".join(sorted(set(fails)))
        if any(f in expect for f in fails):
            return "CAUGHT", named
        if fails:
            return "CAUGHT-BY-OTHER", named
        return "ERROR", "checker exit 1 with no FAIL line"
    return "ERROR", f"checker exit {rc}"


def target_rows():
    """For each mutant: (mutant, error or None, occurrence counts of each old in the copy's file)."""
    rows = []
    for m in MUTANTS:
        err, counts = None, []
        for f, old, _new in m["edits"]:
            n = read_text(os.path.join(COPY, f)).count(old)
            counts.append(n)
            if n != 1 and err is None:
                err = f"{f}: old text occurs {n} times (need exactly 1)"
        rows.append((m, err, counts))
    return rows


def apply_edits(m):
    for f, old, new in m["edits"]:
        p = os.path.join(COPY, f)
        text = read_text(p)
        n = text.count(old)
        if n != 1:
            raise Infra(f"{m['id']}: old text occurs {n} times in {f} at apply time")
        write_text(p, text.replace(old, new, 1))


def run_mutant(m):
    files = sorted({f for f, _o, _n in m["edits"]})
    originals = {f: read_bytes(os.path.join(COPY, f)) for f in files}
    server = None
    try:
        apply_edits(m)
        dist = os.path.join(COPY, "dist")
        build(m["id"])
        server = Server(m["id"])
        server.start()
        verify_serving(server.base, dist)
        modes = "kid" if m["kid_only"] else None
        log_path = os.path.join(LOGS, f"check-{m['id']}.log")
        rc, text = run_checker(server.base, m["expect"], modes, MUTANT_TIMEOUT, log_path, m.get("size", SIZE))
        return verdict(rc, text, m["expect"])
    except Infra as e:
        return "ERROR", str(e)
    finally:
        if server is not None:
            server.stop()
        for f, b in originals.items():
            write_bytes(os.path.join(COPY, f), b)


def print_targets(rows):
    print(f"{'id':<28} {'file':<22} {'expect':<16} {'modes':<6} {'old count':<10} status", flush=True)
    for m, err, counts in rows:
        files = ",".join(sorted({f.split('/')[-1] for f, _o, _n in m["edits"]}))
        status = "OK" if err is None else f"ERROR {err}"
        print(f"{m['id']:<28} {files:<22} {','.join(m['expect']):<16} {'kid' if m['kid_only'] else 'both':<6} "
              f"{','.join(str(c) for c in counts):<10} {status}", flush=True)


def coverage_problems():
    """Every check id the checker has must be named by at least one mutant, and ALL_IDS here must be the checker's own list."""
    with open(CHECKER, encoding="utf-8") as f:
        text = f.read()
    block = re.search(r"const CHECK_MODES = \{(.*?)\n\};", text, re.S)
    theirs = re.findall(r'^  "([a-z-]+)":', block.group(1), re.M) if block else []
    problems = []
    if theirs != ALL_IDS:
        problems.append(f"ALL_IDS differs from the checker's list: {sorted(set(theirs) ^ set(ALL_IDS))}")
    named = {i for m in MUTANTS for i in m["expect"]}
    problems += [f"no mutant must fail {i}" for i in ALL_IDS if i not in named]
    problems += [f"mutant {m['id']} expects {i}, which is not a check id" for m in MUTANTS for i in m["expect"] if i not in ALL_IDS]
    return problems


def run(args):
    gaps = coverage_problems()
    if gaps:
        raise Stop("coverage: " + "; ".join(gaps))
    if not args.check_targets:
        gen = subprocess.run([os.path.join(HERE, "gen-saves.sh")], capture_output=True, text=True)
        if gen.returncode != 0:
            raise Stop("gen-saves.sh failed:\n" + gen.stdout[-800:] + gen.stderr[-800:])
    ensure_copy()
    same, diff_text = copy_matches_real()
    if not same:
        raise Stop("the copy differs from the repo before the run (delete $VERIFY_OUT/decorate-ui-copy to start again):\n" + diff_text)
    rows = target_rows()
    if args.only is not None:  # (an empty value is an unknown id, not "all")
        wanted = args.only.split(",")
        unknown = [w for w in wanted if w not in {m["id"] for m, _e, _c in rows}]
        if unknown:
            raise Stop(f"--only names no mutant: {', '.join(unknown)}")
        rows = [r for r in rows if r[0]["id"] in wanted]
    if args.check_targets:
        print_targets(rows)
        bad = [m["id"] for m, err, _c in rows if err is not None]
        print(f"targets: {len(rows) - len(bad)} of {len(rows)} OK", flush=True)
        return 0 if not bad else 1

    dist = os.path.join(COPY, "dist")
    base_log = os.path.join(LOGS, "baseline.log")
    try:
        m0 = build("clean-1")
        base = Server("baseline")
        base.start()
        verify_serving(base.base, dist)
        rc, text = run_checker(base.base, ALL_IDS, None, BASELINE_TIMEOUT, base_log)
        # A mutant that names its own window (size) is only caught by its edit if the clean build passes the checks it must break in that window too.
        extra_rcs = []
        for other in sorted({m["size"] for m in MUTANTS if m.get("size", SIZE) != SIZE}) if rc == 0 else []:  # (a failed first baseline stops the run below)
            log = os.path.join(LOGS, "baseline-" + other.replace("@", "-") + ".log")
            wanted = sorted({i for m in MUTANTS if m.get("size", SIZE) == other for i in m["expect"]})  # (the ids those mutants must break: the others were built for portrait windows)
            extra_rcs.append((other, log, run_checker(base.base, wanted, None, BASELINE_TIMEOUT, log, other)[0]))
        base.stop()
    except Infra as e:
        raise Stop(f"clean build: {e}")
    last = text.strip().splitlines()[-1:] if text.strip() else ["(no output)"]
    print(f"baseline checker on the clean build: exit {rc}; last line: {last[0]}", flush=True)
    if rc != 0:
        raise Stop(f"the clean build fails its own checks: checker exit {rc} (log {base_log})")
    for other, log, other_rc in extra_rcs:
        print(f"baseline checker on the clean build at {other}: exit {other_rc}", flush=True)
        if other_rc != 0:
            raise Stop(f"the clean build fails its own checks at {other}: checker exit {other_rc} (log {log})")

    results = []
    for m, err, _c in rows:
        if err is not None:
            results.append((m, "ERROR", err))
            print(f"{m['id']}: ERROR ({err})", flush=True)
            continue
        v, detail = run_mutant(m)
        results.append((m, v, detail))
        print(f"{m['id']}: {v} ({detail})", flush=True)

    final_ok = True
    same, diff_text = copy_matches_real()
    if not same:
        final_ok = False
        print("final: the copy differs from the repo after the run:\n" + diff_text, flush=True)
    try:
        m1 = build("clean-2")
    except Infra as e:
        raise Stop(f"final clean rebuild: {e}")
    if m1 != m0:
        final_ok = False
        names = sorted(set(m0) ^ set(m1))
        print(f"final: dist differs from the first clean build; files that differ: {names}", flush=True)
    else:
        print(f"final: dist equals the first clean build ({len(m1)} files, names and hashes)", flush=True)

    print()
    print(f"{'id':<28} {'file':<22} {'expect':<16} {'verdict':<17} detail")
    for m, v, detail in results:
        files = ",".join(sorted({f.split('/')[-1] for f, _o, _n in m["edits"]}))
        print(f"{m['id']:<28} {files:<22} {','.join(m['expect']):<16} {v:<17} {detail}")
    counts = Counter(v for _m, v, _d in results)
    print(f"SUMMARY caught={counts['CAUGHT']} other={counts['CAUGHT-BY-OTHER']} "
          f"survived={counts['SURVIVED']} error={counts['ERROR']} of {len(results)}", flush=True)
    ok = counts["CAUGHT"] == len(results) and final_ok
    print("RUN OK" if ok else "RUN NOT OK", flush=True)
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description="Mutation runner for the home screen checks (H1).")
    ap.add_argument("--check-targets", action="store_true",
                    help="only verify that each old text occurs exactly once in the copy, and print the table")
    ap.add_argument("--only", help="run only these mutants (comma separated ids), after the same clean baselines; the summary counts only them")
    args = ap.parse_args()
    assert PORT in range(4180, 4190), "this runner may use only ports 4180-4189"
    os.makedirs(LOGS, exist_ok=True)
    signal.signal(signal.SIGTERM, _on_term)
    try:
        return run(args)
    except KeyboardInterrupt:
        print("interrupted: servers stopped; any file under edit was restored", flush=True)
        return 130
    except Stop as e:
        print(f"STOP: {e}", flush=True)
        return 2
    finally:
        for s in list(ACTIVE):
            s.stop()


if __name__ == "__main__":
    sys.exit(main())
