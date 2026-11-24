// Keeping the account's copy of the game up to date (docs/cloud-saves.md). The game is always saved on this device first; this file
// only sends copies to the account and brings a newer one back. Nothing here is needed to play, and while signed out it sends nothing (it only marks play as changed, see noteSave).
import { migrateSave } from "../game/state";
import type { Save } from "../game/state";
import type { CloudError, PutReply, Reply, SavePut, ServerSave } from "./cloud";

export const SYNC_DELAY_MS = 30_000; // after the first save on this device that has not been sent yet
export const RETRY_MS = 60_000; // after the server could not be reached
export const WAIT_MS = 5 * 60_000; // after "too many tries"

// What this device remembers about the account (kept in IndexedDB, see local.ts). `revision` is the account's save this device last
// matched (0: never), `savedAt` when this device last wrote its game, `dirty` that it has written since the last sync.
export interface CloudMeta {
  username: string;
  signedIn: boolean;
  revision: number;
  savedAt: number;
  dirty: boolean;
}

const isWhole = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

export function parseMeta(raw: unknown): CloudMeta | null {
  if (typeof raw !== "object" || raw === null) return null;
  const meta = raw as Partial<CloudMeta>;
  if (typeof meta.username !== "string" || typeof meta.signedIn !== "boolean" || typeof meta.dirty !== "boolean") return null;
  if (!isWhole(meta.revision) || !isWhole(meta.savedAt)) return null;
  return { username: meta.username, signedIn: meta.signedIn, revision: meta.revision, savedAt: meta.savedAt, dirty: meta.dirty };
}

// A device that could not load its own game starts a new egg. That egg says nothing about the account's game, so the device counts
// as one that never synced (otherwise its first tap would send the egg over the account's game).
export const metaForNewGame = (meta: CloudMeta | null): CloudMeta | null => (meta ? { ...meta, revision: 0, savedAt: 0, dirty: false } : null);

// An egg nobody has done anything with: nothing here is worth keeping over a game from the account.
export function isUntouched(save: Save): boolean {
  return (
    save.phase === "egg" &&
    save.egg !== null &&
    save.egg.shavedMinutes === 0 &&
    save.creature === null &&
    save.coins === 0 &&
    Object.values(save.inventory).every((count) => !count) &&
    save.hauls.length === 0 &&
    save.owned.length === 0 &&
    save.lastBuy === null &&
    save.log.length <= 1
  );
}

export type Plan = "nothing" | "push" | "adopt" | "ask";

// What to do once the account's save has been looked at.
export function planAfterPull(meta: CloudMeta, untouched: boolean, server: ServerSave): Plan {
  if (server.save === null) return untouched ? "nothing" : "push"; // the account has no game yet
  if (meta.revision === 0) return untouched ? "adopt" : "ask"; // this device never synced with it: never decide for the player
  if (meta.revision === server.revision) return meta.dirty ? "push" : "nothing";
  return meta.dirty ? "push" : "adopt"; // another device saved since: the server decides which is newer when this one pushes
}

export interface Api {
  signIn(username: string, password: string): Promise<Reply<{ username: string }>>;
  signUp(username: string, password: string, code: string): Promise<Reply<{ username: string }>>;
  signOut(): Promise<Reply<unknown>>;
  fetchSave(): Promise<Reply<ServerSave>>;
  sendSave(put: SavePut): Promise<Reply<PutReply>>;
}

export interface Store {
  writeMeta(meta: CloudMeta): Promise<void>;
}

// The part of the live game this file uses (ui/game.ts).
export interface GameLike {
  save: Save;
  onSave: ((byPlayer: boolean) => void) | null; // byPlayer: something the player did, not only the clock moving on
  replaceSave(save: Save): void;
  saveNow(): void;
}

export class CloudSync {
  busy = false;
  message = ""; // the last thing worth telling the player
  lastSyncedAt: number | null = null;
  choosing: ServerSave | null = null; // the account's game, while the player picks which game to keep
  private meta: CloudMeta | null;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private armed = false;
  private queue: Promise<void> = Promise.resolve();
  private active = 0;
  private edits = 0; // counts saves on this device, to tell whether the game changed while a send was on its way

  constructor(
    private readonly game: GameLike,
    meta: CloudMeta | null,
    private readonly api: Api,
    private readonly store: Store,
    private readonly clock: () => number = Date.now,
  ) {
    this.meta = meta;
    game.onSave = (byPlayer) => this.noteSave(byPlayer);
  }

  // Who is signed in (null: nobody), and the last username used here, to fill in the form again.
  get username(): string | null {
    return this.meta?.signedIn ? this.meta.username : null;
  }
  get lastUsername(): string {
    return this.meta?.username ?? "";
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.meta?.signedIn) void this.sync();
  }

  // Look at the account's game, and send or fetch whatever is needed.
  sync(): Promise<void> {
    return this.run(() => this.pull());
  }

  // The page is going away: send what is waiting now, without looking first. (A device that has not met the account yet, revision 0,
  // sends nothing this way: the look decides, and may ask the player.)
  flush(): void {
    if (!this.meta?.signedIn) return;
    this.game.saveNow(); // (a change by the player that is still waiting to be saved is saved, and counted, now)
    if (this.meta.dirty && this.meta.revision > 0) void this.run(() => this.push());
  }

  // Both return a message for the player when it did not work, and null when it did.
  async signIn(username: string, password: string): Promise<string | null> {
    return this.enter(await this.api.signIn(username, password));
  }
  async signUp(username: string, password: string, code: string): Promise<string | null> {
    return this.enter(await this.api.signUp(username, password, code));
  }

  async signOut(): Promise<void> {
    await this.run(async () => {
      const meta = this.current();
      if (meta?.dirty && meta.revision > 0) {
        this.game.saveNow();
        await this.push(); // what is waiting goes first; if that fails the game is still on this device
      }
    });
    this.cancel();
    const reply = await this.api.signOut();
    if (this.meta) await this.setMeta({ ...this.meta, signedIn: false });
    this.choosing = null;
    this.message = reply.ok ? "" : "Signed out on this device. The server could not be reached to end the session there.";
    this.notify();
  }

  // The player's answer when both this device and the account have a game. The account is looked at again first: it may have changed
  // while the question was open, and then the player is asked again. Either way the game that is not kept ends up in the account's
  // backups. The question stays until the answer has been sent.
  choose(which: "device" | "account"): Promise<void> {
    return this.run(async () => {
      const asked = this.choosing;
      if (!asked || !this.current()) return;
      const reply = await this.api.fetchSave();
      if (!this.current()) return;
      if (!reply.ok) return this.failed(reply.error);
      const server = reply.value;
      if (server.revision !== asked.revision) {
        this.choosing = server;
        this.message = "Your account's game changed while you were deciding. Please choose again.";
        return;
      }
      // Sent as a save from a device that never synced (base revision 0), so the server always keeps the older one as a backup.
      // This device's game: dated after the account's, so it is kept. The account's game: dated 0, so the server keeps its own game,
      // stores this device's game as a backup, and answers with its game, which is then taken.
      const savedAt = which === "device" ? Math.max(this.clock(), server.savedAt + 1) : 0;
      await this.push({ baseRevision: 0, savedAt, save: this.game.save });
    });
  }

  // ---- inside ----

  private async enter(reply: Reply<{ username: string }>): Promise<string | null> {
    if (!reply.ok) return reply.error.message;
    const username = reply.value.username;
    const known = this.meta?.username === username ? this.meta : null; // the same account as last time keeps what this device knew of it
    await this.setMeta(known ? { ...known, signedIn: true } : { username, signedIn: true, revision: 0, savedAt: 0, dirty: false });
    this.choosing = null;
    this.message = "";
    void this.sync();
    this.notify();
    return null;
  }

  private current(): CloudMeta | null {
    return this.meta?.signedIn ? this.meta : null;
  }

  private async setMeta(meta: CloudMeta): Promise<void> {
    this.meta = meta;
    await this.store.writeMeta(meta);
  }

  // The game was just saved on this device. A save that only carries the clock forward does not count: every device the player is not
  // using would otherwise keep a newer save than the one in use, and win. (The game moves on by itself, in the same way on every device.)
  // Play done while signed out counts too, once this device has met an account: it is marked as changed (and dated) but not sent, so the
  // next sign in sends it and the server's newest-save-wins rule decides. Without the mark, an account game saved by another device in
  // the meantime would simply replace it, with no backup.
  private noteSave(byPlayer: boolean): void {
    const meta = this.meta;
    if (!meta || !byPlayer) return;
    this.edits += 1;
    void this.setMeta({ ...meta, dirty: true, savedAt: this.clock() });
    if (meta.signedIn && !this.armed) this.arm(SYNC_DELAY_MS); // not pushed back by later saves, so a long run of taps cannot hold the send off for ever
  }

  private arm(ms: number): void {
    clearTimeout(this.timer);
    this.armed = true;
    this.timer = setTimeout(() => {
      this.armed = false;
      void this.sync();
    }, ms);
  }

  private cancel(): void {
    clearTimeout(this.timer);
    this.armed = false;
  }

  // One job at a time, so two sends never cross.
  private run(task: () => Promise<void>): Promise<void> {
    const result = this.queue.then(async () => {
      this.active += 1;
      this.busy = true;
      this.notify();
      try {
        await task();
      } catch {
        this.message = "Something went wrong while saving to your account. Your game is still saved on this device.";
      } finally {
        this.active -= 1;
        this.busy = this.active > 0;
        this.notify();
      }
    });
    this.queue = result;
    return result;
  }

  private async pull(): Promise<void> {
    if (!this.current()) return;
    const reply = await this.api.fetchSave();
    const meta = this.current();
    if (!meta) return; // signed out while waiting
    if (!reply.ok) return this.failed(reply.error);
    const server = reply.value;
    const plan = planAfterPull(meta, isUntouched(this.game.save), server);
    if (plan === "ask") {
      this.choosing = server;
      this.message = "";
      return;
    }
    this.choosing = null;
    if (plan === "push") await this.push();
    else if (plan === "adopt") await this.adopt(server);
    else this.synced();
  }

  private async push(forced?: SavePut): Promise<void> {
    const meta = this.current();
    if (!meta) return;
    const edits = this.edits;
    const put = forced ?? { baseRevision: meta.revision, savedAt: meta.dirty ? meta.savedAt : this.clock(), save: this.game.save };
    const reply = await this.api.sendSave(put);
    const now = this.current();
    if (!now || now.username !== meta.username) return;
    if (!reply.ok) return this.failed(reply.error);
    if (reply.value.status === "kept-server") return this.adopt(reply.value); // the account's game was newer
    await this.setMeta({ ...now, revision: reply.value.revision, dirty: this.edits !== edits });
    this.synced();
  }

  // Replace this device's game with the account's. Only reached when nothing of the player's is lost: this device's game is an untouched
  // egg, or has not changed since it last matched the account, or the server has just stored it as a backup.
  private async adopt(server: ServerSave): Promise<void> {
    const meta = this.current();
    if (!meta) return;
    const save = migrateSave(server.save);
    if (!save) {
      this.message = "The game saved in your account could not be read, so this device keeps its own.";
      this.notify();
      return;
    }
    this.game.replaceSave(save);
    this.game.saveNow(); // (the game from the account is not a change by the player, so this does not count as one)
    this.cancel();
    await this.setMeta({ ...meta, revision: server.revision, savedAt: server.savedAt, dirty: false });
    this.synced();
  }

  private synced(): void {
    this.lastSyncedAt = this.clock();
    this.choosing = null;
    this.message = "";
    this.notify();
  }

  private failed(error: CloudError): void {
    this.message = error.message;
    if (error.kind === "signed-out") {
      this.cancel();
      if (this.meta) void this.setMeta({ ...this.meta, signedIn: false });
    } else if (error.kind === "offline" || error.kind === "again") {
      this.arm(RETRY_MS);
    } else if (error.kind === "wait") {
      this.arm(WAIT_MS);
    } // "refused" is not tried again until the game is next saved
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
