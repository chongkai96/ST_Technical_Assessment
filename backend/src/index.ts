import http from "node:http";
import cors from "cors";
import express from "express";
import type { Pool } from "pg";
import { Server as SocketServer } from "socket.io";
import { createPool, migrate } from "./db.js";
import { registerConflictRoutes } from "./routes/conflicts.js";
import { registerRecordRoutes } from "./routes/records.js";
import { registerUploadRoutes } from "./routes/upload.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:5173";

async function waitForDb(pool: Pool, attempts = 40): Promise<void> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw last;
}

async function main(): Promise<void> {
  const pool = createPool();
  await waitForDb(pool);
  await migrate(pool);

  const app = express();
  app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  const io = new SocketServer(server, {
    cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] },
  });

  registerRecordRoutes(app, pool);
  registerUploadRoutes(app, pool, io);
  registerConflictRoutes(app, pool, io);

  io.on("connection", (socket) => {
    socket.join("collab");
    socket.emit("collab:hello", { at: Date.now() });
  });

  server.listen(PORT, () => {
    console.log(`API + WebSocket listening on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
