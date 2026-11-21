// Hollowking: hollow-eyed swamp king with a crown of roots.
import type { Form } from "../../game/types";

export const hollowking: Form = {
  id: "hollowking",
  stage: "ultimate",
  name: "Hollowking",
  palette: { K: "#1a1020", B: "#5e6b4a", D: "#2a3224", R: "#8a6a3a", W: "#d7ffd0", M: "#c2506a" },
  idle: [
    ".R..R..RR..R..R.",
    ".RR.RR.RR.RR.RR.",
    ".KRRRRRRRRRRRRK.",
    ".KKKKKKKKKKKKKK.",
    ".KBBBBBBBBBBBBK.",
    "KBBDDDBBBBDDDBBK",
    "KBDDWWDBBDWWDDBK",
    "KBDDWKDBBDWKDDBK",
    "KBBDDDBBBBDDDBBK",
    "KBBBBBBKKBBBBBBK",
    "KBBBBMMMMMMBBBBK",
    ".KBBBBBBBBBBBBK.",
    ".KBRBRBRRBRBRBK.",
    "..KRRRRRRRRRRK..",
    "...KRKRKKRKRK...",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 34, str: 16, def: 24, spi: 30, spd: 10 },
  evolvesTo: [], // the last stage
};
