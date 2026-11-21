// Grumblot: lumpy grumpy toad.
import type { Form } from "../../game/types";

export const grumblot: Form = {
  id: "grumblot",
  stage: "rookie",
  name: "Grumblot",
  palette: { K: "#1a1020", G: "#7f8f4e", A: "#a7b56f", L: "#c9cf8a", W: "#ffffff", M: "#c2506a" },
  idle: [
    "................",
    "..KKKK....KKKK..",
    ".KGGGGKKKKGGGGK.",
    ".KGWWGGGGGGWWGK.",
    ".KGWKGGGGGGWKGK.",
    "KGGGGGGGGGGGGGGK",
    "KGAGGGGGGGGGGAGK",
    "KGGGGMMMMMMGGGGK",
    "KGGGMGGGGGGMGGGK",
    "KGGGGGGLLGGGGGGK",
    "KGGAGGLLLLGGAGGK",
    ".KGGGGLLLLGGGGK.",
    ".KKGGGGGGGGGGKK.",
    "..KKKGGKKGGKKK..",
    "....KK....KK....",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 14, str: 9, def: 9, spi: 5, spd: 4 },
  evolvesTo: [
    { to: "gloomtoad", minHours: 72, need: { careMistakesMin: 3 } }, // still neglected
    { to: "thornback", minHours: 72, need: { battlesMin: 10 } }, // lots of fighting
    { to: "gloomtoad", minHours: 72 }, // fallback
  ],
};
