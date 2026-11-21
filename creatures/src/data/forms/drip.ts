// Drip: teardrop-shaped blob that wobbles.
import type { Form } from "../../game/types";

export const drip: Form = {
  id: "drip",
  stage: "baby",
  name: "Drip",
  palette: { K: "#1a1020", D: "#7f8cff", H: "#d0d6ff", W: "#ffffff", M: "#c2506a" },
  idle: [
    "................",
    ".......KK.......",
    "......KDDK......",
    ".....KDDDDK.....",
    ".....KDDDDK.....",
    "....KDHDDHDK....",
    "...KDHDDDDHDK...",
    "..KDDDDDDDDDDK..",
    "..KDWWDDDDWWDK..",
    "..KDWKDDDDWKDK..",
    "..KDDDDDDDDDDK..",
    "..KDDDDMMDDDDK..",
    "...KDDDDDDDDK...",
    "....KKDDDDKK....",
    ".....KKKKKK.....",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 5, str: 3, def: 3, spi: 4, spd: 5 },
  evolvesTo: [
    { to: "smudge", minHours: 6, need: { careMistakesMin: 3 } }, // neglected
    { to: "nubbin", minHours: 6, need: { trainingMin: 3 } }, // lots of training
    { to: "pip", minHours: 6 }, // few mistakes (fallback)
  ],
};
