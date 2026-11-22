// The players of the signed in account: the "who is playing" chip under the header, and the Players part of Settings (see who is
// there, rename, add). Anyone in Settings can use it in this slice; the grown-up lock comes with the PINs (docs/profiles-plan.md).
import { useEffect, useState } from "preact/hooks";
import { NAME_MAX } from "../sync/profiles";
import type { Profile, ProfileKind } from "../sync/profiles";
import type { Roster } from "../sync/roster";

export function useRoster(roster: Roster): void {
  const [, setCount] = useState(0);
  useEffect(() => roster.subscribe(() => setCount((n) => n + 1)), [roster]);
}

const kindText = (kind: ProfileKind): string => (kind === "adult" ? "Grown-up" : "Kid");

// The name of the profile that is open now.
export function openName(roster: Roster): string {
  const id = roster.openId ?? roster.firstId;
  return roster.list?.find((profile) => profile.id === id)?.name ?? "";
}

// Under the header, only when there is someone else to switch to. Tapping it saves the game and goes back to "who is playing?".
export function WhoChip({ roster, onSwitch }: { roster: Roster; onSwitch: () => void }) {
  useRoster(roster);
  if (!roster.canSwitch) return null;
  return (
    <button class="btn small who" onClick={onSwitch} aria-label={`Playing as ${openName(roster)}. Switch player`}>
      <span class="who-name">{openName(roster)}</span>
      <span class="who-switch">Switch player</span>
    </button>
  );
}

function Row({ roster, profile }: { roster: Roster; profile: Profile }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [problem, setProblem] = useState("");
  const playing = profile.id === (roster.openId ?? roster.firstId);

  const save = async (event: Event): Promise<void> => {
    event.preventDefault();
    const failure = await roster.rename(profile.id, name);
    if (failure) return setProblem(failure);
    setProblem("");
    setEditing(false);
  };

  if (!editing) {
    return (
      <li class="player">
        <span class="player-name">
          {profile.name}
          <span class="player-kind">
            {kindText(profile.kind)}
            {playing && ", playing now"}
          </span>
        </span>
        <button
          class="btn small"
          disabled={roster.busy}
          aria-label={`Rename ${profile.name}`}
          onClick={() => {
            setName(profile.name);
            setProblem("");
            setEditing(true);
          }}
        >
          Rename
        </button>
      </li>
    );
  }
  return (
    <li class="player">
      <form class="player-edit" onSubmit={save}>
        <label class="stack">
          New name for {profile.name}
          <input type="text" value={name} maxLength={NAME_MAX * 2} autoComplete="off" onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        {problem && (
          <p class="notice" role="alert">
            {problem}
          </p>
        )}
        <div class="row">
          <button type="submit" class="btn small" disabled={roster.busy}>
            Save name
          </button>
          <button type="button" class="btn small" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}

function AddForm({ roster }: { roster: Roster }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ProfileKind>("kid");
  const [problem, setProblem] = useState("");

  const add = async (event: Event): Promise<void> => {
    event.preventDefault();
    const failure = await roster.add(name, kind);
    if (failure) return setProblem(failure);
    setProblem("");
    setName("");
  };

  return (
    <form class="player-add" onSubmit={add}>
      <label class="stack">
        Add a player
        <input type="text" value={name} maxLength={NAME_MAX * 2} autoComplete="off" placeholder="Name" onInput={(e) => setName(e.currentTarget.value)} />
      </label>
      <div class="row">
        <button type="button" class="btn small" aria-pressed={kind === "kid"} onClick={() => setKind("kid")}>
          Kid
        </button>
        <button type="button" class="btn small" aria-pressed={kind === "adult"} onClick={() => setKind("adult")}>
          Grown-up
        </button>
        <button type="submit" class="btn small" disabled={roster.busy}>
          Add
        </button>
      </div>
      {problem && (
        <p class="notice" role="alert">
          {problem}
        </p>
      )}
    </form>
  );
}

export function PlayersSection({ roster }: { roster: Roster }) {
  useRoster(roster);
  useEffect(() => void roster.refresh(), [roster]); // opening Settings looks at the account's list again
  if (!roster.signedIn) return null;
  return (
    <fieldset>
      <legend>Players</legend>
      {roster.list === null ? (
        <p class="hint">{roster.message || "Loading the players…"}</p>
      ) : (
        <>
          <ul class="players">
            {roster.list.map((profile) => (
              <Row key={profile.id} roster={roster} profile={profile} />
            ))}
          </ul>
          {roster.message && <p class="hint">{roster.message}</p>}
          {roster.switchBlocked && (
            <p class="hint">This browser cannot remember who is playing (a private window, or blocked site data), so {roster.list[0]?.name} plays every time.</p>
          )}
          {roster.canAdd ? <AddForm roster={roster} /> : <p class="hint">An account can have up to 8 players.</p>}
        </>
      )}
    </fieldset>
  );
}
