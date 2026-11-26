import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// Agentic OBE — database layer (async). Picks a driver from the environment:
//   • DATABASE_URL       -> PostgreSQL, e.g. Supabase (recommended on Vercel)
//   • TURSO_DATABASE_URL -> Turso / libSQL over HTTP
//   • neither            -> local SQLite file via Node's built-in node:sqlite
//                           (./data/obe.db, or /tmp on Vercel as a fallback)
// App queries use portable SQL with `?` placeholders; the Postgres driver
// rewrites them to $1, $2, ... and adds RETURNING for inserted ids.
// ============================================================================

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','hod','teacher','student')),
  department TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  department TEXT,
  accreditation_body TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS plos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  UNIQUE(program_id, number)
);
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  credit_hours INTEGER NOT NULL DEFAULT 3,
  lab_credit_hours INTEGER NOT NULL DEFAULT 0,
  semester_label TEXT NOT NULL DEFAULT 'Fall 2026',
  start_date TEXT NOT NULL,
  total_weeks INTEGER NOT NULL DEFAULT 16,
  lecture_days TEXT NOT NULL DEFAULT '["Monday","Wednesday"]',
  lab_day TEXT,
  outline_text TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','completed')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  description TEXT NOT NULL,
  bloom_level TEXT NOT NULL CHECK (bloom_level IN ('C1','C2','C3','C4','C5','C6')),
  domain TEXT NOT NULL DEFAULT 'cognitive',
  approved INTEGER NOT NULL DEFAULT 0,
  ai_generated INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS clo_plo (
  clo_id INTEGER NOT NULL REFERENCES clos(id) ON DELETE CASCADE,
  plo_id INTEGER NOT NULL REFERENCES plos(id) ON DELETE CASCADE,
  weight INTEGER NOT NULL CHECK (weight IN (1,2,3)),
  approved INTEGER NOT NULL DEFAULT 0,
  ai_suggested INTEGER NOT NULL DEFAULT 0,
  rationale TEXT,
  PRIMARY KEY (clo_id, plo_id)
);
CREATE TABLE IF NOT EXISTS weekly_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  topic TEXT NOT NULL,
  subtopics TEXT NOT NULL DEFAULT '[]',
  clo_numbers TEXT NOT NULL DEFAULT '[]',
  UNIQUE(course_id, week)
);
CREATE TABLE IF NOT EXISTS sessions_plan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  date TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  details TEXT
);
CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  total_marks REAL NOT NULL DEFAULT 0,
  weight REAL NOT NULL DEFAULT 10,
  week INTEGER,
  date TEXT,
  is_formative INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  text TEXT,
  max_marks REAL NOT NULL,
  clo_id INTEGER REFERENCES clos(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  roll_no TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  UNIQUE(course_id, roll_no)
);
CREATE TABLE IF NOT EXISTS marks (
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  marks REAL,
  PRIMARY KEY (student_id, question_id)
);
CREATE TABLE IF NOT EXISTS actions_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  clo_id INTEGER REFERENCES clos(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_clos_course ON clos(course_id);
CREATE INDEX IF NOT EXISTS idx_assess_course ON assessments(course_id);
CREATE INDEX IF NOT EXISTS idx_questions_assess ON questions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_students_course ON students(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_course ON sessions_plan(course_id);
`;

const TABLES = ['users', 'sessions', 'settings', 'programs', 'plos', 'courses', 'holidays', 'clos', 'clo_plo', 'weekly_plans', 'sessions_plan', 'assessments', 'questions', 'students', 'marks', 'actions_log'];

/** Postgres flavour of SCHEMA. RLS is enabled with no policies so Supabase's public
 *  REST API (anon key) cannot read these tables; the server connects as the owner. */
function postgresSchema(): string {
  return (
    SCHEMA.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
      .replace(/ COLLATE NOCASE/g, '')
      .replace(/\bREAL\b/g, 'DOUBLE PRECISION')
      .replace(/TEXT DEFAULT CURRENT_TIMESTAMP/g, "TEXT DEFAULT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')") +
    TABLES.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join('\n')
  );
}

/** `?` -> `$1, $2, ...` (skipping quoted strings). */
function toPgPlaceholders(sql: string): string {
  let n = 0;
  let out = '';
  let quote: string | null = null;
  for (const ch of sql) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '?') {
      out += `$${++n}`;
      continue;
    }
    out += ch;
  }
  return out;
}

export type Param = string | number | bigint | null;
type Row = Record<string, unknown>;
export type Statement = [sql: string, params?: Param[]];

/** Minimal executor shared by the client and by an open transaction. */
interface Executor {
  query(sql: string, params: Param[]): Promise<Row[]>;
  exec(sql: string, params: Param[]): Promise<{ changes: number; id: number }>;
  batch(stmts: Statement[]): Promise<void>;
}

interface Driver extends Executor {
  kind: 'postgres' | 'turso' | 'local';
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
  migrate(): Promise<void>;
}

// ---------------------------------------------------------------- Turso ----
async function tursoDriver(url: string, authToken?: string): Promise<Driver> {
  const { createClient } = await import('@libsql/client/web');
  const client = createClient({ url, authToken });
  type Exe = Pick<typeof client, 'execute' | 'batch'>;
  const toRows = (rs: { columns: string[]; rows: ArrayLike<unknown>[] }) =>
    rs.rows.map((r) => {
      const o: Row = {};
      rs.columns.forEach((c, i) => {
        const v = (r as unknown as unknown[])[i];
        o[c] = typeof v === 'bigint' ? Number(v) : v;
      });
      return o;
    });
  const wrap = (e: Exe): Executor => ({
    async query(sql, args) {
      return toRows(await e.execute({ sql, args }));
    },
    async exec(sql, args) {
      const rs = await e.execute({ sql, args });
      return { changes: rs.rowsAffected, id: Number(rs.lastInsertRowid ?? 0) };
    },
    async batch(stmts) {
      if (stmts.length) await e.batch(stmts.map(([sql, args]) => ({ sql, args: args ?? [] })), 'write');
    },
  });
  return {
    kind: 'turso',
    ...wrap(client),
    async transaction(fn) {
      const t = await client.transaction('write');
      try {
        const out = await fn(wrap(t));
        await t.commit();
        return out;
      } catch (err) {
        await t.rollback().catch(() => {});
        throw err;
      } finally {
        t.close();
      }
    },
    async migrate() {
      await client.executeMultiple(SCHEMA);
    },
  };
}

// ------------------------------------------------------- Postgres/Supabase ----
async function postgresDriver(url: string): Promise<Driver> {
  const { default: postgres } = await import('postgres');
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const sql = postgres(url, {
    prepare: false, // required by Supabase's transaction pooler (port 6543)
    max: process.env.VERCEL ? 3 : local ? 1 : 10,
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: local ? false : 'require',
    onnotice: () => {},
    // COUNT(*), SUM(int) etc. come back as int8 — return them as JS numbers
    types: { bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
  });
  type Q = typeof sql;
  const wrap = (q: Q, inTx: boolean): Executor => ({
    async query(text, params) {
      return [...(await q.unsafe(toPgPlaceholders(text), params as never[]))] as Row[];
    },
    async exec(text, params) {
      let t = toPgPlaceholders(text);
      if (/^\s*insert\b/i.test(t) && !/\breturning\b/i.test(t)) t += ' RETURNING *';
      const rs = await q.unsafe(t, params as never[]);
      return { changes: rs.count ?? 0, id: Number((rs[0] as Row | undefined)?.id ?? 0) };
    },
    async batch(stmts) {
      if (!stmts.length) return;
      // queries issued together are pipelined over one connection
      const runAll = (tq: Q) => Promise.all(stmts.map(([text, params]) => tq.unsafe(toPgPlaceholders(text), (params ?? []) as never[])));
      if (inTx) await runAll(q);
      else await sql.begin((t) => runAll(t as unknown as Q));
    },
  });
  return {
    kind: 'postgres',
    ...wrap(sql, false),
    async transaction(fn) {
      return (await sql.begin((t) => fn(wrap(t as unknown as Q, true)))) as never;
    },
    async migrate() {
      const [{ ok, legacy }] = await sql.unsafe(
        "SELECT to_regclass('actions_log') IS NOT NULL AS ok, to_regclass('course_offerings') IS NOT NULL AS legacy"
      );
      if (legacy) {
        throw new Error(
          'The database still has the obsolete prototype schema (course_offerings, profiles, UUID ids). ' +
            'Run supabase/migrations/20261126_agentic_obe_schema.sql in the Supabase SQL Editor to clean it up, then reload.'
        );
      }
      if (ok) return;
      await sql.begin(async (t) => {
        await t.unsafe('SELECT pg_advisory_xact_lock(724001)'); // one migrator at a time
        await t.unsafe(postgresSchema());
      });
    },
  };
}

// ---------------------------------------------------------------- Local ----
async function localDriver(file: string): Promise<Driver> {
  const { DatabaseSync } = await import('node:sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  // node:sqlite is synchronous and single-connection: a lock keeps other
  // requests' statements out of an open transaction.
  let lock: Promise<void> = Promise.resolve();
  const inTx = new AsyncLocalStorage<boolean>();
  const waitLock = async () => {
    if (!inTx.getStore()) await lock;
  };
  const exe: Executor = {
    async query(sql, params) {
      await waitLock();
      return db.prepare(sql).all(...params).map((r) => ({ ...r }));
    },
    async exec(sql, params) {
      await waitLock();
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
    },
    async batch(stmts) {
      if (!stmts.length) return;
      await driver.transaction(async () => {
        for (const [sql, params] of stmts) db.prepare(sql).run(...(params ?? []));
      });
    },
  };
  const driver: Driver = {
    kind: 'local',
    ...exe,
    async transaction(fn) {
      if (inTx.getStore()) return fn(exe); // nested: join the outer transaction
      let release!: () => void;
      const prev = lock;
      lock = new Promise<void>((r) => (release = r));
      await prev;
      try {
        return await inTx.run(true, async () => {
          db.exec('BEGIN');
          try {
            const out = await fn(exe);
            db.exec('COMMIT');
            return out;
          } catch (err) {
            db.exec('ROLLBACK');
            throw err;
          }
        });
      } finally {
        release();
      }
    },
    async migrate() {
      db.exec(SCHEMA);
    },
  };
  return driver;
}

// --------------------------------------------------------------- Public ----
const g = globalThis as unknown as { __obeDriver?: Promise<Driver> };
const txStore = new AsyncLocalStorage<Executor>();

export function isEphemeralDb(): boolean {
  return !!process.env.VERCEL && !process.env.DATABASE_URL && !process.env.TURSO_DATABASE_URL;
}

export function dbKind(): 'postgres' | 'turso' | 'local' {
  return process.env.DATABASE_URL ? 'postgres' : process.env.TURSO_DATABASE_URL ? 'turso' : 'local';
}

async function driver(): Promise<Driver> {
  if (!g.__obeDriver) {
    g.__obeDriver = (async () => {
      const pg = process.env.DATABASE_URL;
      const url = process.env.TURSO_DATABASE_URL;
      const d = pg
        ? await postgresDriver(pg)
        : url
        ? await tursoDriver(url, process.env.TURSO_AUTH_TOKEN)
        : await localDriver(
            // Vercel's filesystem is read-only except /tmp (and /tmp is not persistent)
            process.env.VERCEL ? '/tmp/obe.db' : path.join(process.cwd(), 'data', 'obe.db')
          );
      await d.migrate();
      return d;
    })().catch((e) => {
      g.__obeDriver = undefined;
      throw e;
    });
  }
  return g.__obeDriver;
}

/** The executor for the current context: an open transaction if inside tx(), else the client. */
async function current(): Promise<Executor> {
  return txStore.getStore() ?? (await driver());
}

export async function all<T>(sql: string, ...params: Param[]): Promise<T[]> {
  return (await (await current()).query(sql, params)) as T[];
}

export async function get<T>(sql: string, ...params: Param[]): Promise<T | undefined> {
  return (await (await current()).query(sql, params))[0] as T | undefined;
}

export async function run(sql: string, ...params: Param[]) {
  return (await current()).exec(sql, params);
}

/** Run many write statements atomically in one round trip (fast on Turso). */
export async function batch(stmts: Statement[]) {
  return (await current()).batch(stmts);
}

/** Interactive transaction: all/get/run inside `fn` use the transaction. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  const d = await driver();
  return d.transaction((t) => txStore.run(t, fn));
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
