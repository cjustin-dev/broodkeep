// Settings: the one screen with words. Tapping the version number 7 times opens dev mode.
// (Phase 5 will put a PIN in front of it, once profiles exist.)
import { useEffect, useRef } from "preact/hooks";
import { hourLabel, isAdultMode } from "../game/hud";
import { storage } from "../sync/local";
import type { CloudSync } from "../sync/sync";
import type { Roster } from "../sync/roster";
import { AccountSection } from "./AccountSection";
import type { Game } from "./game";
import { PlayersSection, useRoster } from "./PlayersSection";

const hours = Array.from({ length: 24 }, (_, h) => h);

export const VERSION = "0.5 (Phase 7a)";

interface Props {
  game: Game;
  cloud: CloudSync;
  update: (() => void) | null; // set when a new version of the game is ready (src/ui/App.tsx)
  roster: Roster;
  onClose: () => void;
  onDev: () => void;
}

export function SettingsPanel({ game, cloud, update, roster, onClose, onDev }: Props) {
  useRoster(roster);
  const closeRef = useRef<HTMLButtonElement>(null);
  const versionTaps = useRef(0);
  useEffect(() => closeRef.current?.focus(), []);

  const settings = game.save.settings;
  const setHour = (key: "sleepStartHour" | "sleepEndHour", value: string): void => {
    game.act((save) => {
      save.settings[key] = Number(value);
    });
  };

  const tapVersion = (): void => {
    versionTaps.current += 1;
    if (versionTaps.current >= 7) {
      versionTaps.current = 0;
      onDev();
    }
  };

  return (
    <section class="panel" role="dialog" aria-label="Settings">
      <div class="panel-body">
        <header class="panel-head">
          <h2>Settings</h2>
          <button class="btn small" ref={closeRef} onClick={onClose}>
            Close
          </button>
        </header>

        <fieldset>
          <legend>Sleeping hours</legend>
          <label>
            Bedtime
            <select value={settings.sleepStartHour} onChange={(e) => setHour("sleepStartHour", e.currentTarget.value)}>
              {hours.map((h) => (
                <option value={h}>{hourLabel(h)}</option>
              ))}
            </select>
          </label>
          <label>
            Wake up
            <select value={settings.sleepEndHour} onChange={(e) => setHour("sleepEndHour", e.currentTarget.value)}>
              {hours.map((h) => (
                <option value={h}>{hourLabel(h)}</option>
              ))}
            </select>
          </label>
          <p class="hint">
            Your creature sleeps between these hours and loses very little while it does. Nothing counts as neglect
            during sleep.
          </p>
        </fieldset>

        <fieldset>
          <legend>Display</legend>
          <label class="check">
            <input
              type="checkbox"
              checked={isAdultMode(game.save)}
              onChange={(e) => {
                const on = e.currentTarget.checked;
                game.act((save) => {
                  save.settings.adultMode = on;
                });
              }}
            />
            Adult Mode
          </label>
          <p class="hint">
            Shows the numbers: each stat as a number with the time until it runs out, a clock, your coins and bag, and a line about what
            is happening now. It is saved for this player only.
          </p>
        </fieldset>

        <AccountSection cloud={cloud} signOutFrom={roster.signedIn && !roster.openIsFirst ? (roster.list?.[0]?.name ?? "the first player") : null} />

        <PlayersSection roster={roster} />

        {update && (
          <div class="notice" role="status">
            <p>A new version of Broodkeep is ready.{storage.persistent && " Your game is saved first."}</p>
            <div class="row">
              <button class="btn small" onClick={update}>
                Update now
              </button>
            </div>
          </div>
        )}

        {!storage.persistent && (
          <p class="notice" role="alert">
            Saving is blocked in this browser, so progress will be lost when you close this page.
          </p>
        )}

        <button class="version" onClick={tapVersion}>
          Broodkeep {VERSION}
        </button>
      </div>
    </section>
  );
}
