// Fennix: fox pup with an ember tail (balanced, well cared).
import type { Form } from "../../game/types";

export const fennix: Form = {
  id: "fennix",
  stage: "rookie",
  name: "Fennix",
  palette: { K: "#1a1020", O: "#f08a24", Y: "#ffd25a", W: "#ffffff", M: "#c2506a", F: "#ff4d2e" },
  idle: [
    "................",
    "..KK........KK..",
    ".KOOK......KOOK.",
    ".KOOOKKKKKKOOOK.",
    ".KOOOOOOOOOOOOK.",
    ".KOWWOOOOOOWWOK.",
    ".KOWKOOOOOOWKOK.",
    ".KOOOOOKKOOOOOK.",
    ".KYYOOOMMOOOYYK.",
    "..KYYYYYYYYYYKK.",
    "..KOYYYYYYYYOKFK",
    "...KOOYYYYOOK.FK",
    "....KKOOOOKK.KFK",
    ".....KKKKKK...KK",
    "................",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 12, str: 9, def: 8, spi: 8, spd: 10 },
  evolvesTo: [
    { to: "pyrefang", minHours: 72, need: { strengthMin: 20, winsMin: 5 } }, // strength and battles
    { to: "lumiwing", minHours: 72, need: { spiritMin: 15, happinessAvgMin: 70 } }, // spirit and happiness
    { to: "lumiwing", minHours: 72 }, // fallback
  ],
};
