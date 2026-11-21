// Nubbin: stubby lump with tiny horns.
import type { Form } from "../../game/types";

export const nubbin: Form = {
  id: "nubbin",
  stage: "training",
  name: "Nubbin",
  palette: { K: "#1a1020", N: "#e8a86b", S: "#c98650", H: "#f3ecd0", L: "#f7d9ae", W: "#ffffff", M: "#c2506a" },
  idle: [
    "................",
    "................",
    "....KK....KK....",
    "...KHHK..KHHK...",
    "...KHHKKKKHHK...",
    "..KNNNNNNNNNNK..",
    ".KNNNNNNNNNNNNK.",
    ".KNNNNNNNNNNNNK.",
    ".KNNWWNNNNWWNNK.",
    ".KNNWKNNNNWKNNK.",
    ".KNNNNNNNNNNNNK.",
    ".KNNNNNMMNNNNNK.",
    ".KNNLLLLLLLLNNK.",
    "..KSNNNNNNNNSK..",
    "...KKKKKKKKKK...",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 9, str: 7, def: 5, spi: 3, spd: 5 },
  evolvesTo: [
    { to: "gruntle", minHours: 24, need: { meatMin: 3, winsMin: 3 } }, // meat and battles
    { to: "shellby", minHours: 24, need: { defenseMin: 15 } }, // high defense
    { to: "fennix", minHours: 24 }, // balanced (fallback)
  ],
};
