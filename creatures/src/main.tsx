// Entry point: load the saved game (or start a new egg) and show the screen.
import { render } from "preact";
import { newSave } from "./game/state";
import { loadSave } from "./sync/local";
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
  root.textContent = ""; // remove the "loading" text from index.html
  render(<App game={game} />, root);
}

void start();
