// Measures what a day of play earns, with the repo's own game rules (read-only), so the shop's prices come from numbers and not from guesses
// (docs/adult-a2-plan.md decision 5). It plays an adult for 14 simulated days under each player below and prints coins and materials per day
// (days 2 to 14: the first day starts rested and is not typical; the window runs from the last look of day 1 to 07:00 on day 15, about 13.5 days
// divided by 13, so every row is about 4 percent high, and rows compare with each other). Each visit lasts 15 minutes and looks in every 3 (a job takes 3 to 8), and
// does the care (food, clean-up, medicine) and sends the creature out whenever it can. A player sends it to the spot that pays the most coins
// for the energy ("best"), or goes round the open spots in turn ("round", so every material comes in).
//   careful  looks in every 5 minutes from 07:00 to 20:00 (as often as the creature can go), best spot and round
//   regular  three visits a day: 08:00, 12:30, 19:00, round
//   casual   two visits a day: 08:00 and 19:00, round
//   morning  one visit a day, 08:00, and evening, one visit a day, 19:00: they show what one visit a day does (the creature dies: the row says on which day)
//   <player>-board  the same player with Adult Mode on, who also answers the request board (A2.3, docs/adult-a2-plan.md decision 8): at each look, the
//                   named food (a meal), a job at the named spot, a fight (only with at least 80 energy: FIGHT_ENERGY), a field trip (taken at the look, brought home 21 minutes later) and the
//                   named purchase when it can pay (the coin price is added back, so the coins row shows what was earned, not what was spent on items; the
//                   materials a purchase takes are not, so a board player's materials row is net of them).
//                   It never skips a request for good, because nothing expires and a slot is held until it is done.
// Run it with ./run-income.sh (bundles this file first). Nothing is written to the repo.
import { spotIds, spots } from "../../src/data/habitat";
import type { MaterialId, SpotId } from "../../src/data/habitat";
import { clean, feed, giveMedicine, goTo, startJob } from "../../src/game/actions";
import { fightRefusal, beginFight, finishFight } from "../../src/game/combat/fight";
import { playRound } from "../../src/game/combat/battle";
import { jobRefusal } from "../../src/game/habitat/jobs";
import { buy, buyRefusal } from "../../src/game/shop";
import { items } from "../../src/data/shop";
import type { ItemId } from "../../src/data/shop";
import type { FieldId, FoodId } from "../../src/game/types";
import { makeCreature, simulateTo } from "../../src/game/sim";
import { newSave } from "../../src/game/state";
import type { Save } from "../../src/game/state";

const MINUTE = 60_000;
const DAYS = 14;
const FORM = "gravelhorn"; // an adult: every spot is open to it

type Player = "careful-best" | "careful-round" | "regular" | "casual" | "morning" | "evening" | "careful-round-board" | "regular-board" | "casual-board";
const VISIT_MINUTES = 15;
const LOOK_EVERY = 3;

// Local time on purpose: the creature sleeps by the clock (tuning.sleepDefaults, 20:00 to 07:00).
const at = (day: number, hour: number, minute = 0): number => new Date(2026, 10, 1 + day, hour, minute).getTime();

function startSave(adult: boolean): Save {
  const save = newSave(at(0, 7), 99);
  if (adult) save.settings.adultMode = true;
  const c = makeCreature(FORM, at(-10, 7), save.egg!.pattern);
  c.stageStartedAt = at(-10, 7);
  Object.assign(c.stats, { hunger: 70, happiness: 90, energy: 100, hygiene: 90, wellness: 100 });
  save.creature = c;
  save.egg = null;
  save.phase = "alive";
  save.lastSimulatedAt = at(0, 7);
  return save;
}

let turn = 0;

// The spot to send it to right now, or null: the one that pays the most coins for the energy ("best"), or the next open one in turn ("round").
function pickSpot(save: Save, how: "best" | "round"): SpotId | null {
  const c = save.creature!;
  const open = spotIds.filter((id) => jobRefusal(c, id) === null);
  if (how === "round") return open.length > 0 ? open[turn++ % open.length]! : null;
  open.sort((a, b) => (spots[b].coins[0] + spots[b].coins[1]) / spots[b].energyCost - (spots[a].coins[0] + spots[a].coins[1]) / spots[a].energyCost);
  return open[0] ?? null;
}

const FIGHT_ENERGY = 80; // the board player starts a fight only with this much energy left: a fight spends the energy the jobs need
const FIELD_TRIP_MINUTES = 21; // 20 minutes at the field are asked for; the minute that ends at the 20th is the one that pays
let spentOnRequests = 0; // the coin price of what the board player bought for a purchase request (added back to the row)
let trips: number[] = []; // when each field trip is over (the player brings the creature home then)
let fights = 0;
let fightsWon = 0;

// What the board player does about the open requests at one look: a meal of the named food (any request that wants a meal), a job at the named spot,
// a fight, the named purchase, or a field trip. It returns true when the creature was sent out (so the plain job is skipped).
function answerBoard(save: Save, now: number): boolean {
  const c = save.creature!;
  let sent = false;
  for (const r of [...save.board.open]) {
    if (r.type === "feed") feed(save, r.target as FoodId, now);
    else if (r.type === "buy") {
      const id = r.target as ItemId;
      if (buyRefusal(save, id) === null && buy(save, id, now) === "bought") spentOnRequests += items[id].price.coins;
    } else if (r.type === "fight" && !c.job && c.stats.energy >= FIGHT_ENERGY && fightRefusal(c) === null) {
      const battle = beginFight(save, c, now);
      while (!battle.over) playRound(battle, "attack");
      fights += 1;
      if (finishFight(save, c, battle, now)?.won) fightsWon += 1;
    } else if (r.type === "job" && !c.job && jobRefusal(c, r.target as SpotId) === null) {
      startJob(save, r.target as SpotId, now);
      sent = true;
    } else if (r.type === "field" && !c.job && c.place === "home" && !sent && goTo(save, r.target as FieldId, now) === "went") {
      trips.push(now + FIELD_TRIP_MINUTES * MINUTE);
      sent = true;
    }
  }
  return sent;
}

// What a player does at a visit: care first, then the board (a board player), then send the creature if it can go.
function visit(save: Save, now: number, how: "best" | "round", board: boolean): void {
  const c = save.creature!;
  if (c.place !== "home") return; // out at a field: the trip's own look brings it home
  if (c.sick) giveMedicine(save, now);
  if (c.poop > 0) clean(save, now);
  if (c.stats.hunger < 60) feed(save, "pellet", now);
  if (board && answerBoard(save, now)) return;
  const spot = pickSpot(save, how);
  if (spot) startJob(save, spot, now);
}

function play(player: Player): { coins: number; materials: Record<MaterialId, number>; jobs: number; requests: number; fights: string } {
  const board = player.endsWith("-board");
  const kind = player.replace(/-board$/, "");
  const save = startSave(board);
  spentOnRequests = 0;
  trips = [];
  fights = 0;
  fightsWon = 0;
  const bank = { coins: 0, materials: { fiber: 0, herb: 0, wood: 0, fish: 0, stone: 0 } as Record<MaterialId, number> };
  let jobs = 0;
  let before = { coins: 0, inv: { ...save.inventory }, done: 0, spent: 0 };
  const visits: Array<[number, number]> = kind === "regular" ? [[8, 0], [12, 30], [19, 0]] : kind === "casual" ? [[8, 0], [19, 0]] : kind === "morning" ? [[8, 0]] : kind === "evening" ? [[19, 0]] : [];
  const how = kind === "careful-best" ? "best" : "round";
  turn = 0;
  for (let day = 0; day < DAYS; day++) {
    if (day === 1) before = { coins: save.coins, inv: { ...save.inventory }, done: save.board.done, spent: spentOnRequests }; // measure from the start of day 2
    const times: number[] = [];
    if (player.startsWith("careful")) for (let m = 7 * 60; m < 20 * 60; m += 5) times.push(at(day, 0, m));
    else for (const [h, m] of visits) for (let k = 0; k < VISIT_MINUTES; k += LOOK_EVERY) times.push(at(day, h, m + k));
    for (const t of times) {
      // A field trip is over 21 minutes after it began: the player looks in again then and brings the creature home.
      for (const back of trips.filter((b) => b <= t).sort((a, b) => a - b)) {
        simulateTo(save, back);
        if (save.phase === "alive" && save.creature!.place !== "home") goTo(save, "home", back);
      }
      trips = trips.filter((b) => b > t);
      simulateTo(save, t);
      if (save.phase !== "alive") throw new Error(`${player} lost its creature on day ${day + 1}`);
      const wasAway = !!save.creature!.job;
      visit(save, t, how, board);
      if (!wasAway && save.creature!.job && day >= 1) jobs += 1;
    }
  }
  simulateTo(save, at(DAYS, 7));
  const days = DAYS - 1;
  bank.coins = (save.coins - before.coins + spentOnRequests - before.spent) / days;
  for (const id of Object.keys(bank.materials) as MaterialId[]) bank.materials[id] = ((save.inventory[id] ?? 0) - (before.inv[id] ?? 0)) / days;
  return { coins: bank.coins, materials: bank.materials, jobs: jobs / days, requests: (save.board.done - before.done) / days, fights: `${fightsWon} won of ${fights}` };
}

for (const player of ["careful-best", "careful-round", "regular", "casual", "morning", "evening", "careful-round-board", "regular-board", "casual-board"] as Player[]) {
  let r: ReturnType<typeof play>;
  try {
    r = play(player);
  } catch (error) {
    console.log(`${player.padEnd(19)} ${(error as Error).message}`);
    continue;
  }
  const total = Object.values(r.materials).reduce((a, b) => a + b, 0);
  const mats = Object.entries(r.materials)
    .map(([id, n]) => `${id} ${n.toFixed(1)}`)
    .join(", ");
  const asked = player.endsWith("-board") ? `  ${r.requests.toFixed(1)} requests/day (fights ${r.fights} in all 14 days)` : "";
  console.log(`${player.padEnd(19)} ${r.jobs.toFixed(1)} jobs/day  ${r.coins.toFixed(1)} coins/day  ${total.toFixed(1)} materials/day  (${mats})${asked}`);
}
