// Bastion: stone tortoise with a little tower on its back.
import type { Form } from "../../game/types";

export const bastion: Form = {
  id: "bastion",
  stage: "champion",
  name: "Bastion",
  palette: { K: "#1a1020", S: "#8a8f99", D: "#4a4f5c", L: "#b5bac4", T: "#9fb38a", W: "#ffffff", M: "#c2506a" },
  idle: [
    ".....K.KK.K.....",
    ".....KSSSSK.....",
    ".....KSLLSK.....",
    ".....KSDDSK.....",
    "...KKKSSSSKKK...",
    "..KSSSSSSSSSSK..",
    ".KSSLSSSSSSLSSK.",
    ".KSSLSSSSSSLSSK.",
    ".KKKKKKKKKKKKKK.",
    ".KTTWWTTTTWWTTK.",
    ".KTTWKTTTTWKTTK.",
    ".KTTTTTTTTTTTTK.",
    ".KTTTTTMMTTTTTK.",
    "..KKTTKKKKTTKK..",
    "....KKK..KKK....",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 22, str: 9, def: 20, spi: 10, spd: 6 },
  evolvesTo: [
    { to: "citadrake", minHours: 120, need: { defenseMin: 40, disciplineMin: 60 } }, // defense and discipline
    { to: "solarion", minHours: 120, need: { strengthMin: 30, defenseMin: 30, spiritMin: 30, careMistakesMax: 3 } }, // all-round excellent
    { to: "citadrake", minHours: 120 }, // fallback
  ],
};
