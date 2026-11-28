#!/usr/bin/env python3
"""Mutation runner for the SCREEN side of the Book recipes and the Perfect star (Broodkeep, A4.4, docs/adult-a4-plan.md section 14): the Adult Book's cells and cards, the Next line, the count
line, the stars, Kid Mode's untouched Book, the completed lives' star, the Forecast's Perfect line, the star awarded when a creature grows up in the running game and kept when it retires, the
loader's star list after a reload, and the layout of all of it. The rules and the words (the lifetime count, who earns the star, each recipe) are the unit runner's: mutate-recipes-unit.py.

Works only on a copy of the repo at $VERIFY_OUT/recipes-ui-copy (never the real repo).
Each mutant is one or more exact text replaces in the copy. The copy is rebuilt, served by
`vite preview` on port 4187 (the only port this runner uses; 4180-4189 are reserved for the mutation runners), and
the browser checker recipes-browser.mjs runs with only the check ids that the mutant must break, at the window size the mutant names.

Usage:
  python3 mutate-recipes-ui.py    --check-targets   verify each `old` occurs exactly once in the copy; print the table
  python3 mutate-recipes-ui.py    --check-targets --equivalents   the same for the EQUIVALENT list (a displaced one is only found this way)
  python3 mutate-recipes-ui.py                      clean baseline, every mutant, final clean rebuild
  python3 mutate-recipes-ui.py    --equivalents     clean baseline, then the EQUIVALENT mutants: every check must still pass (SURVIVED) for the run to be OK

Exit codes: 0 every mutant CAUGHT (with --equivalents: every one SURVIVED) and the final checks pass; 1 some mutant not as expected, or a final check
failed; 2 the run stopped (copy out of sync, clean build failed its own checks, build or serve broke).

Edge cases this runner handles (each is a path in the code, not only a happy path):
  - an `old` text that occurs 0 or 2+ times: that mutant is ERROR and is not applied
  - a build that breaks for one mutant: ERROR for that mutant, the file is restored
  - a checker that hangs: killed by process group after 4 minutes, ERROR
  - a served page that is not the build just made: the run refuses to count that mutant (ERROR)
  - a server already answering on the port before ours starts: the run stops (exit 2) instead of testing the wrong server
  - the clean-build baseline runs every check id at ONE size (360x640@2, both modes); a mutant runs only the ids it must break, at its own size: the
    all-sizes proof for the clean build is a separate full run of recipes-browser.mjs (run-recipes.sh). A mutant that names another size (320x568@2) first gets a
    clean run of its ids at that size; a failure there stops the run (exit 2) before any mutant is counted
  - Ctrl-C or SIGTERM mid-mutant: the file under edit is restored in a `finally`, servers are stopped
  - a checker exit 1 whose FAIL lines name only other ids: CAUGHT-BY-OTHER, not CAUGHT
  - a checker exit 1 with no FAIL line at all: ERROR (a crash that looks like a failure)
  - a checker exit 0 on a mutant: SURVIVED
  - the final clean rebuild must match the first clean build (file names and hashes) and the copy's
    src/ must match the real src/ (diff -r empty), else the run is not OK
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
COPY = os.path.join(VERIFY_OUT, "recipes-ui-copy")
CHECKER = os.path.join(HERE, "recipes-browser.mjs")
LOGS = os.path.join(VERIFY_OUT, "mutate-recipes-ui-logs")
PORT = 4187  # ports 4180-4189 are the mutation runners'; this one uses 4187 only
SIZE = "360x640@2"
SMALL = "320x568@2"  # the window where a text or a star that is too wide for its box shows
BUILD_TIMEOUT = 600
BASELINE_TIMEOUT = 1500
MUTANT_TIMEOUT = 240

ALL_IDS = [
    "adult-cells", "card-toggle", "card-keys", "card-texts", "card-done", "next-line", "count-line", "stars-show", "kid-markup", "lives-star",
    "forecast-line", "grow-star", "retire-star", "reload-keeps", "layout-cells", "layout-cards", "card-touch", "layout-forecast",
]

BOOK = "src/ui/BookPanel.tsx"
FC = "src/ui/ForecastPanel.tsx"
CSS = "src/ui/app.css"
SIM = "src/game/sim.ts"
PERF = "src/game/perfect.ts"
STATE = "src/game/state.ts"
ACT = "src/game/actions.ts"

# Text the cell, the card and the lives list share with other lines is anchored on a neighbour.
CELL_LABEL = "aria-label={cellLabel(found, form.name, perfect)} aria-expanded={open}"
COUNT_STAR = "{adult && stars > 0 && perfectText.count(stars)}"
LIFE_STAR_IF = "{adult && life.perfect === true && ("
FC_KEPT_IF = '{f.perfect?.kind === "kept" && ('
STRIP_CSS = ".book-star-strip {\n  width: 100%;\n  height: 16px;"
CARD_BLOCK = (
    "                {adult && open !== null && row.includes(open) && (\n"
    "                  <RecipeCard id={open} found={found.has(open)} perfect={found.has(open) && starred.has(open)} raised={found} onClose={() => close(open)} />\n"
    "                )}\n"
)
UL_OPEN = '              <>\n                <ul class={row.length === 1 ? "book-row single" : "book-row"}>\n'
LEAD_STAR_ON_SUB = (
    '        <p class="fc-name">{form.name}</p>\n'
    '        <p class="fc-sub">\n'
    "          {sub}\n"
    '          {f.perfect?.kind === "kept" && (\n'
    '            <span class="fc-star" role="img" aria-label={perfectText.star}>\n'
    '              <Icon name="star" px={16} />\n'
    "            </span>\n"
    "          )}\n"
    "        </p>\n"
)
LEAD_STAR_ON_NAME = (
    '        <p class="fc-name">\n'
    "          {form.name}\n"
    '          {f.perfect?.kind === "kept" && (\n'
    '            <span class="fc-star" role="img" aria-label={perfectText.star}>\n'
    '              <Icon name="star" px={16} />\n'
    "            </span>\n"
    "          )}\n"
    "        </p>\n"
    '        <p class="fc-sub">{sub}</p>\n'
)
ADULT_LI_OPEN = '<li class="book-cell book-cell-adult" data-found={found} data-open={open}>'
ADULT_LI_CLOSE = "      </button>\n    </li>\n  );\n}\n\n// The card under a cell's row"


# edits: (file, old, new), applied in order. `old` must occur exactly once in that file of the copy.
# expect: check ids, one of which must FAIL for the mutant to count as caught. kid_only: the checker runs --modes kid. size: the window the checker runs at.
def m(id, expect, what, edits, size="360x640@2", kid_only=False):
    return dict(id=id, expect=expect, kid_only=kid_only, size=size, what=what, edits=edits)


MUTANTS = [
    # the cells
    m("cell-name-starts-with-a-verb", ["adult-cells"], "the cell's button name starts with Open, not the word the cell shows", [(BOOK, CELL_LABEL, "aria-label={`Open ${cellLabel(found, form.name, perfect)}`} aria-expanded={open}")]),
    m("cell-is-pressed-too", ["adult-cells"], "the cell has aria-pressed as well as aria-expanded", [(BOOK, "aria-expanded={open} aria-controls={open ? cardId(id) : undefined}", "aria-expanded={open} aria-pressed={open} aria-controls={open ? cardId(id) : undefined}")]),
    m("unraised-name-is-the-creatures", ["adult-cells"], "an unraised cell's button is named with the creature's name", [(BOOK, CELL_LABEL, 'aria-label={`${form.name}, ${found ? "raised" : "not raised yet"}`} aria-expanded={open}')]),
    m("cell-is-a-div", ["adult-cells"], "the cell is a div inside the row's list, not an li", [(BOOK, ADULT_LI_OPEN, '<div class="book-cell book-cell-adult" data-found={found} data-open={open}>'), (BOOK, ADULT_LI_CLOSE, "      </button>\n    </div>\n  );\n}\n\n// The card under a cell's row")]),
    # opening and closing a card
    m("cell-has-no-aria-controls", ["card-toggle"], "an open cell does not say which card it controls", [(BOOK, " aria-controls={open ? cardId(id) : undefined}", "")]),
    m("card-id-is-not-the-controlled-one", ["card-toggle"], "the card's id is not the one the cell controls", [(BOOK, 'id={cardId(id)} role="group" aria-label={name}', 'id={`${cardId(id)}-card`} role="group" aria-label={name}')]),
    m("focus-not-given-back", ["card-toggle"], "Close does not put focus back on the cell", [(BOOK, "    document.getElementById(cellId(id))?.focus(); // the button stays on screen, so focus goes back to it\n", "")]),
    m("second-tap-keeps-the-card-open", ["card-toggle"], "a second tap on the same cell does not close its card", [(BOOK, "onToggle={() => setOpen(open === id ? null : id)}", "onToggle={() => setOpen(id)}")]),
    m("close-button-does-nothing", ["card-toggle"], "the card's Close button does nothing", [(BOOK, "onClose={() => close(open)}", "onClose={() => undefined}")]),
    m("card-has-no-role", ["card-toggle", "card-texts"], "the card is not a group", [(BOOK, 'id={cardId(id)} role="group" aria-label={name}', "id={cardId(id)} aria-label={name}")]),
    m("card-above-its-row", ["card-toggle", "layout-cards"], "the card is drawn above its row, not under it", [(BOOK, CARD_BLOCK, ""), (BOOK, UL_OPEN, "              <>\n" + CARD_BLOCK + '                <ul class={row.length === 1 ? "book-row single" : "book-row"}>\n')]),
    m("cell-out-of-the-tab-order", ["card-keys"], "the cell cannot be reached with Tab", [(BOOK, 'class="book-cell-btn" id={cellId(id)}', 'class="book-cell-btn" tabIndex={-1} id={cellId(id)}')]),
    m("cell-opens-on-pointerdown", ["card-keys"], "the cell opens on pointerdown, so the keyboard (which sends a click) opens nothing", [(BOOK, "onClick={onToggle}>", "onPointerDown={onToggle}>")]),
    # the card's words
    m("steps-in-reverse", ["card-texts"], "the steps are listed last first", [(BOOK, "{recipe.steps.map((step) => (", "{[...recipe.steps].reverse().map((step) => (")]),
    m("note-not-shown", ["card-texts"], "the care note under the steps is never drawn", [(BOOK, '{recipe?.note && <p class="hint">{recipe.note}</p>}', '{false && <p class="hint">{recipe?.note}</p>}')]),
    m("unraised-card-names-the-creature", ["card-texts"], "an unraised creature's card says its name", [(BOOK, "  const name = found ? form.name : cardText.notRaised;", "  const name = form.name;")]),
    m("raised-word-missing", ["card-texts"], "a raised creature's card does not say Raised", [(BOOK, '{found && <p class="hint">{cardText.raised}</p>}', '{false && <p class="hint">{cardText.raised}</p>}')]),
    m("close-button-says-done", ["card-texts"], "the card's button says Done, not Close", [(BOOK, "        {cardText.close}\n      </button>", "        {cardText.done}\n      </button>")]),
    # the Done marks
    m("done-mark-never-shown", ["card-done"], "no step ever shows the Done pill", [(BOOK, '{raised.has(step.formId) && <span class="book-step-done">{cardText.done}</span>}', '{false && <span class="book-step-done">{cardText.done}</span>}')]),
    m("done-flag-inverted", ["card-done"], "a step's done flag is the opposite of the pill", [(BOOK, "data-done={raised.has(step.formId)}", "data-done={!raised.has(step.formId)}")]),
    m("nothing-counts-as-done", ["card-done"], "the card is given an empty set of raised forms", [(BOOK, "raised={found} onClose", "raised={new Set<string>()} onClose")]),
    # the Next line
    m("next-line-never-shown", ["next-line"], "the Next line is not drawn", [(BOOK, "{adult && <NextLine found={found} />}", "{false && <NextLine found={found} />}")]),
    m("next-lead-missing", ["next-line"], "the Next line has no Next to find lead", [(BOOK, "<strong>{nextText.lead}</strong>", "<strong />")]),
    m("next-step-missing", ["next-line"], "the Next line names the creature but not the step", [(BOOK, "{next.label}. {next.step}", "{next.label}.")]),
    m("next-all-raised-is-blank", ["next-line"], "a full Book's Next line is empty", [(BOOK, "        nextText.all\n", "        null\n")]),
    # the count line
    m("count-star-with-none", ["count-line"], "the count line says 0 with a Perfect star", [(BOOK, COUNT_STAR, "{adult && perfectText.count(stars)}")]),
    m("count-star-in-kid-mode", ["count-line"], "Kid Mode's count line carries the star count", [(BOOK, COUNT_STAR, "{stars > 0 && perfectText.count(stars)}")], kid_only=True),
    m("count-counts-every-listed-star", ["count-line"], "the count is the length of the saved list, not the stars of forms in the Book", [(BOOK, "const stars = bookIds().filter((id) => found.has(id) && starred.has(id)).length;", "const stars = starred.size;")]),
    m("count-counts-unraised-stars", ["count-line"], "the count includes a star for a form that is not raised", [(BOOK, ".filter((id) => found.has(id) && starred.has(id)).length", ".filter((id) => starred.has(id)).length")]),
    # the stars on the cells
    m("unraised-cell-gets-the-star", ["stars-show"], "a form with a star that is not raised wears it", [(BOOK, "perfect={found.has(id) && starred.has(id)} open={open === id}", "perfect={starred.has(id)} open={open === id}")]),
    m("star-not-in-the-name", ["stars-show"], "the cell's button name never says Perfect star", [(BOOK, CELL_LABEL, "aria-label={cellLabel(found, form.name, false)} aria-expanded={open}")]),
    m("card-star-line-missing", ["stars-show"], "the open card does not say Perfect star", [(BOOK, '          {perfect && (\n            <p class="book-card-star">', '          {false && (\n            <p class="book-card-star">')]),
    m("strip-never-draws-the-star", ["stars-show", "layout-cells"], "the strip never draws a star", [(BOOK, '{perfect && <Icon name="star" px={16} />}</span>', '{false && <Icon name="star" px={16} />}</span>')]),
    # Kid Mode
    m("kid-cell-gets-a-button", ["kid-markup"], "a Kid cell holds a button", [(BOOK, '<li class="book-cell" data-found={found}>', '<li class="book-cell" data-found={found}><button class="book-cell-btn" aria-label="x" />')], kid_only=True),
    m("kid-hint-removed", ["kid-markup"], "a Kid cell's hint is never drawn", [(BOOK, '{!found && hint && <span class="book-hint">{hint}</span>}', '{false && <span class="book-hint">{hint}</span>}')], kid_only=True),
    m("kid-mode-gets-the-adult-book", ["kid-markup", "count-line", "lives-star"], "every Book is the Adult one", [(BOOK, "const adult = isAdultMode(game.save);", "const adult = true;")], kid_only=True),
    # the completed lives
    m("life-star-in-kid-mode", ["lives-star"], "a Kid Mode completed life wears the star", [(BOOK, LIFE_STAR_IF, "{life.perfect === true && (")], kid_only=True),
    m("life-star-never", ["lives-star"], "no completed life wears the star", [(BOOK, LIFE_STAR_IF, "{false && (")]),
    m("life-star-on-every-life", ["lives-star"], "every completed life wears the star", [(BOOK, LIFE_STAR_IF, "{adult && (")]),
    m("life-star-has-no-name", ["lives-star"], "the life's star has no accessible name", [(BOOK, '<span class="book-life-star" role="img" aria-label={perfectText.star}>', '<span class="book-life-star" role="img">')]),
    # the Forecast
    m("perfect-line-never-shown", ["forecast-line", "layout-forecast"], "the Forecast never draws the Perfect line", [(FC, "{f.perfect && (", "{false && (")]),
    m("perfect-line-kind-always-on", ["forecast-line"], "the Perfect line's kind is always on", [(FC, "data-kind={f.perfect.kind}", 'data-kind="on"')]),
    m("lead-star-never", ["forecast-line", "layout-forecast"], "the star by the tier is never drawn", [(FC, FC_KEPT_IF, "{false && (")]),
    m("lead-star-for-every-line", ["forecast-line"], "the star by the tier is drawn for a creature that has not earned it yet", [(FC, FC_KEPT_IF, "{f.perfect && (")]),
    m("on-line-gets-a-star", ["forecast-line"], "the still-possible line wears a star like an earned one", [(FC, '{f.perfect.kind === "kept" && <Icon name="star" px={16} />}', '<Icon name="star" px={16} />')]),
    m("perfect-text-missing", ["forecast-line"], "the Perfect line has its star but no words", [(FC, "<span>{f.perfect.text}</span>", "<span />")]),
    m("lead-star-back-on-the-name", ["layout-forecast", "forecast-line"], "the star sits beside the name again, where it fell to its own line at 320", [(FC, LEAD_STAR_ON_SUB, LEAD_STAR_ON_NAME)], size=SMALL),
    m("perfect-line-does-not-wrap", ["layout-forecast"], "the Perfect line's words run on one line past the window", [(CSS, ".fc-perfect {\n  display: flex;\n  align-items: flex-start;", ".fc-perfect {\n  display: flex;\n  white-space: nowrap;\n  align-items: flex-start;")], size=SMALL),
    # the star awarded in the running game, kept on retiring, and kept by the loader
    m("grow-up-awards-nothing", ["grow-star"], "growing up never awards the star", [(SIM, "  if (perfect) awardPerfect(save, c, t);\n", "")]),
    m("grow-up-ignores-one-mistake", ["grow-star"], "a life with one earlier mistake still earns it", [(PERF, "return adultTier(nextFormId) === 1 && lifeMistakes(c) === 0;", "return adultTier(nextFormId) === 1 && lifeMistakes(c) !== null;")]),
    m("grow-up-unknown-life-is-clean", ["grow-star"], "a life with no record earns it", [(PERF, "return isCount(c.pastMistakes) ? c.pastMistakes + now : null;", "return isCount(c.pastMistakes) ? c.pastMistakes + now : now;")]),
    m("star-list-read-once", ["grow-star"], "the open Book reads the star list once, when it opens", [(BOOK, "const starred = new Set(game.save.perfect);", "const [starred] = useState(() => new Set(game.save.perfect));")]),
    m("award-without-the-list", ["grow-star"], "the Book's star list is not written", [(PERF, "  if (!save.perfect.includes(c.formId)) save.perfect.push(c.formId);\n", "")]),
    m("award-without-the-log-line", ["grow-star"], "no log line says it grew up as a perfect run", [(PERF, "  logEvent(save, t, `${formOf(c.formId)?.name ?? \"A creature\"} grew up as a perfect run`);\n", "")]),
    m("award-without-the-creatures-flag", ["grow-star"], "the creature itself never carries the flag", [(PERF, "  c.perfect = true;\n", "")]),
    m("retire-drops-the-flag", ["retire-star"], "the completed life does not carry the star", [(ACT, ", ...(c.perfect === true ? { perfect: true as const } : {})", "")]),
    m("retire-flags-every-life", ["retire-star"], "every completed life carries the star", [(ACT, "...(c.perfect === true ? { perfect: true as const } : {})", "perfect: true as const")]),
    m("retire-empties-the-star-list", ["retire-star"], "retiring empties the Book's star list", [(ACT, "  save.retired.push({ formId: c.formId", "  save.perfect = [];\n  save.retired.push({ formId: c.formId")]),
    m("loader-drops-the-star-list", ["reload-keeps"], "the loader empties the star list", [(STATE, "  value.perfect = Array.isArray(value.perfect) ?", "  value.perfect = false && Array.isArray(value.perfect) ?")]),
    m("loader-keeps-only-raised-forms", ["reload-keeps"], "the loader drops a star for a form that is not in the Book", [(STATE, 'typeof id === "string" && Object.prototype.hasOwnProperty.call(forms, id)', 'typeof id === "string" && Object.prototype.hasOwnProperty.call(forms, id) && (value.book as string[]).includes(id)')]),
    # the layout of the cells
    m("strip-is-short", ["layout-cells"], "the star strip is 8 px high", [(CSS, STRIP_CSS, ".book-star-strip {\n  width: 100%;\n  height: 8px;")]),
    m("strip-over-the-face", ["layout-cells"], "the star strip is pulled down over the face", [(CSS, STRIP_CSS, ".book-star-strip {\n  width: 100%;\n  height: 16px;\n  margin-bottom: -16px;")]),
    m("name-too-big-for-the-cell", ["layout-cells"], "the name is 1.6rem and does not wrap", [(CSS, STRIP_CSS, ".book-cell-btn .book-name {\n  font-size: 1.6rem;\n  white-space: nowrap;\n}\n\n" + STRIP_CSS)], size=SMALL),
    m("face-off-the-middle", ["layout-cells"], "the face sits against the left of its cell", [(CSS, "  align-items: center;\n  justify-content: flex-end;\n  gap: 4px;\n  font: inherit;", "  align-items: flex-start;\n  justify-content: flex-end;\n  gap: 4px;\n  font: inherit;")]),
    m("cell-is-narrow", ["layout-cells"], "the cell's button is 40 px wide", [(CSS, ".book-cell-btn {\n  flex: 1;\n  width: 100%;", ".book-cell-btn {\n  flex: 1;\n  width: 40px;")]),
    # the layout of the cards
    m("card-not-brought-into-view", ["layout-cards"], "opening a card does not scroll the panel to it", [(BOOK, '    if (open) document.getElementById(cardId(open))?.scrollIntoView?.({ block: "nearest" });', "    if (open) void open;")]),
    m("step-text-does-not-wrap", ["layout-cards"], "a step's words run on one line past the card", [(CSS, ".book-step {\n  font-size: 0.95rem;", ".book-step {\n  white-space: nowrap;\n  font-size: 0.95rem;")], size=SMALL),
    m("card-scrolls-to-the-top", ["layout-cards"], "opening a card scrolls it to the top of the panel even when it was already in view", [(BOOK, 'scrollIntoView?.({ block: "nearest" })', 'scrollIntoView?.({ block: "start" })')]),
    # The next two apply the same edits as the layout-cards mutants above them, on purpose: mouse and finger reach the same click handler, so no edit is touch-only. They exist so that
    # card-touch (a touch window, a finger scroll, real taps) is itself shown to fail on its own assertion.
    m("card-not-brought-into-view-for-a-finger", ["card-touch"], "opening a card by a finger does not scroll the panel to it", [(BOOK, '    if (open) document.getElementById(cardId(open))?.scrollIntoView?.({ block: "nearest" });', "    if (open) void open;")]),
    m("card-scrolls-to-the-top-for-a-finger", ["card-touch"], "opening a card by a finger scrolls it to the top of the panel even when it was already in view", [(BOOK, 'scrollIntoView?.({ block: "nearest" })', 'scrollIntoView?.({ block: "start" })')]),
    m("close-button-is-short", ["layout-cards"], "the card's Close button is 30 px high", [(CSS, ".btn.book-card-close {\n  min-height: 44px;", ".btn.book-card-close {\n  min-height: 30px;\n  height: 30px;")]),
    m("card-sticks-out-of-the-window", ["layout-cards"], "the card is pulled 40 px past the window's edge", [(CSS, ".book-card {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding: 14px;", ".book-card {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  margin-right: -40px;\n  padding: 14px;")]),
]

# Equivalent (not in the counted list: each is argued from the code and `--equivalents` applies each one, exiting 0 only when every check still passes, which is the proof that the argument holds):
#  - `scrollIntoView?.(`: the question mark only guards a browser with no such method (a test environment); every browser the checks run in has it.
# Not mutated and NOT argued equivalent (the checks cannot see them; they are looked at on the contact sheet and listed in docs/known-issues.md, section Book recipes and the Perfect star, A4.4):
#  - the unraised card's picture being the dark shape and not the face (no check reads a picture), the open cell's ring (`data-open` only paints an inset ring), the focus ring.
EQUIVALENT = [
    m("scroll-into-view-is-not-optional", ["layout-cards"], "the call to scrollIntoView is not guarded", [(BOOK, ".scrollIntoView?.({", ".scrollIntoView({")]),
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


def run_checker(base, ids, modes, timeout, log_path, size):
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
        rc, text = run_checker(server.base, m["expect"], modes, MUTANT_TIMEOUT, log_path, m["size"])
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
    theirs = re.findall(r'^  "([a-z0-9-]+)":', block.group(1), re.M) if block else []
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
    if args.equivalents:
        MUTANTS[:] = EQUIVALENT  # (the coverage check above ran on the real list)
    if not args.check_targets:
        gen = subprocess.run([os.path.join(HERE, "gen-saves-recipes.sh")], capture_output=True, text=True)
        if gen.returncode != 0:
            raise Stop("gen-saves-recipes.sh failed:\n" + gen.stdout[-800:] + gen.stderr[-800:])
    ensure_copy()
    same, diff_text = copy_matches_real()
    if not same:
        raise Stop("the copy differs from the repo before the run (delete $VERIFY_OUT/recipes-ui-copy to start again):\n" + diff_text)
    rows = target_rows()
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
        rc, text = run_checker(base.base, ALL_IDS, None, BASELINE_TIMEOUT, base_log, SIZE)
        # a mutant that names its own window gets a clean run in that window first: a clean build that fails there would make every mutant of that window read as caught
        own = {}
        for mu in MUTANTS:
            if mu["size"] != SIZE:
                own.setdefault(mu["size"], set()).update(mu["expect"])
        own_runs = []
        for size, ids in sorted(own.items()):
            own_log = os.path.join(LOGS, f"baseline-{size}.log")
            own_runs.append((size, run_checker(base.base, sorted(ids), None, MUTANT_TIMEOUT, own_log, size)[0], own_log))
        base.stop()
    except Infra as e:
        raise Stop(f"clean build: {e}")
    last = text.strip().splitlines()[-1:] if text.strip() else ["(no output)"]
    print(f"baseline checker on the clean build: exit {rc}; last line: {last[0]}", flush=True)
    if rc != 0:
        raise Stop(f"the clean build fails its own checks: checker exit {rc} (log {base_log})")
    for size, own_rc, own_log in own_runs:
        print(f"clean build at {size} (the window some mutants name): exit {own_rc}", flush=True)
        if own_rc != 0:
            raise Stop(f"the clean build fails its checks at {size}: checker exit {own_rc} (log {own_log})")

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
    ok = (counts["SURVIVED"] if args.equivalents else counts["CAUGHT"]) == len(results) and final_ok
    print("RUN OK" if ok else "RUN NOT OK", flush=True)
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser(description="Mutation runner for the Book recipe and Perfect star screen checks (A4.4).")
    ap.add_argument("--check-targets", action="store_true",
                    help="only verify that each old text occurs exactly once in the copy, and print the table")
    ap.add_argument("--equivalents", action="store_true", help="run the EQUIVALENT mutants instead: each must leave every check passing (SURVIVED)")
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
