// Writes every form's pictures with each hat on them, made by the game's own code (faceSprite with a hat, art/hat.ts), for the hat contact sheet (sheet-hats.py).
// Output: $VERIFY_OUT/hats-sheet/sprites.json, an object keyed "<hat>|<picture>|<form id>" (hat is "hat-knit" and so on) with { stage, rows, palette }.
// The pictures: open0 (standing, first drawing), open1 (standing, second drawing), droop (slumped), lie0 (lying). `lie1` differs from `lie0` only by the breath.
// Run: tools/verify/run-sheet-hats.sh (it runs this and the renderer)
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "vitest";
import { forms } from "../../src/data/forms";
import { itemIds, items } from "../../src/data/shop";
import type { HatId } from "../../src/data/shop";
import { faceSprite } from "../../src/art/face";
import type { FaceKind } from "../../src/art/face";

const PICTURES: Array<{ name: string; kind: FaceKind; frame: 0 | 1 }> = [
  { name: "open0", kind: "open", frame: 0 },
  { name: "open1", kind: "open", frame: 1 },
  { name: "droop", kind: "droop", frame: 0 },
  { name: "lie0", kind: "lie0", frame: 0 },
];

test("dump the pictures with each hat", () => {
  const out = process.env.VERIFY_OUT ?? join(tmpdir(), "broodkeep-verify");
  const dir = join(out, "hats-sheet");
  mkdirSync(dir, { recursive: true });
  const hats = itemIds.filter((id) => items[id].kind === "hat") as HatId[];
  const dump: Record<string, { stage: string; rows: string[]; palette: Record<string, string> }> = {};
  for (const hat of hats) {
    for (const picture of PICTURES) {
      for (const id of Object.keys(forms)) {
        const form = forms[id]!;
        const sprite = faceSprite(form, picture.kind, picture.frame, hat);
        dump[`${hat}|${picture.name}|${id}`] = { stage: form.stage, rows: sprite.rows, palette: sprite.palette };
      }
    }
  }
  writeFileSync(join(dir, "sprites.json"), JSON.stringify(dump));
});
