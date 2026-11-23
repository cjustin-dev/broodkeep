// The picture of the room, and the touch controls on it.
//   tap the egg        -> helps it hatch
//   tap the creature   -> it startles (3 quick taps = tickle)
//   hold the creature  -> petting
import { useEffect, useRef, useState } from "preact/hooks";
import { drawArena } from "../art/arena";
import { addHeart, addSparkles, triggerPose, updateView } from "../art/idle";
import { ROOM, bedSpot, standY } from "../art/layout";
import { stepMoment } from "../art/moment";
import { drawHabitat } from "../art/habitat";
import { drawScene, moodOf, sizeOf } from "../art/scene";
import { fields } from "../data/fields";
import { getForm } from "../data/forms";
import { spots } from "../data/habitat";
import { tapEgg, touch } from "../game/actions";
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
  if (save.creature.sleep) return `${name} is asleep.`;
  const where = place === "home" ? "" : `In the ${fields[place].name} field. `;
  return where + (save.creature.call ? `${name} ${callWords[save.creature.call]}.` : `${name} is doing fine.`);
}

interface Hold {
  id: number; // which finger (pointer) started this hold
  petted: boolean;
  timer?: number;
  repeat?: number;
}

export function Stage({ game }: { game: Game }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The room is 128 x 128 "game pixels". Each one is drawn k screen pixels wide, where k is a
  // whole number of DEVICE pixels, so every game pixel is exactly the same size and stays sharp,
  // while the room still fills the width of the screen. css is the size on the page.
  const [size, setSize] = useState({ k: 3, css: ROOM.w * 3 });
  const hold = useRef<Hold | null>(null);
  const taps = useRef<number[]>([]);

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

  // Draw loop: one frame at a time, as fast as the screen refreshes.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      stepMoment(game.view, game.save, dt);
      updateView(game.view, dt, moodOf(game.save), Math.random, sizeOf(game.save));
      ctx.setTransform(size.k, 0, 0, size.k, 0, 0); // draw in game pixels, scaled up
      ctx.imageSmoothingEnabled = false;
      if (game.atHabitat) drawHabitat(ctx, game.save, game.view, game.now());
      else if (game.atArena) {
        const arena = game.arena;
        drawArena(ctx, game.save, game.now(), game.view.clock, arena ? { battle: arena.battle, play: arena.play, t: game.arenaTime() } : null);
      } else drawScene(ctx, game.save, game.view, game.now());
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [game, size.k]);

  // Where the creature (or egg) is, as a square box in room pixels (top left corner and side).
  const targetBox = (): { x: number; y: number; size: number } => {
    const save = game.save;
    if (save.phase === "egg") return { x: ROOM.eggX, y: ROOM.eggY, size: ROOM.sprite };
    const side = sizeOf(save);
    if (save.creature?.sleep) return { ...bedSpot(side), size: side };
    return { x: game.view.x, y: standY(side), size: side };
  };

  const isOnTarget = (e: PointerEvent): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * ROOM.w;
    const y = ((e.clientY - rect.top) / rect.height) * ROOM.h;
    const box = targetBox();
    const pad = 6; // a bit of slack, because fingers are bigger than a few pixels
    return x >= box.x - pad && x <= box.x + box.size + pad && y >= box.y - pad && y <= box.y + box.size + pad;
  };

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

  const onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === "mouse" && e.button !== 0) return; // only the main mouse button
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

  // Only the finger that started the hold can end it. Other fingers are ignored.
  const onPointerUp = (e: PointerEvent): void => {
    if (hold.current?.id !== e.pointerId) return;
    const h = endHold();
    if (h && !h.petted) tap();
  };

  const onPointerCancel = (e: PointerEvent): void => {
    if (hold.current?.id === e.pointerId) endHold();
  };

  useEffect(() => endHold, []); // stop any timers if the screen goes away

  return (
    <div class="stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        class="room"
        width={ROOM.w * size.k}
        height={ROOM.h * size.k}
        role="img"
        aria-label={describe(game.save, game)}
        style={{ width: `${size.css}px`, height: `${size.css}px` }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
