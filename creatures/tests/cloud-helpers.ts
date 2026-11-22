// Stand-ins for Cloudflare, so the account and save routes can be tested here: a D1 look-alike on node:sqlite (the same SQL and the very
// migration file the real database gets), and a way to call a route with a made-up request. The real D1 is only reached by the end to end
// run with `wrangler pages dev` (docs/cloud-saves.md).
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import type { Context, D1Database, D1PreparedStatement, D1Result, Env } from "../functions/_lib/types";

const MIGRATION = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");

class Statement implements D1PreparedStatement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): Statement {
    return new Statement(this.db, this.sql, values);
  }

  runSync(): D1Result {
    const info = this.db.prepare(this.sql).run(...(this.values as SQLInputValue[]));
    return { results: [], success: true, meta: { changes: Number(info.changes) } };
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...(this.values as SQLInputValue[]));
    return row ? ({ ...row } as T) : null; // (a plain object, not the null prototype one sqlite gives)
  }

  async all<T>(): Promise<D1Result<T>> {
    const rows = this.db.prepare(this.sql).all(...(this.values as SQLInputValue[]));
    return { results: rows.map((row) => ({ ...row }) as T), success: true, meta: {} };
  }

  async run(): Promise<D1Result> {
    return this.runSync();
  }
}

export interface TestDb {
  env: Env;
  raw: DatabaseSync; // for looking inside the tables, and for setting up a state directly
}

export function newTestDb(overrides: Partial<Env> = {}): TestDb {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON"); // D1 enforces foreign keys, so the stand-in does too
  raw.exec(MIGRATION);
  const DB: D1Database = {
    prepare: (sql) => new Statement(raw, sql),
    // A batch is all or nothing, like D1's.
    batch: async (statements) => {
      raw.exec("BEGIN");
      try {
        const results = (statements as Statement[]).map((statement) => statement.runSync());
        raw.exec("COMMIT");
        return results;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { env: { DB, SIGNUP_CODE: "family-code", ...overrides }, raw };
}

export const SITE = "https://broodkeep.test";
export const key = (char: string): string => char.repeat(43); // a well formed key: 43 base64url characters

export interface Sent {
  status: number;
  body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  headers: Headers;
  cookies: string[]; // the Set-Cookie headers
}

export interface CallOptions {
  method?: string;
  body?: unknown; // sent as JSON
  raw?: string; // sent as it is (instead of body)
  headers?: Record<string, string | null>; // null removes a header the call would otherwise send
  cookie?: string; // "name=value"
  ip?: string;
}

// Calls a route with a request that looks like the browser's: same site Origin, JSON, and a client address.
export async function call(handler: (ctx: Context) => Promise<Response>, env: Env, path: string, options: CallOptions = {}): Promise<Sent> {
  const method = options.method ?? "POST";
  const headers: Record<string, string> = { "CF-Connecting-IP": options.ip ?? "1.2.3.4" };
  if (method !== "GET") {
    headers.Origin = SITE;
    headers["Content-Type"] = "application/json";
  }
  if (options.cookie) headers.Cookie = options.cookie;
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    if (value === null) delete headers[name];
    else headers[name] = value;
  }
  const text = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  const request = new Request(SITE + path, { method, headers, body: method === "GET" ? undefined : text });
  const response = await handler({ request, env });
  const raw = await response.text();
  return { status: response.status, body: raw ? JSON.parse(raw) : null, headers: response.headers, cookies: response.headers.getSetCookie() };
}

// "name=value" from the first Set-Cookie of an answer, ready to send back as a Cookie header.
export const cookieOf = (sent: Sent): string => sent.cookies[0]!.split(";")[0]!;

export const countRows = (raw: DatabaseSync, table: string): number => Number((raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
