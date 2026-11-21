"""Writes tests/fixtures/face-hashes.json: a fingerprint of every stamped face (each Land creature, each look, each drawing) as the
Python library makes it. tests/face.test.ts stamps the same pictures in TypeScript and compares, so the two engines cannot drift.

Usage:
  python3 face_hashes.py            write the file
  python3 face_hashes.py --check    write nothing; exit 1 if the file differs
"""
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import land_all  # noqa: E402
import lib  # noqa: E402

OUT = HERE.parents[2] / "tests" / "fixtures" / "face-hashes.json"


def hashes():
    out = {}
    for cr in land_all.ROSTER:
        for look in lib.LOOKS:
            for frame in (0, 1):
                rows = cr.look(look, frame).rows()
                out[f"{cr.id}/{look}/{frame}"] = hashlib.sha256("\n".join(rows).encode()).hexdigest()[:16]
    return out


def main(argv):
    if argv not in ([], ["--check"]):
        print(__doc__)
        return 2
    text = json.dumps(hashes(), indent=1) + "\n"
    if argv == ["--check"]:
        same = OUT.exists() and OUT.read_text() == text
        print("face hashes match" if same else "face hashes are stale")
        return 0 if same else 1
    OUT.write_text(text)
    print(f"wrote {OUT} ({text.count(chr(10)) - 2} pictures)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
