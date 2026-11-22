// Every API answer is built here. Cloudflare does not apply public/_headers to Functions, so this file sets the headers itself.
import type { Context } from "./types";

const HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
};

// A message for the player and a status, thrown anywhere in a route and turned into an answer by route() below.
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: [string, string][] = [],
  ) {
    super(message);
  }
}

// extra: more headers, such as Set-Cookie (appended, so an answer can carry several).
export function json(body: unknown, status = 200, extra: [string, string][] = []): Response {
  const headers = new Headers(HEADERS);
  for (const [name, value] of extra) headers.append(name, value);
  return new Response(JSON.stringify(body), { status, headers });
}

export const errorResponse = (status: number, message: string, extra: [string, string][] = []): Response => json({ error: message }, status, extra);

// Wraps a route: an HttpError becomes its answer, anything else is logged (the error's name and message only, never the request) and
// answered with a plain 500 that says nothing about the inside of the server.
export function route(handler: (ctx: Context) => Promise<Response>): (ctx: Context) => Promise<Response> {
  return async (ctx) => {
    try {
      return await handler(ctx);
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error.status, error.message, error.headers);
      const what = error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
      console.error("api error:", what.slice(0, 200));
      return errorResponse(500, "Something went wrong. Please try again.");
    }
  };
}

// For a route that exports onRequestPost (or Get, Put): every other method answers 405.
export const wrongMethod = (allowed: string): Response => errorResponse(405, "That is not allowed here.", [["Allow", allowed]]);
