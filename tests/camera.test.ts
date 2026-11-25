// The camera maths (src/art/camera.ts; docs/home-plan.md section 3.2). The expected numbers are worked out by hand.
import { describe, expect, it } from "vitest";
import { MIN_ZOOM, clampCamera, defaultZoom, frameOn, inView, maxZoom, panBy, snapZoom, stepCamera, toGame, zoomAbout } from "../src/art/camera";

const WORLD = { w: 768, h: 192 };
const VP = { w: 640, h: 640 }; // the picture of a 360 wide phone at pixel ratio 2: 128 x 5 device pixels (320 CSS pixels)

describe("the zooms", () => {
  it("opens at the largest whole zoom that still shows the whole 192 pixel height of the home: 256, 512, 640, 768, 1024 pixel pictures give 1, 2, 3, 4, 5", () => {
    // by hand: floor(256 / 192) = 1, floor(512 / 192) = 2, floor(640 / 192) = 3, floor(768 / 192) = 4, floor(1024 / 192) = 5
    expect([256, 512, 640, 768, 1024].map((w) => defaultZoom({ w, h: w }, WORLD, 2))).toEqual([1, 2, 3, 4, 5]);
  });

  it("never opens beyond the largest zoom (a big tablet picture) or below 1", () => {
    expect(defaultZoom({ w: 1536, h: 1536 }, WORLD, 2)).toBe(5); // floor(1536 / 192) = 8, but 5 is the largest at pixel ratio 2
    expect(defaultZoom({ w: 100, h: 100 }, WORLD, 1)).toBe(1);
  });

  it("goes up to 2.5 CSS pixels per game pixel, rounded to whole device pixels, and down to 1", () => {
    expect([1, 2, 3, 1.5].map(maxZoom)).toEqual([3, 5, 8, 4]);
    expect(MIN_ZOOM).toBe(1);
  });

  it("settles a pinch on the nearest whole zoom inside the limits", () => {
    expect([2.4, 2.5, 2.6, 0.3, 9, 5].map((z) => snapZoom(z, 2))).toEqual([2, 3, 3, 1, 5, 5]);
  });
});

describe("keeping the camera inside the home", () => {
  it("stops the view at the edges: at zoom 2 the 640 pixel picture shows 320 x 320 game pixels", () => {
    // the view is 320 wide: its centre stays between 160 and 608; 320 high is taller than the 192 home, so the home is centred vertically (96)
    expect(clampCamera({ x: 0, y: 0, zoom: 2 }, VP, WORLD)).toEqual({ x: 160, y: 96, zoom: 2 });
    expect(clampCamera({ x: 5000, y: 500, zoom: 2 }, VP, WORLD)).toEqual({ x: 608, y: 96, zoom: 2 });
    expect(clampCamera({ x: 300, y: 96, zoom: 2 }, VP, WORLD)).toEqual({ x: 300, y: 96, zoom: 2 });
  });

  it("stops at the top and bottom when the view is lower than the home: zoom 5 shows 128 x 128 game pixels", () => {
    expect(clampCamera({ x: 400, y: 0, zoom: 5 }, VP, WORLD)).toEqual({ x: 400, y: 64, zoom: 5 });
    expect(clampCamera({ x: 400, y: 999, zoom: 5 }, VP, WORLD)).toEqual({ x: 400, y: 128, zoom: 5 });
  });

  it("centres a home that is smaller than the view: at zoom 1 the 640 picture is narrower than the 768 home (stopped at the left edge, 320) but taller than it (centred, 96); a 1024 picture holds the whole home", () => {
    expect(clampCamera({ x: 0, y: 0, zoom: 1 }, VP, WORLD)).toEqual({ x: 320, y: 96, zoom: 1 });
    expect(clampCamera({ x: 0, y: 0, zoom: 1 }, { w: 1024, h: 1024 }, WORLD)).toEqual({ x: 384, y: 96, zoom: 1 }); // a 1024 view holds the whole home: centred
  });
});

describe("panning, zooming and framing", () => {
  it("moves the home with the finger: a drag of 20 device pixels to the right at zoom 2 shows 10 game pixels further left", () => {
    expect(panBy({ x: 300, y: 96, zoom: 2 }, 20, 0, VP, WORLD)).toEqual({ x: 290, y: 96, zoom: 2 });
    expect(panBy({ x: 300, y: 96, zoom: 2 }, -2000, 0, VP, WORLD)).toEqual({ x: 608, y: 96, zoom: 2 }); // dragged far: stops at the right edge
    expect(panBy({ x: 300, y: 96, zoom: 4 }, 0, 20, VP, WORLD)).toEqual({ x: 300, y: 91, zoom: 4 }); // down 20 device pixels at zoom 4: 5 game pixels further up (the view is lower than the home, y may move)
  });

  it("reads a game pixel from a point of the picture", () => {
    expect(toGame({ x: 300, y: 96, zoom: 2 }, VP, { x: 320, y: 320 })).toEqual({ x: 300, y: 96 }); // the middle of the picture is the camera
    expect(toGame({ x: 300, y: 96, zoom: 2 }, VP, { x: 0, y: 0 })).toEqual({ x: 140, y: -64 });
  });

  it("keeps the game pixel under the pinch where it was, as far as the home's walls allow", () => {
    const cam = { x: 300, y: 96, zoom: 2 };
    // the second point is below the middle of the picture: the camera's y must move too (by hand: 96 + (360 - 320) / 2 = 116 is under it before, and 106 + 40 / 4 = 116 after)
    for (const at of [{ x: 500, y: 320 }, { x: 500, y: 360 }]) {
      const before = toGame(cam, VP, at);
      const after = zoomAbout(cam, 4, at, VP, WORLD, 2);
      expect(after.zoom).toBe(4);
      const now = toGame(after, VP, at);
      expect(now.x).toBeCloseTo(before.x, 9);
      expect(now.y).toBeCloseTo(before.y, 9);
    }
    expect(zoomAbout(cam, 4, { x: 500, y: 360 }, VP, WORLD, 2).y).toBe(106);
  });

  it("stops at the wall when the pinch is at the picture's edge: the picture's left edge then shows the home's left edge", () => {
    const cam = { x: 100, y: 96, zoom: 2 }; // sees x -60 to 260 (the view is wider than what is left of the wall)... clamped: 160 is the smallest centre at zoom 2, so the camera starts at 160
    const start = clampCamera(cam, VP, WORLD);
    expect(start.x).toBe(160);
    const after = zoomAbout(start, 4, { x: 0, y: 320 }, VP, WORLD, 2); // the game pixel at the picture's left edge was 0: it wants x = 0 + 320 / 4 = 80, the smallest centre at zoom 4
    expect(after).toEqual({ x: 80, y: 96, zoom: 4 });
    expect(toGame(after, VP, { x: 0, y: 0 }).x).toBe(0);
  });

  it("stops at the wall when the pinch is over the empty space beside the home: the game pixel under the finger is outside the home, so the view cannot keep it there", () => {
    // by hand: a 1024 picture at zoom 1 shows the whole 768 home with 128 of empty space each side; the finger at the picture's left edge is over game pixel 384 + (0 - 512) / 1 = -128.
    // Zoomed to 2 it would want the camera at -128 + 512 / 2 = 128, but at zoom 2 the view is 512 game pixels wide and may not go left of its half, 256.
    const big = { w: 1024, h: 1024 };
    const cam = { x: 384, y: 96, zoom: 1 };
    expect(toGame(cam, big, { x: 0, y: 512 }).x).toBe(-128);
    expect(zoomAbout(cam, 2, { x: 0, y: 512 }, big, WORLD, 2)).toEqual({ x: 256, y: 96, zoom: 2 });
  });

  it("keeps the point under the pinch also at a fraction, and clamps the zoom to the limits", () => {
    const cam = { x: 300, y: 96, zoom: 2 };
    expect(zoomAbout(cam, 2.7, { x: 320, y: 320 }, VP, WORLD, 2).zoom).toBe(2.7);
    expect(zoomAbout(cam, 50, { x: 320, y: 320 }, VP, WORLD, 2).zoom).toBe(5);
    expect(zoomAbout(cam, 0.1, { x: 320, y: 320 }, VP, WORLD, 2).zoom).toBe(1);
  });

  it("centres the camera on a box, inside the home", () => {
    expect(frameOn({ x: 0, y: 0, zoom: 2 }, { x: 400, y: 100, w: 20, h: 20 }, VP, WORLD)).toEqual({ x: 410, y: 96, zoom: 2 });
    expect(frameOn({ x: 0, y: 0, zoom: 2 }, { x: 5, y: 100, w: 20, h: 20 }, VP, WORLD)).toEqual({ x: 160, y: 96, zoom: 2 }); // near the left wall: the camera stops at 160
    expect(frameOn({ x: 0, y: 0, zoom: 5 }, { x: 400, y: 100, w: 20, h: 20 }, VP, WORLD)).toEqual({ x: 410, y: 110, zoom: 5 }); // at zoom 5 the view is 128 high: y follows the box's middle (110, inside 64 to 128)
  });

  it("says whether a whole box is in view", () => {
    const cam = { x: 300, y: 96, zoom: 2 }; // sees x 140 to 460
    expect(inView(cam, { x: 200, y: 50, w: 48, h: 48 }, VP)).toBe(true);
    expect(inView(cam, { x: 430, y: 50, w: 48, h: 48 }, VP)).toBe(false); // half out on the right
    expect(inView(cam, { x: 139, y: 50, w: 10, h: 10 }, VP)).toBe(false); // one pixel out on the left
    expect(inView(cam, { x: 140, y: 50, w: 10, h: 10 }, VP)).toBe(true); // exactly on the edge counts as in
    expect(inView(cam, { x: 412, y: 50, w: 48, h: 48 }, VP)).toBe(true); // its right edge is exactly the view's (460)
  });
});

describe("the keys", () => {
  it("pans by a fifth of the picture (128 device pixels) and zooms by one whole step, and ignores any other key", () => {
    const cam = { x: 300, y: 96, zoom: 2 };
    expect(stepCamera(cam, "ArrowLeft", VP, WORLD, 2)).toEqual({ x: 236, y: 96, zoom: 2 }); // 128 / 2 = 64 game pixels
    expect(stepCamera(cam, "ArrowRight", VP, WORLD, 2)).toEqual({ x: 364, y: 96, zoom: 2 });
    expect(stepCamera(cam, "ArrowUp", VP, WORLD, 2)).toEqual({ x: 300, y: 96, zoom: 2 }); // the home is lower than the picture: nothing to scroll
    expect(stepCamera(cam, "ArrowDown", VP, WORLD, 2)).toEqual({ x: 300, y: 96, zoom: 2 });
    // the zoom is about the middle of the picture: the camera stays where it is (300) at zoom 3, and at zoom 1 it is stopped at the left edge of what it may show (320)
    expect(stepCamera(cam, "=", VP, WORLD, 2)).toEqual({ x: 300, y: 96, zoom: 3 }); // the plus key without shift
    expect(stepCamera(cam, "_", VP, WORLD, 2)).toEqual({ x: 320, y: 96, zoom: 1 }); // the minus key with shift
    expect(stepCamera(cam, "+", VP, WORLD, 2)).toEqual({ x: 300, y: 96, zoom: 3 });
    expect(stepCamera(cam, "-", VP, WORLD, 2)).toEqual({ x: 320, y: 96, zoom: 1 });
    expect([stepCamera({ x: 300, y: 96, zoom: 4 }, "-", VP, WORLD, 2)?.zoom, stepCamera({ x: 300, y: 96, zoom: 4 }, "_", VP, WORLD, 2)?.zoom]).toEqual([3, 3]); // one step down, not two
    expect(stepCamera({ x: 300, y: 96, zoom: 5 }, "+", VP, WORLD, 2)?.zoom).toBe(5);
    expect(stepCamera(cam, "a", VP, WORLD, 2)).toBeNull();
  });
});

describe("the keys at a zoom where the home is taller than the picture", () => {
  it("move up and down by a fifth of the picture, and stop at the top and the bottom", () => {
    // at zoom 4 the 640 picture shows 160 game pixels high: the camera's y stays between 80 and 112; a key moves it 128 / 4 = 32
    const cam = { x: 300, y: 96, zoom: 4 };
    expect(stepCamera(cam, "ArrowUp", VP, WORLD, 2)).toEqual({ x: 300, y: 80, zoom: 4 }); // 96 - 32 = 64, stopped at 80
    expect(stepCamera(cam, "ArrowDown", VP, WORLD, 2)).toEqual({ x: 300, y: 112, zoom: 4 }); // 96 + 32 = 128, stopped at 112
    expect(stepCamera({ x: 300, y: 100, zoom: 4 }, "ArrowUp", VP, WORLD, 2)).toEqual({ x: 300, y: 80, zoom: 4 });
    expect(stepCamera({ x: 300, y: 100, zoom: 4 }, "ArrowDown", VP, WORLD, 2)).toEqual({ x: 300, y: 112, zoom: 4 });
  });
});

describe("a picture that is wider than it is high (width and height are never swapped)", () => {
  const WIDE = { w: 640, h: 320 };
  const cam = { x: 300, y: 96, zoom: 2 }; // sees x 140 to 460 and y 16 to 176

  it("stops the view at the edges by its own width and height: 320 x 160 game pixels at zoom 2", () => {
    expect(clampCamera({ x: 0, y: 0, zoom: 2 }, WIDE, WORLD)).toEqual({ x: 160, y: 80, zoom: 2 });
    expect(clampCamera({ x: 5000, y: 999, zoom: 2 }, WIDE, WORLD)).toEqual({ x: 608, y: 112, zoom: 2 });
  });

  it("reads a game pixel, and says what is in view, with the picture's own width and height", () => {
    expect(toGame(cam, WIDE, { x: 0, y: 0 })).toEqual({ x: 140, y: 16 });
    expect(inView(cam, { x: 200, y: 16, w: 10, h: 10 }, WIDE)).toBe(true);
    expect(inView(cam, { x: 200, y: 15, w: 10, h: 10 }, WIDE)).toBe(false); // one pixel above the view
    expect(inView(cam, { x: 200, y: 167, w: 10, h: 10 }, WIDE)).toBe(false); // one pixel below it (the view ends at 176)
    expect(inView(cam, { x: 200, y: 166, w: 10, h: 10 }, WIDE)).toBe(true); // its bottom edge is exactly 176
  });

  it("opens at the zoom its height allows, and the keys step by its width", () => {
    expect(defaultZoom({ w: 640, h: 576 }, WORLD, 2)).toBe(3); // floor(576 / 192)
    expect(defaultZoom({ w: 384, h: 640 }, WORLD, 2)).toBe(3); // floor(640 / 192), not the width
    expect(stepCamera(cam, "ArrowRight", WIDE, WORLD, 2)).toEqual({ x: 364, y: 96, zoom: 2 }); // a fifth of 640 = 128 device pixels = 64 game pixels
  });
});
