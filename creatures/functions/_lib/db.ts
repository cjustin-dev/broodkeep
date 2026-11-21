// STUB: comments only. Real code is written in Phase 5.
// Rules this file must follow when it is built:
//
// TODO parameterized D1 queries only
//   Every query is a fixed SQL string with ? placeholders, and values go in through
//   .bind(), for example: env.DB.prepare("SELECT id FROM accounts WHERE email = ?").bind(email)
//   Never build SQL by joining strings or using template literals with user input.
//   Table and column names come from constants in the code, never from a request.
//
// TODO keep queries small and in one place
//   Each query is a named helper here, so routes never write raw SQL themselves, and every
//   helper can be reviewed for the rule above in one read.
export {};
