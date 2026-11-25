// The picture of the home, and the touch controls on it.
//   tap the egg        -> helps it hatch
//   tap the creature   -> it startles (3 quick taps = tickle)
//   hold the creature  -> petting
//   drag               -> moves the camera over the home (docs/home-plan.md section 3.2); two fingers pinch it bigger or smaller
// While Decorate mode is on (docs/home-plan.md section 12) the creature is not touched at all: a finger on a piece of furniture carries it on the tile grid (a tap selects it),
// a finger anywhere else pans, and a tap there lets go of the selection. The arrow keys move the selected piece; Escape lets go of it.
// The habitat, the arena and a field keep the old 128 x 128 picture (no camera); the home is 768 x 192 and the camera shows a square part of it.
import { useEffect, useRef, useState } from "preact/hooks";
import { drawArena } from "../art/arena";
import { clampCamera, clampZoom, defaultZoom, frameOn, inView, panBy, snapZoom, stepCamera, toGame, zoomAbout } from "../art/camera";
import type { Box, Camera, Point } from "../art/camera";
import { HOME, layoutInForce, roomOf, useLayout } from "../art/home";
import { drop, follow, lift, tileOf } from "../art/homeEdit";
import type { Lift } from "../art/homeEdit";
import { layoutOf } from "../art/homeLayout";
import { addHeart, addSparkles, reseat, triggerPose, updateView } from "../art/idle";
import { ROOM } from "../art/layout";
import { stepMoment } from "../art/moment";
import { drawHabitat } from "../art/habitat";
import { drawOutline, drawPiece, drawWallOutline, lookOf } from "../art/room";
import { drawScene, moodOf, sizeOf } from "../art/scene";
import { spotsOf } from "../art/spots";
import type { World } from "../art/spots";
import { GestureTracker } from "./gesture";
import type { Action } from "./gesture";
import { Icon } from "./Icon";
import type { IconName } from "../art/sprites";
import { fields } from "../data/fields";
import { getForm } from "../data/forms";
import { spots } from "../data/habitat";
import { PIECE_NAMES, TILE, wallRoomOf } from "../data/home";
import { tapEgg, touch } from "../game/actions";
import { isAdultMode } from "../game/hud";
import type { CallKind, Save } from "../game/state";
import type { Game } from "./game";

const callWords: Record<CallKind, string> = {
  hungry: "is hungry",
  sad: "feels sad",
  dirty: "needs cleaning",
  sick: "is sick",
  sleepy: "is sleepy",
};

// A sentence for screen readers, since the picture itself has no text.
function describe(save: Save, game: Game): string {
  if (game.decor && game.view.world === "home") {
    const piece = game.selectedPiece;
    const wall = game.selectedWall;
    return `Decorating the home. ${piece ? `The ${PIECE_NAMES[piece].toLowerCase()} is selected. The arrow keys move it.` : wall ? `The ${roomNames[wall]} wall is selected. Pick a wallpaper below.` : "Nothing is selected."}`;
  }
  if (save.phase === "egg") return "An egg. Tap it to help it hatch.";
  if (!save.creature) return "";
  const name = getForm(save.creature.formId).name;
  if (save.phase === "dead") return `${name} has passed away.`;
  const job = save.creature.job;
  if (job) return `${name} is out working at the ${spots[job.spot].name}.`;
  if (game.atArena) {
    const b = game.arena?.battle;
    if (!b) return save.creature.sleep ? `The arena. ${name} is asleep.` : `The arena. ${name} is ready to fight.`;
    const foe = `the wild ${getForm(b.foe.formId).name}`;
    const percent = (f: { hp: number; maxHp: number }): number => Math.round((100 * f.hp) / f.maxHp);
    if (b.over === "won") return `${name} won against ${foe}.`;
    if (b.over === "lost") return `${name} lost to ${foe} and needs a rest.`;
    return `${name} is fighting ${foe}. ${name} has ${percent(b.me)} percent health, and ${foe} has ${percent(b.foe)} percent.`;
  }
  const place = save.creature.place;
  if (game.atHabitat) return `The habitat. ${name} is ${place === "home" ? "at home" : `out in the ${fields[place].name} field`}.`;
  const room = place === "home" ? ` In the ${roomNames[roomOf(game.view.x + game.view.size / 2)]}.` : "";
  if (save.creature.sleep) return `${name} is asleep.${room}`;
  const where = place === "home" ? "" : `In the ${fields[place].name} field. `;
  return where + (save.creature.call ? `${name} ${callWords[save.creature.call]}.` : `${name} is doing fine.`) + room;
}

export const roomNames = { bedroom: "bedroom", living: "living room", kitchen: "kitchen" } as const;

// Which space the picture is in: the home, or the old one-line picture (a field, the habitat, the arena).
function worldOf(game: Game): World {
  if (game.atHabitat || game.atArena) return "line";
  const c = game.save.creature;
  if (game.save.phase === "alive" && c && !c.job && c.place !== "home") return "line";
  return "home";
}

// The icon on the Find button: the creature's call when it has one, otherwise a smile.
const findIcons: Record<CallKind, IconName> = { hungry: "hunger", sad: "cloud", dirty: "poop", sick: "sick", sleepy: "zzz" };

// The picture, for the tray to hand the keyboard back to after a piece is put out.
export const focusPicture = (): void => document.querySelector<HTMLElement>("canvas.room")?.focus();

const ARROWS: Record<string, { col: number; row: number }> = {
  ArrowLeft: { col: -1, row: 0 },
  ArrowRight: { col: 1, row: 0 },
  ArrowUp: { col: 0, row: -1 },
  ArrowDown: { col: 0, row: 1 },
};
const VALID_COLOR = "#ffffff";
const INVALID_COLOR = "#e0455b";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const GLIDE_SECONDS = 0.35;
const PET_PAD_CSS = 14; // how far past the creature's picture a touch still counts, in CSS pixels (the zoom does not change it)

interface Hold {
  id: number; // which finger (pointer) started this hold
  petted: boolean;
  timer?: number;
  repeat?: number;
}

export function Stage({ game }: { game: Game }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The picture is a square of 128 x k device pixels, k a whole number, so it fills the width of the screen. In the old pictures every game pixel is k device pixels;
  // in the home the camera (zoom, x, y) decides what part of the home fills the square. css is the size on the page.
  const [size, setSize] = useState({ k: 3, css: ROOM.w * 3 });
  const hold = useRef<Hold | null>(null);
  const taps = useRef<number[]>([]);
  const camera = useRef<Camera | null>(null); // the home's camera: view state, never saved; null until the home is first drawn
  const glide = useRef<{ from: Camera; to: Camera; t: number } | null>(null);
  const framed = useRef(false); // a hatch or evolve scene was running on the last frame
  const tracker = useRef(new GestureTracker());
  const lifting = useRef<{ id: number; held: Lift } | null>(null); // Decorate mode: the piece a finger is carrying (view state: the layout changes only when it is put down)
  const [find, setFindState] = useState<IconName | null>(null); // the Find button: shown (with this icon) while the creature is not fully in view
  const [inHome, setInHomeState] = useState(false);
  const findNow = useRef<IconName | null>(null); // (what the draw loop last put in the two states above, so it only sets them when they change)
  const inHomeNow = useRef(false);
  const [scene, setSceneState] = useState(false); // a hatch or evolve scene is playing (no Decorate button then)
  const sceneNow = useRef(false);
  const [, setRoomState] = useState<string | null>(null); // which room the creature is in: kept only so the words for a screen reader are made again when it walks into another
  const roomNow = useRef<string | null>(null);
  const setFind = (v: IconName | null): void => {
    findNow.current = v;
    setFindState(v);
  };
  const setInHome = (v: boolean): void => {
    inHomeNow.current = v;
    setInHomeState(v);
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const k = Math.max(1, Math.floor((wrap.clientWidth * dpr) / ROOM.w));
      setSize({ k, css: (ROOM.w * k) / dpr });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const dpr = (): number => window.devicePixelRatio || 1;
  const viewport = (): { w: number; h: number } => ({ w: ROOM.w * size.k, h: ROOM.h * size.k });

  // The box the Find button looks for, and the camera frames: where the creature (or the egg, or the bubble of a creature that is away) is, in game pixels.
  const targetBox = (): { x: number; y: number; size: number } => {
    const save = game.save;
    const spots = spotsOf(game.view.world);
    if (save.phase === "egg") return { x: spots.egg.x, y: spots.egg.y, size: ROOM.sprite };
    const side = sizeOf(save);
    if (save.creature?.job && game.view.world === "home") return { x: spots.bubble.x, y: spots.bubble.y, size: 14 };
    if (save.phase === "dead") return { ...spots.dead(side), size: side };
    if (save.creature?.sleep && (game.view.world === "line" || game.view.pose === "sleep")) return { ...spots.bed(side), size: side };
    return { x: game.view.x, y: game.view.y - side, size: side };
  };
  const boxOf = (b: { x: number; y: number; size: number }): Box => ({ x: b.x, y: b.y, w: b.size, h: b.size });

  // Draw loop: one frame at a time, as fast as the screen refreshes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const world = worldOf(game);
      game.view.world = world;
      const layout = layoutOf(game.save.home); // (the furniture was moved: the walking is done on the new floor, and the creature is put on a free tile)
      if (layout !== layoutInForce()) {
        useLayout(layout);
        reseat(game.view);
      }
      stepMoment(game.view, game.save, dt);
      if (game.decor && (world !== "home" || game.view.moment !== null)) game.endDecor(); // (a field, the habitat, the arena or a scene is not the home's picture)
      if (!game.decor) lifting.current = null;
      else endHold(); // (a pet hold begun before Decorate mode started ends with it)
      updateView(game.view, dt, moodOf(game.save), Math.random, sizeOf(game.save), world);
      ctx.imageSmoothingEnabled = false;
      if (world === "home") drawHome(ctx, canvas, dt);
      else {
        ctx.setTransform(size.k, 0, 0, size.k, 0, 0); // draw in game pixels, scaled up
        if (findNow.current !== null) setFind(null);
        if (game.atHabitat) drawHabitat(ctx, game.save, game.view, game.now());
        else if (game.atArena) {
          const arena = game.arena;
          drawArena(ctx, game.save, game.now(), game.view.clock, arena ? { battle: arena.battle, play: arena.play, t: game.arenaTime() } : null);
        } else drawScene(ctx, game.save, game.view, game.now());
      }
      if ((game.view.moment !== null) !== sceneNow.current) {
        sceneNow.current = game.view.moment !== null;
        setSceneState(sceneNow.current);
      }
      if ((world === "home") !== inHomeNow.current) {
        setInHome(world === "home");
        tracker.current = new GestureTracker(); // (a finger that was down when the picture changed world has its lift handled by the other world's code: the tracker starts again)
        endHold();
      }
      const room = world === "home" ? roomOf(game.view.x + game.view.size / 2) : null;
      if (room !== roomNow.current) {
        roomNow.current = room;
        setRoomState(room);
      }
      raf = requestAnimationFrame(frame);
    };

    // One frame of the home: the camera (kept inside the home, framed on the creature when the home first opens and when a hatch or evolve scene starts, gliding to it
    // after a tap on Find), then the scene through it.
    const drawHome = (c: CanvasRenderingContext2D, cv: HTMLCanvasElement, dt: number): void => {
      const vp = { w: cv.width, h: cv.height };
      const ratio = dpr();
      let cam = camera.current ?? frameOn({ x: 0, y: 0, zoom: defaultZoom(vp, HOME, ratio) }, boxOf(targetBox()), vp, HOME);
      const scene = game.view.moment !== null;
      if (scene && !framed.current) cam = frameOn(cam, boxOf(targetBox()), vp, HOME); // a hatch or evolve starts: it is shown
      framed.current = scene;
      if (glide.current) {
        const g = glide.current;
        g.t += dt;
        const u = Math.min(1, g.t / GLIDE_SECONDS);
        const e = u * u * (3 - 2 * u);
        cam = { x: g.from.x + (g.to.x - g.from.x) * e, y: g.from.y + (g.to.y - g.from.y) * e, zoom: g.to.zoom };
        if (u >= 1) glide.current = null;
      }
      cam = clampCamera({ ...cam, zoom: clampZoom(cam.zoom, ratio) }, vp, HOME);
      camera.current = cam;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = "#120c20"; // (what shows where the home is smaller than the picture)
      c.fillRect(0, 0, vp.w, vp.h);
      c.setTransform(cam.zoom, 0, 0, cam.zoom, Math.round(vp.w / 2 - cam.x * cam.zoom), Math.round(vp.h / 2 - cam.y * cam.zoom));
      const layout = layoutOf(game.save.home);
      const carried = lifting.current?.held ?? null;
      drawScene(c, game.save, game.view, game.now(), carried ? { ...layout, [carried.kind]: null } : undefined); // (a carried piece is left out here and drawn on top below)
      if (game.decor) {
        game.viewMiddle = { col: cam.x / TILE, row: cam.y / TILE };
        const selected = game.selectedPiece;
        if (carried) {
          drawPiece(c, lookOf(game.save), carried.kind, carried.at);
          drawOutline(c, carried.kind, carried.at, carried.valid ? VALID_COLOR : INVALID_COLOR);
        } else if (selected && layout[selected]) drawOutline(c, selected, layout[selected], VALID_COLOR);
        else if (game.selectedWall) drawWallOutline(c, game.selectedWall, VALID_COLOR);
      }
      const wanted: IconName | null = inView(cam, boxOf(targetBox()), vp) ? null : game.save.creature?.call && !game.save.creature.job ? findIcons[game.save.creature.call] : "happiness";
      if (wanted !== findNow.current) setFind(wanted);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [game, size.k]);

  const isOnTarget = (e: PointerEvent): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const box = targetBox();
    let x = ((e.clientX - rect.left) / rect.width) * ROOM.w;
    let y = ((e.clientY - rect.top) / rect.height) * ROOM.h;
    let pad = 6; // a bit of slack, because fingers are bigger than a few pixels
    const cam = camera.current;
    if (game.view.world === "home" && cam) {
      const vp = viewport();
      const at = toGame(cam, vp, { x: ((e.clientX - rect.left) / rect.width) * vp.w, y: ((e.clientY - rect.top) / rect.height) * vp.h });
      x = at.x;
      y = at.y;
      pad = (PET_PAD_CSS * dpr()) / cam.zoom; // the slack is a size on the screen, so zooming in does not make it a smaller target in the home
    }
    return x >= box.x - pad && x <= box.x + box.size + pad && y >= box.y - pad && y <= box.y + box.size + pad;
  };

  const adult = isAdultMode(game.save);

  const pet = (h: Hold): void => {
    h.petted = true;
    const result = game.act((s, now) => touch(s, "pet", now));
    if (result.asleep) return;
    triggerPose(game.view, "happy");
    if (result.gained > 0) addHeart(game.view);
  };

  const tap = (): void => {
    const save = game.save;
    if (save.phase === "egg") {
      game.act((s, now) => tapEgg(s, now));
      triggerPose(game.view, "wobble"); // the egg wiggles (a last tap that hatches it starts the hatch scene)
      return;
    }
    if (save.phase !== "alive" || save.creature?.sleep) return;
    const now = performance.now();
    taps.current = taps.current.filter((t) => now - t < 1200);
    taps.current.push(now);
    if (taps.current.length >= 3) {
      taps.current = [];
      game.act((s, t) => touch(s, "tickle", t));
      triggerPose(game.view, "happy");
      addSparkles(game.view, 4);
    } else {
      triggerPose(game.view, "startle");
    }
  };

  const endHold = (): Hold | null => {
    const h = hold.current;
    if (h) {
      window.clearTimeout(h.timer);
      window.clearInterval(h.repeat);
    }
    hold.current = null;
    return h;
  };

  // A finger's place on the picture in CSS pixels from its top left corner, and the factor from those to device pixels.
  const place = (e: PointerEvent): { css: Point; device: Point; scale: number } => {
    const canvas = canvasRef.current as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const css = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    return { css, device: { x: css.x * scale, y: css.y * scale }, scale };
  };

  const act = (actions: Action[], scale: number): void => {
    const vp = viewport();
    for (const a of actions) {
      let cam = camera.current;
      if (!cam) return;
      if (a.type === "end") {
        // The fingers are up: settle on a whole number of device pixels per game pixel, keeping the middle of the picture where it is.
        cam = zoomAbout(cam, snapZoom(cam.zoom, dpr()), { x: vp.w / 2, y: vp.h / 2 }, vp, HOME, dpr());
      } else {
        endHold(); // a pan or a pinch is never a pet
        glide.current = null; // (the player has taken the camera: no glide goes on)
        if (a.type === "pan") cam = panBy(cam, a.dx * scale, a.dy * scale, vp, HOME);
        else {
          cam = zoomAbout(cam, cam.zoom * a.scale, { x: a.center.x * scale, y: a.center.y * scale }, vp, HOME, dpr());
          cam = panBy(cam, a.dx * scale, a.dy * scale, vp, HOME);
        }
      }
      camera.current = cam;
    }
  };

  // The home's tile under a finger.
  const tileUnder = (e: PointerEvent): { col: number; row: number } | null => {
    const cam = camera.current;
    return cam ? tileOf(toGame(cam, viewport(), place(e).device)) : null;
  };

  // Decorate mode: a finger that lands on a piece takes it, and selects it.
  const grab = (e: PointerEvent): void => {
    const tile = tileUnder(e);
    const held = tile ? lift(layoutOf(game.save.home), game.save.owned.includes("feeding-mat"), tile.col, tile.row) : null;
    if (!held) return;
    lifting.current = { id: e.pointerId, held };
    game.select(held.kind);
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" && e.button !== 0) return; // only the main mouse button
    if (game.view.world === "home") {
      // The home takes every finger that lands on the picture: a gesture is made of those fingers only (a finger on a button or the HUD never reaches here).
      canvasRef.current?.setPointerCapture(e.pointerId);
      const { css } = place(e);
      if (tracker.current.down(e.pointerId, css)) {
        endHold(); // a second finger ends the first one's hold at once
        lifting.current = null; // ...and puts back the piece the first was carrying: the two fingers pinch
      }
      if (game.decor) {
        if (tracker.current.pointers === 1) grab(e); // (a third finger changes nothing)
        return; // the creature is not touched while decorating
      }
      if (tracker.current.pointers > 1 || game.save.creature?.job || !isOnTarget(e)) return;
      endHold();
      const h: Hold = { id: e.pointerId, petted: false };
      if (game.save.phase === "alive") {
        h.timer = window.setTimeout(() => {
          pet(h);
          h.repeat = window.setInterval(() => pet(h), 800);
        }, 450);
      }
      hold.current = h;
      return;
    }
    if (game.atHabitat || game.atArena || game.save.creature?.job) return; // nothing to pet: the habitat and arena have their own buttons, and an away creature is not in the room
    if (!isOnTarget(e)) return;
    endHold(); // a second finger replaces the first, so no petting timer is left running
    canvasRef.current?.setPointerCapture(e.pointerId);
    const h: Hold = { id: e.pointerId, petted: false };
    if (game.save.phase === "alive") {
      // Holding for a moment turns the touch into petting, and keeps petting while held.
      h.timer = window.setTimeout(() => {
        pet(h);
        h.repeat = window.setInterval(() => pet(h), 800);
      }, 450);
    }
    hold.current = h;
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (game.view.world !== "home") return;
    const { css, scale } = place(e);
    const actions = tracker.current.move(e.pointerId, css);
    const carrying = lifting.current;
    if (carrying?.id === e.pointerId) {
      // The piece follows only once the finger has left the slop: a finger that stays within it is a tap, which selects the piece and moves nothing.
      const tile = tracker.current.mode === "tap" ? null : tileUnder(e);
      if (tile) carrying.held = follow(layoutOf(game.save.home), carrying.held, tile.col, tile.row);
      return; // (the finger carries a piece: the home does not pan under it)
    }
    act(actions, scale);
  };

  // Only the finger that started the hold can end it. Other fingers are ignored.
  const onPointerUp = (e: PointerEvent): void => {
    if (game.view.world === "home") {
      const { css, scale } = place(e);
      const result = tracker.current.up(e.pointerId, css);
      const carrying = lifting.current;
      if (carrying?.id === e.pointerId) {
        // The piece is put down where the finger lifted, if the rules allow it there; otherwise (or on the tile it came from, or when the finger never left the slop) nothing
        // changes and it is back where it was.
        lifting.current = null;
        if (result.tap) return;
        const layout = layoutOf(game.save.home);
        const tile = tileUnder(e);
        const next = drop(layout, tile ? follow(layout, carrying.held, tile.col, tile.row) : carrying.held);
        if (next) game.setLayout(next);
        return;
      }
      act(result.actions, scale);
      if (game.decor) {
        if (result.tap) {
          // A tap on a room's bare wall selects that wall (the dock offers wallpapers); a tap anywhere else lets go of the piece or the wall.
          const tile = tileUnder(e);
          const room = tile ? wallRoomOf(tile.col, tile.row) : null;
          if (room) game.selectWall(room);
          else game.select(null);
        }
        return;
      }
      if (hold.current?.id !== e.pointerId) return;
      const h = endHold();
      if (h && !h.petted && result.tap) tap();
      return;
    }
    if (hold.current?.id !== e.pointerId) return;
    const h = endHold();
    if (h && !h.petted) tap();
  };

  const onPointerCancel = (e: PointerEvent): void => {
    if (lifting.current?.id === e.pointerId) lifting.current = null; // the piece goes back
    if (game.view.world === "home") act(tracker.current.cancel(e.pointerId), 1);
    if (hold.current?.id === e.pointerId) endHold();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    const cam = camera.current;
    if (game.view.world !== "home" || !cam || e.ctrlKey || e.metaKey || e.altKey) return; // (Ctrl and + is the browser's own zoom)
    if (game.decor) {
      if (e.key === "Escape") {
        e.preventDefault();
        game.select(null);
        return;
      }
      const step = ARROWS[e.key];
      if (step && game.selectedPiece) {
        e.preventDefault(); // (with a piece selected the arrows move it; with none they move the camera)
        game.nudge(step.col, step.row);
        return;
      }
    }
    const next = stepCamera(cam, e.key, viewport(), HOME, dpr());
    if (!next) return;
    e.preventDefault();
    glide.current = null;
    camera.current = next;
  };

  // Find: the camera glides to the creature (or jumps there when the player asked for less motion).
  const onFind = (): void => {
    const cam = camera.current;
    if (!cam) return;
    const to = frameOn(cam, boxOf(targetBox()), viewport(), HOME);
    if (window.matchMedia?.(MOTION_QUERY).matches) {
      glide.current = null;
      camera.current = to;
    } else glide.current = { from: cam, to, t: 0 };
  };

  useEffect(() => endHold, []); // stop any timers if the screen goes away

  const label = game.save.creature ? getForm(game.save.creature.formId).name : "the egg";
  return (
    <div class={adult ? "stage adult" : "stage"} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        class="room"
        width={ROOM.w * size.k}
        height={ROOM.h * size.k}
        role="img"
        aria-label={describe(game.save, game)}
        tabIndex={inHome ? 0 : undefined}
        style={{ width: `${size.css}px`, height: `${size.css}px`, touchAction: inHome ? "none" : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      />
      {inHome && !scene && !game.decor && (
        <button class="btn decorate-btn" aria-label="Decorate the home" onClick={() => game.startDecor()}>
          <Icon name="decorate" px={28} />
        </button>
      )}
      {inHome && find !== null && (
        <button class="btn find" aria-label={`Find ${label}`} onClick={onFind}>
          <Icon name={find} px={28} />
        </button>
      )}
      {adult && (
        <div class="reason-box" role="status" style={{ width: `${size.css}px`, height: `${size.css}px` }}>
          {game.note && <p class="reason">{game.note}</p>}
        </div>
      )}
    </div>
  );
}
