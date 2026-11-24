// Big buttons that switch between the room, the habitat (the outdoors) and the arena. Only shown for a living creature.
// A fight in progress holds the player in the arena: the other buttons wait until it is over or the creature runs away.
// Adult Mode writes the name under each icon, and adds a fourth button, the Shop, which opens its panel instead of switching the picture.
import { isAdultMode } from "../game/hud";
import { Icon, Word } from "./Icon";
import type { Game, Screen } from "./game";

const places: Array<{ screen: Screen; label: string; icon: "house" | "tree" | "swords" }> = [
  { screen: "room", label: "Room", icon: "house" },
  { screen: "habitat", label: "Habitat", icon: "tree" },
  { screen: "arena", label: "Arena", icon: "swords" },
];

export function Nav({ game, onShop }: { game: Game; onShop: () => void }) {
  const adult = isAdultMode(game.save);
  return (
    <div class="nav" role="group" aria-label="Where to look" data-adult={adult ? "true" : undefined}>
      {places.map(({ screen, label, icon }) => (
        <button
          class={adult ? "btn nav-btn labelled" : "btn nav-btn"}
          aria-label={label}
          aria-pressed={game.save.phase === "alive" && game.screen === screen}
          disabled={game.fighting && game.screen !== screen}
          onClick={() => game.setScreen(screen)}
        >
          <Icon name={icon} px={32} />
          {adult && <Word text={label} />}
        </button>
      ))}
      {adult && (
        <button class="btn nav-btn labelled" aria-label="Shop" onClick={onShop}>
          <Icon name="shop" px={32} />
          <Word text="Shop" />
        </button>
      )}
    </div>
  );
}
