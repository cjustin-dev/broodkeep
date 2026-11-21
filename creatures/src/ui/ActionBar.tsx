// The big care buttons under the room: feed, clean, lights, medicine.
// Icons only. The button that matches what the creature is asking for gently pulses.
import { useEffect, useState } from "preact/hooks";
import { addEffect, triggerPose } from "../art/idle";
import { ROOM } from "../art/layout";
import { foodIds, foods } from "../data/foods";
import { clean, feed, giveMedicine, toggleLights } from "../game/actions";
import type { FoodId } from "../game/types";
import type { Game } from "./game";
import { Icon } from "./Icon";

export function ActionBar({ game }: { game: Game }) {
  const [tray, setTray] = useState(false);
  const c = game.save.phase === "alive" ? game.save.creature : null;
  const asleep = c?.sleep != null;

  useEffect(() => {
    if (asleep) setTray(false); // the food tray makes no sense while it sleeps
  }, [asleep]);

  if (!c) return null;

  const sparkle = (): void => {
    for (let i = 0; i < 4; i++) {
      addEffect(game.view, "sparkle", game.view.x + 2 + Math.random() * 12, ROOM.walkY + 2 + Math.random() * 10);
    }
  };

  const onFood = (id: FoodId): void => {
    setTray(false);
    const result = game.act((s, now) => feed(s, id, now));
    if (result === "ate") triggerPose(game.view, "eat");
    else if (result === "full") triggerPose(game.view, "refuse");
  };

  const onClean = (): void => {
    if (game.act((s, now) => clean(s, now)) === "cleaned") {
      triggerPose(game.view, "happy");
      sparkle();
    }
  };

  const onMedicine = (): void => {
    const result = game.act((s, now) => giveMedicine(s, now));
    if (result === "cured") {
      triggerPose(game.view, "happy");
      sparkle();
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
          disabled={asleep}
          data-attention={c.call === "hungry"}
          onClick={() => setTray(!tray)}
        >
          <Icon name="feed" px={48} />
        </button>
        <button class="btn" aria-label="Clean up" data-attention={c.call === "dirty"} onClick={onClean}>
          <Icon name="clean" px={48} />
        </button>
        <button
          class="btn"
          aria-label="Lights off"
          aria-pressed={c.sleep !== null}
          disabled={c.sleep === "night"}
          data-attention={c.call === "sleepy"}
          onClick={onLights}
        >
          <Icon name="lights" px={48} />
        </button>
        <button class="btn" aria-label="Give medicine" data-attention={c.call === "sick"} onClick={onMedicine}>
          <Icon name="medicine" px={48} />
        </button>
      </div>
    </div>
  );
}
