// The picture of the room, and the touch controls on it.
//   tap the egg        -> helps it hatch
//   tap the creature   -> it startles (3 quick taps = tickle)
//   hold the creature  -> petting
import { useEffect, useRef, useState } from "preact/hooks";
import { addEffect, triggerPose, updateView } from "../art/idle";
import { ROOM } from "../art/layout";
import { drawScene, moodOf } from "../art/scene";
import { getForm } from "../data/forms";
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
function describe(save: Save): string {
  if (save.phase === "egg") return "An egg. Tap it to help it hatch.";
  if (!save.creature) return "";
  const name = getForm(save.creature.formId).name;
  if (save.phase === "dead") return `${name} has passed away.`;
  if (save.creature.sleep) return `${name} is asleep.`;
  return save.creature.call ? `${name} ${callWords[save.creature.call]}.` : `${name} is doing fine.`;
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
  // The room is 96 x 96 "game pixels". Each one is drawn k screen pixels wide, where k is a
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
      updateView(game.view, dt, moodOf(game.save), Math.random);
      ctx.setTransform(size.k, 0, 0, size.k, 0, 0); // draw in game pixels, scaled up
      ctx.imageSmoothingEnabled = false;
      drawScene(ctx, game.save, game.view, game.now());
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [game, size.k]);

  // Where the creature (or egg) is, as a box in room pixels.
  const targetBox = (): { x: number; y: number } => {
    const save = game.save;
    if (save.phase === "egg") return { x: ROOM.eggX, y: ROOM.eggY };
    return save.creature?.sleep ? { x: ROOM.bedX, y: ROOM.bedY } : { x: game.view.x, y: ROOM.walkY };
  };

  const isOnTarget = (e: PointerEvent): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * ROOM.w;
    const y = ((e.clientY - rect.top) / rect.height) * ROOM.h;
    const box = targetBox();
    const pad = 6; // a bit of slack, because fingers are bigger than 16 pixels
    return x >= box.x - pad && x <= box.x + ROOM.sprite + pad && y >= box.y - pad && y <= box.y + ROOM.sprite + pad;
  };

  const sparkles = (count: number): void => {
    const box = targetBox();
    for (let i = 0; i < count; i++) {
      addEffect(game.view, "sparkle", box.x + 2 + Math.random() * 12, box.y + 2 + Math.random() * 10);
    }
  };

  const pet = (h: Hold): void => {
    h.petted = true;
    const result = game.act((s, now) => touch(s, "pet", now));
    if (result.asleep) return;
    triggerPose(game.view, "happy");
    if (result.gained > 0) addEffect(game.view, "heart", game.view.x + 4, ROOM.walkY - 2);
  };

  const tap = (): void => {
    const save = game.save;
    if (save.phase === "egg") {
      const result = game.act((s, now) => tapEgg(s, now));
      triggerPose(game.view, "refuse"); // the egg wobbles
      if (result === "hatched") {
        sparkles(8);
        triggerPose(game.view, "happy");
      }
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
      sparkles(4);
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
        aria-label={describe(game.save)}
        style={{ width: `${size.css}px`, height: `${size.css}px` }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
