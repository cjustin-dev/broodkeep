// Adult Mode's cards on the habitat screen: the card for a spot the player has tapped (what it gives, what it costs, why it is shut, and a
// Send button), and the card for a creature that is away (progress, what is coming, and a Call back button that says what it will bring).
// Every visible word is game/habitat/cards.ts (the screen-reader labels are here); the reasons are the same sentences the note over the picture used (game/reasons.ts).
import { useEffect, useRef } from "preact/hooks";
import { spots } from "../data/habitat";
import type { SpotId } from "../data/habitat";
import { callBack } from "../game/actions";
import { cardText } from "../game/habitat/cards";
import { jobProgress, jobRefusal } from "../game/habitat/jobs";
import { backText } from "../game/hud";
import { spotReason } from "../game/reasons";
import { useSecond } from "./AdultHud";
import type { Game } from "./game";

export const spotCardId = "spot-card";

// Brings a card into the window when it appears. On a phone the habitat page is taller than the window and the card opens under the
// spots, so without this the player would tap a spot and see nothing happen until they scrolled.
const showCard = (el: HTMLElement | null): void => el?.scrollIntoView?.({ block: "nearest" });

export function SpotCard({ game, spot, onSend }: { game: Game; spot: SpotId; onSend: () => void }) {
  useSecond(); // the reason is read from the live creature, so a tired creature that has rested turns into a Send button
  const ref = useRef<HTMLElement>(null);
  useEffect(() => showCard(ref.current), [spot]);
  const c = game.save.creature;
  if (!c) return null;
  const code = jobRefusal(c, spot);
  const reason = code === null ? null : spotReason(game.save, c, code, spot, game.now());
  return (
    <section class="habitat-card spot-card" id={spotCardId} ref={ref} role="group" aria-label={`${spots[spot].name} card`}>
      <div class="card-head">
        <div class="card-titles">
          <h4>{cardText.title(spot)}</h4>
          <p class="card-line">{cardText.cost(spot)}</p>
        </div>
        {reason === null && (
          <button class="btn card-btn primary" onClick={onSend}>
            {cardText.send}
          </button>
        )}
      </div>
      <p class="card-line">{cardText.haul(spot)}</p>
      {reason !== null && (
        <p class="card-reason" role="status">
          {reason}
        </p>
      )}
    </section>
  );
}

export function JobCard({ game }: { game: Game }) {
  useSecond(); // the bar, the countdown and the button's words move every second
  const ref = useRef<HTMLElement>(null);
  useEffect(() => showCard(ref.current), []);
  const job = game.save.creature?.job;
  if (!job) return null;
  const now = game.now();
  const share = jobProgress(job, now);
  return (
    <section class="habitat-card job-card" ref={ref} role="group" aria-label={`Away at ${spots[job.spot].name}`}>
      <div class="card-head">
        <h4>{cardText.title(job.spot)}</h4>
        <p class="card-back">{backText(job, now)}</p>
      </div>
      <div
        class="job-bar"
        role="progressbar"
        aria-label="How much of the job is done"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
      >
        <span style={{ width: `${share * 100}%` }} />
      </div>
      <p class="card-line">{cardText.haul(job.spot)}</p>
      <p class="card-line card-soft">{cardText.spent(job.spot)}</p>
      <button class="btn card-btn" onClick={() => game.act((save, nowMs) => callBack(save, nowMs))}>
        {cardText.callBack(job, now)}
      </button>
    </section>
  );
}
