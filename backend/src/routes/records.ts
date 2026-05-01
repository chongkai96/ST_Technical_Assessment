import type { Application } from "express";
import type pg from "pg";
import { toDbRecordRow } from "../db.js";

export function registerRecordRoutes(app: Application, pool: pg.Pool): void {
  app.get("/api/records", async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const offset = (page - 1) * limit;
    const filterParams: unknown[] = [];
    let where = "";
    if (q.length > 0) {
      filterParams.push(`%${q}%`);
      where = `WHERE record_id ILIKE $1 OR post_id ILIKE $1 OR name ILIKE $1
               OR email ILIKE $1 OR body ILIKE $1`;
    }

    const limitPlaceholder = filterParams.length + 1;
    const offsetPlaceholder = filterParams.length + 2;
    const dataParams = [...filterParams, limit, offset];

    const countSql = `SELECT COUNT(*)::int AS c FROM records ${where}`;
    const [countRes, dataRes] = await Promise.all([
      pool.query(countSql, filterParams),
      pool.query(
        `SELECT id, record_id, post_id, name, email, body, version, created_at, updated_at
         FROM records ${where}
         ORDER BY id ASC
         LIMIT $${limitPlaceholder} OFFSET $${offsetPlaceholder}`,
        dataParams,
      ),
    ]);

    const total = countRes.rows[0]?.c ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    res.json({
      data: dataRes.rows.map(toDbRecordRow),
      page,
      limit,
      total,
      totalPages,
    });
  });
}
