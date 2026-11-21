// Blip: round jelly blob with big eyes.
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
  evolvesTo: [
    { to: "smudge", minHours: 6, need: { careMistakesMin: 3 } }, // neglected
    { to: "nubbin", minHours: 6, need: { foodMin: 5 } }, // lots of feeding
    { to: "nubbin", minHours: 6, need: { trainingMin: 3 } }, // lots of training
    { to: "pip", minHours: 6 }, // few mistakes (fallback)
  ],
};
