// STUB: comments only. Real code is written in Phase 5.
// Rules this file must follow when it is built:
//
// TODO one place that builds every API response (JSON success and JSON error)
//   Cloudflare does not apply public/_headers to Pages Functions responses, so this file
//   must set the headers itself on every response:
//     Cache-Control: no-store
//     X-Content-Type-Options: nosniff
//     Content-Type: application/json
//   and also the other security headers from public/_headers (Referrer-Policy,
//   Permissions-Policy, X-Frame-Options).
//
// TODO errors
//   Wrap each route in a catch that logs the real error on the server and returns a
//   generic 500 body. Never send stack traces or database messages to the client.
//
// TODO cookies
//   Set-Cookie is built in auth.ts and attached here with headers.append, so a response
//   can carry more than one cookie.
export {};
