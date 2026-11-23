// Faces, lying down, drooping, eating and feeling: the pictures the game shows, and which one it picks.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { blanketBox, faceSprite, isWide as isWideKind, lieDown, pickFace, stampFace } from "../src/art/face";
import type { FaceKind, Look } from "../src/art/face";
import { BLINK, MEAL, YAWN, blinking, createView, eyesClosed, foodLeft, frameOf, poseOffsets, snackCut, startEating, triggerPose, updateView } from "../src/art/idle";
import { ROOM, walkMaxX, wideWidth } from "../src/art/layout";
import { makeRng } from "../src/game/rng";
import { forms } from "../src/data/forms";
import patterns from "../src/data/face-patterns.json";
import { moodOf } from "../src/art/scene";
import { makeCreature } from "../src/game/sim";
import { newSave } from "../src/game/state";
import hashes from "./fixtures/face-hashes.json";

const all = Object.values(forms);
const awake = { asleep: false, sad: false, sick: false };
const LOOKS: Look[] = ["open", "half", "closed", "up", "happy", "yawn", "sad"];
const WIDE_KINDS: FaceKind[] = ["droop", "droopSad", "droopClosed", "droopYawn", "droopHappy", "lie0", "lie1"];
const FACE_ONLY = "IWAPUM"; // letters only a stamped face uses (a body never does)
const eyeSize = patterns.styles as unknown as Record<string, { eye: { w: number; h: number }; eyes: Record<string, string[]>; looks: Record<string, { eyes: string }> }>;
const styleOf = (stage: string): string => (stage === "baby" ? "kid" : stage);

const contentWidth = (rows: string[]): number => {
  const cols = rows.flatMap((row) => [row.search(/[^.]/), row.search(/[^.]\.*$/)]).filter((x) => x >= 0);
  return Math.max(...cols) - Math.min(...cols) + 1;
};
const filledRows = (rows: string[]): number[] => rows.flatMap((row, y) => (/[^.]/.test(row) ? [y] : []));
const count = (rows: string[], letter: string): number => rows.join("").split(letter).length - 1;
const faceCounts = (rows: string[]): number[] => [...FACE_ONLY].map((letter) => count(rows, letter));

describe("stamped faces", () => {
  it("match the Python library picture for picture (every Land creature, every look, both drawings)", () => {
    const fixture = hashes as Record<string, string>;
    const wrong: string[] = [];
    for (const form of all) {
      for (const look of LOOKS) {
        for (const frame of [0, 1] as const) {
          const rows = stampFace(frame === 1 ? form.idle2 : form.idle, form.stage, form.face, look).rows;
          const hash = createHash("sha256").update(rows.join("\n")).digest("hex").slice(0, 16);
          if (hash !== fixture[`${form.id}/${look}/${frame}`]) wrong.push(`${form.id}/${look}/${frame}`);
        }
      }
    }
    expect(wrong).toEqual([]);
    expect(Object.keys(fixture)).toHaveLength(all.length * LOOKS.length * 2);
  });

  for (const form of all) {
    it(`${form.id}: every look lands on body pixels only and has two matching eyes (the Python parity test checks every pixel)`, () => {
      const { w } = eyeSize[styleOf(form.stage)]!.eye;
      for (const body of [form.idle, form.idle2]) {
        for (const look of LOOKS) {
          const { rows } = stampFace(body, form.stage, form.face, look);
          expect(rows, look).toHaveLength(body.length);
          rows.forEach((row, y) => {
            expect(row, `${look} row ${y}`).toHaveLength(body.length);
            for (let x = 0; x < row.length; x++) {
              if (row[x] !== body[y]![x]) expect(body[y]![x], `${look} at ${x},${y} is on the body`).not.toBe(".");
            }
          });
          // The right eye is the left one moved over (a translation, not a reflection). Only the pattern's own pixels are
          // compared: its "." cells show the body, which differs from one side to the other.
          const size = body[0]!.length;
          const style = eyeSize[styleOf(form.stage)]!;
          const pattern = style.eyes[style.looks[look].eyes]!;
          pattern.forEach((prow, dy) =>
            [...prow].forEach((letter, dx) => {
              if (letter === ".") return;
              expect(rows[form.face.y + dy]![form.face.x + dx], `${look} left eye at ${dx},${dy}`).toBe(letter);
              expect(rows[form.face.y + dy]![size - w - form.face.x + dx], `${look} right eye at ${dx},${dy}`).toBe(letter);
            }),
          );
        }
      }
    });

    it(`${form.id}: the open and happy faces differ, and the first and second drawing share one face`, () => {
      const open = stampFace(form.idle, form.stage, form.face, "open").rows;
      expect(stampFace(form.idle, form.stage, form.face, "happy").rows).not.toEqual(open);
      expect(faceCounts(open)).toEqual(faceCounts(stampFace(form.idle2, form.stage, form.face, "open").rows));
    });
  }

  it("refuses a face that would land off the picture, or a mouth that is not centered", () => {
    const body = forms.pebblin!;
    expect(() => stampFace(body.idle, body.stage, { x: -1, y: 9, mouth: 15 }, "open")).toThrow("off the picture");
    expect(() => stampFace(body.idle, body.stage, { x: 5, y: 22, mouth: 15 }, "open")).toThrow("off the picture");
    expect(() => stampFace(body.idle, body.stage, { x: 5, y: 9, mouth: 15, mouths: { neutral: { x: 3, dy: 0, rows: ["MM"] } } }, "open")).toThrow("not centered");
    expect(() => stampFace(body.idle, body.stage, { x: 5, y: 9, mouth: 15, mouths: { neutral: { dy: 0, rows: ["MMM"] } } }, "open")).toThrow("not centered");
  });

  it("stamps no mouth for a face with no mouth row, and uses a custom mouth where a form has one", () => {
    const body = forms.pebblin!;
    const none = stampFace(body.idle, body.stage, { x: 5, y: 9, mouth: null }, "open").rows;
    expect(count(none, "M")).toBe(0);
    const custom = stampFace(body.idle, body.stage, { x: 5, y: 9, mouth: 15, mouths: { neutral: { dy: 0, rows: ["MMMMMM"] } } }, "open").rows;
    expect(custom[15]).toContain("MMMMMM");
    const hollow = forms.hollowbloom!;
    expect(hollow.face.mouths).toBeDefined();
    expect(count(stampFace(hollow.idle, hollow.stage, hollow.face, "open").rows, "T")).toBeGreaterThan(count(hollow.idle, "T"));
  });
});

describe("the two standing drawings", () => {
  it("every form has a second drawing", () => {
    for (const form of all) expect(form.idle2, form.id).toBeDefined();
  });

  for (const form of all) {
    it(`${form.id}: the first or second drawing is the base of each standing look, and the slumped and lying looks ignore the frame`, () => {
      for (const look of ["open", "closed", "half", "up", "happy", "yawn"] as const) {
        expect(faceSprite(form, look, 0).rows, look).toEqual(stampFace(form.idle, form.stage, form.face, look).rows);
        expect(faceSprite(form, look, 1).rows, look).toEqual(stampFace(form.idle2, form.stage, form.face, look).rows);
      }
      expect(faceSprite(form, "happy", 0).rows).not.toEqual(faceSprite(form, "happy", 1).rows); // not mixed up by the memo
      for (const kind of WIDE_KINDS) {
        expect(isWideKind(kind)).toBe(true);
        expect(faceSprite(form, kind, 1).rows, kind).toEqual(faceSprite(form, kind, 0).rows);
      }
    });
  }

  it("swaps every half second while it stands, hops or is happy, and every quarter second while it walks", () => {
    const at = (pose: "idle" | "hop" | "happy" | "walk", clock: number) => frameOf({ ...createView(), pose, clock });
    for (const pose of ["idle", "hop", "happy"] as const) {
      expect([0, 0.4, 0.5, 0.9, 1.0, 1.4, 1.5].map((t) => at(pose, t))).toEqual([0, 0, 1, 1, 0, 0, 1]);
    }
    expect([0, 0.2, 0.25, 0.45, 0.5, 0.7, 0.75].map((t) => at("walk", t))).toEqual([0, 0, 1, 1, 0, 0, 1]);
  });

  it("stays on the first drawing in every other pose, so a derived look never flickers", () => {
    for (const pose of ["startle", "refuse", "wobble", "eat", "sleep", "rumble", "yawn"] as const) {
      for (const clock of [0, 0.5, 1, 1.5, 7.3]) expect(frameOf({ ...createView(), pose, clock }), `${pose} at ${clock}`).toBe(0);
    }
  });
});

describe("lying down and drooping", () => {
  for (const form of all) {
    it(`${form.id} gets flatter and wider (within its picture), keeps every pixel of its face, and stays on the floor line`, () => {
      const size = form.idle.length;
      const open = filledRows(form.idle);
      const closed = faceCounts(stampFace(form.idle, form.stage, form.face, "closed").rows);
      for (const kind of ["lie0", "lie1"] as const) {
        const rows = faceSprite(form, kind).rows;
        expect(rows).toHaveLength(size);
        for (const row of rows) expect(row).toHaveLength(wideWidth(size));
        const filled = filledRows(rows);
        expect(filled.length, kind).toBeLessThan(open.length); // flatter
        expect(contentWidth(rows), kind).toBeGreaterThan(contentWidth(form.idle)); // wider
        expect(contentWidth(rows), kind).toBeLessThanOrEqual(wideWidth(size)); // but within the picture
        expect(filled[filled.length - 1], kind).toBe(open[open.length - 1]); // same bottom row
        expect(faceCounts(rows), kind).toEqual(closed); // not one face pixel lost
      }
      // breathing: one extra row in the second picture
      expect(filledRows(faceSprite(form, "lie1").rows).length).toBe(filledRows(faceSprite(form, "lie0").rows).length + 1);
    });

    it(`${form.id} can be slumped with sad lids, shut eyes, a yawn or happy arches, and keeps its whole face`, () => {
      const size = form.idle.length;
      const lie = filledRows(faceSprite(form, "lie0").rows).length;
      const open = filledRows(form.idle).length;
      const looks: Array<[FaceKind, Look]> = [["droop", "half"], ["droopSad", "sad"], ["droopClosed", "closed"], ["droopYawn", "yawn"], ["droopHappy", "happy"]];
      for (const [kind, look] of looks) {
        const rows = faceSprite(form, kind).rows;
        expect(rows, kind).toHaveLength(size);
        for (const row of rows) expect(row, kind).toHaveLength(wideWidth(size));
        expect(faceCounts(rows), kind).toEqual(faceCounts(stampFace(form.idle, form.stage, form.face, look).rows));
        const filled = filledRows(rows).length;
        expect(filled, kind).toBeLessThanOrEqual(open); // a slump is never taller than standing
        expect(filled, kind).toBeGreaterThanOrEqual(lie); // and never flatter than lying
      }
    });
  }

  it("never removes a protected row", () => {
    const rows = ["....", "KKKK", "KMMK", "KWWK", "KKKK", "...."];
    const lying = lieDown({ rows, palette: {} }, [2, 3], [], 0);
    expect(count(lying.rows, "M")).toBeGreaterThanOrEqual(2);
    expect(count(lying.rows, "W")).toBeGreaterThanOrEqual(2);
  });

  it("never doubles a protected column, though it doubles the same column when it is not protected", () => {
    const rows = ["......", "KKKKKK", "KMWWMK", "KKKKKK", "......"];
    const sprite = { rows, palette: {} };
    expect(count(lieDown(sprite, [2], [2, 3], 0).rows, "W")).toBe(2); // the two W columns stay single
    expect(count(lieDown(sprite, [2], [], 0).rows, "W")).toBeGreaterThan(2); // unprotected, one of them is doubled
  });
});

describe("saying no", () => {
  it("closes its eyes and sways gently, two pixels at the most, for over a second", () => {
    const view = createView();
    triggerPose(view, "refuse");
    expect(view.poseLength).toBeGreaterThan(1);
    expect(eyesClosed(view)).toBe(true);
    let biggest = 0;
    let swung = 0;
    let last = 0;
    for (let t = 0; t < view.poseLength; t += 0.02) {
      const dx = poseOffsets({ ...view, poseTime: t }).dx;
      biggest = Math.max(biggest, Math.abs(dx));
      if (Math.sign(dx) !== 0 && Math.sign(dx) !== last) swung++;
      if (dx !== 0) last = Math.sign(dx);
    }
    expect(biggest).toBeLessThanOrEqual(2);
    expect(biggest).toBeGreaterThanOrEqual(1);
    expect(swung).toBeGreaterThanOrEqual(4); // side to side, more than once
    expect(swung).toBeLessThanOrEqual(8); // but slowly: a fast shake would swing about 16 times
  });

  it("the egg still gets the quick wiggle", () => {
    const view = createView();
    triggerPose(view, "wobble");
    expect(view.poseLength).toBeLessThan(1);
    expect(eyesClosed(view)).toBe(false);
  });
});

describe("eating", () => {
  it("puts food in front of it, eats it bite by bite, ends happy, and the food is gone", () => {
    const view = createView();
    view.x = 30;
    const rng = makeRng(9);
    startEating(view, "meat");
    expect(view.pose).toBe("eat");
    expect(view.snack?.food).toBe("meat");
    expect(view.snack?.x).toBe(30 + 16); // facing right: right beside the 16 pixel body
    expect(foodLeft(0)).toBe(1);
    expect(foodLeft(MEAL.drop - 0.01)).toBe(1);
    const bites = [0, 1, 2, 3].map((i) => foodLeft(MEAL.drop + i * MEAL.bite + 0.01));
    expect(bites).toEqual([0.75, 0.5, 0.25, 0]);
    expect(eyesClosed({ ...view, poseTime: 0.1 })).toBe(false); // watches the food drop
    expect(eyesClosed({ ...view, poseTime: 1 })).toBe(true); // eyes shut while chewing
    for (let i = 0; i < 30; i++) updateView(view, 0.05, awake, rng.next); // 1.5 s: still eating
    expect(view.pose).toBe("eat");
    expect(view.snack).not.toBeNull();
    for (let i = 0; i < 20; i++) updateView(view, 0.05, awake, rng.next); // past 2.2 s
    expect(view.pose).toBe("happy");
    expect(view.snack).toBeNull();
    expect(view.effects.some((fx) => fx.kind === "heart")).toBe(true);
  });

  it("food goes on the side it is facing, and turns away from a close wall or the bed", () => {
    const left = createView();
    left.x = 40;
    left.facing = -1;
    startEating(left, "worm");
    expect(left.snack?.x).toBe(40 - 8); // facing left: the 8 pixel food ends where the body starts

    const wall = createView();
    wall.x = 4; // (the walking area stops at 8, where the food just fits, so this tests the rule itself)
    wall.facing = -1;
    startEating(wall, "carrot");
    expect(wall.facing).toBe(1);
    expect(wall.snack?.x).toBeGreaterThanOrEqual(0);

    const bed = createView(); // right next to the bed, facing it: the food goes on the other side
    bed.x = walkMaxX(ROOM.sprite);
    bed.facing = 1;
    startEating(bed, "meat");
    expect(bed.facing).toBe(-1);
    expect(bed.snack?.x).toBe(walkMaxX(ROOM.sprite) - 8);
  });

  it("the food always stays inside the room", () => {
    for (const x of [ROOM.walkMinX, 20, 40, walkMaxX(ROOM.sprite)]) {
      for (const facing of [1, -1] as const) {
        const view = createView();
        view.x = x;
        view.facing = facing;
        startEating(view, "treat");
        expect(view.snack!.x).toBeGreaterThanOrEqual(0);
        expect(view.snack!.x + 8).toBeLessThanOrEqual(ROOM.bedLeft); // never on top of the bed
      }
    }
  });

  it("food lands on a whole pixel even when it was walking", () => {
    const view = createView();
    view.x = 30.4;
    startEating(view, "meat");
    expect(view.snack?.x).toBe(46);
    const left = createView();
    left.x = 40.6;
    left.facing = -1;
    startEating(left, "meat");
    expect(left.snack?.x).toBe(41 - 8);
  });

  it("the part that is left of the food is the part away from the creature", () => {
    expect(snackCut(8, 1, 1)).toEqual({ from: 0, columns: 8, shift: 0 });
    expect(snackCut(8, 0.75, 1)).toEqual({ from: 2, columns: 6, shift: 2 }); // right part stays, drawn where it was
    expect(snackCut(8, 0.5, -1)).toEqual({ from: 0, columns: 4, shift: 0 }); // left part stays
    expect(snackCut(8, 0, 1).columns).toBe(0);
    expect(snackCut(8, 0, -1).columns).toBe(0);
  });

  it("a meal stops, with no food and no heart, if the creature dies halfway", () => {
    const view = createView();
    view.x = 30;
    const rng = makeRng(2);
    startEating(view, "meat");
    for (let i = 0; i < 10; i++) updateView(view, 0.05, awake, rng.next);
    expect(view.snack).not.toBeNull();
    for (let i = 0; i < 60; i++) {
      updateView(view, 0.05, { ...awake, dead: true }, rng.next);
      // checked every frame: the meal must stop at once, not just be over by the end
      expect(view.snack).toBeNull();
      expect(view.pose).not.toBe("eat");
      expect(view.pose).not.toBe("happy");
      expect(view.effects.some((fx) => fx.kind === "heart")).toBe(false);
    }
  });

  it("food disappears if it falls asleep halfway through", () => {
    const view = createView();
    startEating(view, "carrot");
    updateView(view, 0.05, { ...awake, asleep: true }, makeRng(1).next);
    triggerPose(view, "idle");
    updateView(view, 0.05, awake, makeRng(1).next);
    expect(view.snack).toBeNull();
  });
});


describe("the blanket", () => {
  for (const form of all) {
    it(`${form.id}'s blanket starts below the eyes (at the mouth, when the closed face has one), and is a little wider than the body`, () => {
      const lying = faceSprite(form, "lie0");
      const box = blanketBox(lying)!;
      const mouth = lying.rows.findIndex((row) => row.includes("M"));
      const eyes = lying.rows.reduce((last, row, y) => (row.includes("A") ? y : last), -1); // the lowest row of the closed eyes
      const filled = filledRows(lying.rows);
      expect(eyes).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThan(eyes);
      if (mouth >= 0) expect(box.top).toBe(mouth); // a beak or no mouth at all leaves no M pixel on a closed face, so the blanket falls back to the lower half
      expect(box.top).toBeGreaterThan(filled[0] as number);
      expect(box.bottom).toBe(filled[filled.length - 1]);
      let first = Infinity;
      let last = -1;
      for (const row of lying.rows) {
        const start = row.search(/[^.]/);
        if (start >= 0) {
          first = Math.min(first, start);
          last = Math.max(last, row.search(/[^.]\.*$/));
        }
      }
      expect(box.left).toBe(first - 1); // one pixel wider each side
      expect(box.right).toBe(last + 1);
      // A big body fills its whole picture, so the blanket may stick out one pixel past the edge. It is drawn on the room, so nothing is cut off.
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(wideWidth(form.idle.length));
    });
  }

  it("a picture with no mouth still gets a blanket over its lower half", () => {
    const rows = ["....", "KKKK", "KBBK", "KBBK", "KBBK", "KKKK", "...."];
    const box = blanketBox({ rows, palette: {} })!;
    expect(box.top).toBeGreaterThan(1);
    expect(box.top).toBeLessThanOrEqual(5);
    expect(blanketBox({ rows: ["..", ".."], palette: {} })).toBeNull();
  });
});

describe("blinking", () => {
  it("blinks every few seconds for a moment, and never for longer than a blink", () => {
    const view = createView();
    const rng = makeRng(11);
    let blinks = 0;
    let wasBlinking = false;
    let longest = 0;
    let run = 0;
    let gapStart = 0;
    const gaps: number[] = [];
    for (let i = 0; i < 2400; i++) {
      updateView(view, 0.05, awake, rng.next);
      const now = blinking(view);
      if (now && !wasBlinking) {
        blinks++;
        gaps.push(view.clock - gapStart);
        run = 0;
      }
      if (now) run += 0.05;
      else if (wasBlinking) gapStart = view.clock;
      longest = Math.max(longest, run);
      wasBlinking = now;
    }
    expect(blinks).toBeGreaterThanOrEqual(20); // 120 s, a blink every 2.5 to 5.5 s plus its own length
    expect(blinks).toBeLessThanOrEqual(48);
    expect(longest).toBeLessThanOrEqual(BLINK.length + 0.06);
    for (const gap of gaps.slice(1)) expect(gap).toBeGreaterThanOrEqual(BLINK.gapMin - 0.1);
  });

  it("an open-eyed creature shows closed eyes only during a blink", () => {
    const view = createView();
    view.nextBlink = 10;
    view.clock = 9;
    expect(pickFace(view, false, false)).toBe("open");
    view.clock = 10.05;
    expect(pickFace(view, false, false)).toBe("closed");
    view.clock = 10.2;
    expect(pickFace(view, false, false)).toBe("open");
  });

  it("a sad or sick creature stays slumped while yawning, chewing or saying no", () => {
    const sad = createView();
    sad.nextBlink = 1000;
    sad.mood = { ...awake, sad: true, sleepy: true };
    triggerPose(sad, "yawn");
    expect(pickFace(sad, false, false)).toBe("droopClosed");
    sad.poseTime = (YAWN.open + YAWN.close) / 2;
    expect(pickFace(sad, false, false)).toBe("droopYawn");
    sad.poseTime = YAWN.close + 0.1;
    expect(pickFace(sad, false, false)).toBe("droopClosed");

    const sick = createView();
    sick.nextBlink = 1000;
    sick.mood = { ...awake, sick: true };
    triggerPose(sick, "refuse");
    expect(pickFace(sick, false, false)).toBe("droopClosed");
    startEating(sick, "carrot");
    expect(pickFace(sick, false, false)).toBe("droop"); // watching the food fall
    sick.poseTime = MEAL.drop + 0.1;
    expect(pickFace(sick, false, false)).toBe("droopClosed"); // chewing
    expect(isWideKind("droopYawn")).toBe(true);
  });

  it("a slumped creature does not pop upright for a blink", () => {
    const view = createView();
    view.mood = { ...awake, sad: true };
    view.nextBlink = 10;
    view.clock = 10.05;
    expect(blinking(view)).toBe(true);
    expect(pickFace(view, false, false)).toBe("droopSad"); // sad: stays on its worried look
    view.mood = { ...awake, sick: true };
    expect(pickFace(view, false, false)).toBe("droop"); // sick: stays on its heavy lids
  });
});

describe("feelings", () => {
  const face = (mood: Partial<typeof awake> & { hungry?: boolean; sleepy?: boolean }, pose: string | null = null) => {
    const view = createView();
    view.nextBlink = 1000;
    view.mood = { ...awake, ...mood };
    if (pose) triggerPose(view, pose as "yawn");
    return pickFace(view, false, false);
  };

  it("picks the look that matches how it feels", () => {
    expect(face({})).toBe("open");
    expect(face({ sad: true })).toBe("droopSad");
    expect(face({ sick: true })).toBe("droop");
    expect(face({ sad: true, sick: true })).toBe("droop"); // sick wins: heavy lids, no tear
    expect(face({ sleepy: true })).toBe("half");
    expect(face({ hungry: true })).toBe("open"); // hunger shows as a growling tummy and a bubble
  });

  it("shows happy eyes during the happy hop, and goes back to normal after it", () => {
    expect(face({}, "happy")).toBe("happy");
    expect(face({ sleepy: true }, "happy")).toBe("happy"); // beats heavy lids
    expect(face({ hungry: true }, "happy")).toBe("happy");
    expect(face({ sad: true }, "happy")).toBe("droopHappy"); // a slumped creature stays slumped
    expect(face({ sick: true }, "happy")).toBe("droopHappy");
    expect(isWideKind("droopHappy")).toBe(true);
    expect(isWideKind("happy")).toBe(false);

    const view = createView();
    view.nextBlink = 1000;
    triggerPose(view, "happy");
    expect(pickFace(view, false, false)).toBe("happy");
    view.nextBlink = view.clock; // a blink is due right now: the happy eyes still win
    expect(blinking(view)).toBe(true);
    expect(pickFace(view, false, false)).toBe("happy");
    view.nextBlink = 1000;
    const rng = makeRng(3);
    for (let i = 0; i < 20; i++) updateView(view, 0.05, awake, rng.next); // past the 0.8 s hop
    expect(view.pose).not.toBe("happy");
    expect(pickFace(view, false, false)).toBe("open");
  });

  it("sleep and death still beat happy eyes", () => {
    const view = createView();
    view.nextBlink = 1000;
    triggerPose(view, "happy");
    expect(pickFace(view, true, false)).toMatch(/^lie/);
    expect(pickFace(view, false, true)).toBe("lie0");
  });

  it("a meal ends with happy eyes and the heart", () => {
    const view = createView();
    view.nextBlink = 1000;
    const rng = makeRng(5);
    startEating(view, "carrot");
    for (let i = 0; i < 50; i++) updateView(view, 0.05, awake, rng.next); // 2.5 s: the meal is over, the hop has begun
    expect(view.pose).toBe("happy");
    expect(pickFace(view, false, false)).toBe("happy");
    expect(view.effects.some((fx) => fx.kind === "heart")).toBe(true);
  });

  it("lying wins over everything, and a dead creature does not breathe", () => {
    const view = createView();
    view.mood = { ...awake, sad: true };
    view.clock = 0;
    expect(pickFace(view, true, false)).toBe("lie0");
    view.clock = 1.5;
    expect(pickFace(view, true, false)).toBe("lie1");
    expect(pickFace(view, false, true)).toBe("lie0");
  });

  it("watches the food fall with its eyes up, then looks down at it", () => {
    const view = createView();
    view.nextBlink = 1000;
    startEating(view, "carrot");
    expect(pickFace(view, false, false)).toBe("up");
    view.poseTime = MEAL.drop * 0.9;
    expect(pickFace(view, false, false)).toBe("open");
    view.poseTime = MEAL.drop + 0.1;
    expect(pickFace(view, false, false)).toBe("closed"); // chewing
  });

  it("a yawn opens the mouth in the middle and has its eyes shut throughout", () => {
    const view = createView();
    view.nextBlink = 1000;
    triggerPose(view, "yawn");
    expect(eyesClosed(view)).toBe(true);
    expect(pickFace(view, false, false)).toBe("closed");
    view.poseTime = (YAWN.open + YAWN.close) / 2;
    expect(pickFace(view, false, false)).toBe("yawn");
    expect(poseOffsets(view).dy).toBe(-1);
    view.poseTime = YAWN.close + 0.1;
    expect(pickFace(view, false, false)).toBe("closed");
    expect(poseOffsets(view).dy).toBe(0);
  });

  it("a hungry creature growls now and then and never hops; a tired one yawns", () => {
    for (const [mood, pose] of [[{ hungry: true }, "rumble"], [{ sleepy: true }, "yawn"]] as const) {
      const view = createView();
      const rng = makeRng(13);
      let seen = 0;
      for (let i = 0; i < 20000; i++) {
        updateView(view, 0.05, { ...awake, ...mood }, rng.next);
        expect(view.pose).not.toBe("hop");
        expect(view.pose).not.toBe("happy");
        if (view.pose === pose && view.poseTime < 0.06) seen++;
      }
      expect(seen).toBeGreaterThan(10);
    }
    // a hungry-only or tired-only creature still wanders now and then, like a sad one
    for (const mood of [{ hungry: true }, { sleepy: true }, { sad: true }]) {
      const walker = createView();
      const dice = makeRng(21);
      let walks = 0;
      for (let i = 0; i < 20000; i++) {
        updateView(walker, 0.05, { ...awake, ...mood }, dice.next);
        if (walker.pose === "walk" && walker.poseTime < 0.06) walks++;
      }
      expect(walks, JSON.stringify(mood)).toBeGreaterThan(10);
    }
    // a creature that is neither never growls or yawns
    const view = createView();
    const rng = makeRng(13);
    for (let i = 0; i < 20000; i++) {
      updateView(view, 0.05, awake, rng.next);
      expect(["rumble", "yawn"]).not.toContain(view.pose);
    }
  });

  it("the tummy trembles one pixel, and the whole thing ends by itself", () => {
    const view = createView();
    triggerPose(view, "rumble");
    const dys = new Set<number>();
    for (let t = 0; t < view.poseLength; t += 0.01) dys.add(poseOffsets({ ...view, poseTime: t }).dy);
    expect([...dys].sort()).toEqual([0, 1]);
    const rng = makeRng(1);
    for (let i = 0; i < 30; i++) updateView(view, 0.05, awake, rng.next);
    expect(view.pose).not.toBe("rumble");
  });

  it("a sick creature sways a pixel each way and a healthy one stands still", () => {
    const sick = createView();
    sick.mood = { ...awake, sick: true };
    const dxs = new Set<number>();
    for (let t = 0; t < 10; t += 0.05) dxs.add(poseOffsets({ ...sick, clock: t }).dx);
    expect([...dxs].sort()).toEqual([-1, 0, 1]);
    const well = createView();
    for (let t = 0; t < 10; t += 0.05) expect(poseOffsets({ ...well, clock: t }).dx).toBe(0);
  });

  it("works out feelings from the save", () => {
    const save = newSave(Date.UTC(2026, 10, 21, 10), 1);
    expect(moodOf(save)).toMatchObject({ asleep: false, dead: false });
    const alive = { ...newSave(Date.UTC(2026, 10, 21, 10), 1) };
    alive.phase = "alive";
    const creature = makeCreature("blip", 0);
    creature.stats = { hunger: 24, happiness: 29, energy: 24, hygiene: 80, wellness: 80, discipline: 50 };
    creature.sick = true;
    alive.creature = creature;
    expect(moodOf(alive)).toEqual({ asleep: false, sad: true, sick: true, dead: false, hungry: true, sleepy: true });
    creature.stats.hunger = 25;
    creature.stats.energy = 25;
    creature.stats.happiness = 30;
    expect(moodOf(alive)).toMatchObject({ sad: false, hungry: false, sleepy: false });
    alive.phase = "dead";
    expect(moodOf(alive).dead).toBe(true);
  });
});
