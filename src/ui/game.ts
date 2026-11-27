// The live game: holds the save and the on-screen state, keeps time moving,
// and saves to the device. The screens read from here and call act() to do things.

import { playback } from "../art/arena";
import type { Playback } from "../art/arena";
import { moved, nearestSpot } from "../art/homeEdit";
import { layoutOfSave } from "../art/homeLayout";
import { addEffect, addHeart, createView, reseat, triggerPose } from "../art/idle";
import { shownOf } from "../art/moment";
import type { Pose, View } from "../art/idle";
import type { IconName } from "../art/sprites";
import { homeOf, isBuilt, roomsBuilt, wallOfRoom } from "../data/home";
import type { Layout, PieceKind, RoomId } from "../data/home";
import { initiativeTuning } from "../data/initiatives";
import { tapTuning } from "../data/tappables";
import type { TapKind } from "../data/tappables";
import { isWallId } from "../data/shop";
import { trainGameIds } from "../data/training";
import type { TrainGameId, TrainStage } from "../data/training";
import { endFight, feed, startFight } from "../game/actions";
import type { FeedResult, StartFightResult } from "../game/actions";
import { playRound } from "../game/combat/battle";
import type { Battle, BattleAction } from "../game/combat/battle";
import type { FightResult } from "../game/combat/fight";
import { advanceClock } from "../game/dev";
import type { DishId } from "../game/dishes";
import { isAdultMode } from "../game/hud";
import { countToss, isMoot, isOver, newInitiative, nextDelay, payBond, payGift } from "../game/initiatives";
import type { Initiative } from "../game/initiatives";
import { paidNote } from "../game/requests";
import { makeRng } from "../game/rng";
import type { Rng } from "../game/rng";
import { simulateTo } from "../game/sim";
import type { Creature, Save } from "../game/state";
import { gameNow } from "../game/time";
import { nextWait, payPickup, payRustle, paySparkle, pickKind, place, possibleKinds } from "../game/tappables";
import type { Tappable, Visit } from "../game/tappables";
import { fieldOfForm } from "../data/fields";
import { newRhythm } from "../game/rhythm";
import type { RhythmState } from "../game/rhythm";
import { newBugCatch, payBurst, payRhythm, payTraining, trainRefusal, trainStageOf } from "../game/training";
import type { BugCatchState, BurstResult, TrainRefusal, TrainResult } from "../game/training";
import type { FieldId, FoodId } from "../game/types";
import { writeSave } from "../sync/local";

export type Screen = "room" | "habitat" | "arena";

// Decorate mode (docs/home-plan.md section 12): view state, never saved. `selected` is the piece the tray's bin and the arrow keys act on; `wall` is the room whose wall is
// selected (the dock then offers wallpapers, section 14). A piece and a wall are never selected together.
export interface Decor {
  selected: PieceKind | null;
  wall: RoomId | null;
}

const NOTE_MS = 6000; // how long a note stays over the room

// A fight on the arena screen. It lives here, not in the save: only a finished fight changes the save (endFight).
export interface Arena {
  battle: Battle;
  play: Playback | null; // the last round, laid out in time for the picture (null before the first round)
  startedAt: number; // seconds on the performance clock when that round began
  result: FightResult | null; // what a finished fight paid, once it is over
}

// A training session (Bug Catch, docs/adult-a3-plan.md section 10). View state like a fight: never saved, so a reload in the middle pays nothing. `phase`: the start card, the run, the result card.
// The overlay (ui/TrainGame.tsx) drives `run` with the engine's own functions; `Game` is told only at the start, the finish and the close.
export interface Training {
  bornAt: number; // the creature that started it: another one (a retire and a hatch) ends the session
  stage: TrainStage; // the stage it is played at (the difficulty row), fixed at the start
  game: TrainGameId; // the game on show: picked on the start card, fixed once it begins
  phase: "ready" | "playing" | "done";
  run: BugCatchState | RhythmState | null; // the one of the game (a burst is always Bug Catch)
  result: TrainResult | BurstResult | null; // what the run paid, once it has been paid
  burst?: FieldId; // set for the 10 second burst a bug tapped in this field starts (docs/adult-a3-plan.md section 17, decision 8): no start card, and `payBurst` pays it
}

// What `startTraining` says, in the order it checks: Kid Mode, no living creature, a session already on, something else on the screen, then the creature's own reasons.
export type StartTrainingResult = "started" | "adult-only" | "no-creature" | "open" | "elsewhere" | TrainRefusal;

export class Game {
  save: Save;
  screen: Screen = "room"; // which picture is showing (not saved: a new visit starts in the room, and so does a new egg)
  arena: Arena | null = null; // the fight on the arena screen (not saved: closing the app in a fight forgets it)
  view: View = createView(); // looks only (position, pose), never saved
  devSpeed = 1; // dev mode time multiplier
  viewMiddle: { col: number; row: number } | null = null; // the home's tile (fractions allowed) at the middle of the picture, set by the Stage every frame: where a piece out of the tray lands
  training: Training | null = null; // the training session over the screen (not saved: a restart in the middle pays nothing)
  trainPick: TrainGameId = "bug"; // the game the start card shows first: the last one picked in this visit (not saved)
  decor: Decor | null = null; // Decorate mode: null when it is off (not saved: it ends with the visit, and with anything that takes the player off the home's picture)
  note: string | null = null; // Adult Mode: why a button did nothing, shown over the room for a few seconds (not saved)
  initiative: Initiative | null = null; // Adult Mode: what the creature is asking for now, drawn as a bubble over it (docs/adult-a3-plan.md section 14; not saved, never logged)
  tappables: Tappable[] = []; // Adult Mode: what is on the ground in the field now (docs/adult-a3-plan.md section 17; not saved, never logged)
  menuOpen = false; // an App panel (settings, book, shop...) is open: the App writes this, because the panel is App state that the game cannot see
  rand: () => number = Math.random; // the draws of initiatives (a test sets it to force one); never the save's own generator
  tapRand: () => number = Math.random; // the seed of each field visit (a test sets it to force one); never the save's own generator
  tapRng: (seed: number) => Rng = makeRng; // makes a visit's generator from its seed (a test gives a scripted one that returns chosen values)
  onSave: ((byPlayer: boolean) => void) | null = null; // told each time the game is saved on this device (the cloud sync listens, sync/sync.ts)
  private lastReal = Date.now();
  private listeners = new Set<() => void>();
  private saveTimer: number | undefined;
  private noteTimer: number | undefined;
  private playerChanged = false; // something the player did since the last save (not just the clock moving on)
  private seenDone: number; // how many requests had been paid when the screens last looked (board.done): a new payment gets a note
  private initiativeClock = 0; // milliseconds of foreground time (at most 2 s a tick), the time initiatives are counted in
  private tapVisit: Visit | null = null; // the stay in the field that the tappables belong to (null outside a field)
  private tapClock = 0; // milliseconds of unblocked field time since the visit began (at most 2 s a step): the time a tappable's wait and life are counted in
  private tapWait = 0; // the unblocked time left before the next spawn
  private initiativeWait: number | null = null; // the seen, unblocked time left before the next initiative is made (null until one is drawn)

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
    this.clearInitiative(); // (the listeners are woken below)
    if (screen !== "arena") this.arena = null; // a finished fight's card goes with the screen
    this.listeners.forEach((listener) => listener());
  }

  // Decorate mode on. Only on the home's picture (the room screen, in the home) and not while a hatch or evolve scene plays. Says whether it started.
  startDecor(): boolean {
    if (this.decor || this.screen !== "room" || this.view.world !== "home" || this.view.moment !== null) return false;
    this.decor = { selected: null, wall: null };
    this.view.still = true;
    reseat(this.view); // (it stands on a tile, and a walk or a meal is called off)
    this.clearInitiative();
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
    return kind !== null && layoutOfSave(this.save)[kind] !== null ? kind : null;
  }

  // Select a piece, or nothing (which lets go of a selected wall too).
  select(kind: PieceKind | null): void {
    if (!this.decor || (this.decor.selected === kind && this.decor.wall === null)) return;
    this.decor.selected = kind;
    this.decor.wall = null;
    this.listeners.forEach((listener) => listener());
  }

  // The room whose wall is selected, while Decorate mode is on.
  get selectedWall(): RoomId | null {
    const room = this.decor?.wall ?? null;
    return room !== null && isBuilt(room, this.save.owned) ? room : null; // (a room that was given back, by the Shop's undo, has no wall to select)
  }

  selectWall(room: RoomId): void {
    if (!this.decor || !isBuilt(room, this.save.owned) || (this.decor.wall === room && this.decor.selected === null)) return;
    this.decor.wall = room;
    this.decor.selected = null;
    this.listeners.forEach((listener) => listener());
  }

  // Give a room a wallpaper (an owned one, or null for the plain wall). False when Decorate mode is off, the wallpaper is not owned, or the room already shows it.
  setWall(room: RoomId, id: string | null): boolean {
    if (!this.decor || !isBuilt(room, this.save.owned) || (id !== null && !(isWallId(id) && this.save.owned.includes(id))) || wallOfRoom(this.save.wall, this.save.home, room) === id) return false;
    this.act((save) => {
      save.home = homeOf(layoutOfSave(save), { ...save.home?.walls, [room]: id });
    });
    return true;
  }

  // Put a layout the rules allowed into the save (the game is saved, and sent to the account, as for any other change).
  setLayout(layout: Layout): void {
    this.act((save) => {
      save.home = homeOf(layout, save.home?.walls); // (the rooms' walls stay)
    });
  }

  // A piece out of the tray goes on the allowed spot nearest `near` (a tile: the middle of the view) and is selected. False when there is no spot.
  bringOut(kind: PieceKind, near: { col: number; row: number }): boolean {
    const layout = layoutOfSave(this.save);
    const at = this.decor && layout[kind] === null && (kind !== "mat" || this.save.owned.includes("feeding-mat")) ? nearestSpot(layout, kind, near, roomsBuilt(this.save.owned)) : null;
    if (!at) return false;
    this.setLayout({ ...layout, [kind]: at });
    this.select(kind);
    return true;
  }

  // The selected piece goes into the tray. False when nothing is selected, and for the bed (a sleepy creature walks to it).
  putAway(): boolean {
    const kind = this.selectedPiece;
    const next = kind ? moved(layoutOfSave(this.save), kind, null, roomsBuilt(this.save.owned)) : null;
    if (!kind || !next) return false;
    this.setLayout(next);
    this.select(null);
    return true;
  }

  // The selected piece one tile over (the arrow keys). False when nothing is selected or the rules do not allow it.
  nudge(dcol: number, drow: number): boolean {
    const kind = this.selectedPiece;
    const layout = layoutOfSave(this.save);
    const from = kind ? layout[kind] : null;
    const next = kind && from ? moved(layout, kind, { col: from.col + dcol, row: from.row + drow }, roomsBuilt(this.save.owned)) : null;
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

  // Open a training session (the start card). Says why not when it cannot, in the order of `StartTrainingResult`. View-only: nothing is saved and nothing is marked as changed by the player.
  // The Arena button asks `whyNot(trainRefusal, trainReason)` first for the sentence; this decides alone. A caller that is not the Arena button must also refuse itself while an App panel
  // is open: the panel is App state and not visible from here (docs/adult-a3-plan.md section 10, decision 5).
  startTraining(): StartTrainingResult {
    if (!isAdultMode(this.save)) return "adult-only";
    this.tick();
    const c = this.save.creature;
    if (this.save.phase !== "alive" || !c) return "no-creature";
    if (this.training) return "open";
    if (this.arena || this.view.moment !== null || this.decor) return "elsewhere";
    const code = trainRefusal(c);
    if (code !== null) return code;
    this.training = { bornAt: c.bornAt, stage: trainStageOf(c), game: this.trainPick, phase: "ready", run: null, result: null };
    this.clearInitiative();
    this.listeners.forEach((listener) => listener());
    return "started";
  }

  // The start card's choice of game (docs/adult-a4-plan.md section 2, decision 1): only while the card is showing, and only a game that exists. The pick is kept for the next card of the visit.
  pickTrainGame(id: TrainGameId): void {
    const t = this.training;
    if (!t || t.phase !== "ready" || !trainGameIds.includes(id)) return;
    t.game = id;
    this.trainPick = id;
    this.listeners.forEach((listener) => listener());
  }

  // The start card's Go: the run begins. Bug Catch's seed is from Math.random, never the save's own generator, so a session leaves the save as it was; a Rhythm Grove song needs no draw at all (the
  // creature's own field, Land's for a form that belongs to none).
  beginTraining(): void {
    const t = this.training;
    if (!t || t.phase !== "ready") return;
    const c = this.save.creature;
    if (!c) return;
    t.run = t.game === "rhythm" ? newRhythm(fieldOfForm(c.formId) ?? "land", t.stage) : newBugCatch(Math.floor(Math.random() * 2 ** 32), t.stage);
    t.phase = "playing";
    this.listeners.forEach((listener) => listener());
  }

  // The run is over: pay it, once. Does nothing without a session, without a finished run, or when the session already has its result (the guard against a second pay). The game is caught up to
  // now first (like whyNot), so a creature that died or went away in the gap is not paid; a death ends the session there. This is the only `act` of a session. `act` wakes the screens
  // before the result is stored, so they are woken again by hand after it.
  finishTraining(): void {
    const t = this.training;
    if (!t || t.phase !== "playing" || !t.run || !t.run.over || t.result !== null) return;
    this.tick();
    if (this.training !== t) return;
    const run = t.run;
    const result = this.act((save, now) => {
      if (t.burst) return payBurst(save, save.creature, run as BugCatchState, t.burst, now);
      return t.game === "rhythm" ? payRhythm(save, save.creature, run as RhythmState, now) : payTraining(save, save.creature, run as BugCatchState, now);
    });
    if (result === null) this.training = null;
    else {
      t.result = result;
      t.phase = "done";
    }
    this.listeners.forEach((listener) => listener());
  }

  // Put the session away: Done, or Quit (a run in progress pays nothing).
  closeTraining(): void {
    if (!this.training) return;
    this.training = null;
    this.listeners.forEach((listener) => listener());
  }

  // What an initiative may not share the screen with (docs/adult-a3-plan.md section 14, decision 4): not Adult Mode, no living creature, away, asleep, a need bubble of its own, another screen,
  // a fight, a training session, Decorate mode, a hatch or evolve scene, the welcome-back card, an open panel, a meal on the plate. A held finger, the feed tray and the header's cards are not.
  private initiativeBlocked(): boolean {
    const c = this.save.creature;
    if (!isAdultMode(this.save) || this.save.phase !== "alive" || !c) return true;
    if (c.job || c.sleep || c.call !== null) return true;
    if (this.screen !== "room" || this.arena || this.training || this.decor || this.view.moment !== null) return true;
    return this.save.hauls.length > 0 || this.menuOpen || this.view.snack !== null;
  }

  // The bubble's picture for the initiative on show (null for none), written to the view that the scene draws.
  private inviteOf(i: Initiative | null): IconName | null {
    if (!i) return null;
    if (i.kind === "play") return "ball";
    if (i.kind === "craving") return i.food as IconName;
    return i.gift?.kind === "coins" ? "coin" : (i.gift as { id: IconName }).id;
  }

  // Take the initiative away without waking the screens (the callers do that). Says whether there was one.
  private clearInitiative(): boolean {
    const had = this.initiative !== null;
    this.initiative = null;
    this.view.invite = null;
    return had;
  }

  // Take the initiative away and wake the screens, with no cost to anyone.
  dropInitiative(): void {
    if (this.clearInitiative()) this.listeners.forEach((listener) => listener());
  }

  // Count the foreground time that has passed (at most `clockCapMs` of it) and make, fade or drop initiatives (docs/adult-a3-plan.md section 14, decisions 2 to 4). Called only by `tick()`, with
  // the real time since the last tick. Nothing here is saved or goes through `changed()`: it wakes the screens, and that is all.
  stepInitiative(dtMs: number): void {
    const dt = Math.max(0, Math.min(dtMs, initiativeTuning.clockCapMs));
    this.initiativeClock += dt;
    const c = this.save.creature;
    if (this.initiativeBlocked() || !c) {
      this.dropInitiative(); // (an initiative that is blocked goes at once, with no cost; the countdown holds)
      return;
    }
    const i = this.initiative;
    if (i && (i.bornAt !== c.bornAt || isOver(i, this.initiativeClock) || isMoot(i, c))) this.dropInitiative();
    if (this.initiativeWait === null) this.initiativeWait = nextDelay(this.rand);
    if (!this.view.inView) return; // out of the camera's view: the countdown holds (a showing initiative goes on fading)
    this.initiativeWait -= dt;
    if (this.initiativeWait > 0 || this.initiative) return;
    this.initiative = newInitiative(c, this.initiativeClock, this.rand);
    this.view.invite = this.inviteOf(this.initiative);
    this.initiativeWait = nextDelay(this.rand); // from this start to the next one
    this.listeners.forEach((listener) => listener());
  }

  // The player tapped the bubble (play or gift). A gift pays once and says what it was; a play pays one toss. Both in one `act`. Returns what the screen needs for its looks, or null when nothing
  // was answered (no initiative, the wrong kind, a game that has become blocked, a play that was over).
  answerInitiative(): { kind: "play" | "gift"; levelUp: number | null; over: boolean } | null {
    const i = this.initiative;
    if (!i || (i.kind !== "play" && i.kind !== "gift")) return null;
    if (this.initiativeBlocked() || i.bornAt !== this.save.creature?.bornAt) {
      this.dropInitiative();
      return null;
    }
    if (i.kind === "gift") {
      const gift = i.gift!;
      this.clearInitiative(); // (before it pays, so a second tap finds nothing)
      const note = this.act((save, now) => payGift(save, gift, now));
      this.say(note);
      return { kind: "gift", levelUp: null, over: true };
    }
    if (!countToss(i, this.initiativeClock)) {
      this.dropInitiative();
      return null;
    }
    const levelUp = this.act((save, now) => payBond(save, save.creature!, initiativeTuning.tossXp, now));
    const over = isOver(i, this.initiativeClock);
    if (over) this.dropInitiative();
    return { kind: "play", levelUp, over };
  }

  // ---- field tappables (docs/adult-a3-plan.md section 17) ----

  // Whether the creature has a field visit now: Adult Mode, alive, awake, not away, out in a field.
  private tapEligible(): boolean {
    const c = this.save.creature;
    return isAdultMode(this.save) && this.save.phase === "alive" && !!c && !c.job && c.sleep === null && c.place !== "home";
  }

  // What holds a visit's clocks and hides its tappables (the visit goes on): another screen than the room, an arena, a training session, Decorate mode, a hatch or evolve scene, a waiting haul
  // card, an open menu, a meal on the plate. A call is not one.
  private tapBlocked(): boolean {
    return this.screen !== "room" || this.arena !== null || this.training !== null || this.decor !== null || this.view.moment !== null || this.save.hauls.length > 0 || this.menuOpen || this.view.snack !== null;
  }

  // End the visit and take everything on the ground away, without waking the screens (the callers do that). Says whether there was a visit.
  private endVisit(): boolean {
    const had = this.tapVisit !== null;
    this.tapVisit = null;
    this.tappables = [];
    this.syncTapView();
    return had;
  }

  // End the visit when what it was for has gone: the creature left the field (home, another field, a job, sleep), another one hatched, it died, or Adult Mode went off.
  private dropVisitIfGone(): void {
    const v = this.tapVisit;
    const c = this.save.creature;
    if (v && !(this.tapEligible() && c && c.bornAt === v.bornAt && c.place === v.place)) this.endVisit();
  }

  // Write what the scene draws and the Stage hits: the tappables of the visit, none while anything holds it. Says whether that changed.
  private syncTapView(): boolean {
    const shown = this.tapVisit !== null && this.tapEligible() && !this.tapBlocked() ? this.tappables.map(({ id, kind, x, y }) => ({ id, kind, x, y })) : [];
    const old = this.view.tappables;
    if (shown.length === old.length && shown.every((p, i) => p.id === old[i]!.id)) return false;
    this.view.tappables = shown;
    return true;
  }

  // Count the unblocked field time that has passed (at most `clockCapMs` of it) and make or fade tappables. Called only by `tick()`, with the real time since the last tick. Nothing here is saved or
  // goes through `changed()`: it wakes the screens, and that is all.
  stepTappables(dtMs: number): void {
    const dt = Math.max(0, Math.min(dtMs, tapTuning.clockCapMs));
    const c = this.save.creature;
    this.dropVisitIfGone();
    if (!this.tapEligible() || !c) {
      if (this.syncTapView()) this.listeners.forEach((listener) => listener());
      return;
    }
    let visit = this.tapVisit;
    if (!visit) {
      const rng = this.tapRng(Math.floor(this.tapRand() * 2 ** 32));
      visit = { bornAt: c.bornAt, place: c.place as FieldId, rng, made: 0, pickupMade: false, nextId: 1 };
      this.tapVisit = visit;
      this.tappables = [];
      this.tapClock = 0;
      this.tapWait = nextWait(rng);
    }
    let changed = false;
    if (!this.tapBlocked()) {
      this.tapClock += dt;
      const before = this.tappables.length;
      const canTrain = trainRefusal(c) === null;
      this.tappables = this.tappables.filter((p) => this.tapClock - p.born < tapTuning.lifeMs && (p.kind !== "bug" || canTrain));
      changed = this.tappables.length !== before;
      this.tapWait -= dt;
      if (this.tapWait <= 0) {
        if (this.tappables.length >= tapTuning.most) this.tapWait = 0; // (full: it comes when one is gone)
        else if (this.spawnTappable(visit, canTrain)) {
          this.tapWait = nextWait(visit.rng); // from this start to the next one
          changed = true;
        } else this.tapWait = 0; // (every try was in the way: it comes at the next step with room)
      }
    }
    if (this.syncTapView() || changed) this.listeners.forEach((listener) => listener());
  }

  // Make one tappable: the kind, then a place for it. False when every try was in the way.
  private spawnTappable(visit: Visit, canTrain: boolean): boolean {
    const kind = pickKind(possibleKinds(visit, this.tappables, canTrain), visit.rng);
    const v = this.view;
    const spot = place(visit.rng, { x: v.x, y: v.y - v.size, w: v.size, h: v.size }, this.tappables);
    if (!spot) return false;
    this.tappables.push({ id: visit.nextId++, kind, x: spot.x, y: spot.y, born: this.tapClock });
    visit.made++;
    if (kind === "pickup") visit.pickupMade = true;
    return true;
  }

  // The creature's reaction to a tap, in the tap's own frame: it turns toward the spot (after the pose, which turns a startled one the other way), plays the pose and shows the effect.
  private reactTo(p: Tappable, pose: Pose, effect: "sparkle" | "heart" | null): void {
    const v = this.view;
    const cx = p.x + tapTuning.size / 2;
    const cy = p.y + tapTuning.size / 2;
    triggerPose(v, pose);
    v.facing = cx >= v.x + v.size / 2 ? 1 : -1;
    if (effect === "sparkle") {
      addEffect(v, "sparkle", cx, cy);
      addEffect(v, "sparkle", cx - 4, cy - 3);
      addEffect(v, "sparkle", cx + 4, cy - 4);
    } else if (effect === "heart") addHeart(v);
  }

  // The player tapped a tappable. It is taken at once and pays once (one `act`), the creature reacts, a note says what was found; a bug starts its burst. Returns what the screen needs for its looks, or
  // null when nothing was taken: no such tappable, a visit that has ended, or a game that has become blocked since the last step (the screens are told and the picture drops them).
  tapTappable(id: number): { kind: TapKind; levelUp: number | null } | null {
    const p = this.tappables.find((q) => q.id === id);
    const visit = this.tapVisit;
    const c = this.save.creature;
    if (!p || !visit || !c) return null;
    if (!this.tapEligible() || c.bornAt !== visit.bornAt || c.place !== visit.place) {
      this.endVisit();
      this.listeners.forEach((listener) => listener());
      return null;
    }
    if (this.tapBlocked()) {
      if (this.syncTapView()) this.listeners.forEach((listener) => listener());
      return null;
    }
    this.tappables = this.tappables.filter((q) => q !== p); // (before it pays, so a second tap finds nothing)
    this.syncTapView();
    if (p.kind === "bug" && trainRefusal(c) !== null) {
      this.listeners.forEach((listener) => listener()); // (it turned sick or sleepy since the last step: the bug is gone, nothing starts)
      return null;
    }
    let levelUp: number | null = null;
    if (p.kind === "sparkle") {
      this.say(this.act((save, now) => paySparkle(save, visit.rng, now)));
      this.reactTo(p, "hop", "sparkle");
    } else if (p.kind === "rustle") {
      const r = this.act((save, now) => payRustle(save, save.creature!, visit.rng, now));
      levelUp = r.level;
      this.say(r.note);
      this.reactTo(p, "startle", r.found ? "sparkle" : "heart");
    } else if (p.kind === "pickup") {
      this.say(this.act((save, now) => payPickup(save, visit.place, now)));
      this.reactTo(p, "happy", "sparkle");
    } else {
      this.reactTo(p, "startle", null);
      this.startBurst();
    }
    return { kind: p.kind, levelUp };
  }

  // The 10 second Bug Catch burst a bug in a field starts: the same refusals as `startTraining`, in the same order, then the run begins at once (no start card). Paid by `payBurst`.
  startBurst(): StartTrainingResult {
    if (!isAdultMode(this.save)) return "adult-only";
    const c = this.save.creature;
    if (this.save.phase !== "alive" || !c) return "no-creature";
    if (this.training) return "open";
    if (this.arena || this.view.moment !== null || this.decor) return "elsewhere";
    const code = trainRefusal(c);
    if (code !== null) return code;
    const stage = trainStageOf(c);
    this.training = { bornAt: c.bornAt, stage, game: "bug", phase: "playing", run: newBugCatch(Math.floor(Math.random() * 2 ** 32), stage, tapTuning.burstMs), result: null, burst: c.place === "home" ? undefined : c.place };
    this.clearInitiative();
    this.syncTapView(); // (a session holds the visit: nothing is shown under it)
    this.listeners.forEach((listener) => listener());
    return "started";
  }

  // Feed the creature (the food row and the dishes). A craving for this very food is answered in the same `act` when the meal is eaten: Bond XP, once. Kid Mode, and any other feeding, is the old
  // `act(feed)` unchanged. Returns the meal's result and the Bond level the craving's XP reached (null for none).
  feed(food: FoodId, dish?: DishId): { result: FeedResult; levelUp: number | null } {
    const i = this.initiative;
    const answers = i !== null && i.kind === "craving" && i.food === food && !this.initiativeBlocked();
    let levelUp: number | null = null;
    const result = this.act((save, now) => {
      const r = feed(save, food, now, dish);
      if (r === "ate" && answers) levelUp = payBond(save, save.creature!, initiativeTuning.cravingXp, now);
      return r;
    });
    if (result === "ate" && answers) this.dropInitiative();
    return { result, levelUp };
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
    if (this.training && (this.save.phase !== "alive" || !c || c.bornAt !== this.training.bornAt)) this.training = null; // the creature is gone or another one hatched (an evolution goes on: it pays with the new stage's cap)
    if (this.initiative && (this.save.phase !== "alive" || !c || c.bornAt !== this.initiative.bornAt || !isAdultMode(this.save))) this.clearInitiative(); // not on every call: a toss, a pet or a meal goes through here too
    this.dropVisitIfGone(); // the creature left the field, died, or another hatched: its tappables go with it
    this.listeners.forEach((listener) => listener());
    this.scheduleSave();
  }

  // Move time forward. Called about once a second, and when the page comes back into view.
  tick(): void {
    const real = Date.now();
    const elapsed = real - this.lastReal; // real time since the last tick (the dev speed does not change it)
    advanceClock(this.save, elapsed, this.devSpeed);
    this.lastReal = real;
    if (simulateTo(this.save, gameNow(this.save, real)) > 0) this.changed(false);
    this.stepInitiative(elapsed);
    this.stepTappables(elapsed);
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
    this.training = null; // a save put in from the account or another profile pays nothing
    this.clearInitiative();
    this.initiativeClock = 0;
    this.initiativeWait = null; // (a new game draws its own wait)
    this.endVisit(); // (and its own visit)
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
