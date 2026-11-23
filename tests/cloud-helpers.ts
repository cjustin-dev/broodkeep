// Stand-ins for Cloudflare, so the account and save routes can be tested here: a D1 look-alike on node:sqlite (the same SQL and the very
// migration files the real database gets), and a way to call a route with a made-up request. The real D1 is only reached by the end to end
// run with `wrangler pages dev` (docs/cloud-saves.md).
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import type { Context, D1Database, D1PreparedStatement, D1Result, Env } from "../functions/_lib/types";

// Every migration file, in number order, the way wrangler runs them.
const MIGRATIONS_DIR = new URL("../migrations/", import.meta.url);
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((name) => /^\d{4}_.*\.sql$/.test(name))
  .sort()
  .map((name) => ({ number: Number(name.slice(0, 4)), sql: readFileSync(new URL(name, MIGRATIONS_DIR), "utf8") }));

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

// upTo: stop after this migration number (to set up the database as it was before a later migration, then run that one by hand).
export function newTestDb(overrides: Partial<Env> = {}, upTo = Infinity): TestDb {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON"); // D1 enforces foreign keys, so the stand-in does too
  for (const migration of MIGRATIONS) if (migration.number <= upTo) raw.exec(migration.sql);
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

// The same database with every read answering a moment late, as D1 over the network does: the read happens, and the answer takes a while
// to come back. The stand-in answers at once, and then one request runs to its end before the next has even read its body, so two requests
// that "arrive together" never overlap. With a late answer they do: the other request can read the same rows before this one writes, which
// is what a test of a race needs.
export function slowReads(db: D1Database, ms = 3): D1Database {
  const wait = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  const slow = (statement: D1PreparedStatement): D1PreparedStatement =>
    Object.assign(Object.create(statement) as D1PreparedStatement, {
      bind: (...values: unknown[]) => slow(statement.bind(...values)),
      first: async <T>() => {
        const row = await statement.first<T>();
        await wait();
        return row;
      },
      all: async <T>() => {
        const rows = await statement.all<T>();
        await wait();
        return rows;
      },
    });
  return { prepare: (sql) => slow(db.prepare(sql)), batch: (statements) => db.batch(statements) };
}

// The SQL text of one migration, to run it by hand on a database made with newTestDb({}, number - 1).
export const migrationSql = (number: number): string => MIGRATIONS.find((migration) => migration.number === number)!.sql;

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
