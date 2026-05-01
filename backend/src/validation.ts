import { z } from "zod";
import type { CsvRow } from "./types.js";

const emailLike = z
  .string()
  .trim()
  .min(1, "email required")
  .regex(/^\S+@\S+\.\S+$/, "invalid email format");

export const csvRowSchema = z.object({
  postId: z.string().trim().min(1, "postId required"),
  id: z.string().trim().min(1, "id required"),
  name: z.string().trim().min(1, "name required"),
  email: emailLike,
  body: z.string().min(1, "body required"),
});

export function parseAndValidateRow(raw: Record<string, string>): {
  ok: true;
  row: CsvRow;
} | {
  ok: false;
  errors: string[];
} {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    normalized[k.trim()] = v ?? "";
  }

  const parsed = csvRowSchema.safeParse({
    postId: normalized.postId ?? normalized["postId"],
    id: normalized.id ?? normalized["id"],
    name: normalized.name ?? normalized["name"],
    email: normalized.email ?? normalized["email"],
    body: normalized.body ?? normalized["body"],
  });

  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.errors.map((e) => e.message),
    };
  }

  return { ok: true, row: parsed.data };
}

export function assertUniqueIdsInBatch(rows: CsvRow[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) dupes.push(r.id);
    seen.add(r.id);
  }
  return dupes;
}
