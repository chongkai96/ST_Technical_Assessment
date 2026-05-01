import type { Application } from "express";
import multer from "multer";
import type pg from "pg";
import type { Server as SocketServer } from "socket.io";
import { processCsvUpload } from "../uploadService.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export function registerUploadRoutes(
  app: Application,
  pool: pg.Pool,
  io: SocketServer,
): void {
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    if (!req.file?.buffer) {
      res.status(400).json({ error: "file is required (field name: file)" });
      return;
    }

    try {
      const result = await processCsvUpload(pool, io, req.file.buffer);
      if ("error" in result) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "Upload processing failed" });
    }
  });
}
