// The buttons under the arena picture. Before a fight: one big Fight button (a refused tap shows a small icon saying
// why). In a fight: attack, guard, special and run away. After a fight: a card with what it paid, tap to put it away.
// Icons only in Kid Mode; Adult Mode puts its word under each icon (Fight, and Train, which opens the training start card, ui/TrainGame.tsx).
import { useEffect, useRef, useState } from "preact/hooks";
import { triggerPose } from "../art/idle";
import type { IconName } from "../art/sprites";
import { combatTuning } from "../data/combat";
import { materials } from "../data/habitat";
import type { StartFightResult } from "../game/actions";
import { fightRefusal } from "../game/combat/fight";
import type { FightResult } from "../game/combat/fight";
import { isAdultMode } from "../game/hud";
import { trainRefusal } from "../game/training";
import { fightReason, trainReason } from "../game/reasons";
import type { CombatStat } from "../game/types";
import type { Game } from "./game";
import { Icon, Word } from "./Icon";

// Why a tap on Fight did nothing, as a picture.
const refusalIcon: Partial<Record<StartFightResult["status"], IconName>> = {
  asleep: "zzz",
  sick: "sick",
  tired: "energy",
  "too-young": "lock",
  busy: "tree",
};

// A stat is drawn as the action that trains it.
const statIcon: Partial<Record<CombatStat, IconName>> = { str: "sword", def: "shield", spi: "spark" };

function ResultCard({ game, result }: { game: Game; result: FightResult }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  const parts: string[] = [];
  if (result.won) {
    parts.push(`${result.coins} ${result.coins === 1 ? "coin" : "coins"}`);
    if (result.material) parts.push(`${result.material.amount} ${materials[result.material.id].name}`);
    if (result.trained && result.trained.points > 0) parts.push("stronger");
  }
  const label = result.won ? `You won! ${parts.join(", ")}. Tap to continue.` : "You lost and your creature needs a rest. Tap to continue.";
  return (
    <button class="result" ref={button} aria-label={label} data-won={result.won} onClick={() => game.leaveFight()}>
      {result.won ? (
        <>
          <span class="haul-row">
            <Icon name="coin" px={32} />
            <span class="result-num">+{result.coins}</span>
          </span>
          {result.material && (
            <span class="haul-row">
              <Icon name={result.material.id} px={32} />
              <span class="result-num">+{result.material.amount}</span>
            </span>
          )}
          {result.trained && result.trained.points > 0 && statIcon[result.trained.stat] && (
            <span class="haul-row">
              <Icon name={statIcon[result.trained.stat] as IconName} px={32} />
              <span class="result-num">+{result.trained.points}</span>
            </span>
          )}
        </>
      ) : (
        <span class="haul-row">
          <Icon name="cloud" px={32} />
          <Icon name="zzz" px={32} />
        </span>
      )}
    </button>
  );
}

export function ArenaBar({ game }: { game: Game }) {
  const [note, setNote] = useState<IconName | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const c = game.save.creature;
  if (game.save.phase !== "alive" || !c) return null;

  const show = (icon: IconName): void => {
    setNote(icon);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNote(null), 1600);
  };

  const adult = isAdultMode(game.save);

  const onFight = (): void => {
    if (adult && game.whyNot(fightRefusal, fightReason) !== null) return;
    const status = game.fight();
    if (status === "started") {
      triggerPose(game.view, "hop");
      setNote(null); // an old refusal does not belong to the fight that has just begun
    } else {
      const icon = refusalIcon[status];
      if (icon) show(icon);
    }
  };

  // Train (Adult Mode): ask why not first, which says the sentence over the room; the entry then decides alone (ui/game.ts startTraining).
  const onTrain = (): void => {
    if (game.whyNot(trainRefusal, trainReason) !== null) return;
    game.startTraining();
  };

  // The note row is there in every state, so the picture does not move when a fight starts or ends.
  const noteRow = (
    <div class="bag" role="group" aria-label="Arena">
      <span class="note" aria-hidden="true">
        {note && <Icon name={note} px={32} />}
      </span>
    </div>
  );

  const arena = game.arena;
  if (arena?.battle.over) {
    return (
      <div class="actions">
        {noteRow}
        {arena.result ? <ResultCard game={game} result={arena.result} /> : null}
      </div>
    );
  }

  if (arena) {
    const waiting = game.playing;
    const full = arena.battle.me.meter >= combatTuning.meterMax;
    return (
      <div class="actions">
        {noteRow}
        <div class="fightbtns" role="group" aria-label="Fight">
          <button class="btn" aria-label="Attack" disabled={waiting} onClick={() => game.round("attack")}>
            <Icon name="sword" px={48} />
          </button>
          <button class="btn" aria-label="Guard" disabled={waiting} onClick={() => game.round("guard")}>
            <Icon name="shield" px={48} />
          </button>
          <button
            class="btn"
            aria-label={full ? "Special" : "Special (not charged yet)"}
            disabled={waiting || !full}
            data-attention={full && !waiting}
            onClick={() => game.round("special")}
          >
            <Icon name="spark" px={48} />
          </button>
          <button class="btn" aria-label="Run away" onClick={() => game.leaveFight()}>
            <Icon name="house" px={32} />
          </button>
        </div>
      </div>
    );
  }

  if (adult) {
    return (
      <div class="actions">
        {noteRow}
        <div class="trainbtns" role="group" aria-label="Fight or train">
          <button class="btn labelled" aria-label="Fight a wild creature" aria-disabled={fightRefusal(c) !== null ? true : undefined} onClick={onFight}>
            <Icon name="swords" px={40} />
            <Word text="Fight" />
          </button>
          <button class="btn labelled" aria-label="Train: play a training game" aria-disabled={trainRefusal(c) !== null ? true : undefined} onClick={onTrain}>
            <Icon name="bug" px={40} />
            <Word text="Train" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="actions">
      {noteRow}
      <button
        class="btn wide fight"
        aria-label="Fight a wild creature"
        aria-disabled={adult && fightRefusal(c) !== null ? true : undefined}
        onClick={onFight}
      >
        <Icon name="swords" px={40} />
      </button>
    </div>
  );
}
