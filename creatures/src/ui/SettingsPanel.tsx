// Settings: the one screen with words. Tapping the version number 7 times opens dev mode.
// (Phase 5 will put a PIN in front of it, once profiles exist.)
import { useEffect, useRef } from "preact/hooks";
import { storage } from "../sync/local";
import type { Game } from "./game";

const hours = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number): string => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;

export const VERSION = "0.1 (Phase 1)";

interface Props {
  game: Game;
  onClose: () => void;
  onDev: () => void;
}

export function SettingsPanel({ game, onClose, onDev }: Props) {
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
