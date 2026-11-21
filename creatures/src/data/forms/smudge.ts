// Smudge: smoky, frowny puff.
import type { Form } from "../../game/types";

export const smudge: Form = {
  id: "smudge",
  stage: "training",
  name: "Smudge",
  palette: { K: "#1a1020", S: "#8f84a8", D: "#5f5678", L: "#bdb4d4", W: "#ffffff", M: "#c2506a" },
  idle: [
    "................",
    "................",
    "...KKK....KKK...",
    "..KSSSKKKKSSSK..",
    ".KSLSSSSSSSSLSK.",
    "KSLLSSSSSSSSLLSK",
    "KSLDDSSSSSSDDLSK",
    "KSSWWSSSSSSWWSSK",
    "KSSWKSSSSSSWKSSK",
    "KSSSSSSSSSSSSSSK",
    "KSSSMMMMMMMMSSSK",
    "KSSMSSSSSSSSMSSK",
    ".KSSSSSSSSSSSSK.",
    "..KSSKSSSSKSSK..",
    "...KK.KKKK.KK...",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 7, str: 4, def: 4, spi: 6, spd: 6 },
  evolvesTo: [
    { to: "mothlet", minHours: 24, need: { careMistakesMax: 1, happinessAvgMin: 70 } }, // turned around with play
    { to: "gruntle", minHours: 24, need: { careMistakesMax: 1, trainingMin: 5 } }, // turned around with training
    { to: "grumblot", minHours: 24 }, // still neglected (fallback)
  ],
};
