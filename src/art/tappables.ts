// The things on the ground in a field (docs/adult-a3-plan.md section 17): a sparkle, a tuft that rustles, a bug and the field's own pickup. 8 x 8 pictures in the shared icon colours (art/sprites.ts);
// the bug is the Bug Catch icon. PLACEHOLDER ART, like the icons.

import type { TapKind } from "../data/tappables";
import type { FieldId } from "../game/types";
import type { View } from "./idle";
import { drawSprite, spriteCanvas } from "./pixel";
import type { Sprite } from "./pixel";
import { colors, icons } from "./sprites";

const pic = (rows: string[]): Sprite => ({ rows, palette: colors });

export const tapSprites: Record<"sparkle" | "tuft" | "acorn" | "shell" | "crystal", Sprite> = {
  sparkle: pic(["...YY...", "...YY...", "..YWWY..", "YYWWWWYY", "YYWWWWYY", "..YWWY..", "...YY...", "...YY..."]),
  tuft: pic(["........", "G...G..G", "GG..GG.G", ".GG.GGG.", ".GGGGGG.", "KGGGGGGK", ".KKKKKK.", "........"]),
  acorn: pic(["..DDDD..", ".DNNNND.", "..DDDD..", "..NYYN..", ".NYYYYN.", ".NYYYYN.", "..NYYN..", "...NN..."]),
  shell: pic(["..KKKK..", ".KPCCPK.", "KPCPPCPK", "KCPCCPCK", "KPCPPCPK", ".KPCCPK.", "..KKKK..", "...KK..."]),
  crystal: pic(["...KK...", "..KLLK..", ".KLWLBK.", ".KLLBBK.", ".KLBBBK.", "..KBBK..", "...KK...", "........"]),
};

const pickupSprite: Record<FieldId, "acorn" | "shell" | "crystal"> = { land: "acorn", water: "shell", sky: "crystal" };

// The picture for a kind (the pickup's depends on the field) and the key the cache holds it under.
export function tapPicture(kind: TapKind, field: FieldId): { sprite: Sprite; key: string } {
  if (kind === "bug") return { sprite: icons.bug, key: "icon:bug" };
  const name = kind === "sparkle" ? "sparkle" : kind === "rustle" ? "tuft" : pickupSprite[field];
  return { sprite: tapSprites[name], key: `tap:${name}` };
}

// Draw what is on the ground, each with a one pixel bob that is out of step with its neighbours'. Called by the scene after the creature and before its bubbles.
export function drawTappables(ctx: CanvasRenderingContext2D, view: View, field: FieldId): void {
  for (const p of view.tappables) {
    const { sprite, key } = tapPicture(p.kind, field);
    drawSprite(ctx, spriteCanvas(sprite, key), p.x, p.y + (Math.floor(view.clock * 2 + p.id) % 2));
  }
}
