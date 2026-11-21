// Shellby: round turtle with a mossy shell.
import type { Form } from "../../game/types";

export const shellby: Form = {
  id: "shellby",
  stage: "rookie",
  name: "Shellby",
  palette: { K: "#1a1020", S: "#9b7b4a", H: "#7a5c33", G: "#5fa84a", T: "#8fd16a", W: "#ffffff", M: "#c2506a" },
  idle: [
    "................",
    ".....KKKKKK.....",
    "...KKSSGGSSKK...",
    "..KSSSGGGGSSSK..",
    ".KSSHSSSSSSHSSK.",
    ".KSSHSSSSSSHSSK.",
    ".KSSSHSSSSHSSSK.",
    ".KKKKKKKKKKKKKK.",
    "..KTWWTTTTWWTK..",
    "..KTWKTTTTWKTK..",
    "..KTTTTTTTTTTK..",
    "..KTTTTMMTTTTK..",
    "..KTTTTTTTTTTK..",
    ".KTTKKKKKKKKTTK.",
    ".KKKK......KKKK.",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 14, str: 6, def: 12, spi: 6, spd: 5 },
  evolvesTo: [
    { to: "bastion", minHours: 72, need: { defenseMin: 25, choresMin: 8 } }, // defense and chores
    { to: "thornback", minHours: 72, need: { battlesMin: 8, careMistakesMin: 2 } }, // battles, some mistakes
    { to: "bastion", minHours: 72 }, // fallback
  ],
};
