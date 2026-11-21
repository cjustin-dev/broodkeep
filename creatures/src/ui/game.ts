// The live game: holds the save and the on-screen state, keeps time moving,
// and saves to the device. The screens read from here and call act() to do things.

import { createView } from "../art/idle";
import type { View } from "../art/idle";
import { advanceClock } from "../game/dev";
import { simulateTo } from "../game/sim";
import type { Save } from "../game/state";
import { gameNow } from "../game/time";
import { writeSave } from "../sync/local";

export class Game {
  save: Save;
  view: View = createView(); // looks only (position, pose), never saved
  devSpeed = 1; // dev mode time multiplier
  private lastReal = Date.now();
  private listeners = new Set<() => void>();
  private saveTimer: number | undefined;

  constructor(save: Save) {
    this.save = save;
    this.tick(); // catch up on any time the app was closed
  }

  // The current time in the game (real time plus any dev skips).
  now(): number {
    return gameNow(this.save, Date.now());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Tell the screens something changed, and save soon.
  changed(): void {
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
