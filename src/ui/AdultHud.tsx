// Adult Mode's header: a strip (who, stage, clock, coins and materials, Book, settings), five stat cells with real numbers, and one line
// that says what matters now. Everything it says is worked out in game/hud.ts, where tests check it against the simulation.
// Kid Mode keeps its own header (App.tsx). The plan is docs/adult-a1-plan.md.
import { useEffect, useState } from "preact/hooks";
import { getForm } from "../data/forms";
import { materialIds, materials } from "../data/habitat";
import {
  bookPercent,
  callCell,
  cellSpan,
  clockText,
  contextLine,
  detailLines,
  hudStats,
  shownValue,
  stageLabel,
  statLevel,
  wellnessState,
} from "../game/hud";
import type { FightInfo, HudStat } from "../game/hud";
import type { Roster } from "../sync/roster";
import type { Game } from "./game";
import { Icon } from "./Icon";
import { openName, useRoster } from "./PlayersSection";

// Redraws once a second: the clock, the countdowns and the times to empty move even when nothing in the game changes.
export function useSecond(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
}

// The short word on each cell (it has to fit a fifth of a 320px screen) and the full name a screen reader says.
const cellText: Record<HudStat, { label: string; name: string }> = {
  hunger: { label: "FOOD", name: "Hunger" },
  happiness: { label: "MOOD", name: "Happiness" },
  energy: { label: "ENRG", name: "Energy" },
  hygiene: { label: "CLEAN", name: "Cleanliness" },
  wellness: { label: "WELL", name: "Wellness" },
};

interface Props {
  game: Game;
  roster: Roster;
  onSwitch: () => void;
  onBook: () => void;
  onSettings: () => void;
  onForecast: () => void;
}

function StatusStrip({ game, roster, now, onSwitch, onBook, onSettings, onForecast }: Props & { now: number }) {
  useRoster(roster);
  const { save } = game;
  const c = save.creature;
  const name = save.phase === "egg" ? "Egg" : c ? getForm(c.formId).name : "";
  const stage = save.phase === "dead" ? "Passed away" : save.phase === "alive" && c ? stageLabel(c) : "";
  const bag = materialIds.filter((id) => (save.inventory[id] ?? 0) > 0);
  const percent = bookPercent(save);
  return (
    <>
      <div class="strip">
        {/* The name and stage are the way in to the Growth Forecast (the row is 44px high, so the button costs no height). Nothing grows in an egg or a gone creature. */}
        {c && save.phase === "alive" ? (
          <button class="strip-id strip-open" aria-label={`Growth Forecast, ${name}, ${stage}`} onClick={onForecast}>
            <span class="strip-name">{name}</span>
            <span class="strip-sub">
              {`${stage} · ${clockText(now)}`}
              <span class="strip-more" aria-hidden="true">
                {" ›"}
              </span>
            </span>
          </button>
        ) : (
          <div class="strip-id">
            <span class="strip-name">{name}</span>
            <span class="strip-sub">{stage ? `${stage} · ${clockText(now)}` : clockText(now)}</span>
          </div>
        )}
        <button class="btn strip-btn" aria-label={`Creature Book, ${percent}% found`} onClick={onBook}>
          <Icon name="book" px={24} />
          <span>{percent}%</span>
        </button>
        <button class="btn strip-btn" aria-label="Settings" onClick={onSettings}>
          <Icon name="settings" px={24} />
        </button>
      </div>
      <div class="strip">
        <div class="strip-bag" role="group" aria-label="Bag">
          <span class="chip tight" role="img" aria-label={`${save.coins} coins`}>
            <Icon name="coin" px={20} />
            {save.coins}
          </span>
          {bag.map((id) => (
            <span class="chip tight" key={id} role="img" aria-label={`${save.inventory[id]} ${materials[id].name}`}>
              <Icon name={id} px={20} />
              {save.inventory[id]}
            </span>
          ))}
        </div>
        {roster.canSwitch && (
          <button class="btn strip-btn strip-who" onClick={onSwitch} aria-label={`Playing as ${openName(roster)}. Switch player`}>
            <span class="who-name">{openName(roster)}</span>
            <span class="who-switch">Switch</span>
          </button>
        )}
      </div>
    </>
  );
}

function AdultStats({ game }: { game: Game }) {
  const [open, setOpen] = useState<HudStat | null>(null);
  const { save } = game;
  const c = save.phase === "alive" ? save.creature : null;
  const asleep = c !== null && c.sleep !== null;
  const opened = c ? open : null; // an egg or a gone creature has no numbers to open

  return (
    <>
      <div class="astats" data-dim={c ? "false" : "true"}>
        {hudStats.map((stat) => {
          const { label, name } = cellText[stat];
          if (!c) {
            return (
              <div class="astat" key={stat}>
                <span class="astat-label">{label}</span>
                <span class="astat-num">–</span>
                <span class="bar">
                  <span class="fill" style={{ transform: "translateX(-100%)" }} />
                </span>
              </div>
            );
          }
          const value = c.stats[stat];
          const shown = shownValue(value);
          const span = stat === "wellness" ? wellnessState(c) : cellSpan(c, stat, asleep, save.owned);
          const calling = c.call !== null && callCell[c.call] === stat;
          const poop = stat === "hygiene" ? c.poop : 0;
          return (
            <button
              class="astat"
              key={stat}
              data-level={statLevel(value)}
              data-zero={shown === 0 ? "true" : "false"}
              aria-expanded={opened === stat}
              aria-label={`${label}: ${name} ${shown} of 100${span ? `, ${span}` : ""}${calling ? ", needs attention" : ""}`}
              onClick={() => setOpen(opened === stat ? null : stat)}
            >
              <span class="astat-label">{label}</span>
              <span class="astat-main">
                <span class="astat-num">{shown}</span>
                {poop > 0 && (
                  <span class="astat-poop">
                    <Icon name="poop" px={14} />
                    {poop}
                  </span>
                )}
              </span>
              <span class="bar">
                <span class="fill" style={{ transform: `translateX(${shown - 100}%)` }} />
              </span>
              <span class="astat-span">{span}</span>
              {calling && (
                <span class="astat-call" aria-hidden="true">
                  !
                </span>
              )}
            </button>
          );
        })}
      </div>
      {c && opened && (
        <section class="astat-card" aria-label={`${cellText[opened].name} details`}>
          {detailLines(c, opened, asleep, save.owned).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      )}
    </>
  );
}

export function AdultHeader({ game, roster, onSwitch, onBook, onSettings, onForecast }: Props) {
  useSecond();
  const now = game.now();
  // A fight is not in the save: the arena screen's own state says which foe it is.
  const fight: FightInfo | null =
    game.fighting && game.arena ? { foeName: getForm(game.arena.battle.foe.formId).name, rung: game.arena.battle.rung } : null;
  return (
    <header class="adult-top">
      <StatusStrip game={game} roster={roster} now={now} onSwitch={onSwitch} onBook={onBook} onSettings={onSettings} onForecast={onForecast} />
      <AdultStats game={game} />
      <p class="adult-ctx">{contextLine(game.save, now, game.screen, fight)}</p>
    </header>
  );
}
