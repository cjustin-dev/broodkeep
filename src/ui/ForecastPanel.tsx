// The Growth Forecast (Adult Mode): what the creature grows into, how close the others are, how long is left, what the stage counts, and a
// what-if that only ever looks at a copy. Everything it says is worked out in game/forecast.ts, where tests check it against the game's rules.
// The plan is docs/adult-a1-plan.md, section 3b.
import { useEffect, useRef, useState } from "preact/hooks";
import { faceSprite } from "../art/face";
import { getForm } from "../data/forms";
import { specialId } from "../data/special";
import { tuning } from "../data/tuning";
import { forecast, whatIf } from "../game/forecast";
import type { Forecast, Row } from "../game/forecast";
import type { Creature } from "../game/state";
import { useSecond } from "./AdultHud";
import type { Game } from "./game";
import { Pic } from "./Icon";

const g = tuning.growth;

const stageWord = (formId: string): string => (formId === specialId ? "Special" : getForm(formId).stage[0]!.toUpperCase() + getForm(formId).stage.slice(1));

function Pips({ filled, total }: { filled: number; total: number }) {
  return (
    <span class="fc-pips" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span class="fc-pip" key={i} data-on={i < filled ? "true" : "false"} />
      ))}
    </span>
  );
}

function Lead({ f, c }: { f: Forecast; c: Creature }) {
  const shown = f.leader ?? c.formId;
  const form = getForm(shown);
  const sprite = faceSprite(form, "open");
  const kicker = f.stage === "adult" ? "Final form" : f.stage === "special" ? "Special form" : "Grows into, if the time were up now";
  const sub = f.tier ? `${stageWord(shown)} · tier ${f.tier} of 4` : stageWord(shown);
  return (
    <section class="fc-lead" aria-label="Leading form">
      <Pic sprite={sprite} id={`forecast:${shown}`} px={Math.min(96, Math.round(sprite.rows.length * 3))} />
      <div>
        <p class="fc-kicker">{kicker}</p>
        <p class="fc-name">{form.name}</p>
        <p class="fc-sub">{sub}</p>
      </div>
    </section>
  );
}

function RowItem({ row, taps, onTaps }: { row: Row; taps: number; onTaps: (n: number) => void }) {
  return (
    <li class="fc-row" data-leads={row.leads ? "true" : "false"}>
      <div class="fc-row-head">
        <span class="fc-label">{row.label}</span>
        {row.pips !== null && <Pips filled={row.value} total={row.pips} />}
        <span class="fc-num">{row.pips !== null ? `${row.value} / ${row.pips}` : row.value}</span>
        {row.leads && <span class="fc-tag">leads</span>}
      </div>
      <p class="fc-note">{row.note}</p>
      {row.maxTaps > 0 && (
        <div class="fc-step" role="group" aria-label={`Try adding ${row.label}`}>
          <button class="btn strip-btn" aria-label={`Try less ${row.label}`} disabled={taps <= 0} onClick={() => onTaps(taps - 1)}>
            −
          </button>
          <span class="fc-added">
            +{taps * row.perTap} {row.unit}
          </span>
          <button class="btn strip-btn" aria-label={`Try more ${row.label}`} disabled={taps >= row.maxTaps} onClick={() => onTaps(taps + 1)}>
            +
          </button>
        </div>
      )}
    </li>
  );
}

export function ForecastPanel({ game, onClose }: { game: Game; onClose: () => void }) {
  useSecond();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const [taps, setTaps] = useState<Record<string, number>>({});
  const [ruleOpen, setRuleOpen] = useState(false);

  const c = game.save.phase === "alive" ? game.save.creature : null;
  const now = game.now();
  const f = c ? forecast(c, now, game.save.lastSimulatedAt, game.save.owned) : null;
  const tried = f !== null && f.rows.some((r) => (taps[r.id] ?? 0) > 0);
  const out = c && tried ? whatIf(c, now, taps, game.save.owned) : null;

  return (
    <section class="panel" role="dialog" aria-label="Growth Forecast">
      <div class="panel-body">
        <header class="panel-head">
          <h2>Growth Forecast</h2>
          <button class="btn small" ref={closeRef} onClick={onClose}>
            Close
          </button>
        </header>
        {!c || !f ? (
          <p class="hint">Nothing is growing right now.</p>
        ) : (
          <>
            <Lead f={f} c={c} />
            {f.timer && <p class="fc-timer">{f.timer.text}</p>}
            {f.confidence && (
              <p class="fc-confidence" data-kind={f.confidence.kind}>
                {f.confidence.text}
              </p>
            )}
            {f.tie && <p class="fc-note">{f.tie}</p>}

            {f.rows.length > 0 && (
              <section class="fc-block">
                <h3>{f.stage === "baby" ? "Field cells" : f.stage === "kid" ? "Food cells" : "Care"}</h3>
                <ul class="fc-rows">
                  {f.rows.map((row) => (
                    <RowItem row={row} taps={taps[row.id] ?? 0} onTaps={(n) => setTaps({ ...taps, [row.id]: n })} />
                  ))}
                </ul>
                <div class="fc-whatif" aria-live="polite">
                  {out?.ambiguous ? (
                    <p>Two fields cannot both be first: the game gives the stage to whichever gets to {g.fieldCellsToKid} cells first. Try one field at a time.</p>
                  ) : out ? (
                    <p>
                      With these changes: <strong>{out.leader ? getForm(out.leader).name : "nothing"}</strong>
                      {out.tier ? ` (tier ${out.tier})` : ""}. {out.leader === f.leader ? "That is the same as now." : "That is different from now."}
                      {out.growsNow && f.confidence?.kind !== "now" ? " It would grow up right away." : ""}
                    </p>
                  ) : (
                    <p class="fc-note">
                      {f.rows.some((r) => r.maxTaps > 0) ? "Use + to try changes. It only looks: nothing is saved or changed." : "Nothing more can be tried here: these numbers are at their limits."}
                    </p>
                  )}
                  {tried && (
                    <button class="btn small" onClick={() => setTaps({})}>
                      Reset
                    </button>
                  )}
                </div>
              </section>
            )}

            {f.rivals.length > 0 && (
              <section class="fc-block">
                <h3>What would change it</h3>
                <ul class="fc-list">
                  {f.rivals.map((r) => (
                    <li>{r.text}</li>
                  ))}
                </ul>
              </section>
            )}

            {f.careClock && (
              <section class="fc-block">
                <h3>Care clock</h3>
                <p class="fc-note">{f.careClock.text}</p>
              </section>
            )}

            <section class="fc-block">
              <button class="btn small fc-rule-toggle" aria-expanded={ruleOpen} onClick={() => setRuleOpen(!ruleOpen)}>
                What changes this?
              </button>
              {ruleOpen && (
                <ul class="fc-list">
                  {f.rule.map((line) => (
                    <li>{line}</li>
                  ))}
                </ul>
              )}
            </section>

            <section class="fc-block">
              <h3>Care log</h3>
              {f.log.lines.length === 0 && f.log.unlisted === 0 ? (
                <p class="fc-note">No care mistakes in this stage.</p>
              ) : (
                <ul class="fc-list">
                  {f.log.lines.map((line) => (
                    <li key={line.at}>{line.text}</li>
                  ))}
                  {f.log.unlisted > 0 && <li>{f.log.unlisted === 1 ? "1 earlier one is not listed." : `${f.log.unlisted} earlier ones are not listed.`}</li>}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </section>
  );
}
