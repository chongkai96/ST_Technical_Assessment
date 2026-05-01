import { parse } from "csv-parse/sync";
import { v4 as uuidv4 } from "uuid";
import type { Server as SocketServer } from "socket.io";
import type pg from "pg";
import { buildConflictItem } from "./diff.js";
import { findByRecordIds } from "./db.js";
import type { ConflictItem, CsvRow } from "./types.js";
import {
  assertUniqueIdsInBatch,
  parseAndValidateRow,
} from "./validation.js";

const REQUIRED_HEADERS = ["postId", "id", "name", "email", "body"] as const;

function assertHeaders(sample: Record<string, string>): string[] {
  const keys = Object.keys(sample).map((k) => k.trim().replace(/^"|"$/g, ""));
  const missing = REQUIRED_HEADERS.filter((h) => !keys.includes(h));
  return missing;
}

export type UploadResult = {
  batchId: string;
  inserted: number;
  skippedUnchanged: number;
  conflicts: ConflictItem[];
  validationErrors?: { line: number; messages: string[] }[];
};

export async function processCsvUpload(
  pool: pg.Pool,
  io: SocketServer | null,
  fileBuffer: Buffer,
): Promise<UploadResult | { error: string; validationErrors?: UploadResult["validationErrors"] }> {
  let rowsRaw: Record<string, string>[];
  try {
    rowsRaw = parse(fileBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as Record<string, string>[];
  } catch {
    return { error: "Invalid CSV format" };
  }

  if (rowsRaw.length === 0) {
    return { error: "CSV is empty" };
  }

  const missing = assertHeaders(rowsRaw[0]!);
  if (missing.length > 0) {
    return {
      error: `Missing required columns: ${missing.join(", ")}`,
    };
  }

  const validationErrors: NonNullable<UploadResult["validationErrors"]> = [];
  const rows: CsvRow[] = [];

  for (let i = 0; i < rowsRaw.length; i++) {
    const raw = rowsRaw[i]!;
    const normalized: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      const key = k.trim().replace(/^"|"$/g, "");
      normalized[key] = v;
    }
    const parsed = parseAndValidateRow(normalized);
    if (!parsed.ok) {
      validationErrors.push({ line: i + 2, messages: parsed.errors });
      continue;
    }
    rows.push(parsed.row);
  }

  if (validationErrors.length > 0) {
    return { error: "Validation failed", validationErrors };
  }

  const dupes = assertUniqueIdsInBatch(rows);
  if (dupes.length > 0) {
    return {
      error: `Duplicate id values inside CSV: ${[...new Set(dupes)].slice(0, 5).join(", ")}${dupes.length > 5 ? "…" : ""}`,
    };
  }

  const batchId = uuidv4();
  const ids = rows.map((r) => r.id);
  const existing = await findByRecordIds(pool, ids);

  const toInsert: CsvRow[] = [];
  const conflicts: ConflictItem[] = [];
  let skippedUnchanged = 0;

  for (const row of rows) {
    const prev = existing.get(row.id);
    if (!prev) {
      toInsert.push(row);
      continue;
    }
    const conflict = buildConflictItem(prev, row);
    if (!conflict) {
      skippedUnchanged += 1;
      continue;
    }
    conflicts.push(conflict);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const row of toInsert) {
      await client.query(
        `INSERT INTO records (record_id, post_id, name, email, body)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.id, row.postId, row.name, row.email, row.body],
      );
    }

    for (const c of conflicts) {
      await client.query(
        `INSERT INTO pending_conflicts (batch_id, record_id, previous_json, incoming_json, changes_json)
         VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb)`,
        [
          batchId,
          c.recordId,
          JSON.stringify(c.previous),
          JSON.stringify(c.incoming),
          JSON.stringify(c.changes),
        ],
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  const payload = {
    batchId,
    inserted: toInsert.length,
    skippedUnchanged,
    conflicts,
  };

  if (io && conflicts.length > 0) {
    io.to("collab").emit("collab:conflicts", payload);
  }

  if (io && (toInsert.length > 0 || skippedUnchanged > 0)) {
    io.to("collab").emit("collab:records_updated", {
      batchId,
      inserted: toInsert.length,
      skippedUnchanged,
    });
  }

  return payload;
}
