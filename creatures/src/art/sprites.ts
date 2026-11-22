// Pictures that are not creatures: icons, eggs and poop. PLACEHOLDER ART.
// One shared set of colors, so every icon matches.

import type { EggPattern, Place } from "../game/types";
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
  | "pellet"
  | "treat"
  | "meat"
  | "carrot"
  | "worm"
  | "seafood"
  | "seaweed"
  | "shrimp"
  | "fish"
  | "zzz"
  | "cloud"
  | "sick"
  | "poop"
  | "house"
  | "tree"
  | "go"
  | "land"
  | "water"
  | "sky"
  | "coin"
  | "lock"
  | "fiber"
  | "herb"
  | "wood"
  | "stone"
  | "swords"
  | "sword"
  | "shield"
  | "spark";

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
  pellet: icon([
    "........",
    "...YY...",
    "...YO...",
    "..YYYY..",
    "..YOYO..",
    ".YYYYYY.",
    ".YOYOYO.",
    "........",
  ]),
  carrot: icon([
    "..GGG...",
    "...GG...",
    "..OOOO..",
    "..OYOO..",
    "..OOOO..",
    "...OOO..",
    "...OO...",
    "....O...",
  ]),
  worm: icon([
    "........",
    "..PPP...",
    ".PPKPP..",
    ".PPPP...",
    "..PPPP..",
    "...PPPP.",
    ".PPPPP..",
    "........",
  ]),
  // A silver fish with a pink belly, so it does not look like the blue fish of the pond.
  seafood: icon([
    "........",
    "..SSS..S",
    ".SSSSSSS",
    "SKSSSSS.",
    "SPPPPPSS",
    ".SSSSS.S",
    "..SSS...",
    "........",
  ]),
  seaweed: icon([
    "..G..G..",
    ".GG..GG.",
    "..GG.G..",
    ".GG..GG.",
    "..G.GG..",
    ".GG.G...",
    "..GGG...",
    "..G.G...",
  ]),
  // A curled red shrimp with orange stripes along its body.
  shrimp: icon([
    "..R.....",
    "R.RRR...",
    ".RRKRR..",
    "..RRORR.",
    "...ROROR",
    "..RROROR",
    ".RRRRRR.",
    "RR.RRR..",
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
  treat: icon([
    "........",
    "........",
    "R.PPPP.R",
    "RRPWPPRR",
    "RRPPPWRR",
    "R.PPPP.R",
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
  // The button that opens the list of places to take the creature, and the three fields in it.
  go: icon([
    "...DD...",
    "...DD...",
    ".YYYYYY.",
    "YYYYYYYY",
    ".YYYYYY.",
    "...DD...",
    "...DD...",
    "..DDDD..",
  ]),
  land: icon([
    "...LL...",
    "..LSSS..",
    ".LSSSSS.",
    "LSSSSSSS",
    "SSSSSSSS",
    "GGGGGGGG",
    "GGNGGGNG",
    "NNNNNNNN",
  ]),
  water: icon([
    "...B....",
    "...BB...",
    "..BBBB..",
    ".BBBBBB.",
    ".BLBBBB.",
    ".BLBBBB.",
    "..BBBB..",
    "........",
  ]),
  sky: icon([
    "..Y.Y...",
    "...YY.Y.",
    ".YYYYY..",
    "..YYYWW.",
    "..WWWWWW",
    ".WWWWWWW",
    "WWWWWWWW",
    ".WWWWWW.",
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
  // The arena: crossed swords (the place, and the start of a fight), then one sword (attack), a shield (guard) and a spark (special).
  swords: icon([
    "K......K",
    "KS....SK",
    ".KS..SK.",
    "..KSSK..",
    "..KSSK..",
    ".YK..KY.",
    "NY....YN",
    "N......N",
  ]),
  sword: icon([
    "......KK",
    ".....KWK",
    "....KWK.",
    "K..KWK..",
    "KKKWK...",
    ".KYK....",
    "KNKYK...",
    "KK.KK...",
  ]),
  shield: icon([
    "KKKKKKKK",
    "KBBYYBBK",
    "KBLYYBBK",
    "KBLYYBBK",
    "KBBYYBBK",
    ".KBYYBK.",
    "..KBBK..",
    "...KK...",
  ]),
  spark: icon([
    "...YY...",
    "...YY...",
    "Y..YY..Y",
    ".YYWWYY.",
    ".YYWWYY.",
    "Y..YY..Y",
    "...YY...",
    "...YY...",
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

// The icon for each place a creature can be: home, or one of the fields.
export const placeIcon: Record<Place, IconName> = { home: "house", land: "land", water: "water", sky: "sky" };

export const allSprites: Record<string, Sprite> = {
  ...Object.fromEntries(Object.entries(icons).map(([name, sprite]) => [`icon:${name}`, sprite])),
  "egg:speckled": eggSprite("speckled"),
  "egg:striped": eggSprite("striped"),
  "egg:swirled": eggSprite("swirled"),
};
