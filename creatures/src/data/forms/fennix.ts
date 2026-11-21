// Fennix: fox pup with an ember tail (balanced, well cared). PLACEHOLDER ART.
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
  // No further forms until Phase 2 adds the Champion stage.
  evolvesTo: [],
};
