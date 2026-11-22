// Entry point: load the saved game (or start a new egg) and show the screen.
import { render } from "preact";
import { newSave } from "./game/state";
import * as api from "./sync/cloud";
import { loadCloudMeta, loadSave, writeCloudMeta } from "./sync/local";
import { CloudSync, metaForNewGame, parseMeta } from "./sync/sync";
import { App } from "./ui/App";
import { Game } from "./ui/game";
import "./ui/app.css";

async function start(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;
  const saved = await loadSave();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
  const game = new Game(saved ?? newSave(Date.now(), seed)); // catches up on time away
  game.saveNow();
  const meta = parseMeta(await loadCloudMeta());
  const cloud = new CloudSync(game, saved ? meta : metaForNewGame(meta), api, { writeMeta: writeCloudMeta }); // (no saved game: a new egg)
  cloud.start(); // signed out (the usual case): does nothing
  document.addEventListener("visibilitychange", () => (document.visibilityState === "hidden" ? cloud.flush() : void cloud.sync()));
  root.textContent = ""; // remove the "loading" text from index.html
  render(<App game={game} cloud={cloud} />, root);
}

void start();
