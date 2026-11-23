// Entry point: find out who is signed in and which profile to play, load that profile's game (or start a new egg) and show the screen.
// One page plays one profile: switching saves, sends, and reloads (docs/profiles-plan.md decision 8), so a page never holds two games.
import { render } from "preact";
import { newSave } from "./game/state";
import * as api from "./sync/cloud";
import { canRemember, readChoice, writeChoice } from "./sync/choice";
import { loadCloudMeta, loadRoster, loadSave, writeCloudMeta, writeRoster } from "./sync/local";
import type { Profile } from "./sync/profiles";
import { FIRST_KEYS, Roster, decideStart, keysFor, metaForProfile, parseStoredRoster } from "./sync/roster";
import { CloudSync, metaForNewGame, parseMeta } from "./sync/sync";
import type { Api, CloudMeta } from "./sync/sync";
import { App } from "./ui/App";
import { Game } from "./ui/game";
import { Picker } from "./ui/Picker";
import "./ui/app.css";

async function start(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;
  const device = parseMeta(await loadCloudMeta()); // the device's account record (the first profile's): the one place that says who is signed in
  const remember = canRemember();
  const decision = decideStart({
    username: device?.signedIn ? device.username : null,
    roster: parseStoredRoster(await loadRoster()),
    chosen: readChoice(),
    canRemember: remember,
  });
  root.textContent = ""; // remove the "loading" text from index.html
  if (decision.kind === "pick") {
    const { list } = decision;
    let opening = false;
    const onPick = (profile: Profile): void => {
      if (opening) return; // a second tap while the first game loads must not start a second game on the same key
      opening = true;
      writeChoice(profile.id);
      void open(root, device, remember, profile, list);
    };
    render(<Picker list={list} onPick={onPick} />, root);
    return;
  }
  await open(root, device, remember, decision.profile, decision.list);
}

// profile null: the first profile, with no list known (a signed out device, or a signed in one that has not met the list yet).
async function open(root: HTMLElement, device: CloudMeta | null, remember: boolean, profile: Profile | null, list: Profile[] | null): Promise<void> {
  const keys = profile === null ? FIRST_KEYS : keysFor(profile.id, list?.[0]?.id ?? null);
  const isFirst = keys === FIRST_KEYS;
  const saved = await loadSave(keys.save);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
  const game = new Game(saved ?? newSave(Date.now(), seed), keys.save); // catches up on time away
  void game.saveNow();

  // The first profile reads its own record, as before. Another profile takes who is signed in from the device's record, and only its
  // revision and changed mark from its own (a profile opened for the first time here has none: it starts as one that never synced).
  const own = parseMeta(await loadCloudMeta(keys.cloud));
  const meta = isFirst || device === null ? own : metaForProfile(device, own);
  const profileId = isFirst ? null : profile!.id; // null: the account's first profile, which is what the server answers without one
  const cloudApi: Api = { ...api, fetchSave: () => api.fetchSave(profileId), sendSave: (put) => api.sendSave(put, profileId) };
  const cloud = new CloudSync(game, saved ? meta : metaForNewGame(meta), cloudApi, { writeMeta: (record) => writeCloudMeta(record, keys.cloud) }); // (no saved game: a new egg)
  cloud.start(); // signed out (the usual case): does nothing

  const roster = new Roster(
    device?.signedIn ? device.username : null,
    list,
    profile?.id ?? null,
    remember,
    { list: api.fetchProfiles, add: api.addProfile, rename: api.renameProfile },
    { write: writeRoster },
  );
  void roster.refresh();

  let ending = false;
  cloud.subscribe(() => {
    void roster.account(cloud.username); // signed in or out in Settings
    if (cloud.username === null) writeChoice(null); // nobody is signed in: an old choice must not open a profile when someone signs in again
    if (!isFirst && cloud.username === null && !ending) {
      // The session ended while another profile was open. The device's record is what says who is signed in, so it is changed here
      // (read again first, so nothing another window wrote is lost), and the page reloads into single player.
      ending = true;
      void endDeviceSession();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") cloud.flush();
    else {
      void cloud.sync();
      void roster.refresh();
    }
  });

  // Save, send, forget the choice and reload: the picker comes up (the account has 2 or more players, or there would be no chip).
  const onSwitch = async (): Promise<void> => {
    await game.saveNow();
    cloud.flush();
    writeChoice(null);
    window.location.reload();
  };

  render(<App game={game} cloud={cloud} roster={roster} onSwitch={() => void onSwitch()} />, root);
}

async function endDeviceSession(): Promise<void> {
  const record = parseMeta(await loadCloudMeta());
  if (record) await writeCloudMeta({ ...record, signedIn: false });
  writeChoice(null);
  window.location.reload();
}

void start();
