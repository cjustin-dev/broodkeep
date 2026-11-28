// The Creature Book: every creature in the game, as a dark shape until a creature of that form has been raised. A missing creature
// shows a short hint once its parent in the family tree has been raised (data/book.ts).
// The same panel is where a grown-up creature retires (game/retire.ts) and where the completed lives are kept.
// In Adult Mode a cell is a button that opens the creature's recipe (game/recipes.ts), the top of the panel says which creature to look for next, and a creature
// raised as a perfect run wears a star (game/perfect.ts). Kid Mode keeps the markup it always had. The plan is docs/adult-a4-plan.md, section 14.
import { useEffect, useRef, useState } from "preact/hooks";
import { faceSprite } from "../art/face";
import { silhouette } from "../art/silhouette";
import { bookIds, bookPages, bookTotal, hintFor } from "../data/book";
import { getForm } from "../data/forms";
import { retireCreature } from "../game/actions";
import { isAdultMode } from "../game/hud";
import { perfectText } from "../game/perfect";
import { cardText, cellLabel, nextText, nextToFind, recipeOf } from "../game/recipes";
import { formName, formOf, lifeDates, retireStatus, retireText } from "../game/retire";
import type { Game } from "./game";
import { Icon, Pic } from "./Icon";

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

const cellId = (id: string): string => `book-cell-${id}`;
const cardId = (id: string): string => `book-card-${id}`;

// Adult Mode's cell: the same li, with a button inside that opens the creature's card. The button's name starts with the word the cell shows, and for a creature
// that is not raised it never holds the creature's name. The first 16 px is a strip of its own for the star, so the star is never on the face.
function AdultCell({ id, found, perfect, open, onToggle }: { id: string; found: boolean; perfect: boolean; open: boolean; onToggle: () => void }) {
  const form = getForm(id);
  const sprite = faceSprite(form, "open");
  return (
    <li class="book-cell book-cell-adult" data-found={found} data-open={open}>
      <button class="book-cell-btn" id={cellId(id)} aria-label={cellLabel(found, form.name, perfect)} aria-expanded={open} aria-controls={open ? cardId(id) : undefined} onClick={onToggle}>
        <span class="book-star-strip">{perfect && <Icon name="star" px={16} />}</span>
        <Pic sprite={found ? sprite : silhouette(sprite)} id={`book:${found ? "face" : "dark"}:${id}`} px={Math.round(sprite.rows.length * 1.5)} />
        <span class="book-name">{found ? form.name : cardText.hidden}</span>
      </button>
    </li>
  );
}

// The card under a cell's row: the creature (or its dark shape), whether it has the star, and the steps that raise it, each marked Done once the form it makes is in the Book.
function RecipeCard({ id, found, perfect, raised, onClose }: { id: string; found: boolean; perfect: boolean; raised: ReadonlySet<string>; onClose: () => void }) {
  const form = getForm(id);
  const sprite = faceSprite(form, "open");
  const recipe = recipeOf(id);
  const name = found ? form.name : cardText.notRaised;
  return (
    <div class="book-card" id={cardId(id)} role="group" aria-label={name}>
      <div class="book-card-head">
        <span class="book-card-face">
          <Pic sprite={found ? sprite : silhouette(sprite)} id={`book:${found ? "face" : "dark"}:${id}`} px={Math.round(sprite.rows.length * 1.5)} />
        </span>
        <div class="book-card-title">
          <h4>{name}</h4>
          {found && <p class="hint">{cardText.raised}</p>}
          {perfect && (
            <p class="book-card-star">
              <Icon name="star" px={16} />
              {perfectText.star}
            </p>
          )}
        </div>
      </div>
      {recipe && (
        <ol class="book-steps">
          {recipe.steps.map((step) => (
            <li class="book-step" data-done={raised.has(step.formId)}>
              {step.text}
              {raised.has(step.formId) && <span class="book-step-done">{cardText.done}</span>}
            </li>
          ))}
        </ol>
      )}
      {recipe?.note && <p class="hint">{recipe.note}</p>}
      <button class="btn small book-card-close" onClick={onClose}>
        {cardText.close}
      </button>
    </div>
  );
}

// "Next to find": the first creature that can be reached now, and the one step it takes (its parent is raised, so every step before it is done).
function NextLine({ found }: { found: ReadonlySet<string> }) {
  const next = nextToFind(found);
  return (
    <p class="hint book-next">
      {next ? (
        <>
          <strong>{nextText.lead}</strong>
          {next.label}. {next.step}
        </>
      ) : (
        nextText.all
      )}
    </p>
  );
}

// A creature's face in its slot, beside the creature's name or what is said about it. A form this version does not know leaves the slot
// empty, so the text beside it keeps its place.
function Face({ formId }: { formId: string }) {
  const form = formOf(formId);
  const sprite = form ? faceSprite(form, "open") : null;
  return (
    <span class="book-life-face">{sprite && <Pic sprite={sprite} id={`book:face:${formId}`} px={Math.round(sprite.rows.length * 1.5)} />}</span>
  );
}

// "This creature": says whether it can retire, and asks once before it does. Panel-local state only: the card and the line that follows
// it are not saved (what is kept is `save.retired`, written by the action).
function RetireSection({ game }: { game: Game }) {
  const [card, setCard] = useState(false);
  const [done, setDone] = useState<string | null>(null); // the retired creature's name, once the action says it worked
  const openRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const status = retireStatus(game.save, game.fighting);
  const asking = card && status.kind === "ready";
  const formId = game.save.creature?.formId ?? null; // for the creature's face beside what is said about it

  useEffect(() => {
    if (card && status.kind !== "ready") setCard(false); // the creature went away, started a fight or is gone: the question no longer stands
  }, [card, status.kind]);
  useEffect(() => {
    if (asking) keepRef.current?.focus(); // the safe answer first
  }, [asking]);
  useEffect(() => {
    if (done !== null) doneRef.current?.focus();
  }, [done]);

  if (status.kind === "none" && done === null) return null;

  const confirm = (): void => {
    const name = status.kind === "ready" ? status.name : "";
    const result = game.act((save, now) => retireCreature(save, now));
    setCard(false);
    if (result === "retired") setDone(name); // a refusal (a second tap, a creature that has since gone away) says nothing and keeps what was said
  };
  const keep = (): void => {
    setCard(false);
    openRef.current?.focus();
  };

  return (
    <section class="book-page retire">
      <h3>{retireText.thisHeading}</h3>
      {status.kind === "teaser" && <p class="hint">{retireText.teaser}</p>}
      {(status.kind === "away" || status.kind === "fighting" || status.kind === "ready") && (
        <div class="retire-who">
          {formId && <Face formId={formId} />}
          <p class="hint">
            {status.kind === "away" ? retireText.away(status.name, status.spot) : status.kind === "fighting" ? retireText.fighting(status.name) : retireText.ready(status.name)}
          </p>
        </div>
      )}
      {status.kind === "ready" && (
        <>
          <button class="btn small retire-btn" ref={openRef} aria-expanded={asking} onClick={() => setCard(!card)}>
            {retireText.button(status.name)}
          </button>
          {asking && (
            <div class="retire-card" role="group" aria-label={retireText.cardTitle(status.name)}>
              <div class="retire-head">
                {formId && <Face formId={formId} />}
                <h4>{retireText.cardTitle(status.name)}</h4>
              </div>
              <p class="hint">{retireText.cardBody(status.name)}</p>
              <div class="retire-actions">
                <button class="btn small retire-btn primary" onClick={confirm}>
                  {retireText.confirm}
                </button>
                <button class="btn small retire-btn" ref={keepRef} onClick={keep}>
                  {retireText.keep}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {done !== null && (
        <p class="hint retire-done" role="status" tabIndex={-1} ref={doneRef}>
          {retireText.done(done)}
        </p>
      )}
    </section>
  );
}

// Completed lives, newest first. A form id this version does not know shows as "A creature", with no face, and does not break the list.
function LivesSection({ game, adult }: { game: Game; adult: boolean }) {
  const lives = game.save.retired;
  if (lives.length === 0) return null;
  return (
    <section class="book-page book-lives">
      <h3>{retireText.livesHeading}</h3>
      <ul class="book-lives-list">
        {[...lives].reverse().map((life) => (
          <li class="book-life">
            <Face formId={life.formId} />
            <span class="book-life-text">
              <span class="book-life-name">{formName(life.formId)}</span>
              <span class="book-life-dates">{lifeDates(life)}</span>
            </span>
            {adult && life.perfect === true && (
              <span class="book-life-star" role="img" aria-label={perfectText.star}>
                <Icon name="star" px={16} />
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BookPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  const found = new Set(game.save.book);
  const raised = bookIds().filter((id) => found.has(id)).length;
  const adult = isAdultMode(game.save);
  const starred = new Set(game.save.perfect);
  const stars = bookIds().filter((id) => found.has(id) && starred.has(id)).length; // only forms that are in the Book count
  const [open, setOpen] = useState<string | null>(null); // the creature whose card is showing (Adult Mode)

  useEffect(() => {
    // The panel is the thing that scrolls, so a card under a row near the bottom of the window would open below the fold.
    if (open) document.getElementById(cardId(open))?.scrollIntoView?.({ block: "nearest" });
  }, [open]);
  const close = (id: string): void => {
    setOpen(null);
    document.getElementById(cellId(id))?.focus(); // the button stays on screen, so focus goes back to it
  };

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
          {adult && stars > 0 && perfectText.count(stars)}
        </p>
        {adult && <NextLine found={found} />}
        <RetireSection game={game} />
        {bookPages().map((page) => (
          <section class="book-page">
            <h3>{page.title}</h3>
            {page.rows.map((row) => (
              <>
                <ul class={row.length === 1 ? "book-row single" : "book-row"}>
                  {row.map((id) =>
                    adult ? (
                      <AdultCell id={id} found={found.has(id)} perfect={found.has(id) && starred.has(id)} open={open === id} onToggle={() => setOpen(open === id ? null : id)} />
                    ) : (
                      <Cell id={id} found={found.has(id)} hint={hintFor(id, found)} />
                    ),
                  )}
                </ul>
                {adult && open !== null && row.includes(open) && (
                  <RecipeCard id={open} found={found.has(open)} perfect={found.has(open) && starred.has(open)} raised={found} onClose={() => close(open)} />
                )}
              </>
            ))}
          </section>
        ))}
        <LivesSection game={game} adult={adult} />
      </div>
    </section>
  );
}
