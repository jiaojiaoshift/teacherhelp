import { describe, expect, it } from "vitest";

import {
  buildInitialExamLibraryFolders,
  createDefaultSpecializedDocuments
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree, createCustomFolder } from "@/lib/services/folder-service";
import { applyMobileUploadRouteToDocuments } from "@/lib/services/mobile-upload-application-service";

function createPhysicsSpecializedFixture() {
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

  const examLibraryDocuments = createDefaultSpecializedDocuments({
    folder: specializedLeaf,
    subjectScope: specializedLeaf.subjectScope
  });
  const archiveFolder = examLibraryFolders.find(
    (folder) => folder.role === "lecture_archive" && folder.parentId === specializedLeaf.id
  );
  const primaryLecture = examLibraryDocuments.find(
    (document) => document.kind === "lecture" && document.lectureVariant === "primary"
  );

  if (!archiveFolder || !primaryLecture) {
    throw new Error("missing archive folder or primary lecture");
  }

  return {
    archiveFolder,
    primaryLecture,
    examLibraryDocuments,
    examLibraryFolders
  };
}

describe("mobile-upload-application-service", () => {
  it("creates one archive lecture document from one archive-only upload route", () => {
    const fixture = createPhysicsSpecializedFixture();

    expect(
      applyMobileUploadRouteToDocuments({
        task: {
          id: "task-archive-1",
          deviceId: "device-a",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: fixture.archiveFolder.id,
          targetNodePath: fixture.archiveFolder.path,
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "张三_高一_26_06_03.pdf",
          mimeType: "application/pdf",
          status: "received",
          createdAt: "2026-06-03T08:00:00.000Z"
        },
        route: {
          operation: "archive_only",
          targetKind: "exam_folder",
          targetFolderId: fixture.archiveFolder.id,
          targetFolderPath: fixture.archiveFolder.path,
          normalizedFileName: "张三_高一_26_06_03.pdf"
        },
        sourceAssetId: "asset-archive-1",
        examLibraryFolders: fixture.examLibraryFolders,
        examLibraryDocuments: fixture.examLibraryDocuments
      })
    ).toMatchObject({
      status: "applied",
      createdDocumentId: "lecture-archive-task-archive-1",
      examLibraryDocuments: [
        ...fixture.examLibraryDocuments,
        {
          id: "lecture-archive-task-archive-1",
          folderId: fixture.archiveFolder.id,
          kind: "lecture",
          lectureVariant: "archive",
          title: "张三_高一_26_06_03",
          rawPageAssetIds: ["asset-archive-1"],
          sourceUploadTaskId: "task-archive-1"
        }
      ]
    });
  });

  it("accepts one primary-lecture upload directly when uploaded sync metadata matches the current metadata", () => {
    const fixture = createPhysicsSpecializedFixture();
    const currentMetadata = {
      version: 1 as const,
      sourceDocumentId: fixture.primaryLecture.id,
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

    expect(
      applyMobileUploadRouteToDocuments({
        task: {
          id: "task-primary-1",
          deviceId: "device-a",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: fixture.primaryLecture.id,
          targetNodePath: fixture.primaryLecture.questionIds,
          originalFileName: "随手命名.pdf",
          normalizedFileName: "牛顿定律主讲义.pdf",
          mimeType: "application/pdf",
          status: "received",
          createdAt: "2026-06-03T08:00:00.000Z"
        },
        route: {
          operation: "primary_lecture_update",
          targetKind: "exam_document",
          targetDocumentId: fixture.primaryLecture.id,
          targetFolderId: fixture.primaryLecture.folderId,
          normalizedFileName: "牛顿定律主讲义.pdf"
        },
        sourceAssetId: "asset-primary-1",
        uploadedSyncMetadata: currentMetadata,
        examLibraryFolders: fixture.examLibraryFolders,
        examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
          document.id === fixture.primaryLecture.id
            ? {
                ...document,
                syncMetadata: currentMetadata
              }
            : document
        )
      })
    ).toMatchObject({
      status: "applied",
      createdDocumentId: null
    });
  });

  it("returns one delta sync plan when the uploaded primary lecture is behind by one whole block", () => {
    const fixture = createPhysicsSpecializedFixture();
    const uploadedMetadata = {
      version: 1 as const,
      sourceDocumentId: fixture.primaryLecture.id,
      generatedAt: "2026-06-01T09:00:00.000Z",
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
    const currentMetadata = {
      version: 1 as const,
      sourceDocumentId: fixture.primaryLecture.id,
      generatedAt: "2026-06-03T09:00:00.000Z",
      questionIds: ["q-1", "q-2", "q-3"],
      blocks: [
        uploadedMetadata.blocks[0],
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

    const result = applyMobileUploadRouteToDocuments({
      task: {
        id: "task-primary-2",
        deviceId: "device-a",
        uploadKind: "primary_lecture_pdf",
        targetNodeId: fixture.primaryLecture.id,
        targetNodePath: [],
        originalFileName: "随手命名.pdf",
        normalizedFileName: "牛顿定律主讲义.pdf",
        mimeType: "application/pdf",
        status: "received",
        createdAt: "2026-06-03T08:00:00.000Z"
      },
      route: {
        operation: "primary_lecture_update",
        targetKind: "exam_document",
        targetDocumentId: fixture.primaryLecture.id,
        targetFolderId: fixture.primaryLecture.folderId,
        normalizedFileName: "牛顿定律主讲义.pdf"
      },
      sourceAssetId: "asset-primary-2",
      uploadedSyncMetadata: uploadedMetadata,
      examLibraryFolders: fixture.examLibraryFolders,
      examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
        document.id === fixture.primaryLecture.id
          ? {
              ...document,
              syncMetadata: currentMetadata
            }
          : document
      )
    });

    expect(result).toMatchObject({
      status: "awaiting_sync",
      targetDocumentId: fixture.primaryLecture.id,
      normalizedFileName: "牛顿定律主讲义.pdf",
      syncPlan: {
        status: "delta",
        conflictReason: null,
        preservedBlockIds: ["block-a"],
        addedBlocks: [
          {
            blockId: "block-b",
            questionIds: ["q-3"],
            insertAfterBlockId: "block-a",
            insertBeforeBlockId: null
          }
        ],
        removedBlockIds: []
      }
    });
    expect(result.status === "awaiting_sync" ? result.examLibraryDocuments : []).toEqual(
      fixture.examLibraryDocuments.map((document) =>
        document.id === fixture.primaryLecture.id
          ? {
              ...document,
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
              pendingSourceUploadTaskId: "task-primary-2",
              syncMetadata: currentMetadata
            }
          : document
      )
    );
  });

  it("rejects one primary-lecture upload when sync metadata conflicts with the current block structure", () => {
    const fixture = createPhysicsSpecializedFixture();
    const uploadedMetadata = {
      version: 1 as const,
      sourceDocumentId: fixture.primaryLecture.id,
      generatedAt: "2026-06-01T09:00:00.000Z",
      questionIds: ["q-1", "q-x"],
      blocks: [
        {
          blockId: "block-a",
          questionIds: ["q-1", "q-x"],
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
    const currentMetadata = {
      ...uploadedMetadata,
      generatedAt: "2026-06-03T09:00:00.000Z",
      questionIds: ["q-1", "q-2"],
      blocks: [
        {
          ...uploadedMetadata.blocks[0],
          questionIds: ["q-1", "q-2"]
        }
      ]
    };

    expect(
      applyMobileUploadRouteToDocuments({
        task: {
          id: "task-primary-3",
          deviceId: "device-a",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: fixture.primaryLecture.id,
          targetNodePath: [],
          originalFileName: "随手命名.pdf",
          normalizedFileName: "牛顿定律主讲义.pdf",
          mimeType: "application/pdf",
          status: "received",
          createdAt: "2026-06-03T08:00:00.000Z"
        },
        route: {
          operation: "primary_lecture_update",
          targetKind: "exam_document",
          targetDocumentId: fixture.primaryLecture.id,
          targetFolderId: fixture.primaryLecture.folderId,
          normalizedFileName: "牛顿定律主讲义.pdf"
        },
        sourceAssetId: "asset-primary-3",
        uploadedSyncMetadata: uploadedMetadata,
        examLibraryFolders: fixture.examLibraryFolders,
        examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
          document.id === fixture.primaryLecture.id
            ? {
                ...document,
                syncMetadata: currentMetadata
              }
            : document
        )
      })
    ).toEqual({
      status: "rejected",
      errorMessage: "主讲义同步信息与当前题块结构冲突"
    });
  });
});
