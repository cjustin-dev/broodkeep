// Draws the arena: the ring, both fighters, their HP bars and the special meter, and plays back the blows of
// the last round one after another. PLACEHOLDER ART made from simple rectangles, like the room.
// Reads the battle, never changes it. No numbers are drawn: the bars and pips say it all.

import { combatTuning } from "../data/combat";
import { getForm } from "../data/forms";
import type { Battle, BattleEvent, Side } from "../game/combat/battle";
import { currentHp, maxHp } from "../game/combat/stats";
import type { Save } from "../game/state";
import { hourOf, realClock } from "../game/time";
import { faceSprite, isWide } from "./face";
import type { FaceKind } from "./face";
import { ROOM } from "./layout";
import { drawSprite, spriteCanvas } from "./pixel";
import { sky } from "./room";
import { drawBubble } from "./scene";
import { icons } from "./sprites";
import type { IconName } from "./sprites";

// Where the fighters stand: the middle of each picture, and the line their feet are on.
export const ARENA = { meX: 34, foeX: 94, feetY: 112, lunge: 10 };
// How long things take, in seconds. A round plays guards and sulks together first, then each blow in turn.
export const FX = { calm: 0.4, strike: 0.5, hitAt: 0.2, recoil: 0.25, down: 0.5 };

export interface Step {
  event: BattleEvent;
  start: number; // seconds from the start of the round
  hitAt: number | null; // when a blow lands (null for a guard or a sulk)
}
export interface Playback {
  steps: Step[];
  length: number; // seconds until the round has finished playing
}

// Lay a round's events out in time. Guards and sulks happen together at the start, then each blow follows the last.
export function playback(events: BattleEvent[], over: boolean): Playback {
  const steps: Step[] = [];
  const calm = events.filter((e) => e.kind === "guard" || e.kind === "sulk");
  for (const event of calm) steps.push({ event, start: 0, hitAt: null });
  let t = calm.length > 0 ? FX.calm : 0;
  for (const event of events) {
    if (event.kind !== "attack" && event.kind !== "special") continue;
    steps.push({ event, start: t, hitAt: t + FX.hitAt });
    t += FX.strike;
  }
  return { steps, length: t + (over ? FX.down : 0) };
}

// What the HP bar shows `t` seconds into the round: the HP from before it, less every blow that has landed so far.
export function shownHp(b: Battle, play: Playback | null, t: number, side: Side): number {
  if (!play) return b[side].hp;
  let hp = b.hpBefore[side];
  for (const step of play.steps) {
    if (step.hitAt !== null && step.hitAt <= t && step.event.actor !== side) hp = Math.max(0, hp - step.event.damage);
  }
  return hp;
}

const strikeOf = (play: Playback, side: Side, t: number): Step | undefined =>
  play.steps.find((s) => s.hitAt !== null && s.event.actor === side && t >= s.start && t < s.start + FX.strike);

// The latest blow that has landed on this side, and how long ago. A parried blow (a Perfect guard) lands on nothing: no recoil.
function lastHitOn(play: Playback, side: Side, t: number): { step: Step; age: number } | null {
  let found: { step: Step; age: number } | null = null;
  for (const step of play.steps) {
    if (step.hitAt !== null && step.hitAt <= t && step.event.actor !== side && !step.event.parried) found = { step, age: t - step.hitAt };
  }
  return found;
}

// The left and top edge of a fighter's standing picture (a picture `size` pixels across), lunging at the other side or
// recoiling from a hit. Wider pictures (slumped) are centered on the same spot by the drawing code.
export function fighterPlace(side: Side, size: number, play: Playback | null, t: number): { x: number; y: number } {
  const dir = side === "me" ? 1 : -1;
  let dx = 0;
  if (play) {
    const strike = strikeOf(play, side, t);
    if (strike) {
      const u = (t - strike.start) / FX.strike;
      const out = FX.hitAt / FX.strike;
      dx += dir * Math.round(ARENA.lunge * (u < out ? u / out : (1 - u) / (1 - out)));
    }
    const hit = lastHitOn(play, side, t);
    if (hit && hit.age < FX.recoil) dx -= dir * Math.round((hit.step.event.crit ? 4 : 2) * (1 - hit.age / FX.recoil));
  }
  return { x: (side === "me" ? ARENA.meX : ARENA.foeX) - size / 2 + dx, y: ARENA.feetY - size };
}

export interface ArenaShow {
  battle: Battle;
  play: Playback | null; // the round being played back (null before the first round)
  t: number; // seconds since that round began
}

function rect(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function icon(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number): void {
  ctx.drawImage(spriteCanvas(icons[name], `icon:${name}`), Math.round(x), Math.round(y));
}

function drawGround(ctx: CanvasRenderingContext2D, hour: number): void {
  const s = sky(hour);
  rect(ctx, s.color, 0, 0, ROOM.w, 53);
  if (s.stars) {
    for (const [x, y] of [[13, 7], [45, 16], [77, 5], [107, 19], [120, 8]] as const) rect(ctx, "#ffffff", x, y, 1, 1);
  }
  rect(ctx, "#6b7078", 0, 40, ROOM.w, 35); // the wall round the ring
  for (let y = 44, row = 0; y < 75; y += 8, row++) {
    for (let x = (row % 2) * 10; x < ROOM.w; x += 20) rect(ctx, "#5a5f66", x, y, 10, 1);
  }
  for (const [x, color] of [[19, "#e0455b"], [61, "#4aa3df"], [104, "#e0455b"]] as const) {
    rect(ctx, "#3a3a44", x, 40, 1, 7); // a banner on a pole
    rect(ctx, color, x + 1, 41, 9, 12);
    rect(ctx, color, x + 3, 53, 5, 1);
  }
  rect(ctx, "#e8c98a", 0, 75, ROOM.w, ROOM.h - 75); // sand
  for (let y = 80, row = 0; y < ROOM.h; y += 9, row++) {
    for (let x = (row % 2) * 9; x < ROOM.w; x += 18) rect(ctx, "#d9b98a", x, y, 5, 1);
  }
  rect(ctx, "#c9a56e", 0, 75, ROOM.w, 1);
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, hp: number, max: number, color: string): void {
  rect(ctx, "#1a1020", x - 1, y - 1, w + 2, 6);
  rect(ctx, "#3a2a4a", x, y, w, 4);
  const filled = hp <= 0 ? 0 : Math.max(1, Math.round((w * hp) / max));
  rect(ctx, color, x, y, filled, 4);
}

function meterPips(ctx: CanvasRenderingContext2D, x: number, y: number, meter: number): void {
  for (let i = 0; i < combatTuning.meterMax; i++) {
    rect(ctx, "#1a1020", x + i * 7, y, 6, 4);
    rect(ctx, i < meter ? "#ffd25a" : "#3a2a4a", x + i * 7 + 1, y + 1, 4, 2);
  }
}

// The ladder of fights: cleared rungs green, this one yellow, the rest dark, and the last (the boss) red.
function ladderPips(ctx: CanvasRenderingContext2D, x: number, y: number, rung: number): void {
  const last = combatTuning.ladder.length;
  for (let i = 1; i <= last; i++) {
    const boss = i === last;
    const color = i < rung ? "#5cb85c" : i === rung ? (boss ? "#e0455b" : "#ffd25a") : boss ? "#7a3040" : "#3a2a4a";
    rect(ctx, "#1a1020", x + (i - 1) * 8, y, 7, 5);
    rect(ctx, color, x + (i - 1) * 8 + 1, y + 1, 5, 3);
  }
}

function faceOf(show: ArenaShow, side: Side, clock: number): FaceKind {
  const { battle: b, play, t } = show;
  const lost = b.over !== null && (b.over === "won") === (side === "foe");
  const koStep = play?.steps.find((s) => s.event.ko);
  const settled = b.over !== null && (!koStep || (koStep.hitAt ?? 0) <= t);
  if (settled) return lost ? "droopClosed" : "happy";
  if (play && t < play.length) {
    const hit = lastHitOn(play, side, t);
    if (hit && hit.age < FX.recoil * 2) return "closed"; // a wince
    const mine = play.steps.find((s) => s.event.actor === side && t >= s.start && (s.hitAt === null || t < s.start + FX.strike));
    if (mine?.event.kind === "guard") return "closed";
    if (mine?.event.kind === "sulk") return "droop";
    if (mine?.event.kind === "special") return "yawn"; // a shout
  }
  return (clock + (side === "me" ? 0 : 1.7)) % 3.4 < 0.16 ? "closed" : "open";
}

function drawFighter(ctx: CanvasRenderingContext2D, show: ArenaShow, side: Side, clock: number): void {
  const { battle: b, play, t } = show;
  const form = getForm(b[side].formId);
  const size = form.idle.length;
  const kind = faceOf(show, side, clock);
  const frame: 0 | 1 = isWide(kind) ? 0 : Math.floor((clock + (side === "me" ? 0 : 0.5)) * 2) % 2 === 0 ? 0 : 1;
  const hit = play ? lastHitOn(play, side, t) : null;
  const flash = hit && hit.age < FX.recoil ? (hit.age < FX.recoil / 3 ? 0.8 : 0.45) : 0;
  const tint = flash
    ? { color: "#ffffff", amount: flash }
    : kind === "droopClosed"
      ? { color: "#8a8a8a", amount: 0.6 }
      : side === "foe" && b.boss
        ? { color: "#e0455b", amount: 0.22 }
        : undefined;
  const sprite = spriteCanvas(faceSprite(form, kind, frame), `form:${form.id}:${kind}:${frame}`, tint);
  const place = fighterPlace(side, size, play, t);
  const bob = kind === "open" && Math.floor((clock + (side === "me" ? 0 : 0.3)) * 3) % 2 === 1 ? 1 : 0;
  const x = place.x - (sprite.width - size) / 2; // a wider (slumped) picture stays on the same middle
  drawSprite(ctx, sprite, x, place.y + bob, { flipX: side === "foe" });

  const dir = side === "me" ? 1 : -1;
  const midX = place.x + size / 2;
  const active = play !== null && t < play.length; // guards and sulks only show while the round plays
  if (active && play.steps.some((s) => s.event.actor === side && s.event.kind === "guard" && t >= s.start)) {
    icon(ctx, "shield", midX + dir * (size / 2 - 1) - 4, place.y + size / 2 - 4);
  }
  if (active && play.steps.some((s) => s.event.actor === side && s.event.kind === "sulk" && t >= s.start)) {
    drawBubble(ctx, "cloud", Math.round(midX - 6), Math.max(0, place.y - 16));
  }
}

// The spark that flies at the other side during a special, and the burst where a blow lands.
function drawStrikes(ctx: CanvasRenderingContext2D, show: ArenaShow): void {
  const { play, t } = show;
  if (!play) return;
  for (const step of play.steps) {
    if (step.hitAt === null) continue;
    const mine = step.event.actor === "me";
    const targetX = mine ? ARENA.foeX : ARENA.meX;
    const y = ARENA.feetY - 18;
    if (step.event.kind === "special" && t >= step.start && t < step.hitAt) {
      const p = (t - step.start) / FX.hitAt;
      const fromX = mine ? ARENA.meX + 8 : ARENA.foeX - 8;
      icon(ctx, "spark", fromX + (targetX - fromX) * p - 4, y - 4);
    }
    if (step.event.parried) continue; // nothing was hit, so no burst
    const age = t - step.hitAt;
    if (age < 0 || age >= FX.recoil) continue;
    if (step.event.kind === "special") icon(ctx, "spark", targetX - 4, y - 4);
    const spread = step.event.crit ? 7 : 3;
    for (const [dx, dy] of step.event.crit ? ([[-spread, -spread], [spread, -spread], [0, 0], [-spread, spread], [spread, spread]] as const) : ([[0, 0], [spread, -spread]] as const)) {
      rect(ctx, "#ffe066", targetX + dx, y + dy - 1, 1, 3);
      rect(ctx, "#ffe066", targetX + dx - 1, y + dy, 3, 1);
    }
  }
}

export function drawArena(ctx: CanvasRenderingContext2D, save: Save, gameNowMs: number, clock: number, show: ArenaShow | null): void {
  ctx.imageSmoothingEnabled = false;
  const hour = hourOf(realClock(save, gameNowMs));
  drawGround(ctx, hour);
  const c = save.phase === "alive" ? save.creature : null;
  if (!c) return;

  const night = (): void => {
    if (sky(hour).stars) rect(ctx, "rgba(15, 10, 50, 0.35)", 0, 0, ROOM.w, ROOM.h);
  };

  if (show) {
    const { battle: b, play, t } = show;
    drawFighter(ctx, show, "foe", clock);
    drawFighter(ctx, show, "me", clock);
    drawStrikes(ctx, show);
    bar(ctx, 6, 5, 52, shownHp(b, play, t, "me"), b.me.maxHp, "#5cb85c");
    meterPips(ctx, 6, 14, b.me.meter);
    bar(ctx, 70, 5, 52, shownHp(b, play, t, "foe"), b.foe.maxHp, b.boss ? "#e0455b" : "#f08a24");
    ladderPips(ctx, 70, 14, b.rung);
    night();
    return;
  }

  // No fight on: the creature waits on the left (or is out or in bed), and the right side invites a fight.
  bar(ctx, 6, 5, 52, currentHp(c), maxHp(c), "#5cb85c");
  ladderPips(ctx, 70, 5, Math.min(combatTuning.ladder.length, Math.max(1, c.rung ?? 1)));
  if (c.job) drawBubble(ctx, "tree", ARENA.meX - 6, 80);
  else if (c.sleep) drawBubble(ctx, "house", ARENA.meX - 6, 80);
  else {
    const form = getForm(c.formId);
    const size = form.idle.length;
    const frame = Math.floor(clock * 2) % 2 === 1 ? 1 : 0;
    const blink = clock % 3.4 < 0.16;
    const kind: FaceKind = blink ? "closed" : "open";
    const sprite = spriteCanvas(faceSprite(form, kind, blink ? 0 : (frame as 0 | 1)), `form:${form.id}:${kind}:${blink ? 0 : frame}`);
    drawSprite(ctx, sprite, ARENA.meX - size / 2, ARENA.feetY - size + (Math.floor(clock * 3) % 2 === 1 ? 1 : 0));
    drawBubble(ctx, "swords", ARENA.foeX - 6, 78);
  }
  night();
}
