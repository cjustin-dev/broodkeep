// The buttons under the habitat picture: one per place to work, the bag, and a way to call the creature home.
// Icons only. A spot the creature is too young for shows a lock. A refused tap shows a small icon saying why.
import { useEffect, useRef, useState } from "preact/hooks";
import { triggerPose } from "../art/idle";
import type { IconName } from "../art/sprites";
import { isLocked } from "../art/habitat";
import { materialIds, materials, spotIds, spots } from "../data/habitat";
import type { SpotId } from "../data/habitat";
import { callBack, startJob } from "../game/actions";
import type { StartJobResult } from "../game/actions";
import type { Game } from "./game";
import { Icon } from "./Icon";

// Why a tap on a spot did nothing, as a picture.
const refusalIcon: Partial<Record<StartJobResult, IconName>> = { asleep: "zzz", sick: "sick", tired: "energy", "too-young": "lock" };

export function HabitatBar({ game }: { game: Game }) {
  const [note, setNote] = useState<IconName | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const c = game.save.creature;
  if (game.save.phase !== "alive" || !c) return null;
  const away = c.job;

  const show = (icon: IconName): void => {
    setNote(icon);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNote(null), 1600);
  };

  const onSpot = (id: SpotId): void => {
    const result = game.act((s, now) => startJob(s, id, now));
    if (result === "started") triggerPose(game.view, "hop");
    else {
      const icon = refusalIcon[result];
      if (icon) show(icon);
    }
  };

  const bag = materialIds.filter((id) => (game.save.inventory[id] ?? 0) > 0);

  return (
    <div class="actions">
      <div class="bag" role="group" aria-label="Bag">
        <span class="chip" aria-label={`${game.save.coins} coins`}>
          <Icon name="coin" px={24} />
          {game.save.coins}
        </span>
        {bag.map((id) => (
          <span class="chip" aria-label={`${game.save.inventory[id]} ${materials[id].name}`}>
            <Icon name={id} px={24} />
            {game.save.inventory[id]}
          </span>
        ))}
        <span class="note" aria-hidden="true">
          {note && <Icon name={note} px={32} />}
        </span>
      </div>
      {away ? (
        <button class="btn wide callback" aria-label="Call back" onClick={() => game.act((s, now) => callBack(s, now))}>
          <Icon name="house" px={40} />
        </button>
      ) : (
        <div class="spots" role="group" aria-label="Places to work">
          {spotIds.map((id) => {
            const locked = isLocked(c, id);
            return (
              <button
                class="btn spot"
                aria-label={locked ? `${spots[id].name} (too young)` : spots[id].name}
                onClick={() => onSpot(id)}
              >
                <Icon name={spots[id].material} px={40} />
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
    </div>
  );
}
