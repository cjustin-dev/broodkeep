// Dreadmaw: shadow beast, many eyes, huge jaw.
import type { Form } from "../../game/types";

export const dreadmaw: Form = {
  id: "dreadmaw",
  stage: "ultimate",
  name: "Dreadmaw",
  palette: { K: "#1a1020", S: "#3a2f4f", D: "#1f1830", E: "#ff3b3b", T: "#e8e2d0", W: "#ffe45a", M: "#c2506a" },
  idle: [
    ".K..K......K..K.",
    ".KS.KSK..KSK.SK.",
    ".KSSSSSKKSSSSSK.",
    "KSESSESSSSESSESK",
    "KSSWWSSSSSSWWSSK",
    "KSSWKSSSSSSWKSSK",
    "KSSSSSSSSSSSSSSK",
    "KSDDDDDDDDDDDDSK",
    "KDTMMMMMMMMMMTDK",
    "KDMMMMMMMMMMMMDK",
    "KDTMTMTMMTMTMTDK",
    ".KDTTTTTTTTTTDK.",
    "..KKKKKKKKKKKK..",
    "................",
    "................",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 30, str: 32, def: 16, spi: 22, spd: 26 },
  evolvesTo: [], // the last stage
};
