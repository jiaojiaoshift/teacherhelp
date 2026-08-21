import { describe, expect, it } from "vitest";

import {
  canMarkDocumentImportReady,
  canPurgeSourceAsset
} from "@/lib/services/source-retention-service";

describe("source-retention-service", () => {
  it("rejects source purge before import readiness and explicit confirmation", () => {
    expect(
      canPurgeSourceAsset({
        documentStatus: "semantic_review_pending",
        hasUnsavedChanges: false,
        hasDurableQuestionImages: true,
        userConfirmedPurge: true
      })
    ).toBe(false);

    expect(
      canPurgeSourceAsset({
        documentStatus: "import_ready",
        hasUnsavedChanges: false,
        hasDurableQuestionImages: true,
        userConfirmedPurge: false
      })
    ).toBe(false);
  });

  it("allows purge only after import readiness, no unsaved changes, and explicit confirmation", () => {
    expect(
      canPurgeSourceAsset({
        documentStatus: "import_ready",
        hasUnsavedChanges: false,
        hasDurableQuestionImages: true,
        userConfirmedPurge: true
      })
    ).toBe(true);
  });

  it("rejects source purge while any durable question image is missing", () => {
    expect(
      canPurgeSourceAsset({
        documentStatus: "import_ready",
        hasUnsavedChanges: false,
        hasDurableQuestionImages: false,
        userConfirmedPurge: true
      })
    ).toBe(false);
  });

  it("marks a document import-ready only when all pages are reviewed and all questions have final review decisions", () => {
    expect(
      canMarkDocumentImportReady({
        pages: [
          { id: "page-1", reviewStatus: "reviewed" },
          { id: "page-2", reviewStatus: "reviewed" }
        ],
        questions: [
          { id: "q-1", classificationStatus: "confirmed" },
          { id: "q-2", classificationStatus: "pending_bucket" }
        ]
      })
    ).toBe(true);

    expect(
      canMarkDocumentImportReady({
        pages: [
          { id: "page-1", reviewStatus: "reviewed" },
          { id: "page-2", reviewStatus: "unreviewed" }
        ],
        questions: [
          { id: "q-1", classificationStatus: "confirmed" }
        ]
      })
    ).toBe(false);

    expect(
      canMarkDocumentImportReady({
        pages: [{ id: "page-1", reviewStatus: "reviewed" }],
        questions: [
          { id: "q-1", classificationStatus: "needs_choice" }
        ]
      })
    ).toBe(false);
  });
});
