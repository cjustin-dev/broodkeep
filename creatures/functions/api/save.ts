// GET /api/save: the cloud save. PUT /api/save { baseRevision, savedAt, save }: send one (saves.ts says which save is kept).
import { requireSession } from "../_lib/auth";
import * as db from "../_lib/db";
import { json, route, wrongMethod } from "../_lib/response";
import { putSave, readSave } from "../_lib/saves";
import { SAVE_BODY_MAX, parseSavePut, readJsonObject, requireSameSiteJson } from "../_lib/validation";

export const onRequestGet = route(async (ctx) => {
  const { accountId } = await requireSession(ctx, Date.now());
  return json(await readSave(ctx.env, await db.firstProfileId(ctx.env, accountId)));
});

export const onRequestPut = route(async (ctx) => {
  requireSameSiteJson(ctx.request);
  const now = Date.now();
  const { accountId } = await requireSession(ctx, now); // before the body is read, so a stranger cannot make the server read a big upload
  const input = parseSavePut(await readJsonObject(ctx.request, SAVE_BODY_MAX), now);
  return json(await putSave(ctx.env, await db.firstProfileId(ctx.env, accountId), input, now));
});

export const onRequest = (): Response => wrongMethod("GET, PUT");
