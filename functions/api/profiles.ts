// The profiles of the signed in account (docs/profiles-plan.md).
//   GET   /api/profiles                    -> { profiles: [{ id, name, kind }] }, the first profile first
//   POST  /api/profiles { name, kind }     -> 201 { id, name, kind }: adds a profile (up to 8 per account, names unique ignoring case)
//   PATCH /api/profiles { id, name }       -> { id, name, kind }: renames one
// A profile that is another account's answers 404, the same as one that does not exist.
import { requireSession } from "../_lib/auth";
import * as db from "../_lib/db";
import { json, route, wrongMethod } from "../_lib/response";
import { SMALL_BODY, parseProfileCreate, parseProfileRename, readJsonObject, requireSameSiteJson } from "../_lib/validation";

export const onRequestGet = route(async (ctx) => {
  const { accountId } = await requireSession(ctx, Date.now());
  return json({ profiles: await db.listProfiles(ctx.env, accountId) });
});

export const onRequestPost = route(async (ctx) => {
  requireSameSiteJson(ctx.request);
  const now = Date.now();
  const { accountId } = await requireSession(ctx, now);
  const { name, kind } = parseProfileCreate(await readJsonObject(ctx.request, SMALL_BODY));
  return json(await db.createProfile(ctx.env, accountId, name, kind, now), 201);
});

export const onRequestPatch = route(async (ctx) => {
  requireSameSiteJson(ctx.request);
  const { accountId } = await requireSession(ctx, Date.now());
  const { id, name } = parseProfileRename(await readJsonObject(ctx.request, SMALL_BODY));
  return json(await db.renameProfile(ctx.env, accountId, id, name));
});

export const onRequest = (): Response => wrongMethod("GET, POST, PATCH");
