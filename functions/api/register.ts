// POST /api/register { username, key, code }: makes an account and signs it in. The family code is a secret set in the Cloudflare
// dashboard; without one the door stays shut.
import { assertNotLimited, clientIp, hashKey, sameSecret, startSession } from "../_lib/auth";
import * as db from "../_lib/db";
import { HttpError, json, route, wrongMethod } from "../_lib/response";
import { SMALL_BODY, parseRegister, readJsonObject, requireSameSiteJson } from "../_lib/validation";

export const onRequestPost = route(async ({ request, env }) => {
  requireSameSiteJson(request);
  const { username, key, code } = parseRegister(await readJsonObject(request, SMALL_BODY));
  if (!env.SIGNUP_CODE) throw new HttpError(403, "Signing up is closed.");
  const now = Date.now();
  const ip = clientIp(request);
  await assertNotLimited(env, "register", null, ip, now);
  if (!(await sameSecret(code, env.SIGNUP_CODE))) {
    await db.recordFailure(env, "register", "", ip, now);
    throw new HttpError(403, "That family code is not right.");
  }
  await db.purgeExpired(env, now);
  const accountId = await db.createAccount(env, username, await hashKey(key), now);
  return json({ username }, 201, [await startSession(env, accountId, now)]);
});

export const onRequest = (): Response => wrongMethod("POST");
