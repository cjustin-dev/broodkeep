// Which save the server keeps (docs/cloud-saves.md section 2). Each device sends the save with `baseRevision`, the revision it last
// synced. If that is still the server's revision, nothing else happened in between and the save is accepted. If not, another device
// saved meanwhile: the newer `savedAt` wins and the loser is kept as a backup, never thrown away.
import { HttpError } from "./response";
import * as db from "./db";
import type { SavePut } from "./validation";
import type { Env } from "./types";

export const BACKUP_EVERY_MS = 30 * 60_000;
export const BACKUPS_KEPT = 10;

export type PutResult =
  | { status: "saved"; revision: number }
  | { status: "kept-server"; revision: number; savedAt: number; save: unknown };

const tryAgain = (): HttpError => new HttpError(409, "Please try again.");

export async function putSave(env: Env, profileId: number, input: SavePut, now: number): Promise<PutResult> {
  const current = await db.getSaveRow(env, profileId);

  if (!current) {
    try {
      await db.insertFirstSave(env, profileId, input.savedAt, input.data);
    } catch (error) {
      if (db.isUniqueViolation(error)) throw tryAgain(); // another device saved first, a moment ago
      throw error;
    }
    return { status: "saved", revision: 1 };
  }

  const conflict = input.baseRevision !== current.revision;
  if (conflict && input.savedAt <= current.savedAt) {
    // The server's save is newer (or the same age): it stays, and the device's save is kept as a backup.
    await db.addBackup(env, profileId, input.baseRevision, input.savedAt, input.data, now, BACKUPS_KEPT);
    return { status: "kept-server", revision: current.revision, savedAt: current.savedAt, save: JSON.parse(current.data) };
  }

  if (!(await db.replaceSaveRow(env, profileId, current.revision, input.savedAt, input.data))) throw tryAgain();
  const newest = await db.newestBackupTime(env, profileId);
  if (conflict || newest === null || now - newest >= BACKUP_EVERY_MS) {
    await db.addBackup(env, profileId, current.revision, current.savedAt, current.data, now, BACKUPS_KEPT);
  }
  return { status: "saved", revision: current.revision + 1 };
}

export async function readSave(env: Env, profileId: number): Promise<{ revision: number; savedAt: number; save: unknown }> {
  const row = await db.getSaveRow(env, profileId);
  return row ? { revision: row.revision, savedAt: row.savedAt, save: JSON.parse(row.data) } : { revision: 0, savedAt: 0, save: null };
}
