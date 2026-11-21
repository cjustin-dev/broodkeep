// Blip: round jelly blob with big eyes. PLACEHOLDER ART (Phase 2 draws the real set).
import type { Form } from "../../game/types";

export const blip: Form = {
  id: "blip",
  stage: "baby",
  name: "Blip",
  palette: { K: "#1a1020", B: "#5cc8d7", H: "#b8f0f5", W: "#ffffff", M: "#c2506a" },
  idle: [
    "................",
    "................",
    "................",
    ".....KKKKKK.....",
    "....KBBBBBBK....",
    "...KBBHHBBBBK...",
    "..KBBBHBBBBBBK..",
    "..KBBBBBBBBBBK..",
    "..KBWWBBBBWWBK..",
    "..KBWKBBBBWKBK..",
    "..KBBBBBBBBBBK..",
    "..KBBBBMMBBBBK..",
    "...KBBBBBBBBK...",
    "....KKBBBBKK....",
    ".....KKKKKK.....",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 5, str: 3, def: 3, spi: 4, spd: 4 },
  // Only one path exists in Phase 1, so Pip is the fallback.
  evolvesTo: [{ to: "pip", minHours: 6 }],
};
