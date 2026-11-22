// The Creature Book: every creature in the game, as a dark shape until a creature of that form has been raised. A missing creature
// shows a short hint once its parent in the family tree has been raised (data/book.ts).
import { useEffect, useRef } from "preact/hooks";
import { faceSprite } from "../art/face";
import { silhouette } from "../art/silhouette";
import { bookIds, bookPages, bookTotal, hintFor } from "../data/book";
import { getForm } from "../data/forms";
import type { Game } from "./game";
import { Pic } from "./Icon";

function Cell({ id, found, hint }: { id: string; found: boolean; hint: string | null }) {
  const form = getForm(id);
  const sprite = faceSprite(form, "open");
  return (
    <li class="book-cell" data-found={found}>
      {/* one and a half times the drawing's size, so every size keeps its place against the others */}
      <Pic sprite={found ? sprite : silhouette(sprite)} id={`book:${found ? "face" : "dark"}:${id}`} px={Math.round(sprite.rows.length * 1.5)} />
      <span class="book-name">{found ? form.name : "???"}</span>
      {!found && hint && <span class="book-hint">{hint}</span>}
    </li>
  );
}

export function BookPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  const found = new Set(game.save.book);
  const raised = bookIds().filter((id) => found.has(id)).length;

  return (
    <section class="panel" role="dialog" aria-label="Creature Book">
      <div class="panel-body">
        <header class="panel-head">
          <h2>Creature Book</h2>
          <button class="btn small" ref={closeRef} onClick={onClose}>
            Close
          </button>
        </header>
        <p class="hint">
          {raised} of {bookTotal()} creatures raised
        </p>
        {bookPages().map((page) => (
          <section class="book-page">
            <h3>{page.title}</h3>
            {page.rows.map((row) => (
              <ul class={row.length === 1 ? "book-row single" : "book-row"}>
                {row.map((id) => (
                  <Cell id={id} found={found.has(id)} hint={hintFor(id, found)} />
                ))}
              </ul>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
