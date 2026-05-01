export const apiBase: string = import.meta.env.VITE_API_BASE ?? "";

export type CsvRow = {
  postId: string;
  id: string;
  name: string;
  email: string;
  body: string;
};

export type DbRecord = CsvRow & {
  dbId: number;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type FieldChange = {
  field: keyof CsvRow;
  previous: string;
  incoming: string;
};

export type ConflictItem = {
  recordId: string;
  previous: CsvRow;
  incoming: CsvRow;
  changes: FieldChange[];
};

export type UploadResponse =
  | {
      batchId: string;
      inserted: number;
      skippedUnchanged: number;
      conflicts: ConflictItem[];
    }
  | { error: string; validationErrors?: { line: number; messages: string[] }[] };

export async function fetchRecords(page: number, limit: number, q: string) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (q.trim()) params.set("q", q.trim());
  const res = await fetch(`${apiBase}/api/records?${params}`);
  if (!res.ok) throw new Error("Failed to load records");
  return res.json() as Promise<{
    data: DbRecord[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>;
}

export async function fetchPendingConflicts() {
  const res = await fetch(`${apiBase}/api/conflicts`);
  if (!res.ok) throw new Error("Failed to load conflicts");
  return res.json() as Promise<{
    items: {
      id: number;
      batchId: string;
      recordId: string;
      previous: CsvRow;
      incoming: CsvRow;
      changes: FieldChange[];
      createdAt: string;
    }[];
  }>;
}

export async function resolveConflict(body: {
  batchId: string;
  recordId: string;
  choice: "keep_old" | "keep_new";
}) {
  const res = await fetch(`${apiBase}/api/conflicts/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Resolve failed");
  }
}
