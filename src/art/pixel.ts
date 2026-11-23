// Turns pixel art written as text grids into pictures.
// Each letter in a grid picks a color from the palette. "." is see-through.
// Pictures are drawn once into a small hidden canvas and then reused (cached).

export interface Sprite {
  rows: string[];
  palette: Record<string, string>;
}

const cache = new Map<string, HTMLCanvasElement>();

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Blend color a toward color b. amount 0 gives a, 1 gives b.
export function mixColor(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const mix = (x: number, y: number): string =>
    Math.round(x + (y - x) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${mix(ar, br)}${mix(ag, bg)}${mix(ab, bb)}`;
}

export function spriteSize(sprite: Sprite): { w: number; h: number } {
  return { w: sprite.rows[0]?.length ?? 0, h: sprite.rows.length };
}

// A canvas holding the sprite at its natural size (1 grid cell = 1 pixel).
// "key" names the picture for the cache. "tint" blends every color toward one color.
export function spriteCanvas(sprite: Sprite, key: string, tint?: { color: string; amount: number }): HTMLCanvasElement {
  const cacheKey = tint ? `${key}|${tint.color}|${tint.amount}` : key;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const { w, h } = spriteSize(sprite);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  sprite.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const letter = row[x] as string;
      const color = sprite.palette[letter];
      if (letter === "." || !color) continue;
      ctx.fillStyle = tint ? mixColor(color, tint.color, tint.amount) : color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  cache.set(cacheKey, canvas);
  return canvas;
}

// Draw a cached sprite. Positions are whole pixels so the art stays crisp.
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  options: { flipX?: boolean; height?: number } = {},
): void {
  const w = canvas.width;
  const h = options.height ?? canvas.height; // a smaller height squashes the sprite by whole rows
  const px = Math.round(x);
  const py = Math.round(y) + (canvas.height - h);
  if (options.flipX) {
    ctx.save();
    ctx.translate(px + w, py);
    ctx.scale(-1, 1);
    ctx.drawImage(canvas, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(canvas, px, py, w, h);
  }
}

// A picture as a data: URL, scaled up, for use in an <img> (buttons and icons).
// The page's security rules allow data: images.
const urlCache = new Map<string, string>();
export function spriteDataUrl(sprite: Sprite, key: string, scale: number): string {
  const cacheKey = `${key}@${scale}`;
  const hit = urlCache.get(cacheKey);
  if (hit) return hit;
  const small = spriteCanvas(sprite, key);
  const big = document.createElement("canvas");
  big.width = small.width * scale;
  big.height = small.height * scale;
  const ctx = big.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, big.width, big.height);
  const url = big.toDataURL("image/png");
  urlCache.set(cacheKey, url);
  return url;
}
