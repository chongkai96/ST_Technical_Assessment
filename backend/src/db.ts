import pg from "pg";
import type { CsvRow } from "./types.js";

const { Pool } = pg;

export function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  return new Pool({ connectionString });
}

export async function migrate(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS records (
      id SERIAL PRIMARY KEY,
      record_id VARCHAR(512) NOT NULL UNIQUE,
      post_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      body TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS pending_conflicts (
      id SERIAL PRIMARY KEY,
      batch_id UUID NOT NULL,
      record_id VARCHAR(512) NOT NULL,
      previous_json JSONB NOT NULL,
      incoming_json JSONB NOT NULL,
      changes_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved BOOLEAN NOT NULL DEFAULT FALSE,
      resolution VARCHAR(32),
      UNIQUE(batch_id, record_id)
    );
    CREATE INDEX IF NOT EXISTS idx_pending_conflicts_unresolved
      ON pending_conflicts (resolved) WHERE resolved = FALSE;
  `);
}

export function toDbRecordRow(r: pg.QueryResultRow): CsvRow & {
  dbId: number;
  version: number;
  createdAt: string;
  updatedAt: string;
} {
  return {
    dbId: Number(r.id),
    postId: r.post_id,
    id: r.record_id,
    name: r.name,
    email: r.email,
    body: r.body,
    version: r.version,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function findByRecordIds(
  pool: pg.Pool,
  ids: string[],
): Promise<Map<string, CsvRow>> {
  if (ids.length === 0) return new Map();
  const res = await pool.query(
    `SELECT id, record_id, post_id, name, email, body FROM records WHERE record_id = ANY($1::varchar[])`,
    [ids],
  );
  const map = new Map<string, CsvRow>();
  for (const row of res.rows) {
    map.set(row.record_id, {
      postId: row.post_id,
      id: row.record_id,
      name: row.name,
      email: row.email,
      body: row.body,
    });
  }
  return map;
}
