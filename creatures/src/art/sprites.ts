// Pictures that are not creatures: icons, eggs and poop. PLACEHOLDER ART.
// One shared set of colors, so every icon matches.

import type { EggPattern } from "../game/types";
import type { Sprite } from "./pixel";

export const colors: Record<string, string> = {
  K: "#1a1020", // outline
  W: "#ffffff",
  R: "#e0455b",
  O: "#f08a24",
  Y: "#ffd25a",
  G: "#5cb85c",
  B: "#4aa3df",
  L: "#a8e0ff",
  P: "#ff8fb3",
  N: "#8a5a3a",
  D: "#5e3a22",
  S: "#9aa0a6",
  C: "#f5e6c8",
};

const icon = (rows: string[]): Sprite => ({ rows, palette: colors });

export type IconName =
  | "hunger"
  | "happiness"
  | "energy"
  | "hygiene"
  | "wellness"
  | "feed"
  | "clean"
  | "lights"
  | "medicine"
  | "settings"
  | "berry"
  | "meat"
  | "fish"
  | "candy"
  | "zzz"
  | "cloud"
  | "sick"
  | "poop"
  | "house"
  | "tree"
  | "coin"
  | "lock"
  | "fiber"
  | "herb"
  | "wood"
  | "stone";

export const icons: Record<IconName, Sprite> = {
  hunger: icon([
    "....OOO.",
    "...OOOOO",
    "...OOOOO",
    "..COOOO.",
    "..CCOO..",
    ".CC.....",
    "CC......",
    "C.......",
  ]),
  happiness: icon([
    "..KKKK..",
    ".KYYYYK.",
    "KYKYYKYK",
    "KYYYYYYK",
    "KYKYYKYK",
    "KYYKKYYK",
    ".KYYYYK.",
    "..KKKK..",
  ]),
  energy: icon([
    "....YYY.",
    "...YYY..",
    "..YYY...",
    ".YYYYYY.",
    "....YYY.",
    "...YYY..",
    "..YY....",
    ".Y......",
  ]),
  hygiene: icon([
    "...BB...",
    "..BBBB..",
    "..BLBB..",
    ".BLBBBB.",
    ".BLBBBB.",
    ".BBBBBB.",
    "..BBBB..",
    "...BB...",
  ]),
  wellness: icon([
    ".RR..RR.",
    "RRRRRRRR",
    "RWRRRRRR",
    "RRRRRRRR",
    ".RRRRRR.",
    "..RRRR..",
    "...RR...",
    "........",
  ]),
  // A bowl of food, so it does not look like the meat or hunger icons.
  feed: icon([
    "........",
    "...OO...",
    "..OOOO..",
    ".OOOOOO.",
    "BBBBBBBB",
    "BLBBBBBB",
    ".BBBBBB.",
    "..BBBB..",
  ]),
  // A broom, so it does not look like a shovel.
  clean: icon([
    "......NN",
    ".....NN.",
    "....NN..",
    "...NN...",
    "..YYYY..",
    ".YYYYYY.",
    "YYOYYOYY",
    "YYYYYYYY",
  ]),
  lights: icon([
    "..YYY...",
    ".YYY....",
    "YYY.....",
    "YYY.....",
    "YYY.....",
    ".YYY..YY",
    "..YYYYY.",
    "....YY..",
  ]),
  medicine: icon([
    "..RRRR..",
    "..RRRR..",
    "RRRRRRRR",
    "RRRRRRRR",
    "RRRRRRRR",
    "RRRRRRRR",
    "..RRRR..",
    "..RRRR..",
  ]),
  settings: icon([
    "...SS...",
    ".S.SS.S.",
    "..SSSS..",
    "SSS..SSS",
    "SSS..SSS",
    "..SSSS..",
    ".S.SS.S.",
    "...SS...",
  ]),
  berry: icon([
    "....GG..",
    "...GG...",
    "..RRRR..",
    ".RRRRRR.",
    ".RWRRRR.",
    ".RRRRRR.",
    "..RRRR..",
    "........",
  ]),
  meat: icon([
    "....OOO.",
    "...OOOOO",
    "...OOOOO",
    "..COOOO.",
    "..CCOO..",
    ".CC.....",
    "CC......",
    "C.......",
  ]),
  fish: icon([
    "........",
    "...BBB.B",
    "..BBBBBB",
    ".BKBBBB.",
    "BBBBBBBB",
    ".BBBBBB.",
    "...BBB.B",
    "........",
  ]),
  candy: icon([
    "........",
    "P..PP..P",
    "PP.PP.PP",
    "P.PPPP.P",
    "..PWPP..",
    "..PPPP..",
    "........",
    "........",
  ]),
  zzz: icon([
    "WWW.....",
    "..W.....",
    ".W..WWW.",
    "WWW...W.",
    ".....W..",
    "....WWW.",
    "........",
    "........",
  ]),
  cloud: icon([
    "........",
    "..SSS...",
    ".SSSSS.S",
    "SSSSSSSS",
    "SSSSSSSS",
    ".SSSSSS.",
    "..B..B..",
    ".B..B...",
  ]),
  sick: icon([
    "....SS..",
    "....SS..",
    "....SR..",
    "....SR..",
    "....SR..",
    "...SRRS.",
    "...SRRS.",
    "....SS..",
  ]),
  poop: icon([
    "....N...",
    "...NN...",
    "..NNNN..",
    "..NWNN..",
    ".NNNNNN.",
    "NNNNNNNN",
    "NNNNNNNN",
    ".DDDDDD.",
  ]),
  house: icon([
    "...RR...",
    "..RRRR..",
    ".RRRRRR.",
    "RRRRRRRR",
    ".CBCCBC.",
    ".CCCCCC.",
    ".CCDDCC.",
    ".CCDDCC.",
  ]),
  tree: icon([
    "..GGGG..",
    ".GGGGGG.",
    "GGGGGGGG",
    "GGGGGGGG",
    ".GGGGGG.",
    "...NN...",
    "...NN...",
    "..NNNN..",
  ]),
  coin: icon([
    "..KKKK..",
    ".KYYYYK.",
    "KYWOOOYK",
    "KYWOYYYK",
    "KYWOYYYK",
    "KYYOOOYK",
    ".KYYYYK.",
    "..KKKK..",
  ]),
  lock: icon([
    "..KKKK..",
    ".KSSSSK.",
    ".KS..SK.",
    ".KS..SK.",
    "KKKKKKKK",
    "KYYYYYYK",
    "KYYKKYYK",
    "KKKKKKKK",
  ]),
  fiber: icon([
    "..PPPP..",
    ".PPWPPP.",
    "PPWPPPPP",
    "PPPPRRPP",
    "PPPRRPPP",
    ".PPPPPP.",
    "..PPPP.R",
    "......RR",
  ]),
  herb: icon([
    "......GG",
    "....GGGG",
    "..GGGGG.",
    ".GGGGG..",
    "GGGGG...",
    ".NGG....",
    "N.......",
    "........",
  ]),
  wood: icon([
    "........",
    ".NNNNNN.",
    "NNCCCCNN",
    "NCCDDCCN",
    "NCCDDCCN",
    "NNCCCCNN",
    ".NNNNNN.",
    "........",
  ]),
  stone: icon([
    "........",
    "....SS..",
    "..SSSSS.",
    ".SWSSSSS",
    "SSSSSSSS",
    "SSSSSSKS",
    ".KKKKKK.",
    "........",
  ]),
};

// The eggs: the same shape, with different markings for each pattern.
const eggBase = [
  "................",
  ".....KKKKKK.....",
  "....KEEEEEEK....",
  "...KEEEEEEEEK...",
  "..KEEEEEEEEEEK..",
  "..KEEEEEEEEEEK..",
  ".KEEEEEEEEEEEEK.",
  ".KEEEEEEEEEEEEK.",
  ".KEEEEEEEEEEEEK.",
  ".KEEEEEEEEEEEEK.",
  "..KEEEEEEEEEEK..",
  "..KEEEEEEEEEEK..",
  "...KEEEEEEEEK...",
  "....KKEEEEKK....",
  ".....KKKKKK.....",
  "................",
];

const eggMark: Record<EggPattern, (row: number, col: number) => boolean> = {
  speckled: (r, c) => (r * 7 + c * 13) % 9 === 0,
  striped: (r) => r % 4 === 2,
  swirled: (r, c) => (c - r + 16) % 6 === 0 || (c + r) % 11 === 0,
};

const eggColors: Record<EggPattern, string> = {
  speckled: "#b5834f",
  striped: "#6fb6e8",
  swirled: "#a98be0",
};

export function eggSprite(pattern: EggPattern): Sprite {
  const mark = eggMark[pattern];
  const rows = eggBase.map((row, r) =>
    [...row].map((ch, c) => (ch === "E" && mark(r, c) ? "S" : ch)).join(""),
  );
  return { rows, palette: { K: "#1a1020", E: "#f5e6c8", S: eggColors[pattern] } };
}

export const allSprites: Record<string, Sprite> = {
  ...Object.fromEntries(Object.entries(icons).map(([name, sprite]) => [`icon:${name}`, sprite])),
  "egg:speckled": eggSprite("speckled"),
  "egg:striped": eggSprite("striped"),
  "egg:swirled": eggSprite("swirled"),
};
