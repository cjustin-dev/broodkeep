// Dev mode: where the creature can evolve next, how each rule stands, and the numbers of systems
// that do not exist yet (so every path can still be tested).
import { forms } from "../data/forms";
import { describePaths, ruleText } from "../game/evolution";
import { setLaterCounter } from "../game/dev";
import { METRICS, laterMetrics, metricValue } from "../game/metrics";
import type { Game } from "./game";

export function DevTree({ game }: { game: Game }) {
  const save = game.save;
  const c = save.creature;
  if (!c || save.phase !== "alive") return null;
  const form = forms[c.formId];
  const paths = describePaths(c, game.now());

  return (
    <>
      <fieldset>
        <legend>Evolution paths from {form?.name ?? c.formId}</legend>
        {paths.length === 0 ? (
          <p class="hint">This is the last stage. It does not evolve any further.</p>
        ) : (
          <ol class="paths">
            {paths.map((p) => (
              <li class={p.leading ? "leading" : undefined}>
                <strong>{forms[p.evo.to]?.name ?? p.evo.to}</strong>{" "}
                <span class="hint">{p.fallback ? "if no path above fits" : "needs all of these"}</span>
                <div class="hint">
                  opens after {p.evo.minHours} h ({p.hoursInStage.toFixed(1)} h so far)
                </div>
                {p.leading && <span class="tag">wins if the time were up</span>}
                {p.rows.length > 0 && (
                  <ul>
                    {p.rows.map((row) => (
                      <li class={row.pass ? "pass" : "fail"}>{ruleText(row)}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </fieldset>

      <fieldset>
        <legend>Numbers for later systems</legend>
        <p class="hint">
          Only training is not in the game yet, so it stays at 0. Jobs, battles, wins and the three stats are counted for
          real (the stats start at the form's own numbers), and the number here is the total the tree reads. Set them here to
          test the paths that need them. They reset at each evolution. Discipline is a stat: use its slider under Creature.
        </p>
        {laterMetrics.map((metric) => (
          <label class="slider">
            <span>{METRICS[metric].label}</span>
            <input
              type="number"
              min={0}
              max={999}
              value={metricValue(c, metric)}
              onFocus={(e) => e.currentTarget.select()}
              onInput={(e) => game.act((s) => setLaterCounter(s, metric, Number(e.currentTarget.value)))}
            />
          </label>
        ))}
      </fieldset>
    </>
  );
}
