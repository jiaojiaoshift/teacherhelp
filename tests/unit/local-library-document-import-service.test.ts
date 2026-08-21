import { describe, expect, it } from "vitest";

import type { LocalLibrarySnapshot } from "@/lib/services/local-library-contract";
import { importDocumentIntoLocalLibrary } from "@/lib/services/local-library-document-import-service";

function buildSnapshot(input: {
  questionIds: string[];
  pages?: LocalLibrarySnapshot["pages"];
  assets?: LocalLibrarySnapshot["binaryAssets"];
}): LocalLibrarySnapshot {
  return {
    folders: [],
    pages: input.pages ?? [],
    binaryAssets: input.assets ?? [],
    questionDrafts: input.questionIds.map((id, index) => ({
      id,
      documentId: "existing-document",
      pageIds: [],
      primaryPageId: "",
      localOrder: index + 1,
      globalOrder: index + 1,
      bboxByPage: {},
      status: "reviewed",
      source: "ai",
      confidence: 0.9,
      crossPageGroupId: null,
      classificationStatus: "confirmed",
      directoryPath: ["我的题库", "高中物理", "曲线运动", "平抛运动基础"],
      directoryCandidatePaths: []
    })),
    examLibraryFolders: [],
    examLibraryDocuments: [],
    examWorkspaceDraft: {
      selectedLibrary: "specialized",
      selectedFolderId: null,
      selectedDocumentId: null
    }
  };
}

describe("local library document import service", () => {
  it("adds one classified document idempotently while preserving existing data", () => {
    const existing = buildSnapshot({ questionIds: ["existing-question"] });
    const source = buildSnapshot({
      questionIds: [],
      pages: [
        {
          id: "electric-page-1",
          documentId: "electric-document",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          displayAssetId: "electric-asset-1",
          analysisStatus: "done",
          reviewStatus: "reviewed"
        },
        {
          id: "electric-page-2",
          documentId: "electric-document",
          pageNumber: 2,
          width: 1200,
          height: 1600,
          displayAssetId: "electric-asset-2",
          analysisStatus: "done",
          reviewStatus: "reviewed"
        }
      ],
      assets: [
        {
          id: "electric-asset-1",
          documentId: "electric-document",
          pageId: "electric-page-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 10,
          dataUrl: "data:image/png;base64,cGFnZTE="
        },
        {
          id: "electric-asset-2",
          documentId: "electric-document",
          pageId: "electric-page-2",
          kind: "display",
          mimeType: "image/png",
          byteLength: 10,
          dataUrl: "data:image/png;base64,cGFnZTI="
        }
      ]
    });
    source.questionDrafts = [
      {
        id: "electric-question",
        documentId: "electric-document",
        pageIds: ["electric-page-1", "electric-page-2"],
        primaryPageId: "electric-page-1",
        localOrder: 1,
        globalOrder: 1,
        bboxByPage: {
          "electric-page-1": { x: 120, y: 1200, width: 920, height: 300 },
          "electric-page-2": { x: 130, y: 60, width: 160, height: 280 }
        },
        status: "reviewed",
        source: "merged",
        confidence: 0.96,
        crossPageGroupId: "electric-cross-page",
        classificationStatus: "confirmed",
        directoryPath: ["我的题库", "高中物理", "静电场", "等效重力场"],
        directoryCandidatePaths: []
      }
    ];

    const first = importDocumentIntoLocalLibrary({
      existing,
      source,
      documentId: "electric-document"
    });
    const second = importDocumentIntoLocalLibrary({
      existing: first,
      source,
      documentId: "electric-document"
    });

    expect(first.questionDrafts.map((question) => question.id)).toEqual([
      "existing-question",
      "electric-question"
    ]);
    expect(first.questionDrafts[1].bboxByPage).toEqual({
      "electric-page-1": { x: 120, y: 1200, width: 920, height: 300 },
      "electric-page-2": { x: 120, y: 60, width: 920, height: 280 }
    });
    expect(
      first.folders.some(
        (folder) =>
          folder.path.join(" / ") === "我的题库 / 高中物理 / 静电场 / 等效重力场"
      )
    ).toBe(true);
    expect(
      first.examLibraryDocuments.filter(
        (document) =>
          document.title === "等效重力场专题卷" &&
          document.questionIds.includes("electric-question")
      )
    ).toHaveLength(1);
    expect(second).toEqual(first);
  });
});
