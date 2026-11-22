// The device's side of profiles (docs/profiles-plan.md): which profile to open at start, where each profile's game is kept on this
// device, and the list of the account's profiles (the "roster").
import type { Reply } from "./cloud";
import { MAX_PROFILES, NAME_HELP, isValidName, nameKey, normalizeName, parseProfileList } from "./profiles";
import type { Profile, ProfileKind } from "./profiles";
import type { CloudMeta } from "./sync";

// Where a profile's game and its account record are kept on this device. The first profile keeps the keys the game used before
// profiles existed, so nothing is moved and a page from before profiles still finds its game.
export interface ProfileKeys {
  save: string;
  cloud: string;
}
export const FIRST_KEYS: ProfileKeys = { save: "save", cloud: "cloud" };
export const keysFor = (id: number, firstId: number | null): ProfileKeys => (id === firstId ? FIRST_KEYS : { save: `save:${id}`, cloud: `cloud:${id}` });

// The last list from the account, kept so the "who is playing" screen works offline. Tagged with the username, so a list that belongs
// to another account is never used.
export interface StoredRoster {
  username: string;
  list: Profile[];
}

export function parseStoredRoster(raw: unknown): StoredRoster | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { username, list } = raw as { username?: unknown; list?: unknown };
  const profiles = parseProfileList(list);
  return typeof username === "string" && profiles ? { username, list: profiles } : null;
}

// What to show at start. "open": a profile is chosen (the first one when no list is known: a signed out device, or a signed in one that
// has not met the list yet, as today). "pick": the "who is playing" screen.
export type Start = { kind: "open"; profile: Profile | null; list: Profile[] | null } | { kind: "pick"; list: Profile[] };

export interface StartInput {
  username: string | null; // who is signed in on this device (null: nobody)
  roster: StoredRoster | null;
  chosen: number | null; // the profile picked in this session (survives a reload)
  canRemember: boolean; // false when the session choice cannot be kept (a blocked or private window): the first profile plays, no picker
}

// The order matters: a list that belongs to the account that is signed in comes first (nobody signed in, or a list tagged with another
// username, means the first profile, so an old choice cannot open another profile's game on a device that is signed out), then the
// choice, then the picker.
export function decideStart({ username, roster, chosen, canRemember }: StartInput): Start {
  if (roster === null || roster.username !== username) return { kind: "open", profile: null, list: null };
  const { list } = roster;
  const first = list[0]!;
  if (list.length === 1 || !canRemember) return { kind: "open", profile: first, list };
  const picked = list.find((profile) => profile.id === chosen);
  return picked ? { kind: "open", profile: picked, list } : { kind: "pick", list };
}

// The account record of a profile other than the first. Who is signed in comes from the device's record (the first profile's), and
// only the revision, the time and the changed mark come from the profile's own record, and only when it is the same account's.
// Without a record of its own a profile starts as one that never synced.
export function metaForProfile(device: CloudMeta, own: CloudMeta | null): CloudMeta {
  const same = own !== null && own.username === device.username;
  return { username: device.username, signedIn: device.signedIn, revision: same ? own.revision : 0, savedAt: same ? own.savedAt : 0, dirty: same ? own.dirty : false };
}

// ---- the list, kept in step with the account ----

export interface RosterApi {
  list(): Promise<Reply<Profile[]>>;
  add(name: string, kind: ProfileKind): Promise<Reply<Profile>>;
  rename(id: number, name: string): Promise<Reply<Profile>>;
}
export interface RosterStore {
  write(record: StoredRoster): Promise<void>;
}

export class Roster {
  list: Profile[] | null; // null: not known on this device yet
  message = ""; // the last thing worth telling the player
  busy = false;
  private listeners = new Set<() => void>();

  constructor(
    private username: string | null,
    list: Profile[] | null,
    public openId: number | null, // the profile that is open (null: the first one, when the list is not known yet)
    private readonly canRemember: boolean,
    private readonly api: RosterApi,
    private readonly store: RosterStore,
  ) {
    this.list = list;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  get signedIn(): boolean {
    return this.username !== null;
  }
  get firstId(): number | null {
    return this.list?.[0]?.id ?? null;
  }
  get openIsFirst(): boolean {
    return this.openId === null || this.openId === this.firstId;
  }
  // The "switch player" chip shows when there is someone else to switch to, and the choice can be kept.
  get canSwitch(): boolean {
    return this.signedIn && this.canRemember && (this.list?.length ?? 0) >= 2;
  }
  get canAdd(): boolean {
    return this.signedIn && (this.list?.length ?? 0) < MAX_PROFILES;
  }
  // Signed in with players to switch between, but a choice cannot be kept (a blocked or private window): there is no chip and no
  // picker, and Settings says why.
  get switchBlocked(): boolean {
    return this.signedIn && !this.canRemember && (this.list?.length ?? 0) >= 2;
  }

  // Who is signed in changed (the player signed in or out in Settings, which only the first profile offers). What was known belongs to
  // the account that was here: the list is dropped, and the open profile is the first one of whoever signs in. Signing in fetches the
  // list; signing out hides it.
  account(username: string | null): Promise<void> {
    if (username === this.username) return Promise.resolve();
    this.username = username;
    this.list = null;
    this.openId = null;
    this.message = "";
    this.notify();
    return username === null ? Promise.resolve() : this.refresh();
  }

  // Looks at the account's list. Called at start, when the page comes back to the front, when Settings opens, and after signing in. A
  // failure keeps what is known (offline is the usual reason) and only says so when nothing is.
  async refresh(): Promise<void> {
    const username = this.username;
    if (username === null) return;
    const reply = await this.api.list();
    if (this.username !== username) return; // the player signed out or in as someone else while it was on its way
    if (reply.ok) await this.take(reply.value);
    else if (this.list === null || reply.error.kind === "refused") this.message = "The players could not be loaded."; // (offline with a list on hand is not worth saying)
    this.notify();
  }

  // Both return a message for the player when it did not work, and null when it did.
  async add(name: string, kind: ProfileKind): Promise<string | null> {
    const problem = this.check(name, null);
    if (problem) return problem;
    return this.change(async () => {
      const username = this.username;
      const reply = await this.api.add(normalizeName(name), kind);
      if (this.username !== username || this.list === null) return null; // signed out, or in as someone else, while it was on its way: the list it was for is gone
      if (!reply.ok) return reply.error.message;
      const added = reply.value;
      await this.take(this.list.some((profile) => profile.id === added.id) ? this.list : [...this.list, added]); // (a look at the account may have seen it first)
      return null;
    });
  }

  async rename(id: number, name: string): Promise<string | null> {
    const problem = this.check(name, id);
    if (problem) return problem;
    return this.change(async () => {
      const username = this.username;
      const reply = await this.api.rename(id, normalizeName(name));
      if (this.username !== username || this.list === null) return null;
      if (!reply.ok) return reply.error.message;
      const renamed = reply.value;
      await this.take(this.list.map((profile) => (profile.id === id ? renamed : profile)));
      return null;
    });
  }

  // The same rules the server applies, so the player hears about a bad name at once (the server still decides).
  private check(name: string, ownId: number | null): string | null {
    if (this.list === null) return "The players are not loaded yet."; // the answer would be stored as the whole list
    const clean = normalizeName(name);
    if (!isValidName(clean)) return NAME_HELP;
    const key = nameKey(clean);
    if (this.list?.some((profile) => profile.id !== ownId && nameKey(profile.name) === key)) return "You already have a player with that name.";
    if (ownId === null && (this.list?.length ?? 0) >= MAX_PROFILES) return `An account can have up to ${MAX_PROFILES} players.`;
    return null;
  }

  private async change(task: () => Promise<string | null>): Promise<string | null> {
    if (this.busy) return "One moment, the last change is still being saved.";
    this.busy = true;
    this.notify();
    try {
      return await task();
    } finally {
      this.busy = false;
      this.notify();
    }
  }

  private async take(list: Profile[]): Promise<void> {
    this.list = list;
    this.message = "";
    if (this.username !== null) await this.store.write({ username: this.username, list });
  }
}
