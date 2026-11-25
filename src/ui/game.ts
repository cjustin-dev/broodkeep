// The live game: holds the save and the on-screen state, keeps time moving,
// and saves to the device. The screens read from here and call act() to do things.

import { playback } from "../art/arena";
import type { Playback } from "../art/arena";
import { moved, nearestSpot } from "../art/homeEdit";
import { layoutOf } from "../art/homeLayout";
import { createView, reseat } from "../art/idle";
import { shownOf } from "../art/moment";
import type { View } from "../art/idle";
import { homeOf } from "../data/home";
import type { Layout, PieceKind } from "../data/home";
import { endFight, startFight } from "../game/actions";
import type { StartFightResult } from "../game/actions";
import { playRound } from "../game/combat/battle";
import type { Battle, BattleAction } from "../game/combat/battle";
import type { FightResult } from "../game/combat/fight";
import { advanceClock } from "../game/dev";
import { isAdultMode } from "../game/hud";
import { paidNote } from "../game/requests";
import { simulateTo } from "../game/sim";
import type { Creature, Save } from "../game/state";
import { gameNow } from "../game/time";
import { writeSave } from "../sync/local";

export type Screen = "room" | "habitat" | "arena";

// Decorate mode (docs/home-plan.md section 12): view state, never saved. `selected` is the piece the tray's bin and the arrow keys act on.
export interface Decor {
  selected: PieceKind | null;
}

const NOTE_MS = 6000; // how long a note stays over the room

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
  viewMiddle: { col: number; row: number } | null = null; // the home's tile (fractions allowed) at the middle of the picture, set by the Stage every frame: where a piece out of the tray lands
  decor: Decor | null = null; // Decorate mode: null when it is off (not saved: it ends with the visit, and with anything that takes the player off the home's picture)
  note: string | null = null; // Adult Mode: why a button did nothing, shown over the room for a few seconds (not saved)
  onSave: ((byPlayer: boolean) => void) | null = null; // told each time the game is saved on this device (the cloud sync listens, sync/sync.ts)
  private lastReal = Date.now();
  private listeners = new Set<() => void>();
  private saveTimer: number | undefined;
  private noteTimer: number | undefined;
  private playerChanged = false; // something the player did since the last save (not just the clock moving on)
  private seenDone: number; // how many requests had been paid when the screens last looked (board.done): a new payment gets a note

  // saveKey: where this game is kept on the device ("save" is the first profile's, see sync/roster.ts).
  constructor(
    save: Save,
    private readonly saveKey = "save",
  ) {
    this.save = save;
    this.seenDone = save.board.done;
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
    this.dropDecor();
    this.dropNote();
    if (screen !== "arena") this.arena = null; // a finished fight's card goes with the screen
    this.listeners.forEach((listener) => listener());
  }

  // Decorate mode on. Only on the home's picture (the room screen, in the home) and not while a hatch or evolve scene plays. Says whether it started.
  startDecor(): boolean {
    if (this.decor || this.screen !== "room" || this.view.world !== "home" || this.view.moment !== null) return false;
    this.decor = { selected: null };
    this.view.still = true;
    reseat(this.view); // (it stands on a tile, and a walk or a meal is called off)
    this.listeners.forEach((listener) => listener());
    return true;
  }

  endDecor(): void {
    if (!this.decor) return;
    this.dropDecor();
    this.listeners.forEach((listener) => listener());
  }

  // Leave Decorate mode without waking the screens (the callers do that themselves).
  private dropDecor(): void {
    this.decor = null;
    this.view.still = false;
  }

  // The piece the tray's bin and the arrow keys act on: the selected one, while it is put out in the home.
  get selectedPiece(): PieceKind | null {
    const kind = this.decor?.selected ?? null;
    return kind !== null && layoutOf(this.save.home)[kind] !== null ? kind : null;
  }

  select(kind: PieceKind | null): void {
    if (!this.decor || this.decor.selected === kind) return;
    this.decor.selected = kind;
    this.listeners.forEach((listener) => listener());
  }

  // Put a layout the rules allowed into the save (the game is saved, and sent to the account, as for any other change).
  setLayout(layout: Layout): void {
    this.act((save) => {
      save.home = homeOf(layout);
    });
  }

  // A piece out of the tray goes on the allowed spot nearest `near` (a tile: the middle of the view) and is selected. False when there is no spot.
  bringOut(kind: PieceKind, near: { col: number; row: number }): boolean {
    const layout = layoutOf(this.save.home);
    const at = this.decor && layout[kind] === null && (kind !== "mat" || this.save.owned.includes("feeding-mat")) ? nearestSpot(layout, kind, near) : null;
    if (!at) return false;
    this.setLayout({ ...layout, [kind]: at });
    this.select(kind);
    return true;
  }

  // The selected piece goes into the tray. False when nothing is selected, and for the bed (a sleepy creature walks to it).
  putAway(): boolean {
    const kind = this.selectedPiece;
    const next = kind ? moved(layoutOf(this.save.home), kind, null) : null;
    if (!kind || !next) return false;
    this.setLayout(next);
    this.select(null);
    return true;
  }

  // The selected piece one tile over (the arrow keys). False when nothing is selected or the rules do not allow it.
  nudge(dcol: number, drow: number): boolean {
    const kind = this.selectedPiece;
    const layout = layoutOf(this.save.home);
    const from = kind ? layout[kind] : null;
    const next = kind && from ? moved(layout, kind, { col: from.col + dcol, row: from.row + drow }) : null;
    if (!next) return false;
    this.setLayout(next);
    return true;
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

  // Say something over the room (Adult Mode only: Kid Mode never shows a note). A new note replaces the old one and starts the clock again.
  // This only wakes the screens, like setScreen. It must never go through changed(): a note is not something the player did to the game, and
  // changed() would mark the game as changed by the player and schedule a save and a cloud upload.
  say(text: string): void {
    if (!isAdultMode(this.save) || text === "") return;
    window.clearTimeout(this.noteTimer);
    this.note = text;
    this.noteTimer = window.setTimeout(() => this.clearNote(), NOTE_MS);
    this.listeners.forEach((listener) => listener());
  }

  clearNote(): void {
    if (this.note === null) return;
    this.dropNote();
    this.listeners.forEach((listener) => listener());
  }

  // Forget the note without waking the screens (the callers do that themselves).
  private dropNote(): void {
    window.clearTimeout(this.noteTimer);
    this.note = null;
  }

  // Adult Mode: before a button does its job, ask the live state why not. The game is caught up to now first, the same moment the action itself
  // would use, so a button that looked lit a moment ago but is not (night began, a job ended) tells the truth. `refusal` gives the code (see
  // availability.ts), `reason` the sentence for it; the sentence is said over the room and the code returned, or null when the tap may go on.
  // Always null in Kid Mode, which keeps its own flow.
  whyNot<K extends string>(refusal: (c: Creature) => K | null, reason: (save: Save, c: Creature, code: K, nowMs: number) => string): K | null {
    if (!isAdultMode(this.save)) return null;
    this.tick();
    const c = this.save.creature;
    if (this.save.phase !== "alive" || !c) return null;
    const code = refusal(c);
    if (code !== null) this.say(reason(this.save, c, code, this.now()));
    return code;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Tell the screens something changed, and save soon. byPlayer is false for the clock moving on and for a game put in from the account.
  changed(byPlayer = true): void {
    if (byPlayer) this.playerChanged = true;
    if (this.screen !== "room" && this.save.phase !== "alive") this.screen = "room"; // an egg or a death goes back to the room, and stays there when the next creature hatches
    if (this.save.phase !== "alive" || !isAdultMode(this.save)) this.dropNote(); // a note is about the creature that was there, and Adult Mode's
    this.announceRequests();
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
    if (simulateTo(this.save, gameNow(this.save, real)) > 0) this.changed(false);
  }

  // Run something the player did, then refresh the screens.
  act<T>(action: (save: Save, nowMs: number) => T): T {
    const result = action(this.save, this.now());
    this.changed();
    return result;
  }

  replaceSave(save: Save): void {
    this.save = save;
    this.dropDecor();
    this.seenDone = save.board.done; // a game put in from the account is not announced
    this.screen = "room";
    this.arena = null;
    this.view.moment = null; // a scene belongs to the old game
    this.dropNote();
    this.view.shown = shownOf(save);
    this.lastReal = Date.now();
    this.devSpeed = 1;
    this.changed(false);
  }

  // Adult Mode: one note over the room for the requests paid since the last look, whether the player did it or time passing did (the catch-up
  // after the app was closed too). Only the count is compared: the note itself is said like any other (say() never goes through changed()).
  private announceRequests(): void {
    const { done, waits } = this.save.board;
    if (done > this.seenDone) this.say(paidNote(waits, done - this.seenDone));
    this.seenDone = done;
  }

  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), 600);
  }

  // Answers when the game is on the device, for a caller that is about to reload the page (the others do not wait).
  saveNow(): Promise<void> {
    window.clearTimeout(this.saveTimer);
    const written = writeSave(this.save, this.saveKey);
    const byPlayer = this.playerChanged;
    this.playerChanged = false;
    this.onSave?.(byPlayer);
    return written;
  }
}
