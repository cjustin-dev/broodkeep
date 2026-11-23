// The few Cloudflare types the server code uses, written out here so no extra package is needed. D1 is Cloudflare's SQLite database.

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: { changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

// What the dashboard and wrangler.toml give the server: the database, and the family sign up code (a secret).
export interface Env {
  DB: D1Database;
  SIGNUP_CODE?: string;
}

// The part of a Pages Functions request context these routes use.
export interface Context {
  request: Request;
  env: Env;
}
