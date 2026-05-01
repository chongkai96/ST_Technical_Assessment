import type { Application } from "express";
import type pg from "pg";
import type { Server as SocketServer } from "socket.io";
import { z } from "zod";

const resolveBody = z.object({
  batchId: z.string().uuid(),
  recordId: z.string().min(1),
  choice: z.enum(["keep_old", "keep_new"]),
});

export function registerConflictRoutes(
  app: Application,
  pool: pg.Pool,
  io: SocketServer,
): void {
  app.get("/api/conflicts", async (_req, res) => {
    const r = await pool.query(
      `SELECT id, batch_id, record_id, previous_json, incoming_json, changes_json, created_at
       FROM pending_conflicts WHERE resolved = FALSE ORDER BY created_at ASC`,
    );
    res.json({
      items: r.rows.map((row) => ({
        id: row.id,
        batchId: row.batch_id,
        recordId: row.record_id,
        previous: row.previous_json,
        incoming: row.incoming_json,
        changes: row.changes_json,
        createdAt: row.created_at,
      })),
    });
  });

  app.post("/api/conflicts/resolve", async (req, res) => {
    const parsed = resolveBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    const { batchId, recordId, choice } = parsed.data;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const pending = await client.query(
        `SELECT * FROM pending_conflicts
         WHERE batch_id = $1 AND record_id = $2 AND resolved = FALSE FOR UPDATE`,
        [batchId, recordId],
      );
      if (pending.rowCount === 0) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: "Conflict not found or already resolved" });
        return;
      }

      const row = pending.rows[0]!;
      const incoming = row.incoming_json as {
        postId: string;
        id: string;
        name: string;
        email: string;
        body: string;
      };

      if (choice === "keep_new") {
        await client.query(
          `UPDATE records SET post_id = $1, name = $2, email = $3, body = $4,
           version = version + 1, updated_at = NOW()
           WHERE record_id = $5`,
          [incoming.postId, incoming.name, incoming.email, incoming.body, recordId],
        );
      }

      await client.query(
        `UPDATE pending_conflicts SET resolved = TRUE, resolution = $1
         WHERE batch_id = $2 AND record_id = $3`,
        [choice, batchId, recordId],
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    io.to("collab").emit("collab:resolved", { batchId, recordId, choice });
    io.to("collab").emit("collab:records_updated", {
      reason: "resolve",
      batchId,
      recordId,
      choice,
    });

    res.json({ ok: true });
  });
}
