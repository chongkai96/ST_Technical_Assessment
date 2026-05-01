import { describe, expect, it } from "vitest";
import { buildConflictItem, computeRowDiff } from "./diff.js";
import type { CsvRow } from "./types.js";

const base: CsvRow = {
  postId: "1",
  id: "99",
  name: "Alice",
  email: "a@b.co",
  body: "hello",
};

describe("computeRowDiff", () => {
  it("returns empty when identical", () => {
    expect(computeRowDiff(base, { ...base })).toEqual([]);
  });

  it("detects single field change", () => {
    const next = { ...base, name: "Bob" };
    expect(computeRowDiff(base, next)).toEqual([
      { field: "name", previous: "Alice", incoming: "Bob" },
    ]);
  });

  it("detects multiple field changes", () => {
    const next: CsvRow = {
      ...base,
      postId: "2",
      email: "c@d.co",
    };
    const d = computeRowDiff(base, next);
    expect(d.map((x) => x.field).sort()).toEqual(["email", "postId"].sort());
  });
});

describe("buildConflictItem", () => {
  it("returns null when no effective change", () => {
    expect(buildConflictItem(base, { ...base })).toBeNull();
  });

  it("builds conflict when data diverges", () => {
    const item = buildConflictItem(base, { ...base, body: "world" });
    expect(item?.recordId).toBe("99");
    expect(item?.changes).toHaveLength(1);
    expect(item?.changes[0]?.field).toBe("body");
  });
});
