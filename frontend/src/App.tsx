import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  apiBase,
  fetchPendingConflicts,
  fetchRecords,
  resolveConflict,
  type ConflictItem,
  type DbRecord,
  type UploadResponse,
} from "./api";

function uploadWithProgress(file: File, onProgress: (pct: number) => void): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBase}/api/upload`);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText) as UploadResponse;
        if (xhr.status >= 200 && xhr.status < 300) resolve(parsed);
        else reject(new Error("error" in parsed ? parsed.error : "Upload failed"));
      } catch {
        reject(new Error("Invalid response"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    const body = new FormData();
    body.append("file", file);
    xhr.send(body);
  });
}

type PendingConflict = {
  id: number;
  batchId: string;
  recordId: string;
  previous: ConflictItem["previous"];
  incoming: ConflictItem["incoming"];
  changes: ConflictItem["changes"];
  createdAt: string;
};

export function App() {
  const [page, setPage] = useState(1);
  const [limit] = useState(15);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [rows, setRows] = useState<DbRecord[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadPhase, setUploadPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingConflict[]>([]);
  const [socketStatus, setSocketStatus] = useState<"off" | "connecting" | "live">("off");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetchRecords(page, limit, debouncedQ);
      setRows(res.data);
      setTotalPages(res.totalPages);
      setTotal(res.total);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedQ]);

  const loadConflicts = useCallback(async () => {
    try {
      const res = await fetchPendingConflicts();
      setPending(res.items);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    loadConflicts();
  }, [loadConflicts]);

  useEffect(() => {
    const url = apiBase || window.location.origin;
    const s: Socket = io(url, { path: "/socket.io", transports: ["websocket", "polling"] });
    setSocketStatus("connecting");
    s.on("connect", () => setSocketStatus("live"));
    s.on("disconnect", () => setSocketStatus("off"));
    s.on("collab:conflicts", () => {
      loadConflicts();
      loadRecords();
    });
    s.on("collab:records_updated", () => {
      loadRecords();
      loadConflicts();
    });
    s.on("collab:resolved", () => {
      loadRecords();
      loadConflicts();
    });
    return () => {
      s.disconnect();
    };
  }, [loadConflicts, loadRecords]);

  const handleFile = async (fileList: FileList | null) => {
    const f = fileList?.[0];
    if (!f) return;
    setUploadPhase("uploading");
    setUploadPct(0);
    setUploadMsg(null);
    try {
      const result = await uploadWithProgress(f, (p) => {
        setUploadPct(p);
        if (p >= 100) setUploadPhase("processing");
      });
      if ("error" in result) {
        setUploadMsg(
          result.validationErrors
            ? `Validation failed (${result.validationErrors.length} row(s))`
            : result.error,
        );
        return;
      }
      setUploadMsg(
        `Inserted ${result.inserted}, unchanged ${result.skippedUnchanged}, conflicts ${result.conflicts.length}`,
      );
      await loadRecords();
      await loadConflicts();
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadPhase("idle");
      setUploadPct(null);
    }
  };

  const badge = useMemo(() => {
    if (socketStatus === "live") return { text: "Realtime: connected", ok: true };
    if (socketStatus === "connecting") return { text: "Realtime: connecting…", ok: false };
    return { text: "Realtime: offline", ok: false };
  }, [socketStatus]);

  return (
    <div className="layout">
      <header style={{ marginBottom: "1.25rem" }}>
        <h1 style={{ margin: "0 0 0.35rem", fontSize: "1.5rem" }}>CSV upload & collaboration</h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.95rem" }}>
          Upload sample data, paginate, search, and resolve overlapping row conflicts live across
          browser sessions.
        </p>
      </header>

      <div style={{ marginBottom: "0.75rem" }} className="badge">
        {badge.ok ? "● " : "○ "}
        {badge.text}
      </div>

      <div className="grid-two">
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Upload CSV</h2>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={uploadPhase !== "idle"}
            onChange={(e) => handleFile(e.target.files)}
          />
          {uploadPct !== null && uploadPhase === "uploading" && (
            <div style={{ marginTop: "0.75rem" }}>
              <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Upload progress</div>
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: "#1e293b",
                  overflow: "hidden",
                  marginTop: 6,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${uploadPct}%`,
                    background: "var(--accent)",
                    transition: "width 120ms linear",
                  }}
                />
              </div>
              <div style={{ fontSize: "0.8rem", marginTop: 4 }}>{uploadPct}%</div>
            </div>
          )}
          {uploadPhase === "processing" && (
            <p style={{ color: "var(--muted)", marginTop: "0.75rem" }}>Processing on server…</p>
          )}
          {uploadMsg && (
            <p style={{ marginTop: "0.75rem", color: uploadMsg.includes("fail") ? "var(--danger)" : "var(--ok)" }}>
              {uploadMsg}
            </p>
          )}
        </section>

        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Search</h2>
          <input
            type="search"
            placeholder="Filter by id, postId, name, email, body…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            aria-label="Search records"
          />
        </section>
      </div>

      <section className="card" style={{ marginTop: "1rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", flex: "1 1 auto" }}>Records</h2>
          <span className="badge">{total} total</span>
        </div>
        {loadError && <p style={{ color: "var(--danger)" }}>{loadError}</p>}
        {loading && <p style={{ color: "var(--muted)" }}>Loading…</p>}
        <div style={{ overflowX: "auto", marginTop: "0.5rem" }}>
          <table>
            <thead>
              <tr>
                <th>id</th>
                <th>post</th>
                <th>name</th>
                <th>email</th>
                <th>body</th>
                <th>ver</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.dbId}>
                  <td>{r.id}</td>
                  <td>{r.postId}</td>
                  <td style={{ maxWidth: 160 }}>{r.name}</td>
                  <td style={{ maxWidth: 140 }}>{r.email}</td>
                  <td style={{ maxWidth: 320 }}>{r.body}</td>
                  <td>{r.version}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Pending conflicts (realtime)</h2>
        {pending.length === 0 && <p style={{ color: "var(--muted)" }}>No open conflicts.</p>}
        {pending.map((c) => (
          <article
            key={`${c.batchId}-${c.recordId}-${c.id}`}
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "0.75rem",
              marginTop: "0.75rem",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center" }}>
              <strong>record id:</strong>
              <span>{c.recordId}</span>
              <span className="badge">batch {c.batchId.slice(0, 8)}…</span>
            </div>
            <div className="grid-two" style={{ marginTop: "0.75rem" }}>
              <div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 6 }}>Stored</div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    fontSize: "0.78rem",
                    background: "#0b1220",
                    padding: "0.5rem",
                    borderRadius: 8,
                  }}
                >
                  {JSON.stringify(c.previous, null, 2)}
                </pre>
              </div>
              <div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 6 }}>Incoming</div>
                <pre
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    fontSize: "0.78rem",
                    background: "#0b1220",
                    padding: "0.5rem",
                    borderRadius: 8,
                  }}
                >
                  {JSON.stringify(c.incoming, null, 2)}
                </pre>
              </div>
            </div>
            <table style={{ marginTop: "0.75rem" }}>
              <thead>
                <tr>
                  <th>field</th>
                  <th>before</th>
                  <th>after</th>
                </tr>
              </thead>
              <tbody>
                {c.changes.map((ch) => (
                  <tr key={ch.field}>
                    <td>{ch.field}</td>
                    <td className="diff-old">{ch.previous}</td>
                    <td className="diff-new">{ch.incoming}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  await resolveConflict({ batchId: c.batchId, recordId: c.recordId, choice: "keep_old" });
                  await loadConflicts();
                  await loadRecords();
                }}
              >
                Keep stored
              </button>
              <button
                type="button"
                onClick={async () => {
                  await resolveConflict({ batchId: c.batchId, recordId: c.recordId, choice: "keep_new" });
                  await loadConflicts();
                  await loadRecords();
                }}
              >
                Keep incoming
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
