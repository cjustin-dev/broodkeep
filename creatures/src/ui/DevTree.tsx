// Dev mode: how the creature is growing up (docs/paradise-plan.md section 2), which form it would grow into if the time were
// up, and the counters to set so every path in the tree can be tested without waiting.
import { fieldIds, fieldOfForm, fields, openFieldIds, planOf } from "../data/fields";
import { foods } from "../data/foods";
import { forms } from "../data/forms";
import { tuning } from "../data/tuning";
import { setCareCounter, setFieldMinutes, setPlace, setServings } from "../game/dev";
import { fieldCells, foodCells, leadingForm, stageHours, tierOf } from "../game/growth";
import type { Place } from "../game/types";
import type { Game } from "./game";

const numberInput = (value: number, max: number, onValue: (n: number) => void) => (
  <input
    type="number"
    min={0}
    max={max}
    value={value}
    onFocus={(e) => e.currentTarget.select()}
    onInput={(e) => onValue(Number(e.currentTarget.value))}
  />
);

export function DevTree({ game }: { game: Game }) {
  const save = game.save;
  const c = save.creature;
  if (!c || save.phase !== "alive") return null;
  const form = forms[c.formId];
  const stage = form?.stage;
  const next = leadingForm(c);
  const limit = stageHours(c);
  const hours = (game.now() - c.stageStartedAt) / 3_600_000;
  const g = tuning.growth;
  const field = fieldOfForm(c.formId);

  return (
    <fieldset>
      <legend>
        Growing up: {form?.name ?? c.formId} ({stage})
      </legend>
      {limit === null ? (
        <p class="hint">Fully grown. It does not change any more.</p>
      ) : (
        <p class="hint">
          {hours.toFixed(1)} of {limit} hours in this stage. If the time were up now it would grow into{" "}
          <strong>{next ? (forms[next]?.name ?? next) : "nothing"}</strong>
          {stage === "baby" ? ` (${g.fieldCellsToKid} cells in one field grow it sooner, each ${g.fieldCellMinutes} minutes)` : ""}.
        </p>
      )}

      <label class="slider">
        <span>place</span>
        <select value={c.place} onChange={(e) => game.act((s) => setPlace(s, e.currentTarget.value as Place))}>
          <option value="home">home</option>
          {fieldIds.map((id) => (
            <option value={id}>
              {fields[id].name}
              {fields[id].plan ? "" : " (locked)"}
            </option>
          ))}
        </select>
      </label>

      {stage === "baby" &&
        openFieldIds.map((id) => (
          <label class="slider">
            <span>
              {fields[id].name} minutes ({fieldCells(c, id)} cells)
            </span>
            {numberInput(c.counters.fieldMinutes[id] ?? 0, 999, (n) => game.act((s) => setFieldMinutes(s, id, n)))}
          </label>
        ))}

      {stage === "kid" &&
        field &&
        planOf(field).foods.map((food) => (
          <label class="slider">
            <span>
              {foods[food].name} servings ({foodCells(c, food)} cells, makes {forms[planOf(field).young[food] ?? ""]?.name ?? "?"})
            </span>
            {numberInput(c.counters.servings[food] ?? 0, 99, (n) => game.act((s) => setServings(s, food, n)))}
          </label>
        ))}

      {stage === "young" && (
        <>
          <label class="slider">
            <span>hunger cells (of {g.careCellsMax})</span>
            {numberInput(c.counters.hungerCells, g.careCellsMax, (n) => game.act((s) => setCareCounter(s, "hungerCells", n)))}
          </label>
          <label class="slider">
            <span>happy cells (of {g.careCellsMax})</span>
            {numberInput(c.counters.happyCells, g.careCellsMax, (n) => game.act((s) => setCareCounter(s, "happyCells", n)))}
          </label>
          <label class="slider">
            <span>care mistakes (tier {tierOf(c)})</span>
            {numberInput(c.counters.careMistakes, 99, (n) => game.act((s) => setCareCounter(s, "careMistakes", n)))}
          </label>
        </>
      )}
    </fieldset>
  );
}
