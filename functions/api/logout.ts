// POST /api/logout {}: ends this browser's session. Signing out when not signed in is fine.
import { clearedCookie, readToken, tokenHash } from "../_lib/auth";
import * as db from "../_lib/db";
import { json, route, wrongMethod } from "../_lib/response";
import { SMALL_BODY, parseEmpty, readJsonObject, requireSameSiteJson } from "../_lib/validation";

export const onRequestPost = route(async ({ request, env }) => {
  requireSameSiteJson(request);
  parseEmpty(await readJsonObject(request, SMALL_BODY));
  const token = readToken(request);
  if (token) await db.deleteSession(env, await tokenHash(token));
  return json({ ok: true }, 200, [clearedCookie()]);
});

export const onRequest = (): Response => wrongMethod("POST");
