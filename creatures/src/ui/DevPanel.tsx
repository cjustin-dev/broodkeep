// Developer mode: bend time and rules so the whole game can be tested in minutes.
import { useEffect, useRef, useState } from "preact/hooks";
import { combatTuning } from "../data/combat";
import { forms } from "../data/forms";
import { startNewEgg } from "../game/actions";
import {
  forceEvolve,
  forceHatch,
  hpPercent,
  killCreature,
  resetAll,
  rungNumber,
  setHpPercent,
  setPoop,
  setRung,
  setSick,
  setStat,
  skipAhead,
  spawnEgg,
} from "../game/dev";
import type { Stats } from "../game/state";
import { HOUR } from "../game/time";
import { DevTree } from "./DevTree";
import type { Game } from "./game";

const speeds = [1, 10, 100, 1000];
const statNames: Array<keyof Stats> = ["hunger", "happiness", "energy", "hygiene", "wellness", "discipline"];

const when = (ms: number): string => {
  const d = new Date(ms);
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`;
};

export function DevPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [formId, setFormId] = useState("cragpup");
  const [sure, setSure] = useState(false);
  useEffect(() => closeRef.current?.focus(), []);

  const save = game.save;
  const c = save.creature;
  const now = game.now();
  const act = <T,>(fn: (s: typeof save, nowMs: number) => T): T => game.act(fn);

  return (
    <section class="panel" role="dialog" aria-label="Developer mode">
      <div class="panel-body">
        <header class="panel-head">
          <h2>Developer mode</h2>
          <button class="btn small" ref={closeRef} onClick={onClose}>
            Close
          </button>
        </header>

        <fieldset>
          <legend>Time</legend>
          <div class="row" role="group" aria-label="Speed">
            {speeds.map((speed) => (
              <button class="btn small" aria-pressed={game.devSpeed === speed} onClick={() => {
                game.devSpeed = speed;
                game.changed();
              }}>
                {speed}x
              </button>
            ))}
          </div>
          <div class="row" role="group" aria-label="Skip ahead">
            {[1, 6, 24].map((h) => (
              <button class="btn small" onClick={() => act((s) => skipAhead(s, h, Date.now()))}>
                +{h}h
              </button>
            ))}
          </div>
          <dl class="facts">
            <dt>Game time</dt>
            <dd>{when(now)}</dd>
            <dt>Ahead of real time</dt>
            <dd>{(save.clockOffsetMs / HOUR).toFixed(1)} h</dd>
          </dl>
        </fieldset>

        <fieldset>
          <legend>Creature</legend>
          <dl class="facts">
            <dt>Phase</dt>
            <dd>{save.phase}</dd>
            {c && (
              <>
                <dt>Form</dt>
                <dd>{c.formId}</dd>
                <dt>Time in this stage</dt>
                <dd>{((now - c.stageStartedAt) / HOUR).toFixed(1)} h</dd>
                <dt>Care mistakes</dt>
                <dd>{c.counters.careMistakes}</dd>
                <dt>Place</dt>
                <dd>{c.place}</dd>
                <dt>Call</dt>
                <dd>{c.call ?? "none"}</dd>
              </>
            )}
          </dl>

          {c && save.phase === "alive" && (
            <>
              {statNames.map((stat) => (
                <label class="slider">
                  <span>{stat}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(c.stats[stat])}
                    onInput={(e) => act((s) => setStat(s, stat, Number(e.currentTarget.value)))}
                  />
                  <output>{Math.round(c.stats[stat])}</output>
                </label>
              ))}
              <label class="slider">
                <span>battle HP %</span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={hpPercent(save)}
                  onInput={(e) => act((s) => setHpPercent(s, Number(e.currentTarget.value)))}
                />
                <output>{hpPercent(save)}</output>
              </label>
              <label class="slider">
                <span>fight rung (5 = boss)</span>
                <input
                  type="range"
                  min={1}
                  max={combatTuning.ladder.length}
                  value={rungNumber(save)}
                  onInput={(e) => act((s) => setRung(s, Number(e.currentTarget.value)))}
                />
                <output>{rungNumber(save)}</output>
              </label>
              <label class="check">
                <input type="checkbox" checked={c.sick} onChange={(e) => act((s) => setSick(s, e.currentTarget.checked))} />
                Sick
              </label>
              <div class="row">
                <span>Poop: {c.poop}</span>
                <button class="btn small" onClick={() => act((s) => setPoop(s, c.poop - 1))}>
                  −
                </button>
                <button class="btn small" onClick={() => act((s) => setPoop(s, c.poop + 1))}>
                  +
                </button>
              </div>
            </>
          )}

          <label class="slider">
            <span>Form</span>
            <select value={formId} onChange={(e) => setFormId(e.currentTarget.value)}>
              {Object.values(forms).map((f) => (
                <option value={f.id}>
                  {f.name} ({f.stage})
                </option>
              ))}
            </select>
          </label>
          <div class="row">
            <button class="btn small" onClick={() => act((s, n) => forceHatch(s, formId, n))}>
              Hatch this form now
            </button>
            <button class="btn small" disabled={save.phase !== "alive"} onClick={() => act((s, n) => forceEvolve(s, formId, n))}>
              Evolve to it
            </button>
          </div>
          <div class="row">
            <button class="btn small" onClick={() => act((s, n) => spawnEgg(s, n))}>
              New egg
            </button>
            <button class="btn small" disabled={save.phase !== "alive"} onClick={() => act((s, n) => killCreature(s, n))}>
              Kill it
            </button>
            <button class="btn small" disabled={save.phase !== "dead"} onClick={() => act((s, n) => startNewEgg(s, n))}>
              Egg after death
            </button>
          </div>
        </fieldset>

        <DevTree game={game} />

        <fieldset>
          <legend>Erase everything</legend>
          <button
            class="btn small danger"
            onClick={() => {
              if (!sure) return setSure(true);
              const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
              game.replaceSave(resetAll(save, game.now(), seed));
              setSure(false);
            }}
          >
            {sure ? "Tap again to erase the game" : "Start a brand new game"}
          </button>
        </fieldset>

        <fieldset>
          <legend>Event log (newest first)</legend>
          <ol class="log">
            {save.log
              .slice(-120)
              .reverse()
              .map((entry) => (
                <li>
                  <time>{when(entry.at)}</time> {entry.text}
                </li>
              ))}
          </ol>
        </fieldset>
      </div>
    </section>
  );
}
