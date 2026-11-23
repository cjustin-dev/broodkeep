// The big care buttons under the room: feed, clean, lights, medicine.
// Icons only. The button that matches what the creature is asking for gently pulses.
import { useEffect, useState } from "preact/hooks";
import { addSparkles, startEating, triggerPose } from "../art/idle";
import { placeIcon } from "../art/sprites";
import { fieldIds, fields } from "../data/fields";
import { foods } from "../data/foods";
import { clean, feed, giveMedicine, goTo, toggleLights } from "../game/actions";
import { menuOf } from "../game/growth";
import type { FoodId, Place } from "../game/types";
import type { Game } from "./game";
import { Icon } from "./Icon";

// The places a creature can be taken: home first, then the fields. A locked field shows a lock and shakes its head when tapped.
const placeIds: Place[] = ["home", ...fieldIds];
const placeName = (id: Place): string => (id === "home" ? "Home" : fields[id].name);

export function ActionBar({ game }: { game: Game }) {
  const [tray, setTray] = useState<"food" | "places" | null>(null); // which little list is open above the buttons
  const c = game.save.phase === "alive" ? game.save.creature : null;
  const asleep = c?.sleep != null;
  const away = c?.job != null; // out working in the habitat: it cannot be cared for until it is home

  useEffect(() => {
    if (asleep || away) setTray(null); // the trays make no sense while it sleeps or is out
  }, [asleep, away]);

  if (!c) return null;

  const onFood = (id: FoodId): void => {
    setTray(null);
    const result = game.act((s, now) => feed(s, id, now));
    if (result === "ate") startEating(game.view, id);
    else if (result === "full") triggerPose(game.view, "refuse");
  };

  const onPlace = (id: Place): void => {
    const result = game.act((s, now) => goTo(s, id, now));
    if (result === "went") {
      setTray(null);
      triggerPose(game.view, "hop");
    } else if (result === "locked") triggerPose(game.view, "refuse");
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
      {tray === "food" && (
        <div class="tray" role="group" aria-label="Choose food">
          {menuOf(c).map((id) => (
            <button class="btn food" aria-label={foods[id].name} onClick={() => onFood(id)}>
              <Icon name={id} px={40} />
            </button>
          ))}
        </div>
      )}
      {tray === "places" && (
        <div class="tray" role="group" aria-label="Where to go">
          {placeIds.map((id) => {
            const locked = id !== "home" && !fields[id].plan;
            return (
              <button
                class="btn place"
                aria-label={locked ? `${placeName(id)} (locked)` : placeName(id)}
                aria-pressed={c.place === id}
                onClick={() => onPlace(id)}
              >
                <Icon name={placeIcon[id]} px={40} />
                {locked && (
                  <span class="badge">
                    <Icon name="lock" px={20} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div class="care" role="group" aria-label="Care">
        <button
          class="btn"
          aria-label="Feed"
          aria-expanded={tray === "food"}
          disabled={asleep || away}
          data-attention={c.call === "hungry"}
          onClick={() => setTray(tray === "food" ? null : "food")}
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
        <button
          class="btn"
          aria-label="Go somewhere"
          aria-expanded={tray === "places"}
          disabled={asleep || away}
          onClick={() => setTray(tray === "places" ? null : "places")}
        >
          <Icon name="go" px={48} />
        </button>
      </div>
    </div>
  );
}
