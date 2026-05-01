import type { ConflictItem, CsvRow, FieldChange } from "./types.js";

const FIELDS: (keyof CsvRow)[] = ["postId", "id", "name", "email", "body"];

export function computeRowDiff(previous: CsvRow, incoming: CsvRow): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const f of FIELDS) {
    if (previous[f] !== incoming[f]) {
      changes.push({ field: f, previous: previous[f], incoming: incoming[f] });
    }
  }
  return changes;
}

export function buildConflictItem(previous: CsvRow, incoming: CsvRow): ConflictItem | null {
  const changes = computeRowDiff(previous, incoming);
  if (changes.length === 0) return null;
  return {
    recordId: previous.id,
    previous,
    incoming,
    changes,
  };
}
