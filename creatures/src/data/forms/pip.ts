// Pip: hoppy blob with leaf ears (the good-care branch).
import type { Form } from "../../game/types";

export const pip: Form = {
  id: "pip",
  stage: "training",
  name: "Pip",
  palette: { K: "#1a1020", B: "#8ad65a", G: "#3f9b3a", L: "#c8f08a", W: "#ffffff", M: "#c2506a" },
  idle: [
    "................",
    "...GG......GG...",
    "..GLLG....GLLG..",
    "..GLLG....GLLG..",
    "...GGKKKKKKGG...",
    "....KBBBBBBK....",
    "...KBBBBBBBBK...",
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
  baseStats: { vit: 8, str: 5, def: 5, spi: 6, spd: 6 },
  evolvesTo: [
    { to: "shellby", minHours: 24, need: { berriesMin: 4, choresMin: 3 } }, // berries and chores
    { to: "mothlet", minHours: 24, need: { happinessAvgMin: 75 } }, // high happiness
    { to: "fennix", minHours: 24 }, // balanced (fallback)
  ],
};
