// What stands under the picture while Decorate mode is on (docs/home-plan.md section 12): the furniture that is put away, one picture each, then the bin (put the selected
// piece away) and Done. Icons only, as the care buttons are; Adult Mode adds a word under the bin and Done and says why the bin did nothing (the bed cannot be put away).
import { useEffect, useRef } from "preact/hooks";
import { trayOf } from "../art/homeEdit";
import { layoutOf } from "../art/homeLayout";
import { drawPiece, plainLook } from "../art/room";
import { COLS, PIECE_NAMES, SHAPES, TILE } from "../data/home";
import type { PieceKind } from "../data/home";
import { isAdultMode } from "../game/hud";
import type { Game } from "./game";
import { Icon, Word } from "./Icon";
import { focusPicture } from "./Stage";

const thumbLook = { ...plainLook, mat: true }; // (the Feeding Mat is only in the tray once it is owned, so its picture is always the real one)

// A piece's own picture, at its size in the home, scaled down by the page to fit its button.
function PieceThumb({ kind }: { kind: PieceKind }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { cols, rows } = SHAPES[kind];
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cols * TILE, rows * TILE);
    drawPiece(ctx, thumbLook, kind, { col: 0, row: 0 });
  }, [kind, cols, rows]);
  return <canvas ref={canvas} class="piece-thumb" width={cols * TILE} height={rows * TILE} aria-hidden="true" />;
}

export function DecorateBar({ game }: { game: Game }) {
  const save = game.save;
  const adult = isAdultMode(save);
  const tray = trayOf(layoutOf(save.home), save.owned.includes("feeding-mat"));
  const selected = game.selectedPiece;

  // A piece lands near the middle of what the picture shows (the Stage keeps that tile on the game, as it keeps the creature's looks).
  const onBringOut = (kind: PieceKind): void => {
    game.bringOut(kind, game.viewMiddle ?? { col: COLS / 2, row: 4 });
    focusPicture(); // (the arrow keys move the piece that was just put out)
  };

  const onPutAway = (): void => {
    if (selected === "bed") {
      game.say("The bed has to stay: your creature sleeps in it.");
      return;
    }
    if (game.putAway()) focusPicture();
  };

  return (
    <div class="actions decorate">
      {tray.length > 0 && (
        <div class="tray pieces" role="group" aria-label="Furniture put away">
          {tray.map((kind) => (
            <button class="btn piece" aria-label={`Put out the ${PIECE_NAMES[kind].toLowerCase()}`} onClick={() => onBringOut(kind)}>
              <PieceThumb kind={kind} />
            </button>
          ))}
        </div>
      )}
      <div class="care decor-care" role="group" aria-label="Decorate">
        <button
          class={adult ? "btn labelled" : "btn"}
          aria-label={selected ? `Put the ${PIECE_NAMES[selected].toLowerCase()} away` : "Put away the selected piece"}
          disabled={adult ? undefined : selected === null || selected === "bed"}
          aria-disabled={adult && (selected === null || selected === "bed") ? true : undefined}
          onClick={onPutAway}
        >
          <Icon name="bin" px={48} />
          {adult && <Word text="Put away" />}
        </button>
        <button class={adult ? "btn labelled" : "btn"} aria-label="Done decorating" onClick={() => game.endDecor()}>
          <Icon name="done" px={48} />
          {adult && <Word text="Done" />}
        </button>
      </div>
    </div>
  );
}
