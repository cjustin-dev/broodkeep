// The picture of the home, and the touch controls on it.
//   tap the egg        -> helps it hatch
//   tap the creature   -> it startles (3 quick taps = tickle)
//   hold the creature  -> petting
//   tap the ball or the gift over its head (Adult Mode, an initiative: docs/adult-a3-plan.md section 14) -> plays, or takes the gift; the bubble is tested before the creature
//   drag               -> moves the camera over the home (docs/home-plan.md section 3.2); two fingers pinch it bigger or smaller
// While Decorate mode is on (docs/home-plan.md section 12) the creature is not touched at all: a finger on a piece of furniture carries it on the tile grid (a tap selects it),
// a finger anywhere else pans, and a tap there lets go of the selection. The arrow keys move the selected piece; Escape lets go of it.
// The habitat, the arena and a field keep the old 128 x 128 picture (no camera); the home is 768 x 192 (1032 x 192 once the Playroom is built) and the camera shows a square part of it.
import { useEffect, useRef, useState } from "preact/hooks";
import { drawArena } from "../art/arena";
import { clampCamera, clampZoom, defaultZoom, frameOn, inView, panBy, snapZoom, stepCamera, toGame, zoomAbout } from "../art/camera";
import type { Box, Camera, Point } from "../art/camera";
import { HOME, layoutInForce, roomOf, roomsInForce, useLayout } from "../art/home";
import { drop, follow, lift, tileOf } from "../art/homeEdit";
import type { Lift } from "../art/homeEdit";
import { layoutOfSave } from "../art/homeLayout";
import { addHeart, addSparkles, reseat, triggerPose, updateView } from "../art/idle";
import { ROOM } from "../art/layout";
import { stepMoment } from "../art/moment";
import { drawHabitat } from "../art/habitat";
import { drawOutline, drawPiece, drawWallOutline, lookOf } from "../art/room";
import { bubbleBox, drawScene, moodOf, sizeOf } from "../art/scene";
import { spotsOf } from "../art/spots";
import type { World } from "../art/spots";
import { GestureTracker } from "./gesture";
import type { Action } from "./gesture";
import { Icon } from "./Icon";
import type { IconName } from "../art/sprites";
import { fields } from "../data/fields";
import { foods } from "../data/foods";
import { getForm } from "../data/forms";
import { spots } from "../data/habitat";
import { tapTuning } from "../data/tappables";
import { PIECE_NAMES, TILE, roomsBuilt, wallRoomOf } from "../data/home";
import { tapEgg, touch } from "../game/actions";
import { BIG_BURST_LEVEL, bondAtLeast } from "../game/bond";
import { isAdultMode } from "../game/hud";
import { tappableAt, touches } from "../game/tappables";
import type { CallKind, Save } from "../game/state";
import type { FoodId } from "../game/types";
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
  return where + (save.creature.call ? `${name} ${callWords[save.creature.call]}.` : `${name} is doing fine.`) + offerOf(game, name) + (game.view.tappables.length > 0 ? " Something to tap on the ground." : "") + room;
}

// What an initiative offers, for screen readers (nothing while a call is on: the call has the bubble).
function offerOf(game: Game, name: string): string {
  const i = game.initiative;
  const c = game.save.creature;
  if (!i || !c || c.call) return "";
  if (i.kind === "play") return ` ${name} is holding out a ball. Tap it to play.`;
  if (i.kind === "gift") return ` ${name} found something. Tap it to take it.`;
  return ` ${name} wants ${foods[i.food as FoodId].name.toLowerCase()}.`;
}

// The bubble of an initiative that is showing, in game pixels (null for none). A tap on a craving's bubble lands here too and does nothing (a craving is answered by feeding): without it the touch would
// fall through to the creature under the bubble's lower edge and pet or poke it. The draw and the hit test both take the place from `bubbleBox`.
function bubbleOf(game: Game): Box | null {
  const i = game.initiative;
  const c = game.save.creature;
  if (!i || !c || c.call || c.sleep || c.job) return null;
  return bubbleBox(game.view, sizeOf(game.save), spotsOf(game.view.world).w);
}

export const roomNames = { bedroom: "bedroom", living: "living room", kitchen: "kitchen", playroom: "playroom" } as const;

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
  bubble?: boolean; // the finger landed on an initiative's bubble: a tap answers it, and there is no petting timer
  tappable?: number; // the finger landed on a tappable in a field (its id): a lift still on it takes it, and there is no petting timer
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
    // For the browser checks: the canvas says which initiative is showing (`data-initiative`: play, craving or gift) and where its bubble is (`data-bubble`: x, y, width and height in CSS pixels from the
    // canvas's top left corner). Both are left off while there is none, and in Kid Mode, so the page is unchanged there.
    const markBubble = (cv: HTMLCanvasElement, world: World): void => {
      const i = game.initiative;
      const c = game.save.creature;
      const showing = i !== null && game.view.invite !== null && !!c && !c.call && !c.sleep && !c.job;
      let box: string | null = null;
      if (showing) {
        const b = bubbleBox(game.view, sizeOf(game.save), spotsOf(world).w);
        const cam = camera.current;
        const zoom = world === "home" && cam ? cam.zoom : size.k; // the transform the picture was drawn with, then device pixels to CSS pixels
        const tx = world === "home" && cam ? Math.round(cv.width / 2 - cam.x * cam.zoom) : 0;
        const ty = world === "home" && cam ? Math.round(cv.height / 2 - cam.y * cam.zoom) : 0;
        const css = cv.getBoundingClientRect().width / cv.width;
        const round = (n: number): number => Math.round(n * 10) / 10;
        box = [(b.x * zoom + tx) * css, (b.y * zoom + ty) * css, b.w * zoom * css, b.h * zoom * css].map(round).join(",");
      }
      const kind = showing ? i.kind : null;
      if (cv.getAttribute("data-initiative") !== kind) kind === null ? cv.removeAttribute("data-initiative") : cv.setAttribute("data-initiative", kind);
      if (cv.getAttribute("data-bubble") !== box) box === null ? cv.removeAttribute("data-bubble") : cv.setAttribute("data-bubble", box);
    };
    // For the browser checks: `data-tappables` lists what is on the ground in a field, one `kind:x,y,w,h` for each (the picture's box in CSS pixels from the canvas's top left corner), joined with `|`.
    // Left off while there is none, and in Kid Mode, so the page is unchanged there.
    const markTappables = (cv: HTMLCanvasElement, world: World): void => {
      const list = world === "line" ? game.view.tappables : [];
      const css = cv.getBoundingClientRect().width / cv.width;
      const round = (n: number): number => Math.round(n * 10) / 10;
      const value = list.length === 0 ? null : list.map((p) => `${p.kind}:${[p.x * size.k * css, p.y * size.k * css, tapTuning.size * size.k * css, tapTuning.size * size.k * css].map(round).join(",")}`).join("|");
      if (cv.getAttribute("data-tappables") !== value) value === null ? cv.removeAttribute("data-tappables") : cv.setAttribute("data-tappables", value);
    };
    const frame = (now: number): void => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const world = worldOf(game);
      game.view.world = world;
      const layout = layoutOfSave(game.save); // (the furniture was moved, or a room was built or given back: the walking is done on the new floor, and the creature is put on a free tile)
      const rooms = roomsBuilt(game.save.owned);
      if (layout !== layoutInForce() || rooms !== roomsInForce()) {
        useLayout(layout, rooms);
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
        game.view.inView = true; // (no camera: all of the picture is in view)
        ctx.setTransform(size.k, 0, 0, size.k, 0, 0); // draw in game pixels, scaled up
        if (findNow.current !== null) setFind(null);
        if (game.atHabitat) drawHabitat(ctx, game.save, game.view, game.now());
        else if (game.atArena) {
          const arena = game.arena;
          drawArena(ctx, game.save, game.now(), game.view.clock, arena ? { battle: arena.battle, play: arena.play, t: game.arenaTime() } : null);
        } else drawScene(ctx, game.save, game.view, game.now());
      }
      markBubble(canvas, world);
      markTappables(canvas, world);
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
      const layout = layoutOfSave(game.save);
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
      const visible = inView(cam, boxOf(targetBox()), vp);
      game.view.inView = visible; // (an initiative is not made while the creature is out of the camera's view)
      const wanted: IconName | null = visible ? null : game.save.creature?.call && !game.save.creature.job ? findIcons[game.save.creature.call] : "happiness";
      if (wanted !== findNow.current) setFind(wanted);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [game, size.k]);

  // A pointer's place in game pixels, and how much slack a touch gets around a target (a bit more than a finger's width).
  const pointOf = (e: PointerEvent): { x: number; y: number; pad: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
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
    return { x, y, pad };
  };

  const isOnTarget = (e: PointerEvent): boolean => {
    const at = pointOf(e);
    if (!at) return false;
    const box = targetBox();
    return at.x >= box.x - at.pad && at.x <= box.x + box.size + at.pad && at.y >= box.y - at.pad && at.y <= box.y + box.size + at.pad;
  };

  // A touch on the bubble over the creature's head, whatever it offers (the bubble is tested before the creature).
  const isOnBubble = (e: PointerEvent): boolean => {
    const at = pointOf(e);
    const box = bubbleOf(game);
    return !!at && !!box && at.x >= box.x - at.pad && at.x <= box.x + box.w + at.pad && at.y >= box.y - at.pad && at.y <= box.y + box.h + at.pad;
  };

  const adult = isAdultMode(game.save);

  // A new Bond level is a burst of sparkles with a heart (the chip in the header pops too, ui/AdultHud.tsx).
  const levelBurst = (result: { levelUp?: number | null }): void => {
    if (!result.levelUp) return;
    addSparkles(game.view, 8);
    addHeart(game.view);
  };

  // The ball or the gift was tapped (an initiative, adult track A3.3). `answerInitiative` pays; this only shows it: a toss hops, a gift beams, a new Bond level is the usual burst.
  const answer = (): void => {
    const result = game.answerInitiative();
    if (!result) return;
    triggerPose(game.view, result.kind === "play" ? "hop" : "happy");
    addSparkles(game.view, result.kind === "play" && result.over ? 5 : 2);
    levelBurst(result);
  };

  // A tappable was tapped (a field, adult track A3.4). `tapTappable` pays and the creature reacts; this only shows a new Bond level, the usual burst.
  const takeTappable = (id: number): void => {
    const result = game.tapTappable(id);
    if (result) levelBurst(result);
  };

  // The tappable a touch is for in a field's picture (the nearest of those it touches), or null: none showing, the home, Kid Mode.
  const tappableUnder = (e: PointerEvent): { id: number; x: number; y: number } | null => {
    if (game.view.world === "home" || game.view.tappables.length === 0) return null;
    const at = pointOf(e);
    return at ? tappableAt(game.view.tappables, at.x, at.y) : null;
  };

  const pet = (h: Hold): void => {
    h.petted = true;
    const result = game.act((s, now) => touch(s, "pet", now));
    if (result.asleep) return;
    triggerPose(game.view, "happy");
    if (result.gained > 0) addHeart(game.view);
    if (result.gained > 0 && bondAtLeast(game.save, BIG_BURST_LEVEL)) addSparkles(game.view, 3); // (Bond level 5: a bigger burst; Adult Mode only, read from the save at each pet)
    levelBurst(result);
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
      const result = game.act((s, t) => touch(s, "tickle", t));
      triggerPose(game.view, "happy");
      addSparkles(game.view, 4);
      levelBurst(result);
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
    const held = tile ? lift(layoutOfSave(game.save), game.save.owned.includes("feeding-mat"), tile.col, tile.row) : null;
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
      if (tracker.current.pointers > 1 || game.save.creature?.job) return;
      if (isOnBubble(e)) {
        endHold();
        hold.current = { id: e.pointerId, petted: false, bubble: true }; // (no petting timer: a tap answers it)
        return;
      }
      if (!isOnTarget(e)) return;
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
    const onBall = isOnBubble(e);
    const onTap = onBall ? null : tappableUnder(e); // (the bubble is over a tappable, and a tappable over the creature)
    if (!onBall && !onTap && !isOnTarget(e)) return;
    endHold(); // a second finger replaces the first, so no petting timer is left running
    canvasRef.current?.setPointerCapture(e.pointerId);
    const h: Hold = { id: e.pointerId, petted: false, bubble: onBall || undefined, tappable: onTap?.id };
    if (onBall || onTap) {
      hold.current = h;
      return;
    }
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
      if (tile) carrying.held = follow(layoutOfSave(game.save), carrying.held, tile.col, tile.row, roomsBuilt(game.save.owned));
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
        const layout = layoutOfSave(game.save);
        const rooms = roomsBuilt(game.save.owned);
        const tile = tileUnder(e);
        const next = drop(layout, tile ? follow(layout, carrying.held, tile.col, tile.row, rooms) : carrying.held, rooms);
        if (next) game.setLayout(next);
        return;
      }
      act(result.actions, scale);
      if (game.decor) {
        if (result.tap) {
          // A tap on a room's bare wall selects that wall (the dock offers wallpapers); a tap anywhere else lets go of the piece or the wall.
          const tile = tileUnder(e);
          const room = tile ? wallRoomOf(tile.col, tile.row, roomsBuilt(game.save.owned)) : null;
          if (room) game.selectWall(room);
          else game.select(null);
        }
        return;
      }
      if (hold.current?.id !== e.pointerId) return;
      const h = endHold();
      if (h?.bubble) {
        if (result.tap) answer(); // (a drag that began on the bubble answers nothing)
        return; // ...and a bubble tap never pokes or counts toward a tickle
      }
      if (h && !h.petted && result.tap) tap();
      return;
    }
    if (hold.current?.id !== e.pointerId) return;
    const h = endHold();
    if (h?.bubble) {
      if (isOnBubble(e)) answer(); // (the one-line picture has no pan: a finger that has left the bubble answers nothing)
      return;
    }
    if (h?.tappable !== undefined) {
      const mine = game.view.tappables.find((p) => p.id === h.tappable);
      const at = pointOf(e);
      if (mine && at && touches(mine, at.x, at.y)) takeTappable(mine.id); // (a finger that has left it takes nothing, and nothing is poked)
      return;
    }
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
