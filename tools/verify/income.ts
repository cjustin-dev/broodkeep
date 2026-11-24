// Measures what a day of play earns, with the repo's own game rules (read-only), so the shop's prices come from numbers and not from guesses
// (docs/adult-a2-plan.md decision 5). It plays an adult for 14 simulated days under three players and prints coins and materials per day
// (days 2 to 14: the first day starts rested and is not typical). Each visit lasts 15 minutes and looks in every 3 (a job takes 3 to 8), and
// does the care (food, clean-up, medicine) and sends the creature out whenever it can. A player sends it to the spot that pays the most coins
// for the energy ("best"), or goes round the open spots in turn ("round", so every material comes in).
//   careful  looks in every 5 minutes from 07:00 to 20:00 (as often as the creature can go), best spot and round
//   regular  three visits a day: 08:00, 12:30, 19:00, round
//   casual   two visits a day: 08:00 and 19:00, round
//   morning  one visit a day, 08:00, and evening, one visit a day, 19:00: they show what one visit a day does (the creature dies: the row says on which day)
// Run it with ./run-income.sh (bundles this file first). Nothing is written to the repo.
import { spotIds, spots } from "../../src/data/habitat";
import type { MaterialId, SpotId } from "../../src/data/habitat";
import { clean, feed, giveMedicine, startJob } from "../../src/game/actions";
import { jobRefusal } from "../../src/game/habitat/jobs";
import { makeCreature, simulateTo } from "../../src/game/sim";
import { newSave } from "../../src/game/state";
import type { Save } from "../../src/game/state";

const MINUTE = 60_000;
const DAYS = 14;
const FORM = "gravelhorn"; // an adult: every spot is open to it

type Player = "careful-best" | "careful-round" | "regular" | "casual" | "morning" | "evening";
const VISIT_MINUTES = 15;
const LOOK_EVERY = 3;

// Local time on purpose: the creature sleeps by the clock (tuning.sleepDefaults, 20:00 to 07:00).
const at = (day: number, hour: number, minute = 0): number => new Date(2026, 10, 1 + day, hour, minute).getTime();

function startSave(): Save {
  const save = newSave(at(0, 7), 99);
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

// What a player does at a visit: care first, then send the creature if it can go.
function visit(save: Save, now: number, how: "best" | "round"): void {
  const c = save.creature!;
  if (c.sick) giveMedicine(save, now);
  if (c.poop > 0) clean(save, now);
  if (c.stats.hunger < 60) feed(save, "pellet", now);
  const spot = pickSpot(save, how);
  if (spot) startJob(save, spot, now);
}

function play(player: Player): { coins: number; materials: Record<MaterialId, number>; jobs: number } {
  const save = startSave();
  const bank = { coins: 0, materials: { fiber: 0, herb: 0, wood: 0, fish: 0, stone: 0 } as Record<MaterialId, number> };
  let jobs = 0;
  let before = { coins: 0, inv: { ...save.inventory } };
  const visits: Array<[number, number]> = player === "regular" ? [[8, 0], [12, 30], [19, 0]] : player === "casual" ? [[8, 0], [19, 0]] : player === "morning" ? [[8, 0]] : player === "evening" ? [[19, 0]] : [];
  const how = player === "careful-best" ? "best" : "round";
  turn = 0;
  for (let day = 0; day < DAYS; day++) {
    if (day === 1) before = { coins: save.coins, inv: { ...save.inventory } }; // measure from the start of day 2
    const times: number[] = [];
    if (player.startsWith("careful")) for (let m = 7 * 60; m < 20 * 60; m += 5) times.push(at(day, 0, m));
    else for (const [h, m] of visits) for (let k = 0; k < VISIT_MINUTES; k += LOOK_EVERY) times.push(at(day, h, m + k));
    for (const t of times) {
      simulateTo(save, t);
      if (save.phase !== "alive") throw new Error(`${player} lost its creature on day ${day + 1}`);
      const wasAway = !!save.creature!.job;
      visit(save, t, how);
      if (!wasAway && save.creature!.job && day >= 1) jobs += 1;
    }
  }
  simulateTo(save, at(DAYS, 7));
  const days = DAYS - 1;
  bank.coins = (save.coins - before.coins) / days;
  for (const id of Object.keys(bank.materials) as MaterialId[]) bank.materials[id] = ((save.inventory[id] ?? 0) - (before.inv[id] ?? 0)) / days;
  return { coins: bank.coins, materials: bank.materials, jobs: jobs / days };
}

for (const player of ["careful-best", "careful-round", "regular", "casual", "morning", "evening"] as Player[]) {
  let r: ReturnType<typeof play>;
  try {
    r = play(player);
  } catch (error) {
    console.log(`${player.padEnd(14)} ${(error as Error).message}`);
    continue;
  }
  const total = Object.values(r.materials).reduce((a, b) => a + b, 0);
  const mats = Object.entries(r.materials)
    .map(([id, n]) => `${id} ${n.toFixed(1)}`)
    .join(", ");
  console.log(`${player.padEnd(14)} ${r.jobs.toFixed(1)} jobs/day  ${r.coins.toFixed(1)} coins/day  ${total.toFixed(1)} materials/day  (${mats})`);
}
