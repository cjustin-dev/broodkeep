// Thornback: spiky armored lizard.
import type { Form } from "../../game/types";

export const thornback: Form = {
  id: "thornback",
  stage: "champion",
  name: "Thornback",
  palette: { K: "#1a1020", G: "#4f8a4a", D: "#2f5a2f", S: "#d8d2a6", B: "#b8d68a", W: "#ffffff", M: "#c2506a" },
  idle: [
    "..K..K....K..K..",
    ".KSK.KSKKSK.KSK.",
    ".KGGGGGGGGGGGGK.",
    "KGGGGGGGGGGGGGGK",
    "KGGDGGGGGGGGDGGK",
    "KGGWWGGGGGGWWGGK",
    "KGGWKGGGGGGWKGGK",
    "KGGGGGGKKGGGGGGK",
    "KGGGBBBBBBBBGGGK",
    "KGGBBBMMMMBBBGGK",
    ".KGGBBBBBBBBGGK.",
    ".KGGGBBBBBBGGGK.",
    "..KGGGGGGGGGGK..",
    "..KKGGKKKKGGKK..",
    "...KKKK..KKKK...",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 19, str: 14, def: 17, spi: 7, spd: 9 },
  evolvesTo: [
    { to: "dreadmaw", minHours: 120, need: { battlesMin: 30 } }, // battle-hungry
    { to: "citadrake", minHours: 120, need: { disciplineMin: 60 } }, // disciplined
    { to: "citadrake", minHours: 120 }, // fallback
  ],
};
