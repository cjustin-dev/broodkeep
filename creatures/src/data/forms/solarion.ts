// Solarion: radiant lion-dragon.
import type { Form } from "../../game/types";

export const solarion: Form = {
  id: "solarion",
  stage: "ultimate",
  name: "Solarion",
  palette: { K: "#1a1020", G: "#f2b632", O: "#d9781e", F: "#ff8a1e", Y: "#ffe27a", H: "#fff1c0", W: "#ffffff", M: "#c2506a" },
  idle: [
    "..H..F.FF.F..H..",
    ".FYFFYFYYFYFFYF.",
    "FYYOOOOOOOOOOYYF",
    "FYOGGGGGGGGGGOYF",
    "FOGGGGGGGGGGGGOF",
    "FOGWWGGGGGGWWGOF",
    "FOGWKGGGGGGWKGOF",
    "FOGGGGGKKGGGGGOF",
    "FYOGGHGGGGHGGOYF",
    ".FOGGGMMMMGGGOF.",
    ".FYOGGGGGGGGOYF.",
    "..FOOGGGGGGOOF..",
    "..KGGGGGGGGGGK..",
    "...KKGGKKGGKK...",
    "....KKK..KKK....",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 28, str: 24, def: 20, spi: 24, spd: 22 },
  evolvesTo: [], // the last stage
};
