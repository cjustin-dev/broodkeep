// Pixel icons as <img> pictures. The picture is a data: URL, which the page's
// security rules allow. Icons have no text, so the button around one needs a label.
import { spriteDataUrl } from "../art/pixel";
import type { Sprite } from "../art/pixel";
import { icons } from "../art/sprites";
import type { IconName } from "../art/sprites";

interface PicProps {
  sprite: Sprite;
  id: string; // cache name for the picture
  px: number; // size on screen, in CSS pixels (width and height)
  class?: string;
}

export function Pic({ sprite, id, px, class: className }: PicProps) {
  const cells = sprite.rows.length;
  // Draw at a whole-number multiple of the grid, so the pixels stay sharp.
  const url = spriteDataUrl(sprite, id, Math.max(1, Math.ceil((px * 2) / cells)));
  return <img class={className ?? "pic"} src={url} alt="" width={px} height={px} draggable={false} />;
}

export function Icon({ name, px = 40 }: { name: IconName; px?: number }) {
  return <Pic sprite={icons[name]} id={`icon:${name}`} px={px} />;
}

// The word under an icon in Adult Mode. The button's own aria-label is its name, so the word is hidden from a screen reader.
export function Word({ text }: { text: string }) {
  return (
    <span class="word" aria-hidden="true">
      {text}
    </span>
  );
}
