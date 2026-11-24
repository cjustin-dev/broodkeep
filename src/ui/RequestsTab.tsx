// The request board (Adult Mode): the Shop panel's second tab. Each card is a picture, the words, the exact numbers, a bar, and what it pays; a finished
// request leaves a card that says what it paid and when the next one comes. The rules are in game/requests.ts; the numbers in data/requests.ts. A card is
// only a picture of the board: nothing on it is tapped (the things are done in the room, the habitat and the arena). Plan: docs/adult-a2-plan.md section 11.
import { placeIcon } from "../art/sprites";
import type { IconName } from "../art/sprites";
import { spots } from "../data/habitat";
import type { SpotId } from "../data/habitat";
import { requestTuning } from "../data/requests";
import { items } from "../data/shop";
import type { ItemId } from "../data/shop";
import type { Request } from "../game/board";
import { coinsFor, minutesToNext, purchaseCounted, requestProgress, requestWords, staleRequest } from "../game/requests";
import type { FieldId } from "../game/types";
import type { Game } from "./game";
import { Icon } from "./Icon";

// The picture of a request: the food, the field, the material the spot drops, the swords, the shop.
function pictureOf(r: Request): IconName {
  switch (r.type) {
    case "feed":
      return r.target as IconName; // a food id is also the name of its icon
    case "field":
      return placeIcon[r.target as FieldId];
    case "job":
      return spots[r.target as SpotId].material;
    case "fight":
      return "swords";
    case "buy":
      return "shop";
  }
}

function Reward({ coins, item, bonus }: { coins: number; item: string | null; bonus: boolean }) {
  return (
    <span class="req-reward" role="group" aria-label="Reward">
      <span class="chip tight" role="img" aria-label={`${coins} coins`}>
        <Icon name="coin" px={20} />+{coins}
      </span>
      {bonus && <span class="req-bonus">+{Math.round(requestTuning.staleBonus * 100)}%</span>}
      {item !== null && (
        <span class="chip tight req-gift" role="img" aria-label={`and ${items[item as ItemId].name}`}>
          <Icon name="spark" px={20} />
          {items[item as ItemId].name}
        </span>
      )}
    </span>
  );
}

function OpenCard({ game, r, now }: { game: Game; r: Request; now: number }) {
  const { save } = game;
  const need = requestTuning.need[r.type];
  const bonus = staleRequest(save.board, now)?.id === r.id;
  const waitingForUndo = r.type === "buy" && save.owned.includes(r.target as string) && !purchaseCounted(save, r.target as string, now);
  return (
    <li class="req-card" data-state="open" data-bonus={bonus ? "true" : "false"}>
      <span class="req-pic">
        <Icon name={pictureOf(r)} px={40} />
      </span>
      <span class="req-text">
        <span class="req-title">{requestWords(r)}</span>
        <span class="bar req-bar" aria-hidden="true">
          <span class="fill" style={{ transform: `translateX(${(Math.min(1, r.have / need) - 1) * 100}%)` }} />
        </span>
        <span class="req-progress">{requestProgress(r)}</span>
        {waitingForUndo && <span class="req-note">Bought. It counts when the undo is over.</span>}
      </span>
      <Reward coins={coinsFor(save.board, r, now)} item={r.item} bonus={bonus} />
    </li>
  );
}

export function RequestsTab({ game }: { game: Game }) {
  const { board } = game.save;
  const now = game.now();
  const empty = Math.max(0, requestTuning.slots - board.open.length - board.waits.length);
  return (
    <>
      <p class="shop-hint">A request waits for you. Nothing runs out.</p>
      <ul class="req-list" aria-label="Requests">
        {board.open.map((r) => (
          <OpenCard key={r.id} game={game} r={r} now={now} />
        ))}
        {board.waits.map((w, i) => (
          <li class="req-card" key={`done-${w.doneAt}-${i}`} data-state="done">
            <span class="req-pic">
              <Icon name="spark" px={40} />
            </span>
            <span class="req-text">
              <span class="req-title">
                Done: +{w.coins} {w.coins === 1 ? "coin" : "coins"}
                {w.item !== null && ` and ${items[w.item as ItemId].name}`}
              </span>
              <span class="req-progress">Next request in {minutesToNext(w.doneAt, now)} min</span>
            </span>
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li class="req-card" key={`empty-${i}`} data-state="empty">
            <span class="req-text">
              <span class="req-progress">A new request is on its way.</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
