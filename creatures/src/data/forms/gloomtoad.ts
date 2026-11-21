// Gloomtoad: swamp toad carrying a lantern of cold light.
import type { Form } from "../../game/types";

export const gloomtoad: Form = {
  id: "gloomtoad",
  stage: "champion",
  name: "Gloomtoad",
  palette: { K: "#1a1020", G: "#3d5a56", A: "#5f8a82", B: "#7aa39a", L: "#9fe8ff", Y: "#e6fbff", W: "#ffffff", M: "#c2506a" },
  idle: [
    ".......KK.......",
    "......KYYK......",
    "..KKKKKLLKKKKK..",
    ".KGGGGKKKKGGGGK.",
    ".KGWWGGGGGGWWGK.",
    ".KGWKGGGGGGWKGK.",
    "KGGGGGGGGGGGGGGK",
    "KGAGGGGGGGGGGAGK",
    "KGGGGMMMMMMGGGGK",
    "KGGGMGGGGGGMGGGK",
    "KGGAGGBBBBGGAGGK",
    ".KGGAGBBBBGAGGK.",
    ".KKGGGGGGGGGGKK.",
    "..KKKGGKKGGKKK..",
    "....KK....KK....",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 20, str: 10, def: 14, spi: 15, spd: 8 },
  evolvesTo: [
    { to: "hollowking", minHours: 120, need: { careMistakesMin: 6, neglectHoursMin: 10 } }, // neglect
    { to: "aurelith", minHours: 120, need: { careMistakesMax: 2, spiritMin: 40 } }, // big turnaround, high spirit
    { to: "hollowking", minHours: 120 }, // fallback
  ],
};
