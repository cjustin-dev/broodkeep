// "Welcome back": what the creature brought home from its last job. One card at a time, oldest first.
// Jobs can finish while the app is closed, so this is how the player finds out.
import { useEffect, useRef } from "preact/hooks";
import { materials, spots } from "../data/habitat";
import { dismissHaul } from "../game/actions";
import type { Game } from "./game";
import { Icon } from "./Icon";

export function HaulCard({ game }: { game: Game }) {
  const button = useRef<HTMLButtonElement>(null);
  const haul = game.save.hauls[0];
  useEffect(() => button.current?.focus(), [haul]);
  if (!haul) return null;
  const more = game.save.hauls.length - 1;
  const label = `Back from the ${spots[haul.spot].name}: ${haul.coins} coins and ${haul.amount} ${materials[haul.material].name}. Tap to collect.`;
  return (
    <section class="haul" role="dialog" aria-label="Welcome back">
      <button class="haul-card" ref={button} aria-label={label} onClick={() => game.act((s) => dismissHaul(s))}>
        <span class="haul-row">
          <Icon name="coin" px={48} />
          <span class="haul-num">+{haul.coins}</span>
        </span>
        <span class="haul-row">
          <Icon name={haul.material} px={48} />
          <span class="haul-num">+{haul.amount}</span>
        </span>
        {more > 0 && <span class="haul-more">+{more} more</span>}
      </button>
    </section>
  );
}
