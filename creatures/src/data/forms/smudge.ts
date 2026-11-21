// Smudge: smoky, frowny puff with a curling tail.
import type { Form } from "../../game/types";

export const smudge: Form = {
  id: "smudge",
  stage: "training",
  name: "Smudge",
  palette: { S: "#7a7094", D: "#5f5678", L: "#9a92b4", M: "#c2506a", K: "#1a1020", W: "#ffffff" },
  idle: [
    ".............K..",
    ".....KKKKKKKKLK.",
    "..K.KLLLLLLDKK..",
    ".KLKLSSSSSSSDK..",
    ".KLLSSSSSSSSSDK.",
    ".KLSWWSSSSWWSSDK",
    ".KLSWKSSSSWKSSDK",
    ".KDSSSSSSSSSSDK.",
    "..KDSSMMMMSSDK..",
    "...KDMSSSDMDK...",
    "....KSSSSSDK....",
    "....KDSSSSDKK...",
    ".....KSSSDKKDK..",
    ".....KDDDDDDDK..",
    "......KKKKKKK...",
    "................",
  ],
  // Second drawing, swapped in while it stands, walks or hops: smoke drifts.
  idle2: [
    ".........KK.....",
    ".....KKKKLDK.K..",
    "....KLLLLSSDKLK.",
    "..KKLSSSSSSSLDK.",
    ".KLLSSSSSSSSSDK.",
    ".KLSWWSSSSWWSSDK",
    ".KLSWKSSSSWKSSDK",
    ".KDSSSSSSSSSSDK.",
    "..KDSSMMMMSSDK..",
    "...KDMSSSDMDK...",
    "....KSSSSSDK....",
    "....KDSSSSDK.KK.",
    ".....KDSSSDKKDDK",
    "......KDDDDDDKK.",
    ".......KKKKKK...",
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
