// Pyrefang: flame-maned wolf.
import type { Form } from "../../game/types";

export const pyrefang: Form = {
  id: "pyrefang",
  stage: "champion",
  name: "Pyrefang",
  palette: { K: "#1a1020", G: "#6b7a99", L: "#9aa8c4", F: "#ff6a2b", Y: "#ffc23a", H: "#f3ecd0", W: "#ffffff", M: "#c2506a" },
  idle: [
    "................",
    "..K....FF....K..",
    ".KGK..FYYF..KGK.",
    ".KGGKKFYYFKKGGK.",
    "FKGGGGGGGGGGGGKF",
    "FYKGGGGGGGGGGKYF",
    "FYKGWWGGGGWWGKYF",
    "FYKGWKGGGGWKGKYF",
    ".FKGGGGKKGGGGKF.",
    ".FKGLLLLLLLLGKF.",
    "..KGLLLMMLLLGK..",
    "..KGLHLLLLHLGK..",
    "...KGGGGGGGGK...",
    "...KKGGKKGGKK...",
    "....KKK..KKK....",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 18, str: 16, def: 10, spi: 12, spd: 14 },
  evolvesTo: [
    { to: "solarion", minHours: 120, need: { strengthMin: 40, careMistakesMax: 3 } }, // strong and great care
    { to: "dreadmaw", minHours: 120, need: { strengthMin: 40, careMistakesMin: 8 } }, // strong and many mistakes
    { to: "solarion", minHours: 120 }, // fallback
  ],
};
