// The picture behind a creature that is out in a field. Each field is one 128 x 128 picture (made by tools/art/paradise and written to
// field-<name>.ts by emit_ts.py). A field with no picture yet (Water and Sky wait for their slices) has none, and the room shows instead.

import type { FieldId } from "../game/types";
import { landField } from "./field-land";
import { spriteCanvas } from "./pixel";
import type { Sprite } from "./pixel";

export const fieldPictures: Partial<Record<FieldId, Sprite>> = { land: landField };

// Draw the field's picture over the whole canvas. Returns false (and draws nothing) when the field has no picture.
export function drawField(ctx: CanvasRenderingContext2D, id: FieldId): boolean {
  const picture = fieldPictures[id];
  if (!picture) return false;
  ctx.drawImage(spriteCanvas(picture, `field:${id}`), 0, 0);
  return true;
}
