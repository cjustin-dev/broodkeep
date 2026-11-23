// A tiny hook: re-draws the component whenever the game changes.
import { useEffect, useState } from "preact/hooks";
import type { Game } from "./game";

export function useGame(game: Game): void {
  const [, setCount] = useState(0);
  useEffect(() => game.subscribe(() => setCount((n) => n + 1)), [game]);
}
