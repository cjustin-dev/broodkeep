// The buttons under the arena picture. Before a fight: one big Fight button (a refused tap shows a small icon saying
// why). In a fight: attack, guard, special and run away. After a fight: a card with what it paid, tap to put it away.
// Icons only in Kid Mode; Adult Mode puts its word under each icon (Fight, and Train, which opens the training start card, ui/TrainGame.tsx).
// A timed fight (Adult Mode, docs/adult-a4-plan.md section 10) has its own bar: the numbers, the wild creature's next move, and a timing pad that replaces
// Attack, Guard and Special for one tap after one of them is chosen.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { triggerPose } from "../art/idle";
import type { IconName } from "../art/sprites";
import { combatTuning } from "../data/combat";
import { materials } from "../data/habitat";
import { timingWindows } from "../data/rhythm";
import type { StartFightResult } from "../game/actions";
import type { BattleAction } from "../game/combat/battle";
import { fightRefusal } from "../game/combat/fight";
import type { FightResult } from "../game/combat/fight";
import { gradeTap } from "../game/combat/timing";
import { isAdultMode } from "../game/hud";
import { trainRefusal } from "../game/training";
import { fightReason, trainReason } from "../game/reasons";
import type { CombatStat } from "../game/types";
import type { Arena, Game } from "./game";
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
  const shownAt = useRef(performance.now());
  useEffect(() => button.current?.focus(), []);
  // A timed fight ends on a tap on the pad (taken at pointerdown), and the click that same touch makes lands on this card, which is already on the screen: it would be put away unseen.
  const onClick = (): void => {
    if (game.arena?.battle.timed && performance.now() - shownAt.current < combatTuning.timed.resultGuardMs) return;
    game.leaveFight();
  };
  const parts: string[] = [];
  if (result.won) {
    parts.push(`${result.coins} ${result.coins === 1 ? "coin" : "coins"}`);
    if (result.material) parts.push(`${result.material.amount} ${materials[result.material.id].name}`);
    if (result.trained && result.trained.points > 0) parts.push("stronger");
  }
  const label = result.won ? `You won! ${parts.join(", ")}. Tap to continue.` : "You lost and your creature needs a rest. Tap to continue.";
  return (
    <button class="result" ref={button} aria-label={label} data-won={result.won} onClick={onClick}>
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

const timedActions: { id: BattleAction; icon: IconName; word: string }[] = [
  { id: "attack", icon: "sword", word: "Attack" },
  { id: "guard", icon: "shield", word: "Guard" },
  { id: "special", icon: "spark", word: "Special" },
];

// A timed fight (Adult Mode): the numbers, the wild creature's next move, and the three actions. Choosing one opens the timing pad: a ring shrinks onto a
// circle, a tap is graded by how far from the moment it meets it (game/combat/timing.ts), and a pad that is not tapped plays the round as Normal.
function TimedFight({ game, arena, noteRow }: { game: Game; arena: Arena; noteRow: ComponentChildren }) {
  const [prompt, setPrompt] = useState<{ choice: BattleAction; openedAt: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const resolved = useRef(false);
  const pad = useRef<HTMLButtonElement>(null);
  const back = useRef<BattleAction | null>(null); // the action to give focus back to once its round has played
  useEffect(() => () => window.clearTimeout(timer.current), []); // leaving the fight (or any other end) stops the pad's clock
  useEffect(() => {
    if (prompt) pad.current?.focus();
  }, [prompt]);

  const b = arena.battle;
  const waiting = game.playing;
  // The pad took focus and left with it, and the buttons were disabled while the round played: put focus back on the action just played (Attack after a Special, which empties the meter),
  // unless the player has moved it somewhere else since.
  useEffect(() => {
    if (waiting || !back.current) return;
    const id = back.current === "special" ? "attack" : back.current;
    back.current = null;
    if (document.activeElement && document.activeElement !== document.body) return;
    document.querySelector<HTMLButtonElement>(`.fightbtns.timed button[data-act="${id}"]:not(:disabled)`)?.focus();
  }, [waiting]);
  const full = b.me.meter >= combatTuning.meterMax;
  const t = combatTuning.timed;
  const hp = (side: "me" | "foe"): number => (waiting ? b.hpBefore[side] : b[side].hp); // the numbers wait for the blows, like the bars

  // One tap, or the pad closing by itself (tapAt null), ends the prompt and plays the round once.
  const finish = (choice: BattleAction, openedAt: number, tapAt: number | null): void => {
    if (resolved.current) return;
    resolved.current = true;
    window.clearTimeout(timer.current);
    back.current = choice;
    setPrompt(null);
    const offset = tapAt === null ? null : tapAt - (openedAt + t.ringMs);
    game.round(choice, offset === null ? "normal" : gradeTap(offset), offset);
  };
  const open = (choice: BattleAction): void => {
    if (waiting || prompt) return;
    resolved.current = false;
    const openedAt = performance.now();
    setPrompt({ choice, openedAt });
    timer.current = window.setTimeout(() => finish(choice, openedAt, null), t.ringMs + timingWindows.goodMs + t.graceMs);
  };

  const next = b.foeNext ? timedActions.find((a) => a.id === b.foeNext) : undefined;
  const chosen = prompt ? timedActions.find((a) => a.id === prompt.choice)! : null;
  const tap = (): void => {
    if (prompt) finish(prompt.choice, prompt.openedAt, performance.now());
  };
  return (
    <div class="actions">
      {noteRow}
      <p class="arena-nums">
        <span>
          You {hp("me")}/{b.me.maxHp}
        </span>{" "}
        <span>
          Foe {hp("foe")}/{b.foe.maxHp}
        </span>{" "}
        <span>
          Special {b.me.meter}/{combatTuning.meterMax}
        </span>
      </p>
      <p class="arena-intent" style={{ visibility: waiting || !next ? "hidden" : "visible" }}>
        <span>Foe next: </span>
        {next && <Icon name={next.icon} px={24} />}
        <span class="arena-move">{next?.id ?? ""}</span>
      </p>
      <div class="fightbtns timed" role="group" aria-label="Fight">
        {chosen ? (
          <button
            class="timing-pad"
            ref={pad}
            aria-label={`${chosen.word}: tap when the ring meets the circle`}
            onPointerDown={(e) => {
              if (e.button !== 0) return; // a touch, the pen's tip and the mouse's main button are 0; a right or middle press is not a tap
              e.preventDefault();
              tap();
            }}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault(); // also stops the button's own click for Enter: a held key repeats into the pad, and a repeat is not a tap
                if (!e.repeat) tap();
              }
            }}
            onClick={(e) => {
              if (e.detail === 0) tap(); // a click that no pointer made: assistive technology
            }}
          >
            <span class="timing-target" aria-hidden="true" />
            <span class="timing-ring" aria-hidden="true" style={`animation-duration: ${t.ringMs}ms; --ring-ms: ${t.ringMs}ms`} />
            <span class="timing-icon" aria-hidden="true">
              <Icon name={chosen.icon} px={32} />
            </span>
            <span class="timing-word" aria-hidden="true">
              {chosen.word}
            </span>
          </button>
        ) : (
          timedActions.map((a) => (
            <button
              key={a.id}
              class="btn labelled"
              aria-label={a.id === "special" && !full ? "Special (not charged yet)" : a.word}
              disabled={waiting || (a.id === "special" && !full)}
              data-act={a.id}
              data-attention={a.id === "special" && full && !waiting}
              onKeyDown={(e) => {
                if (e.repeat && (e.key === " " || e.key === "Enter")) e.preventDefault(); // a key still held from the pad's tap repeats into the button that focus went back to: not a choice
              }}
              onClick={() => open(a.id)}
            >
              <Icon name={a.icon} px={40} />
              <Word text={a.word} />
            </button>
          ))
        )}
        <button class="btn labelled" aria-label="Run away" onClick={() => game.leaveFight()}>
          <Icon name="house" px={32} />
          <Word text="Run" />
        </button>
      </div>
    </div>
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

  if (arena && arena.battle.timed) return <TimedFight game={game} arena={arena} noteRow={noteRow} />;

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
