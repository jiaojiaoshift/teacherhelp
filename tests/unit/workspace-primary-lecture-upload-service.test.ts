import { describe, expect, it } from "vitest";

import {
  buildInitialExamLibraryFolders,
  createDefaultSpecializedDocuments
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree, createCustomFolder } from "@/lib/services/folder-service";
import { processWorkspacePrimaryLectureUpload } from "@/lib/services/workspace-primary-lecture-upload-service";

function createFixture() {
  const questionFolders = buildInitialFolderTree();
  const physics = questionFolders.find((folder) => folder.subjectScope === "高中物理");

  if (!physics) {
    throw new Error("missing physics root");
  }

  const chapter = createCustomFolder({
    name: "力学",
    parent: physics
  });
  const leaf = createCustomFolder({
    name: "牛顿定律",
    parent: chapter
  });
  const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders.concat(chapter, leaf));
  const specializedLeaf = examLibraryFolders.find(
    (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
  );

  if (!specializedLeaf) {
    throw new Error("missing specialized leaf");
  }

  const documents = createDefaultSpecializedDocuments({
    folder: specializedLeaf,
    subjectScope: specializedLeaf.subjectScope
  });
  const primaryLecture = documents.find(
    (document) => document.kind === "lecture" && document.lectureVariant === "primary"
  );

  if (!primaryLecture) {
    throw new Error("missing primary lecture");
  }

  const exportSnapshot = {
    version: 1 as const,
    sourceDocumentId: primaryLecture.id,
    generatedAt: "2026-06-03T09:00:00.000Z",
    questionIds: ["q-1", "q-2"],
    blocks: [
      {
        blockId: "block-a",
        questionIds: ["q-1", "q-2"],
        exportOrder: 0,
        pageRange: {
          start: 1,
          end: 1
        },
        anchorBBox: {
          page: 1,
          x: 100,
          y: 120,
          width: 720,
          height: 200
        }
      }
    ]
  };

  return {
    examLibraryFolders,
    primaryLecture,
    examLibraryDocuments: documents.map((document) =>
      document.id === primaryLecture.id
        ? {
            ...document,
            syncMetadata: exportSnapshot
          }
        : document
    ),
    exportSnapshot
  };
}

describe("workspace-primary-lecture-upload-service", () => {
  it("rejects one workspace primary-lecture upload when no exported sync snapshot exists yet", () => {
    const fixture = createFixture();

    expect(
      processWorkspacePrimaryLectureUpload({
        file: {
          name: "随手命名.pdf",
          type: "application/pdf",
          size: 4096
        },
        targetDocumentId: fixture.primaryLecture.id,
        examLibraryFolders: fixture.examLibraryFolders,
        examLibraryDocuments: fixture.examLibraryDocuments,
        now: "2026-06-03T10:00:00.000Z"
      })
    ).toEqual({
      status: "rejected",
      errorMessage: "请先导出当前主讲义后再上传更新版本"
    });
  });

  it("processes one matching workspace primary-lecture upload into a completed mobile upload task", () => {
    const fixture = createFixture();

    const result = processWorkspacePrimaryLectureUpload({
      file: {
        name: "随手命名.pdf",
        type: "application/pdf",
        size: 4096
      },
      targetDocumentId: fixture.primaryLecture.id,
      examLibraryFolders: fixture.examLibraryFolders,
      examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
        document.id === fixture.primaryLecture.id
          ? {
              ...document,
              lastExportedSyncMetadata: fixture.exportSnapshot
            }
          : document
      ),
      now: "2026-06-03T10:00:00.000Z",
      createId: (prefix) =>
        prefix === "mobile-upload-task" ? "task-primary-1" : "asset-primary-1"
    });

    expect(result).toMatchObject({
      status: "processed",
      task: {
        id: "task-primary-1",
        uploadKind: "primary_lecture_pdf",
        normalizedFileName: "牛顿定律主讲义.pdf",
        status: "completed"
      },
      sourceAsset: {
        id: "asset-primary-1",
        documentId: fixture.primaryLecture.id,
        kind: "source",
        mimeType: "application/pdf",
        byteLength: 4096
      }
    });
    expect(
      result.status === "processed"
        ? result.examLibraryDocuments.find((document) => document.id === fixture.primaryLecture.id)
        : null
    ).toMatchObject({
      rawPageAssetIds: ["asset-primary-1"],
      sourceUploadTaskId: "task-primary-1"
    });
  });

  it("processes one outdated workspace primary-lecture upload into a processing review task", () => {
    const fixture = createFixture();
    const currentMetadata = {
      ...fixture.exportSnapshot,
      generatedAt: "2026-06-03T11:00:00.000Z",
      questionIds: ["q-1", "q-2", "q-3"],
      blocks: [
        fixture.exportSnapshot.blocks[0],
        {
          blockId: "block-b",
          questionIds: ["q-3"],
          exportOrder: 1,
          pageRange: {
            start: 2,
            end: 2
          },
          anchorBBox: {
            page: 2,
            x: 120,
            y: 150,
            width: 700,
            height: 180
          }
        }
      ]
    };

    const result = processWorkspacePrimaryLectureUpload({
      file: {
        name: "牛顿定律主讲义.pdf",
        type: "application/pdf",
        size: 8192
      },
      targetDocumentId: fixture.primaryLecture.id,
      examLibraryFolders: fixture.examLibraryFolders,
      examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
        document.id === fixture.primaryLecture.id
          ? {
              ...document,
              syncMetadata: currentMetadata,
              lastExportedSyncMetadata: fixture.exportSnapshot
            }
          : document
      ),
      now: "2026-06-03T12:00:00.000Z",
      createId: (prefix) =>
        prefix === "mobile-upload-task" ? "task-primary-2" : "asset-primary-2"
    });

    expect(result).toMatchObject({
      status: "processed",
      task: {
        id: "task-primary-2",
        normalizedFileName: "牛顿定律主讲义.pdf",
        status: "processing"
      },
      sourceAsset: {
        id: "asset-primary-2",
        byteLength: 8192
      }
    });
    expect(
      result.status === "processed"
        ? result.examLibraryDocuments.find((document) => document.id === fixture.primaryLecture.id)
        : null
    ).toMatchObject({
      syncMetadata: currentMetadata,
      syncStatus: "pending_confirmation",
      pendingQuestionIds: ["q-1", "q-2", "q-3"],
      pendingQuestionBlocks: [
        {
          key: "block-a",
          label: "block-a",
          questionIds: ["q-1", "q-2"]
        },
        {
          key: "block-b",
          label: "block-b",
          questionIds: ["q-3"]
        }
      ],
      pendingManualPlacementQuestionIds: [],
      pendingRawPageAssetIds: ["asset-primary-2"],
      pendingSourceUploadTaskId: "task-primary-2"
    });
  });
});
