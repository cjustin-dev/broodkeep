// STUB: comments only. Real code is written in Phase 5.
// Rules this file must follow when it is built:
//
// TODO validate input on EVERY route, before touching the database
//   Check the HTTP method, the Content-Type and the body size (reject bodies over a small
//   limit). Parse JSON inside try/catch. Then check every field with an allow-list:
//   expected type, length range and allowed characters or values. Reject unknown fields.
//
// TODO field limits (starting points)
//   Email: valid shape, at most 254 characters, lowercased before storing.
//   Password: a minimum length and also a maximum (for example 128), so nobody can send a
//   huge string just to make the server burn time hashing it.
//   Profile name: short, trimmed text. PIN: digits only, fixed length.
//   Save JSON: cap its size well below the D1 limit of 2 MB per row.
//
// TODO errors
//   Return short, generic messages with the right status (400, 401, 403, 413, 429).
//   Never echo raw input or internal error text back to the client.
export {};
