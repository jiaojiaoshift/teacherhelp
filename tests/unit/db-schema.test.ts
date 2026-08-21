import { describe, expect, it } from "vitest";

import { DB_STORES, DB_VERSION } from "@/lib/db/schema";

describe("db-schema", () => {
  it("defines the expected object stores for phase two", () => {
    expect(DB_VERSION).toBe(2);
    expect(Object.values(DB_STORES)).toEqual([
      "documents",
      "source_assets",
      "pages",
      "binary_assets",
      "questions",
      "folders",
      "tags",
      "analysis_jobs",
      "settings",
      "ui_snapshots",
      "exam_libraries",
      "exam_documents"
    ]);
  });
});
