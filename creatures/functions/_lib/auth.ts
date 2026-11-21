// STUB: comments only. Real code is written in Phase 5 (accounts and cloud sync).
// Rules this file must follow when it is built:
//
// TODO password hashing
//   Use PBKDF2 (crypto.subtle, SHA-256) with a random salt per user: 16 bytes from
//   crypto.getRandomValues, never reused. Store the algorithm, iteration count, salt and
//   hash in one string, for example "pbkdf2-sha256$<iterations>$<salt>$<hash>", so the
//   iteration count can be raised later while old hashes still verify.
//   Check the iteration limit first: Cloudflare Workers has been reported to cap PBKDF2
//   at 100,000, which is below the OWASP figure of 600,000 for SHA-256. Look up the
//   current limit in the Cloudflare docs, use the highest allowed value, and require a
//   reasonable minimum password length to make up for it.
//   Compare hashes with crypto.subtle.timingSafeEqual (a Workers extension), never ===.
//   Adult PINs are hashed the same way, each with its own salt.
//
// TODO session tokens
//   Make each token 32 random bytes, base64url encoded. The raw token only ever lives in
//   the cookie. The sessions table stores SHA-256(token), never the token itself, plus an
//   expiry time. Logging out or expiring a session deletes its row.
//
// TODO cookie
//   Flags: HttpOnly; Secure; SameSite=Lax; Path=/; plus Max-Age. Consider the "__Host-"
//   name prefix (it forces Secure, Path=/ and no Domain attribute). Safari may not accept
//   Secure cookies on http://localhost, so test login locally in Chrome or Firefox.
//
// TODO CSRF
//   SameSite=Lax alone is not enough. Every state-changing route (POST, PUT, DELETE) must
//   check that the Origin header matches the site and that Content-Type is application/json.
//
// TODO login rate limiting (notes)
//   Count failed logins per email and per IP (the CF-Connecting-IP header) in a D1 table.
//   After about 5 failures in 15 minutes, answer 429 with a Retry-After header.
//   Use short expiring windows, not a permanent lockout, so a stranger cannot lock the
//   family out for good.
//   Give the same generic error for an unknown email and a wrong password. For an unknown
//   email, still run one dummy hash so the response time looks the same.
//   A second layer can be a Cloudflare dashboard rate limiting rule on the login route.
export {};
