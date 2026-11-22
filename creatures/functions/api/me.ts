// GET /api/me: who is signed in here, or 401.
import { requireSession } from "../_lib/auth";
import { json, route, wrongMethod } from "../_lib/response";

export const onRequestGet = route(async (ctx) => {
  const { email } = await requireSession(ctx, Date.now());
  return json({ email });
});

export const onRequest = (): Response => wrongMethod("GET");
