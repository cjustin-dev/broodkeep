// The whole screen: stats on top, the room in the middle, care buttons underneath.
import { useEffect, useState } from "preact/hooks";
import { eggSprite } from "../art/sprites";
import { getForm } from "../data/forms";
import { startNewEgg } from "../game/actions";
import { ActionBar } from "./ActionBar";
import { DevPanel } from "./DevPanel";
import type { Game } from "./game";
import { Icon, Pic } from "./Icon";
import { SettingsPanel } from "./SettingsPanel";
import { Stage } from "./Stage";
import { StatBars } from "./StatBars";
import { useGame } from "./useGame";

const deathText = {
  hunger: "It went too long without food.",
  sickness: "It was sick for too long.",
  neglect: "It was left alone for too long.",
};

function DeathCard({ game }: { game: Game }) {
  const { creature, death } = game.save;
  const name = creature ? getForm(creature.formId).name : "Your creature";
  return (
    <section class="death">
      <p class="death-title">{name} has passed away.</p>
      {death && <p class="hint">{deathText[death.cause]}</p>}
      <button class="btn wide" onClick={() => game.act((s, now) => startNewEgg(s, now))}>
        <Pic sprite={eggSprite("speckled")} id="egg:speckled" px={48} />
        <span>New egg</span>
      </button>
    </section>
  );
}

export function App({ game }: { game: Game }) {
  useGame(game);
  const [panel, setPanel] = useState<"settings" | "dev" | null>(null);

  // Keep time moving, and save when the page is hidden or closed.
  useEffect(() => {
    const timer = window.setInterval(() => game.tick(), 1000);
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") game.tick();
      else game.saveNow();
    };
    const onHide = (): void => game.saveNow();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
    };
  }, [game]);

  const save = game.save;
  return (
    <main class="app">
      <header class="top">
        <StatBars stats={save.phase === "alive" && save.creature ? save.creature.stats : null} />
        <button class="btn gear" aria-label="Settings" onClick={() => setPanel("settings")}>
          <Icon name="settings" px={28} />
        </button>
      </header>
      <Stage game={game} />
      <div class="dock">{save.phase === "dead" ? <DeathCard game={game} /> : <ActionBar game={game} />}</div>
      {panel === "settings" && <SettingsPanel game={game} onClose={() => setPanel(null)} onDev={() => setPanel("dev")} />}
      {panel === "dev" && <DevPanel game={game} onClose={() => setPanel(null)} />}
    </main>
  );
}
