import { describe, expect, it } from "vitest";
import { assertUniqueIdsInBatch, parseAndValidateRow } from "./validation.js";

describe("parseAndValidateRow", () => {
  it("accepts a valid row", () => {
    const r = parseAndValidateRow({
      postId: "1",
      id: "2",
      name: "n",
      email: "a@b.co",
      body: "b",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.row.email).toBe("a@b.co");
  });

  it("rejects invalid email", () => {
    const r = parseAndValidateRow({
      postId: "1",
      id: "2",
      name: "n",
      email: "not-an-email",
      body: "b",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects empty body", () => {
    const r = parseAndValidateRow({
      postId: "1",
      id: "2",
      name: "n",
      email: "a@b.co",
      body: "",
    });
    expect(r.ok).toBe(false);
  });
});

describe("assertUniqueIdsInBatch", () => {
  it("returns duplicate ids", () => {
    const dupes = assertUniqueIdsInBatch([
      { postId: "1", id: "1", name: "a", email: "a@b.co", body: "x" },
      { postId: "1", id: "2", name: "b", email: "b@b.co", body: "y" },
      { postId: "1", id: "1", name: "c", email: "c@b.co", body: "z" },
    ]);
    expect(dupes).toContain("1");
  });

  it("returns empty when unique", () => {
    const dupes = assertUniqueIdsInBatch([
      { postId: "1", id: "1", name: "a", email: "a@b.co", body: "x" },
      { postId: "1", id: "2", name: "b", email: "b@b.co", body: "y" },
    ]);
    expect(dupes).toHaveLength(0);
  });
});
