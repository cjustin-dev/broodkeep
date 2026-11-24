// The note Adult Mode shows over the room (ui/game.ts: say, clearNote, whyNot). It is screen state: it must never reach the save.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feed, startNewEgg } from "../src/game/actions";
import type { Request } from "../src/game/board";
import { killCreature } from "../src/game/dev";
import { feedButtonRefusal, lightsRefusal } from "../src/game/availability";
import { feedReason, lightsReason } from "../src/game/reasons";
import { newSave } from "../src/game/state";
import { HOUR, MINUTE } from "../src/game/time";
import { writeSave } from "../src/sync/local";
import { Game } from "../src/ui/game";
import { aliveSave, at } from "./helpers";

// The write to the device is replaced (the real one needs a browser), as in game-save-hook.test.ts.
vi.mock("../src/sync/local", () => ({ writeSave: vi.fn(() => Promise.resolve()) }));

let game: Game;
let told: boolean[];
let woken: number;

function start(adult: boolean, nowMs = at(10)): void {
  vi.setSystemTime(nowMs);
  const save = aliveSave("blip", nowMs);
  if (adult) save.settings.adultMode = true;
  game = new Game(save);
  told = [];
  woken = 0;
  game.onSave = (byPlayer) => told.push(byPlayer);
  game.subscribe(() => woken++);
  vi.mocked(writeSave).mockClear();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis); // the game uses window.setTimeout
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("say", () => {
  it("shows a note, wakes the screens, and takes it away after 6 seconds", () => {
    start(true);
    game.say("Not hungry.");
    expect(game.note).toBe("Not hungry.");
    expect(woken).toBe(1);
    vi.advanceTimersByTime(5999);
    expect(game.note).toBe("Not hungry.");
    vi.advanceTimersByTime(1);
    expect(game.note).toBeNull();
    expect(woken).toBe(2); // the screens are told when it goes, too
  });

  it("replaces the old note and starts the 6 seconds again, with one timer", () => {
    start(true);
    game.say("one");
    const withOne = vi.getTimerCount();
    vi.advanceTimersByTime(4000);
    game.say("two");
    expect(vi.getTimerCount()).toBe(withOne); // the first timer was cleared, not left running beside the second
    vi.advanceTimersByTime(4000);
    expect(game.note).toBe("two"); // 8 s after the first note, 4 s after the second
    vi.advanceTimersByTime(2000);
    expect(game.note).toBeNull();
  });

  it("does nothing in Kid Mode, and nothing for empty text", () => {
    start(false);
    game.say("Not hungry.");
    expect(game.note).toBeNull();
    expect(woken).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    game.save.settings.adultMode = true;
    game.say("");
    expect(game.note).toBeNull();
    expect(woken).toBe(0);
  });

  it("is never the player's doing: no save is scheduled, nothing is marked changed, nothing goes to the cloud", async () => {
    start(true);
    const before = JSON.stringify(game.save);
    game.say("Not hungry.");
    game.say("Not tired.");
    vi.advanceTimersByTime(60_000);
    expect(writeSave).not.toHaveBeenCalled(); // changed() would have scheduled one 600 ms later
    expect(told).toEqual([]);
    expect(JSON.stringify(game.save)).toBe(before);
    await game.saveNow(); // and when something does save, it is not called the player's
    expect(told).toEqual([false]);
  });
});

describe("the note goes away with what it was about", () => {
  it("clears when the screen changes", () => {
    start(true);
    game.say("Not hungry.");
    game.setScreen("habitat");
    expect(game.note).toBeNull();
  });

  it("clears when a game is put in (the account's, or the dev panel's), with its timer", () => {
    start(true);
    game.replaceSave(aliveSave("blip", at(10))); // with no note showing: what replaceSave leaves pending by itself (its save timer)
    const baseline = vi.getTimerCount();
    vi.clearAllTimers();
    start(true);
    game.say("Not hungry.");
    expect(vi.getTimerCount()).toBe(1); // the note's timer is pending, and nothing else
    const next = aliveSave("blip", at(10));
    next.settings.adultMode = true; // an Adult game put in: changed() alone would keep the note, so only replaceSave's own clear can drop it
    game.replaceSave(next);
    expect(game.note).toBeNull();
    expect(vi.getTimerCount()).toBe(baseline); // the note's timer went with it
  });

  it("clears when the creature dies, and stays clear for the new egg", () => {
    start(true);
    game.say("Not hungry.");
    game.act((save, now) => killCreature(save, now));
    expect(game.save.phase).toBe("dead");
    expect(game.note).toBeNull();
    game.act((save, now) => startNewEgg(save, now));
    expect(game.save.phase).toBe("egg");
    expect(game.note).toBeNull();
  });

  it("clears when the creature dies by itself, with nobody tapping (the clock moves on and it starves)", () => {
    start(true);
    game.say("Not hungry.");
    vi.setSystemTime(Date.now() + 10 * 24 * HOUR);
    game.tick();
    expect(game.save.phase).toBe("dead");
    expect(game.note).toBeNull();
  });

  it("clears when Adult Mode is switched off, and does not come back when it is switched on again", () => {
    start(true);
    game.say("Not hungry.");
    game.save.settings.adultMode = false;
    game.changed();
    expect(game.note).toBeNull();
    game.save.settings.adultMode = true;
    game.changed();
    expect(game.note).toBeNull();
  });

  it("does not clear when only the clock moves on", () => {
    start(true);
    game.say("Not hungry.");
    vi.setSystemTime(Date.now() + MINUTE);
    game.tick();
    expect(game.note).toBe("Not hungry.");
  });
});

describe("whyNot", () => {
  const ask = (): string | null => game.whyNot(feedButtonRefusal, (save, c, code, now) => feedReason(save, c, code, now));

  it("says why not, in the note, and returns the code", () => {
    start(true);
    game.save.creature!.stats.hunger = 97;
    expect(ask()).toBe("full");
    expect(game.note).toBe("Not hungry: food is 97 of 100. It refuses food at 95 or more.");
  });

  it("returns null and says nothing when the tap may go on", () => {
    start(true);
    game.save.creature!.stats.hunger = 50;
    expect(ask()).toBeNull();
    expect(game.note).toBeNull();
  });

  it("does not even look in Kid Mode, and says nothing", () => {
    start(false);
    game.save.creature!.stats.hunger = 97;
    const refusal = vi.fn(() => "never asked");
    const tick = vi.spyOn(game, "tick");
    expect(game.whyNot(refusal, () => "never said")).toBeNull();
    expect(refusal).not.toHaveBeenCalled();
    expect(tick).not.toHaveBeenCalled();
    expect(game.note).toBeNull();
  });

  it("asks the live state, not the last picture: the night that began a moment ago is already true", () => {
    start(true, at(19, 59)); // one minute before the default bedtime (8 pm)
    game.save.creature!.stats.energy = 50; // tired enough that the Nap button is lit by day
    expect(game.save.creature!.sleep).toBeNull();
    expect(lightsRefusal(game.save.creature!)).toBeNull(); // the screen would show the Nap button lit
    vi.setSystemTime(at(20, 5)); // five minutes into the night; no tick has run yet
    expect(game.save.creature!.sleep).toBeNull(); // the screen still shows the old state
    expect(game.whyNot(lightsRefusal, (save, c, code, now) => lightsReason(save, c, code, now))).toBe("night");
    expect(game.note).toBe("Night sleep follows the clock: wakes 7 am (in 10:55).");
    expect(game.save.creature!.sleep).toBe("night"); // it caught the game up first
  });

  it("returns null when there is only an egg to ask about, and says nothing", () => {
    vi.setSystemTime(at(10));
    const egg = newSave(at(10), 1);
    egg.settings.adultMode = true;
    game = new Game(egg);
    expect(game.save.phase).toBe("egg");
    expect(game.whyNot(() => "x", () => "never")).toBeNull();
    expect(game.note).toBeNull();
  });

  it("returns null when there is no creature to ask about (dead)", () => {
    start(true);
    game.act((save, now) => killCreature(save, now));
    expect(game.whyNot(() => "x", () => "never")).toBeNull();
    expect(game.note).toBeNull();
  });

  it("does not change the save", () => {
    start(true);
    game.save.creature!.stats.hunger = 97;
    const before = JSON.stringify(game.save);
    ask();
    expect(JSON.stringify(game.save)).toBe(before);
    expect(feed(game.save, "pellet", game.now())).toBe("full"); // and the action is still refused the same way
  });
});

// The note a paid request gets (adult track A2.3): said once for what was paid since the screens last looked, whoever paid it (the player's tap or time passing).
describe("a paid request says so", () => {
  const wanted = (o: Pick<Request, "type" | "target"> & Partial<Request>): Request => ({ id: 0, have: 0, item: null, drewAt: at(10), ...o });
  const busy = (n: number) => Array.from({ length: n }, () => ({ doneAt: at(10), coins: 0, item: null }));

  it("says it over the room when the player's meal finishes the request, and not again", () => {
    start(true);
    game.save.board.open = [wanted({ type: "feed", target: "pellet" })];
    game.save.board.waits = busy(2);
    game.act((s, now) => feed(s, "pellet", now));
    expect(game.note).toBeNull(); // one meal of two
    game.act((s, now) => feed(s, "pellet", now));
    expect(game.save.coins).toBe(2);
    expect(game.note).toBe("Request done: +2 coins");
    vi.advanceTimersByTime(6000);
    expect(game.note).toBeNull();
    game.changed(); // nothing new was paid
    expect(game.note).toBeNull();
  });

  it("says it when time passing finishes it, with the item it paid", () => {
    start(true);
    game.save.owned = ["feeding-mat"];
    game.save.board.open = [wanted({ type: "buy", target: "feeding-mat", item: "stew" })];
    game.save.board.waits = busy(2);
    vi.setSystemTime(at(10) + 61_000);
    game.tick();
    expect(game.save.board.done).toBe(1);
    expect(game.note).toBe("Request done: +5 coins and Stew");
  });

  it("states no amount when a long catch-up has already freed the slot that was paid (a wait lasts 15 minutes)", () => {
    start(true);
    game.save.owned = ["feeding-mat"];
    game.save.board.open = [wanted({ type: "buy", target: "feeding-mat", item: "stew" })];
    game.save.board.waits = busy(2);
    vi.setSystemTime(at(10) + 40 * MINUTE);
    game.tick();
    expect(game.save.board.done).toBe(1);
    expect(game.save.coins).toBe(5);
    expect(game.save.board.waits).toEqual([]); // the wait that paid is gone
    expect(game.note).toBe("Request done");
  });

  it("says nothing in Kid Mode, and nothing for a game put in with payments already in it", () => {
    start(false);
    game.save.board.open = [wanted({ type: "feed", target: "pellet" })];
    game.save.board.waits = busy(2);
    game.save.settings.adultMode = true; // the board runs in Adult Mode: a Kid Mode tap cannot pay it
    game.save.settings.adultMode = false;
    game.act((s, now) => feed(s, "pellet", now));
    game.act((s, now) => feed(s, "pellet", now));
    expect(game.save.board.done).toBe(0);
    expect(game.note).toBeNull();

    start(true);
    const next = aliveSave("blip", at(10));
    next.settings.adultMode = true;
    next.board.done = 5;
    game.replaceSave(next);
    expect(game.note).toBeNull();
    game.changed();
    expect(game.note).toBeNull();
  });
});
