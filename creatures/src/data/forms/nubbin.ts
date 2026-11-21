// Nubbin: stubby lump with tiny horns, always ready for a play fight.
import type { Form } from "../../game/types";

export const nubbin: Form = {
  id: "nubbin",
  stage: "training",
  name: "Nubbin",
  palette: { I: "#d8cdb0", N: "#e8a86b", D: "#c27d44", L: "#f6c690", T: "#f9e0b8", H: "#f4ecd8", M: "#c2506a", K: "#1a1020", W: "#ffffff" },
  idle: [
    "................",
    "....K......K....",
    "...KHK....KHK...",
    "...KHHKKKKHHK...",
    "...KILLLLLDIK...",
    "..KDDNNNNNNDDK..",
    ".KLNWWNNNNWWNDK.",
    ".KLNWKNNNNWKNDK.",
    "KKKNNNNNNNNNNKKK",
    "KNNKNNNMMNNNKNNK",
    "NNNNKTTTTTTKNNNN",
    "NNNNKTTTTTTKNNNN",
    "KNNKNTTTTTTNKNNK",
    "KKKKNNKKKKNNKKKK",
    ".KK.KK....KK.KK.",
    "................",
  ],
  // Second drawing, swapped in while it stands, walks or hops: fists swing up.
  idle2: [
    "................",
    ".KK.K......K.KK.",
    "KKKKHK....KHKKKK",
    "KNNKHHKKKKHHKNNK",
    "NNNNKLLLLLDKNNNN",
    "NNNDDNNNNNNDDNNN",
    "KNNKWWNNNNWWKNNK",
    "KKKNWKNNNNWKNKKK",
    ".KLNNNNNNNNNNNK.",
    ".KLNNNNMMNNNNNK.",
    ".KDNNTTTTTTNNDK.",
    "..KDNTTTTTTNDK..",
    "..KNNTTTTTTNNK..",
    "...KNNKKKKNNK...",
    "....KK....KK....",
    "................",
  ],
  softLook: null,
  baseStats: { vit: 9, str: 7, def: 5, spi: 3, spd: 5 },
  evolvesTo: [
    { to: "gruntle", minHours: 24, need: { meatMin: 3, winsMin: 3 } }, // meat and battles
    { to: "shellby", minHours: 24, need: { defenseMin: 15 } }, // high defense
    { to: "fennix", minHours: 24 }, // balanced (fallback)
  ],
};
