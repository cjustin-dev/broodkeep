// The live game: holds the save and the on-screen state, keeps time moving,
// and saves to the device. The screens read from here and call act() to do things.

import { playback } from "../art/arena";
import type { Playback } from "../art/arena";
import { createView } from "../art/idle";
import { shownOf } from "../art/moment";
import type { View } from "../art/idle";
import { endFight, startFight } from "../game/actions";
import type { StartFightResult } from "../game/actions";
import { playRound } from "../game/combat/battle";
import type { Battle, BattleAction } from "../game/combat/battle";
import type { FightResult } from "../game/combat/fight";
import { advanceClock } from "../game/dev";
import { simulateTo } from "../game/sim";
import type { Save } from "../game/state";
import { gameNow } from "../game/time";
import { writeSave } from "../sync/local";

export type Screen = "room" | "habitat" | "arena";

// A fight on the arena screen. It lives here, not in the save: only a finished fight changes the save (endFight).
export interface Arena {
  battle: Battle;
  play: Playback | null; // the last round, laid out in time for the picture (null before the first round)
  startedAt: number; // seconds on the performance clock when that round began
  result: FightResult | null; // what a finished fight paid, once it is over
}

export class Game {
  save: Save;
  screen: Screen = "room"; // which picture is showing (not saved: a new visit starts in the room, and so does a new egg)
  arena: Arena | null = null; // the fight on the arena screen (not saved: closing the app in a fight forgets it)
  view: View = createView(); // looks only (position, pose), never saved
  devSpeed = 1; // dev mode time multiplier
  private lastReal = Date.now();
  private listeners = new Set<() => void>();
  private saveTimer: number | undefined;

  constructor(save: Save) {
    this.save = save;
    this.view.shown = shownOf(save); // so a hatch or evolution that happens during the catch-up still plays
    this.tick(); // catch up on any time the app was closed
  }

  // The current time in the game (real time plus any dev skips).
  now(): number {
    return gameNow(this.save, Date.now());
  }

  // True while the habitat is showing. It only makes sense for a living creature (changed() sends an egg or a death back to the room).
  get atHabitat(): boolean {
    return this.screen === "habitat" && this.save.phase === "alive";
  }

  // True while the arena is showing (a living creature only, like the habitat).
  get atArena(): boolean {
    return this.screen === "arena" && this.save.phase === "alive";
  }

  // True from the first moment of a fight until it is won or lost (or the player runs away).
  get fighting(): boolean {
    return this.arena !== null && this.arena.battle.over === null;
  }

  // Seconds since the last round began, which the picture uses to play its blows back.
  arenaTime(): number {
    return this.arena ? performance.now() / 1000 - this.arena.startedAt : 0;
  }

  // True while the last round is still playing out, so the buttons wait for it.
  get playing(): boolean {
    return this.arena?.play != null && this.arenaTime() < this.arena.play.length;
  }

  // A fight in progress can only be left by running away, so the nav buttons do nothing until then.
  setScreen(screen: Screen): void {
    if (this.screen === screen || this.fighting) return;
    this.screen = screen;
    if (screen !== "arena") this.arena = null; // a finished fight's card goes with the screen
    this.listeners.forEach((listener) => listener());
  }

  // Start a fight (the energy is spent now). Says why not if it cannot start.
  fight(): StartFightResult["status"] {
    const result = startFight(this.save, this.now());
    if (result.status === "started") this.arena = { battle: result.battle, play: null, startedAt: 0, result: null };
    this.changed();
    return result.status;
  }

  // Play one round with the player's choice. A finished fight is paid out into the save right away, and the
  // picture still plays the last blows before the result card matters.
  round(choice: BattleAction): void {
    const arena = this.arena;
    if (!arena || arena.battle.over || this.playing) return;
    playRound(arena.battle, choice);
    arena.play = playback(arena.battle.events, arena.battle.over !== null);
    arena.startedAt = performance.now() / 1000;
    if (arena.battle.over) arena.result = endFight(this.save, arena.battle, this.now());
    this.changed();
    window.setTimeout(() => this.listeners.forEach((listener) => listener()), arena.play.length * 1000 + 50); // wake the buttons
  }

  // Run away from a fight, or put away a finished one. Running away costs the energy already spent and nothing else.
  leaveFight(): void {
    this.arena = null;
    this.listeners.forEach((listener) => listener());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Tell the screens something changed, and save soon.
  changed(): void {
    if (this.screen !== "room" && this.save.phase !== "alive") this.screen = "room"; // an egg or a death goes back to the room, and stays there when the next creature hatches
    const c = this.save.creature;
    if (this.arena && (this.save.phase !== "alive" || c?.formId !== this.arena.battle.me.formId)) this.arena = null; // the creature is gone or has evolved: that fight is over
    this.listeners.forEach((listener) => listener());
    this.scheduleSave();
  }

  // Move time forward. Called about once a second, and when the page comes back into view.
  tick(): void {
    const real = Date.now();
    advanceClock(this.save, real - this.lastReal, this.devSpeed);
    this.lastReal = real;
    if (simulateTo(this.save, gameNow(this.save, real)) > 0) this.changed();
  }

  // Run something the player did, then refresh the screens.
  act<T>(action: (save: Save, nowMs: number) => T): T {
    const result = action(this.save, this.now());
    this.changed();
    return result;
  }

  replaceSave(save: Save): void {
    this.save = save;
    this.screen = "room";
    this.arena = null;
    this.view.moment = null; // a scene belongs to the old game
    this.view.shown = shownOf(save);
    this.lastReal = Date.now();
    this.devSpeed = 1;
    this.changed();
  }

  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), 600);
  }

  saveNow(): void {
    window.clearTimeout(this.saveTimer);
    void writeSave(this.save);
  }
}
