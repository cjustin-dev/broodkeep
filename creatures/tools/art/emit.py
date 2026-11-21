"""Write the drawings into the game's form files: header comment, palette, idle and idle2.

Usage: python3 emit.py [--check] [forms dir]       (the forms dir defaults to ../../src/data/forms)

--check changes nothing and exits 1 if a form file differs from what the drawings produce. Every drawing
is also checked against the face rules first (two eyes, six W pixels, empty last row): see Canvas.check()
in bk.py. The two babies (Blip, Drip) have no drawings here and are never touched.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import stage1, stage2, stage3  # noqa: E402
from blurbs import TEXT  # noqa: E402


def drawings():
    """yield (form id, [frame 0 rows, frame 1 rows], palette) for every drawn creature"""
    for mod in (stage1, stage2, stage3):
        for name, fn, pal in mod.DESIGNS:
            frames = []
            for f in (0, 1):
                c = fn(f)
                problems = c.check()
                if problems:
                    sys.exit(f"{name} frame {f} breaks the face rules: {problems}")
                frames.append(c.rows())
            yield name, frames, pal


def new_text(name, frames, pal, src):
    """the form file's text with its header comment, palette, idle and idle2 replaced"""
    lines = src.split("\n")
    assert lines[0].startswith("// "), f"{name}: line 1 is not the header comment"
    # header comment: the new description, keeping an old "(branch hint)" if there was one
    hint = re.search(r"\(([^)]*)\)\.?$", lines[0])
    blurb = TEXT[name][0].rstrip(".")
    blurb = blurb[0].lower() + blurb[1:]
    lines[0] = f"// {name.capitalize()}: {blurb}" + (f" ({hint.group(1)})" if hint else "") + "."
    src = "\n".join(lines)

    pal_txt = ", ".join(f'{k}: "{v}"' for k, v in pal.items())
    src, n = re.subn(r"  palette: \{[^\n]*\},\n", lambda m: f"  palette: {{ {pal_txt} }},\n", src)
    assert n == 1, f"{name}: palette line not found"

    def arr(rows):
        return "[\n" + "".join(f'    "{r}",\n' for r in rows) + "  ]"

    block = (
        f"  idle: {arr(frames[0])},\n"
        f"  // Second drawing, swapped in while it stands, walks or hops: {TEXT[name][1]}.\n"
        f"  idle2: {arr(frames[1])},\n"
    )
    pattern = r"  idle: \[\n(?:    \"[^\n]*\",\n)+  \],\n(?:  //[^\n]*\n)?(?:  idle2: \[\n(?:    \"[^\n]*\",\n)+  \],\n)?"
    src, n = re.subn(pattern, lambda m: block, src)
    assert n == 1, f"{name}: idle block not found"
    return src


def main(argv):
    check = "--check" in argv
    args = [a for a in argv if a != "--check"]
    forms_dir = Path(args[0]) if args else HERE.parent.parent / "src" / "data" / "forms"
    different = []
    for name, frames, pal in list(drawings()):  # list(): every drawing is checked before any file is written
        path = forms_dir / f"{name}.ts"
        src = path.read_text()
        out = new_text(name, frames, pal, src)
        if out != src:
            different.append(name)
            if not check:
                path.write_text(out)
    verb = "differ from the drawings" if check else "rewritten"
    print(f"{len(different)} form file(s) {verb}" + (": " + ", ".join(different) if different else ""))
    return 1 if (check and different) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
