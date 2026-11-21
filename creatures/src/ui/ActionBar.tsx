// The big care buttons under the room: feed, clean, lights, medicine.
// Icons only. The button that matches what the creature is asking for gently pulses.
import { useEffect, useState } from "preact/hooks";
import { addSparkles, startEating, triggerPose } from "../art/idle";
import { foodIds, foods } from "../data/foods";
import { clean, feed, giveMedicine, toggleLights } from "../game/actions";
import type { FoodId } from "../game/types";
import type { Game } from "./game";
import { Icon } from "./Icon";

export function ActionBar({ game }: { game: Game }) {
  const [tray, setTray] = useState(false);
  const c = game.save.phase === "alive" ? game.save.creature : null;
  const asleep = c?.sleep != null;
  const away = c?.job != null; // out working in the habitat: it cannot be cared for until it is home

  useEffect(() => {
    if (asleep || away) setTray(false); // the food tray makes no sense while it sleeps or is out
  }, [asleep, away]);

  if (!c) return null;

  const onFood = (id: FoodId): void => {
    setTray(false);
    const result = game.act((s, now) => feed(s, id, now));
    if (result === "ate") startEating(game.view, id);
    else if (result === "full") triggerPose(game.view, "refuse");
  };

  const onClean = (): void => {
    if (game.act((s, now) => clean(s, now)) === "cleaned") {
      triggerPose(game.view, "happy");
      addSparkles(game.view, 4);
    }
  };

  const onMedicine = (): void => {
    const result = game.act((s, now) => giveMedicine(s, now));
    if (result === "cured") {
      triggerPose(game.view, "happy");
      addSparkles(game.view, 4);
    } else if (result === "not-sick") triggerPose(game.view, "refuse");
  };

  const onLights = (): void => {
    const result = game.act((s, now) => toggleLights(s, now));
    if (result === "not-tired") triggerPose(game.view, "refuse");
  };

  return (
    <div class="actions">
      {tray && (
        <div class="tray" role="group" aria-label="Choose food">
          {foodIds.map((id) => (
            <button class="btn food" aria-label={foods[id].name} onClick={() => onFood(id)}>
              <Icon name={id} px={40} />
            </button>
          ))}
        </div>
      )}
      <div class="care" role="group" aria-label="Care">
        <button
          class="btn"
          aria-label="Feed"
          aria-expanded={tray}
          disabled={asleep || away}
          data-attention={c.call === "hungry"}
          onClick={() => setTray(!tray)}
        >
          <Icon name="feed" px={48} />
        </button>
        <button class="btn" aria-label="Clean up" disabled={away} data-attention={c.call === "dirty"} onClick={onClean}>
          <Icon name="clean" px={48} />
        </button>
        <button
          class="btn"
          aria-label="Lights off"
          aria-pressed={c.sleep !== null}
          disabled={c.sleep === "night" || away}
          data-attention={c.call === "sleepy"}
          onClick={onLights}
        >
          <Icon name="lights" px={48} />
        </button>
        <button class="btn" aria-label="Give medicine" disabled={away} data-attention={c.call === "sick"} onClick={onMedicine}>
          <Icon name="medicine" px={48} />
        </button>
      </div>
    </div>
  );
}
