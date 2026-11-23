// "Who is playing?": one big tile per profile of the account, with the creature's picture (from the game on this device; an egg if
// the profile has not been opened here yet). Shown at the start of a session when the account has 2 or more profiles.
import { useEffect, useState } from "preact/hooks";
import { faceSprite } from "../art/face";
import { eggSprite } from "../art/sprites";
import { getForm } from "../data/forms";
import type { Save } from "../game/state";
import { loadSave } from "../sync/local";
import type { Profile } from "../sync/profiles";
import { keysFor } from "../sync/roster";
import { Pic } from "./Icon";

function Tile({ profile, firstId, onPick }: { profile: Profile; firstId: number; onPick: (profile: Profile) => void }) {
  const [save, setSave] = useState<Save | null>(null);
  useEffect(() => void loadSave(keysFor(profile.id, firstId).save).then(setSave), [profile.id, firstId]);
  const creature = save?.phase === "alive" || save?.phase === "dead" ? save.creature : null;
  const sprite = creature ? faceSprite(getForm(creature.formId), "open") : eggSprite(save?.egg?.pattern ?? "speckled");
  const id = creature ? `who:${creature.formId}` : `who:egg:${save?.egg?.pattern ?? "speckled"}`;
  return (
    <li>
      <button class="btn who-tile" onClick={() => onPick(profile)}>
        <Pic sprite={sprite} id={id} px={Math.round(sprite.rows.length * 2)} />
        <span class="who-tile-name">{profile.name}</span>
      </button>
    </li>
  );
}

export function Picker({ list, onPick }: { list: Profile[]; onPick: (profile: Profile) => void }) {
  const firstId = list[0]!.id;
  return (
    <main class="app picker">
      <h1 class="picker-title">Who is playing?</h1>
      <ul class="picker-grid">
        {list.map((profile) => (
          <Tile key={profile.id} profile={profile} firstId={firstId} onPick={onPick} />
        ))}
      </ul>
    </main>
  );
}
