// Lumiwing: glowing moth with patterned wings.
import type { Form } from "../../game/types";

export const lumiwing: Form = {
  id: "lumiwing",
  stage: "champion",
  name: "Lumiwing",
  palette: { K: "#1a1020", F: "#fff1c4", P: "#3fc2c9", Y: "#fff7a8", W: "#ffffff", M: "#c2506a" },
  idle: [
    "..K.K......K.K..",
    "...KK......KK...",
    ".....KKKKKK.....",
    ".KKKKFFFFFFKKKK.",
    "KPPPKFFFFFFKPPPK",
    "KPYPKFFFFFFKPYPK",
    "KPYYKWWFFWWKYYPK",
    "KPYPKWKFFWKKPYPK",
    "KPPPKFFFFFFKPPPK",
    "KPPPKFFMMFFKPPPK",
    "KPYPKFFFFFFKPYPK",
    ".KPPKFFFFFFKPPK.",
    "..KPKKFFFFKKPK..",
    "...KK.KKKK.KK...",
    "................",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 16, str: 8, def: 10, spi: 20, spd: 16 },
  evolvesTo: [
    { to: "aurelith", minHours: 120, need: { spiritMin: 40, careMistakesMax: 3 } }, // spirit and great care
    { to: "solarion", minHours: 120, need: { strengthMin: 35 } }, // strength focus
    { to: "aurelith", minHours: 120 }, // fallback
  ],
};
