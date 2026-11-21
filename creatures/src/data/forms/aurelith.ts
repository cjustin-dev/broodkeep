// Aurelith: celestial moth-angel, wings full of stars.
import type { Form } from "../../game/types";

export const aurelith: Form = {
  id: "aurelith",
  stage: "ultimate",
  name: "Aurelith",
  palette: { K: "#1a1020", F: "#f5f0ff", P: "#3b3f9e", Q: "#6a6fd6", S: "#ffe27a", H: "#ffe27a", W: "#ffffff", M: "#c2506a" },
  idle: [
    ".....HHHHHH.....",
    "....H......H....",
    ".....KKKKKK.....",
    "..KKKFFFFFFKKK..",
    ".KQQKFFFFFFKQQK.",
    "KQSQKFFFFFFKQSQK",
    "KQQPKWWFFWWKPQQK",
    "KPQSKWKFFWKKSQPK",
    "KPPQKFFFFFFKQPPK",
    "KQSQKFFMMFFKQSQK",
    ".KQPKFFFFFFKPQK.",
    "..KQKFFFFFFKQK..",
    "...KKKFFFFKKK...",
    ".....KKKKKK.....",
    "................",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 26, str: 14, def: 18, spi: 34, spd: 24 },
  evolvesTo: [], // the last stage
};
