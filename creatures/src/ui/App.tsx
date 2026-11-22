// The whole screen: stats on top, the room in the middle, care buttons underneath.
import { useEffect, useRef, useState } from "preact/hooks";
import { useRegisterSW } from "virtual:pwa-register/preact";
import { eggSprite } from "../art/sprites";
import { getForm } from "../data/forms";
import { startNewEgg } from "../game/actions";
import type { CloudSync } from "../sync/sync";
import { ActionBar } from "./ActionBar";
import { ArenaBar } from "./ArenaBar";
import { DevPanel } from "./DevPanel";
import type { Game } from "./game";
import { HabitatBar } from "./HabitatBar";
import { HaulCard } from "./HaulCard";
import { BookPanel } from "./BookPanel";
import { Icon, Pic } from "./Icon";
import { Nav } from "./Nav";
import { SettingsPanel } from "./SettingsPanel";
import { Stage } from "./Stage";
import { StatBars } from "./StatBars";
import { useGame } from "./useGame";

// An app left open for days still looks for a new version now and then.
const UPDATE_CHECK_MS = 60 * 60_000;

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

export function App({ game, cloud }: { game: Game; cloud: CloudSync }) {
  useGame(game);
  const [panel, setPanel] = useState<"settings" | "dev" | "book" | null>(null);

  // The installed app keeps its own copy of the game's files (a service worker). A new version waits until the player taps "Update
  // now" in Settings: reloading by itself could cut in on play. The game is saved and sent to the account first.
  const askedForUpdate = useRef(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // When the new version takes over, only the window whose player asked reloads. A second window of the game is left alone.
    onNeedReload: () => {
      if (askedForUpdate.current) window.location.reload();
    },
    onRegisteredSW: (_url, registration) => {
      if (!registration) return;
      window.setInterval(() => registration.update().catch(() => undefined), UPDATE_CHECK_MS); // (fails while offline: nothing to do)
    },
  });
  const update = needRefresh
    ? async (): Promise<void> => {
        askedForUpdate.current = true;
        await game.saveNow(); // on this device first
        cloud.flush(); // then to the account: a request that goes on after the reload
        // The new worker waits for the message. If another window already applied the update, none waits: this window only has to
        // reload onto the files the worker already serves.
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration?.waiting) await updateServiceWorker(true);
        else window.location.reload();
      }
    : null;

  // Keep time moving, and save when the page is hidden or closed.
  useEffect(() => {
    const timer = window.setInterval(() => game.tick(), 1000);
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") game.tick();
      else game.saveNow();
    };
    const onHide = (): void => void game.saveNow();
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
        <button class="btn gear" aria-label="Creature Book" onClick={() => setPanel("book")}>
          <Icon name="book" px={28} />
        </button>
        <button class="btn gear" aria-label="Settings" onClick={() => setPanel("settings")}>
          <Icon name="settings" px={28} />
        </button>
      </header>
      <Stage game={game} />
      <div class="dock">
        {save.phase === "dead" ? (
          <DeathCard game={game} />
        ) : (
          <>
            {save.phase === "alive" && <Nav game={game} />}
            {game.atHabitat ? <HabitatBar game={game} /> : game.atArena ? <ArenaBar game={game} /> : <ActionBar game={game} />}
          </>
        )}
      </div>
      <HaulCard game={game} />
      {panel === "settings" && <SettingsPanel game={game} cloud={cloud} update={update} onClose={() => setPanel(null)} onDev={() => setPanel("dev")} />}
      {panel === "dev" && <DevPanel game={game} onClose={() => setPanel(null)} />}
      {panel === "book" && <BookPanel game={game} onClose={() => setPanel(null)} />}
    </main>
  );
}
