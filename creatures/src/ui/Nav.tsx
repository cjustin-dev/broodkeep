// Big buttons that switch between the room, the habitat (the outdoors) and the arena. Only shown for a living creature.
// A fight in progress holds the player in the arena: the other buttons wait until it is over or the creature runs away.
import { Icon } from "./Icon";
import type { Game, Screen } from "./game";

const places: Array<{ screen: Screen; label: string; icon: "house" | "tree" | "swords" }> = [
  { screen: "room", label: "Room", icon: "house" },
  { screen: "habitat", label: "Habitat", icon: "tree" },
  { screen: "arena", label: "Arena", icon: "swords" },
];

export function Nav({ game }: { game: Game }) {
  return (
    <div class="nav" role="group" aria-label="Where to look">
      {places.map(({ screen, label, icon }) => (
        <button
          class="btn nav-btn"
          aria-label={label}
          aria-pressed={game.save.phase === "alive" && game.screen === screen}
          disabled={game.fighting && game.screen !== screen}
          onClick={() => game.setScreen(screen)}
        >
          <Icon name={icon} px={32} />
        </button>
      ))}
    </div>
  );
}
