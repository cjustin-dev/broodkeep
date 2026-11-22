// The field pictures: every field a creature can be taken to has one, and each is a clean 128 x 128 grid.
import { describe, expect, it } from "vitest";
import { fieldPictures } from "../src/art/field";
import { ROOM } from "../src/art/layout";
import { fieldIds, openFieldIds } from "../src/data/fields";

describe("field pictures", () => {
  it("has one for every open field, or a creature taken there would be shown in the room", () => {
    for (const id of openFieldIds) expect(fieldPictures[id], id).toBeDefined();
  });

  it("gives each field its own picture", () => {
    const looks = Object.values(fieldPictures).map((p) => p!.rows.join("|"));
    expect(looks.length).toBeGreaterThan(1);
    expect(new Set(looks).size).toBe(looks.length);
  });

  it("has none for a field that is still locked, and none for an unknown one", () => {
    for (const id of fieldIds) if (!openFieldIds.includes(id)) expect(fieldPictures[id], id).toBeUndefined();
    expect(Object.keys(fieldPictures).every((id) => (fieldIds as string[]).includes(id))).toBe(true);
  });

  for (const [id, picture] of Object.entries(fieldPictures)) {
    it(`${id} is the size of the room, solid, and only uses palette letters`, () => {
      expect(picture!.rows).toHaveLength(ROOM.h);
      for (const row of picture!.rows) {
        expect(row).toHaveLength(ROOM.w);
        for (const letter of row) {
          expect(letter, "a field is solid: no see-through pixels").not.toBe(".");
          expect(picture!.palette[letter], `letter ${letter}`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
      // no colour is listed that the picture never uses (the emitter writes only the colours it found)
      const used = new Set(picture!.rows.join(""));
      expect(Object.keys(picture!.palette).sort()).toEqual([...used].sort());
    });
  }
});
