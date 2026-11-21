// Mothlet: fuzzy little moth.
import type { Form } from "../../game/types";

export const mothlet: Form = {
  id: "mothlet",
  stage: "rookie",
  name: "Mothlet",
  palette: { K: "#1a1020", F: "#e8d8f8", P: "#a98bd8", Y: "#f7c6e8", W: "#ffffff", M: "#c2506a" },
  idle: [
    "...K........K...",
    "....K......K....",
    ".....KKKKKK.....",
    "..KKKFFFFFFKKK..",
    ".KPPKFFFFFFKPPK.",
    "KPYPKFFFFFFKPYPK",
    "KPYYKWWFFWWKYYPK",
    "KPPYKWKFFWKKYPPK",
    "KPPPKFFFFFFKPPPK",
    ".KPPKFFMMFFKPPK.",
    "..KPKFFFFFFKPK..",
    "...KKFFFFFFKK...",
    ".....KFFFFK.....",
    "......KKKK......",
    "................",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 10, str: 5, def: 6, spi: 12, spd: 11 },
  evolvesTo: [
    { to: "lumiwing", minHours: 72, need: { careMistakesMax: 1, happinessAvgMin: 80 } }, // great care
    { to: "gloomtoad", minHours: 72, need: { careMistakesMin: 4 } }, // neglected
    { to: "lumiwing", minHours: 72 }, // fallback
  ],
};
