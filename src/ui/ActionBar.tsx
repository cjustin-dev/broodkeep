// The big care buttons under the room: feed, clean, lights, medicine, go.
// Icons only. The button that matches what the creature is asking for gently pulses.
// Adult Mode (settings.adultMode) adds a word under each icon and says why a button did nothing: a button that cannot do its job is dimmed
// (aria-disabled) but still taps, and the tap asks the live state and says the reason over the room (game.whyNot). Kid Mode is as it was.
import { useEffect, useState } from "preact/hooks";
import { addSparkles, startEating, triggerPose } from "../art/idle";
import { placeIcon } from "../art/sprites";
import { fieldIds, fields } from "../data/fields";
import { foods } from "../data/foods";
import { clean, feed, giveMedicine, goTo, toggleLights } from "../game/actions";
import { cleanRefusal, feedButtonRefusal, feedRefusal, goButtonRefusal, goRefusal, lightsRefusal, medicineRefusal } from "../game/availability";
import { menuOf } from "../game/growth";
import { isAdultMode } from "../game/hud";
import { cleanReason, feedReason, goReason, lightsReason, medicineReason } from "../game/reasons";
import type { FoodId, Place } from "../game/types";
import type { Game } from "./game";
import { Icon, Word } from "./Icon";

// The places a creature can be taken: home first, then the fields. A locked field shows a lock and shakes its head when tapped.
const placeIds: Place[] = ["home", ...fieldIds];
const placeName = (id: Place): string => (id === "home" ? "Home" : fields[id].name);

export function ActionBar({ game }: { game: Game }) {
  const [tray, setTray] = useState<"food" | "places" | null>(null); // which little list is open above the buttons
  const c = game.save.phase === "alive" ? game.save.creature : null;
  const asleep = c?.sleep != null;
  const away = c?.job != null; // out working in the habitat: it cannot be cared for until it is home
  const adult = isAdultMode(game.save);

  useEffect(() => {
    if (asleep || away) setTray(null); // the trays make no sense while it sleeps or is out
  }, [asleep, away]);

  if (!c) return null;

  const shake = (): void => triggerPose(game.view, "refuse");

  const onFood = (id: FoodId): void => {
    setTray(null);
    if (adult) {
      const why = game.whyNot((live) => feedRefusal(live, id), feedReason);
      if (why === "full") shake();
      if (why !== null) return;
    }
    const result = game.act((s, now) => feed(s, id, now));
    if (result === "ate") startEating(game.view, id);
    else if (result === "full") triggerPose(game.view, "refuse");
  };

  const onPlace = (id: Place): void => {
    if (adult) {
      const why = game.whyNot((live) => goRefusal(live, id), (save, live, code, now) => goReason(save, live, code, id, now));
      if (why === "locked") shake();
      if (why !== null) return;
    }
    const result = game.act((s, now) => goTo(s, id, now));
    if (result === "went") {
      setTray(null);
      triggerPose(game.view, "hop");
    } else if (result === "locked") triggerPose(game.view, "refuse");
  };

  // The Adult Mode taps on Feed and Go (Kid Mode toggles the tray directly): an unavailable one says why and opens nothing.
  const onFeedButton = (): void => {
    const why = game.whyNot(feedButtonRefusal, feedReason);
    if (why === null) setTray(tray === "food" ? null : "food");
    else {
      if (why === "full") shake();
      setTray(null);
    }
  };

  const onGoButton = (): void => {
    const why = game.whyNot(goButtonRefusal, (save, live, code, now) => goReason(save, live, code, "home", now)); // (the place does not matter for these two reasons)
    if (why === null) setTray(tray === "places" ? null : "places");
    else setTray(null);
  };

  const onClean = (): void => {
    if (adult && game.whyNot(cleanRefusal, (_save, live, code, now) => cleanReason(live, code, now)) !== null) return;
    if (game.act((s, now) => clean(s, now)) === "cleaned") {
      triggerPose(game.view, "happy");
      addSparkles(game.view, 4);
    }
  };

  const onMedicine = (): void => {
    if (adult) {
      const why = game.whyNot(medicineRefusal, (_save, live, code, now) => medicineReason(live, code, now));
      if (why === "not-sick") shake();
      if (why !== null) return;
    }
    const result = game.act((s, now) => giveMedicine(s, now));
    if (result === "cured") {
      triggerPose(game.view, "happy");
      addSparkles(game.view, 4);
    } else if (result === "not-sick") triggerPose(game.view, "refuse");
  };

  const onLights = (): void => {
    if (adult) {
      const why = game.whyNot(lightsRefusal, lightsReason);
      if (why === "not-tired") shake();
      if (why !== null) return;
    }
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
          class={adult ? "btn labelled" : "btn"}
          aria-label="Feed"
          aria-expanded={tray === "food"}
          disabled={adult ? undefined : asleep || away}
          aria-disabled={adult && feedButtonRefusal(c) !== null ? true : undefined}
          data-attention={c.call === "hungry"}
          onClick={adult ? onFeedButton : () => setTray(tray === "food" ? null : "food")}
        >
          <Icon name="feed" px={48} />
          {adult && <Word text="Feed" />}
        </button>
        <button
          class={adult ? "btn labelled" : "btn"}
          aria-label={adult && c.poop > 0 ? `Clean up, ${c.poop} poop` : "Clean up"}
          disabled={adult ? undefined : away}
          aria-disabled={adult && cleanRefusal(c) !== null ? true : undefined}
          data-attention={c.call === "dirty"}
          onClick={onClean}
        >
          <Icon name="clean" px={48} />
          {adult && <Word text="Clean" />}
          {adult && c.poop > 0 && (
            <span class="count" aria-hidden="true">
              {c.poop}
            </span>
          )}
        </button>
        <button
          class={adult ? "btn labelled" : "btn"}
          aria-label={adult ? (c.sleep === "nap" ? "Wake" : "Nap") : "Lights off"}
          aria-pressed={adult ? undefined : c.sleep !== null}
          disabled={adult ? undefined : c.sleep === "night" || away}
          aria-disabled={adult && lightsRefusal(c) !== null ? true : undefined}
          data-attention={c.call === "sleepy"}
          onClick={onLights}
        >
          <Icon name="lights" px={48} />
          {adult && <Word text={c.sleep === "nap" ? "Wake" : "Nap"} />}
        </button>
        <button
          class={adult ? "btn labelled" : "btn"}
          aria-label={adult ? "Meds (give medicine)" : "Give medicine"}
          disabled={adult ? undefined : away}
          aria-disabled={adult && medicineRefusal(c) !== null ? true : undefined}
          data-attention={c.call === "sick"}
          onClick={onMedicine}
        >
          <Icon name="medicine" px={48} />
          {adult && <Word text="Meds" />}
        </button>
        <button
          class={adult ? "btn labelled" : "btn"}
          aria-label="Go somewhere"
          aria-expanded={tray === "places"}
          disabled={adult ? undefined : asleep || away}
          aria-disabled={adult && goButtonRefusal(c) !== null ? true : undefined}
          onClick={adult ? onGoButton : () => setTray(tray === "places" ? null : "places")}
        >
          <Icon name="go" px={48} />
          {adult && <Word text="Go" />}
        </button>
      </div>
    </div>
  );
}
