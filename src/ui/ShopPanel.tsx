// The Shop (Adult Mode): what the coins and materials buy. A preview of the room with the chosen item, the wallet, a 10 second undo after a buy, and
// a card for each item. A second tab, Requests, is the request board (ui/RequestsTab.tsx), beside the shop (the nav row has no room for a fifth button). The rules are in game/shop.ts; the list and the prices in data/shop.ts. The plan is docs/adult-a2-plan.md, section 9.
import { useEffect, useRef, useState } from "preact/hooks";
import { drawRoom, lookOf } from "../art/room";
import type { Look } from "../art/room";
import { ROOM } from "../art/layout";
import { materialIds, materials } from "../data/habitat";
import { itemIds, items } from "../data/shop";
import type { ItemId } from "../data/shop";
import { buy, buyRefusal, poorText, undoBuy, undoLeftMs, useWall } from "../game/shop";
import { hourOf } from "../game/time";
import type { Save } from "../game/state";
import { useSecond } from "./AdultHud";
import type { Game } from "./game";
import { Icon } from "./Icon";
import { RequestsTab } from "./RequestsTab";

// The room as it would look with one item added to what the player has (an owned item shows as it is).
function lookWith(save: Save, id: ItemId): Look {
  const look = lookOf(save);
  const item = items[id];
  if (item.kind === "wallpaper") return { ...look, wall: id };
  return { ...look, bed: look.bed || id === "comfy-bed", mat: look.mat || id === "feeding-mat" };
}

function Preview({ look, hour, label }: { look: Look; hour: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    drawRoom(ctx, hour, look);
  }, [look.wall, look.bed, look.mat, hour]);
  return <canvas ref={ref} class="shop-preview" width={ROOM.w} height={ROOM.h} role="img" aria-label={label} />;
}

function Cost({ id, save }: { id: ItemId; save: Save }) {
  const price = items[id].price;
  const coinsShort = save.coins < price.coins;
  return (
    <div class="shop-cost" role="group" aria-label="Price">
      <span class="chip tight" data-short={coinsShort ? "true" : "false"} role="img" aria-label={`${price.coins} coins, you have ${save.coins}`}>
        <Icon name="coin" px={20} />
        {price.coins}
      </span>
      {materialIds.map((material) => {
        const need = price.materials[material];
        if (!need) return null;
        const have = save.inventory[material] ?? 0;
        return (
          <span
            class="chip tight"
            key={material}
            data-short={have < need ? "true" : "false"}
            role="img"
            aria-label={`${need} ${materials[material].name}, you have ${have}`}
          >
            <Icon name={material} px={20} />
            {have}/{need}
          </span>
        );
      })}
    </div>
  );
}

function ItemCard({ id, game, selected, onPick }: { id: ItemId; game: Game; selected: boolean; onPick: () => void }) {
  const { save } = game;
  const item = items[id];
  const owned = save.owned.includes(id);
  const refusal = owned ? null : buyRefusal(save, id);
  const onWall = save.wall === id;
  return (
    <li class="shop-card" data-selected={selected ? "true" : "false"} data-owned={owned ? "true" : "false"}>
      <button class="shop-pick" aria-pressed={selected} aria-label={`${item.name}. ${item.effect} Preview it in the room.`} onClick={onPick}>
        <span class="shop-name">{item.name}</span>
        <span class="shop-effect">{item.effect}</span>
      </button>
      {!owned && <Cost id={id} save={save} />}
      {refusal === "poor" && <p class="shop-reason">{poorText(save, id)}</p>}
      {owned ? (
        item.kind === "wallpaper" ? (
          <button class="btn card-btn" aria-pressed={onWall} onClick={() => game.act((s) => useWall(s, onWall ? null : id))}>
            {onWall ? "Stop using" : "Use"}
          </button>
        ) : (
          <p class="shop-owned">{item.kind === "food" ? "Owned: find it under Feed" : "Owned"}</p>
        )
      ) : (
        <button
          class={refusal === null ? "btn card-btn primary" : "btn card-btn"}
          aria-label={`Buy ${item.name}`}
          aria-disabled={refusal !== null ? true : undefined}
          onClick={() => refusal === null && game.act((s, now) => buy(s, id, now))}
        >
          Buy
        </button>
      )}
    </li>
  );
}

export function ShopPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  useSecond();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const [picked, setPicked] = useState<ItemId>(itemIds[0]!);
  const [tab, setTab] = useState<"items" | "requests">("items");
  const { save } = game;
  const now = game.now();
  const left = undoLeftMs(save, now);
  const last = save.lastBuy && left !== null ? items[save.lastBuy.item as ItemId] : null;
  const seconds = left === null ? 0 : Math.ceil(left / 1000);
  // The undo is on both tabs: a purchase that counts toward a request can be undone from either one while its 10 seconds last.
  const undoBar = last && (
    <div class="shop-undo" role="status">
      <span>Bought {last.name}.</span>
      <button class="btn card-btn" aria-label={`Undo ${last.name}, ${seconds} seconds left`} onClick={() => game.act((s, at) => undoBuy(s, at))}>
        Undo ({seconds}s)
      </button>
    </div>
  );

  return (
    <section class="panel" role="dialog" aria-label="Shop">
      <div class="panel-body">
        <header class="panel-head">
          <h2>Shop</h2>
          <button class="btn small" ref={closeRef} onClick={onClose}>
            Close
          </button>
        </header>
        <div class="shop-wallet" role="group" aria-label="Wallet">
          <span class="chip tight" role="img" aria-label={`${save.coins} coins`}>
            <Icon name="coin" px={20} />
            {save.coins}
          </span>
          {materialIds.map((id) => (
            <span class="chip tight" key={id} role="img" aria-label={`${save.inventory[id] ?? 0} ${materials[id].name}`}>
              <Icon name={id} px={20} />
              {save.inventory[id] ?? 0}
            </span>
          ))}
        </div>
        <div class="shop-tabs" role="group" aria-label="Show">
          <button class="btn small" aria-pressed={tab === "items"} onClick={() => setTab("items")}>
            Items
          </button>
          <button class="btn small" aria-pressed={tab === "requests"} onClick={() => setTab("requests")}>
            Requests
          </button>
        </div>
        {tab === "requests" ? (
          <>
            {undoBar}
            <RequestsTab game={game} />
          </>
        ) : (
          <>
            <Preview look={lookWith(save, picked)} hour={hourOf(now)} label={`Your room with ${items[picked].name}`} />
            <p class="shop-hint">Tap an item to see it in the room.</p>
            {undoBar}
            <ul class="shop-list">
              {itemIds.map((id) => (
                <ItemCard key={id} id={id} game={game} selected={picked === id} onPick={() => setPicked(id)} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
