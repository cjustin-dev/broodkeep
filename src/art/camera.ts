// The camera over the home (docs/home-plan.md section 3.2): what part of the home the square picture shows, and how a drag or a pinch moves it. No canvas and no
// state here (the Stage keeps the camera), so all of it is tested without a browser (tests/camera.test.ts).
//
// The camera is a point of the home (x, y, in game pixels) that sits in the middle of the picture, and a zoom: device pixels per game pixel. The picture is
// `vp` device pixels wide and high. At rest the zoom is a whole number (every game pixel the same size, sharp); while two fingers pinch it is smooth.

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}
export interface Size {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// The smallest zoom is 1 device pixel per game pixel; the largest is 2.5 CSS pixels per game pixel, rounded to whole device pixels (3, 5 and 8 at pixel ratio 1, 2 and 3; 5 at
// ratio 2 is about the scale of the old room at 360 wide).
export const MIN_ZOOM = 1;
export const maxZoom = (dpr: number): number => Math.max(MIN_ZOOM, Math.round(2.5 * dpr));
// The zoom the home opens at: the largest whole number of device pixels per game pixel at which the whole height of the home still fits the (square) picture, so the picture
// is filled and nothing of the home is cut off above or below. Between the limits above.
export const defaultZoom = (vp: Size, world: Size, dpr: number): number => Math.min(maxZoom(dpr), Math.max(MIN_ZOOM, Math.floor(vp.h / world.h)));

export const snapZoom = (zoom: number, dpr: number): number => Math.min(maxZoom(dpr), Math.max(MIN_ZOOM, Math.round(zoom)));
export const clampZoom = (zoom: number, dpr: number): number => Math.min(maxZoom(dpr), Math.max(MIN_ZOOM, zoom));

// The camera is kept inside the home: its view never shows past an edge, and a view wider (or taller) than the home shows the home centred.
export function clampCamera(cam: Camera, vp: Size, world: Size): Camera {
  const halfW = vp.w / cam.zoom / 2;
  const halfH = vp.h / cam.zoom / 2;
  const x = halfW * 2 >= world.w ? world.w / 2 : Math.min(world.w - halfW, Math.max(halfW, cam.x));
  const y = halfH * 2 >= world.h ? world.h / 2 : Math.min(world.h - halfH, Math.max(halfH, cam.y));
  return { x, y, zoom: cam.zoom };
}

// Which game pixel is under a point of the picture (device pixels from its top left corner).
export const toGame = (cam: Camera, vp: Size, p: Point): Point => ({ x: cam.x + (p.x - vp.w / 2) / cam.zoom, y: cam.y + (p.y - vp.h / 2) / cam.zoom });

// A drag: the home follows the finger by (dx, dy) device pixels.
export const panBy = (cam: Camera, dx: number, dy: number, vp: Size, world: Size): Camera => clampCamera({ x: cam.x - dx / cam.zoom, y: cam.y - dy / cam.zoom, zoom: cam.zoom }, vp, world);

// A pinch: a new zoom, with the game pixel under `at` (device pixels) staying under it.
export function zoomAbout(cam: Camera, zoom: number, at: Point, vp: Size, world: Size, dpr: number): Camera {
  const next = clampZoom(zoom, dpr);
  const under = toGame(cam, vp, at);
  return clampCamera({ x: under.x - (at.x - vp.w / 2) / next, y: under.y - (at.y - vp.h / 2) / next, zoom: next }, vp, world);
}

// The camera centred on a box of the home (the creature, the egg, a bubble), at the same zoom.
export const frameOn = (cam: Camera, box: Box, vp: Size, world: Size): Camera => clampCamera({ x: box.x + box.w / 2, y: box.y + box.h / 2, zoom: cam.zoom }, vp, world);

// Is the whole box inside the picture?
export function inView(cam: Camera, box: Box, vp: Size): boolean {
  const halfW = vp.w / cam.zoom / 2;
  const halfH = vp.h / cam.zoom / 2;
  return box.x >= cam.x - halfW && box.x + box.w <= cam.x + halfW && box.y >= cam.y - halfH && box.y + box.h <= cam.y + halfH;
}

// The camera is moved by the keys (docs/home-plan.md 3.2): the arrow keys pan by a fifth of the picture, plus and minus change the zoom by one whole step.
export function stepCamera(cam: Camera, key: string, vp: Size, world: Size, dpr: number): Camera | null {
  const step = Math.round(vp.w / 5);
  if (key === "ArrowLeft") return panBy(cam, step, 0, vp, world);
  if (key === "ArrowRight") return panBy(cam, -step, 0, vp, world);
  if (key === "ArrowUp") return panBy(cam, 0, step, vp, world);
  if (key === "ArrowDown") return panBy(cam, 0, -step, vp, world);
  if (key === "+" || key === "=") return zoomAbout(cam, snapZoom(cam.zoom + 1, dpr), { x: vp.w / 2, y: vp.h / 2 }, vp, world, dpr);
  if (key === "-" || key === "_") return zoomAbout(cam, snapZoom(cam.zoom - 1, dpr), { x: vp.w / 2, y: vp.h / 2 }, vp, world, dpr);
  return null;
}
