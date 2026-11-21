// Two big buttons that switch between the room and the habitat (the outdoors). Only shown for a living creature.
import { Icon } from "./Icon";
import type { Game } from "./game";

export function Nav({ game }: { game: Game }) {
  const outside = game.atHabitat;
  return (
    <div class="nav" role="group" aria-label="Where to look">
      <button class="btn nav-btn" aria-label="Room" aria-pressed={!outside} onClick={() => game.setScreen("room")}>
        <Icon name="house" px={32} />
      </button>
      <button class="btn nav-btn" aria-label="Habitat" aria-pressed={outside} onClick={() => game.setScreen("habitat")}>
        <Icon name="tree" px={32} />
      </button>
    </div>
  );
}
