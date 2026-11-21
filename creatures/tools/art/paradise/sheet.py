"""Check the creatures of one field and draw a contact sheet (needs Pillow).

Usage: python3 sheet.py land out.png [scale=4]       (run from tools/art/paradise/, or give the path to this file)

Each creature is one row: standing, second drawing, happy, sad, eyes closed. The checks in lib.problems() run first and
every problem is printed; the sheet is drawn anyway so the problem can be looked at. Exit code 1 if anything was wrong.
"""
import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lib  # noqa: E402


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__)
    roster = importlib.import_module(argv[0]).ROSTER
    out = argv[1]
    k = int(argv[2]) if len(argv) > 2 else 4
    found = lib.validate_patterns()
    if found:  # the creature checks read the patterns, so a broken file stops here
        print("\n".join(found))
        return 1
    found = [p for cr in roster for p in lib.problems(cr)]
    print("\n".join(found) if found else f"checks: no problems in {len(roster)} creatures")
    lib.sheet(roster, k).save(out)
    print("wrote", out)
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
