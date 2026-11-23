// POST /api/login { username, key }: signs in. A wrong username and a wrong password get the same answer and take the same steps.
import { DUMMY_HASH, assertNotLimited, checkKey, clientIp, startSession } from "../_lib/auth";
import * as db from "../_lib/db";
import { HttpError, json, route, wrongMethod } from "../_lib/response";
import { SMALL_BODY, parseLogin, readJsonObject, requireSameSiteJson } from "../_lib/validation";

export const onRequestPost = route(async ({ request, env }) => {
  requireSameSiteJson(request);
  const { username, key } = parseLogin(await readJsonObject(request, SMALL_BODY));
  const now = Date.now();
  const ip = clientIp(request);
  await assertNotLimited(env, "login", username, ip, now);
  const account = await db.findAccount(env, username);
  const keyIsRight = await checkKey(key, account?.password_hash ?? DUMMY_HASH);
  if (!account || !keyIsRight) {
    await db.recordFailure(env, "login", username, ip, now);
    throw new HttpError(401, "That username or password is not right.");
  }
  await db.clearFailures(env, "login", username);
  await db.purgeExpired(env, now);
  return json({ username: account.username }, 200, [await startSession(env, account.id, now)]);
});

export const onRequest = (): Response => wrongMethod("POST");
