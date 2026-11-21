// Gruntle: horned brawler pup.
import type { Form } from "../../game/types";

export const gruntle: Form = {
  id: "gruntle",
  stage: "rookie",
  name: "Gruntle",
  palette: { K: "#1a1020", R: "#c0553a", D: "#8a3a28", T: "#e8b98a", H: "#f3ecd0", W: "#ffffff", M: "#c2506a" },
  idle: [
    "................",
    ".KHK........KHK.",
    ".KHHK......KHHK.",
    "..KHHKKKKKKHHK..",
    "..KRRRRRRRRRRK..",
    ".KRRRRRRRRRRRRK.",
    ".KRRDDRRRRDDRRK.",
    ".KRRWWRRRRWWRRK.",
    ".KRRWKRRRRWKRRK.",
    ".KRRRRRKKRRRRRK.",
    ".KRRTTTTTTTTRRK.",
    ".KRTTTMMMMTTTRK.",
    "..KRTHTTTTHTRK..",
    "..KKRRRKKRRRKK..",
    "...KKKK..KKKK...",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 13, str: 12, def: 8, spi: 4, spd: 7 },
  evolvesTo: [
    { to: "pyrefang", minHours: 72, need: { winsMin: 10 } }, // wins a lot
    { to: "thornback", minHours: 72, need: { battlesMin: 12, careMistakesMin: 3 } }, // fights a lot, sloppy care
    { to: "pyrefang", minHours: 72 }, // fallback
  ],
};
