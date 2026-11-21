// Pip: hoppy sprout with leaf ears and rosy cheeks (the good-care branch).
import type { Form } from "../../game/types";

export const pip: Form = {
  id: "pip",
  stage: "training",
  name: "Pip",
  palette: { B: "#8ad65a", D: "#5fa840", L: "#b8ee8c", T: "#eaf7b8", A: "#4f9a3a", P: "#f2a0a8", M: "#c2506a", K: "#1a1020", W: "#ffffff" },
  idle: [
    "..KKK......KKK..",
    ".KAAAK....KAAAK.",
    ".KAAAKKKKKKAAAK.",
    ".KABALLLLLDABAK.",
    "..KALBBBBBBDAK..",
    "..KLBBBBBBBBDK..",
    "..KLWWBBBBWWDK..",
    "..KLWKBBBBWKDK..",
    ".KPLBBBBBBBBDPK.",
    "..KDBBBMMBBBDK..",
    ".KBBDDBBBBDDBBK.",
    "..KBBDDDDDDBBK..",
    "..KBBBDTTDBBBK..",
    "..KBBBKKKKBBBK..",
    "...KKK....KKK...",
    "................",
  ],
  // Second drawing, swapped in while it stands, walks or hops: hops, ears flop out.
  idle2: [
    "................",
    ".KK..KKKKKK..KK.",
    "KAAKKLLLLLDKKAAK",
    "AAAALBBBBBBDAAAA",
    "AABLBBBBBBBBDBAA",
    "KAALWWBBBBWWDAAK",
    ".KKLWKBBBBWKDKK.",
    ".KPLBBBBBBBBDPK.",
    "..KDBBBMMBBBDK..",
    ".KBBDDBBBBDDBBK.",
    "..KBDBDDDDBDBK..",
    "...KBDTTTTDBK...",
    "..KBBBDTTDBBBK..",
    "..KBBBKKKKBBBK..",
    "...KKK....KKK...",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 8, str: 5, def: 5, spi: 6, spd: 6 },
  evolvesTo: [
    { to: "shellby", minHours: 24, need: { berriesMin: 4, choresMin: 3 } }, // berries and chores
    { to: "mothlet", minHours: 24, need: { happinessAvgMin: 75 } }, // high happiness
    { to: "fennix", minHours: 24 }, // balanced (fallback)
  ],
};
