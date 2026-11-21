// Citadrake: dragon with a fortress grown into its back.
import type { Form } from "../../game/types";

export const citadrake: Form = {
  id: "citadrake",
  stage: "ultimate",
  name: "Citadrake",
  palette: { K: "#1a1020", D: "#5c7a99", S: "#a0a5ad", T: "#4a4f5c", B: "#d9c88a", H: "#f3ecd0", W: "#ffffff", M: "#c2506a" },
  idle: [
    ".K.K..KKKK..K.K.",
    ".KSKSSSSSSSSKSK.",
    ".KSKSTTSSTTSKSK.",
    ".KSKSSSSSSSSKSK.",
    ".KKKKKKKKKKKKKK.",
    "..KDDDDDDDDDDK..",
    ".KDDDDDDDDDDDDK.",
    ".KDWWDDDDDDWWDK.",
    ".KDWKDDDDDDWKDK.",
    ".KDDDDDKKDDDDDK.",
    ".KDDBBBBBBBBDDK.",
    ".KDBBBMMMMBBBDK.",
    "..KDBBBHHBBBDK..",
    "..KKDDKKKKDDKK..",
    "....KKK..KKK....",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 32, str: 18, def: 30, spi: 18, spd: 14 },
  evolvesTo: [], // the last stage
};
