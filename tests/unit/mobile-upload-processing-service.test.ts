import { describe, expect, it } from "vitest";

import {
  buildInitialExamLibraryFolders,
  createDefaultSpecializedDocuments
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree, createCustomFolder } from "@/lib/services/folder-service";
import { processMobileUploadTask } from "@/lib/services/mobile-upload-processing-service";

function createSpecializedFixture() {
  const questionFolders = buildInitialFolderTree();
  const physics = questionFolders.find((folder) => folder.subjectScope === "高中物理");

  if (!physics) {
    throw new Error("missing physics folder");
  }

  const chapter = createCustomFolder({
    name: "力学",
    parent: physics
  });
  const leaf = createCustomFolder({
    name: "牛顿定律",
    parent: chapter
  });
  const allQuestionFolders = questionFolders.concat(chapter, leaf);
  const examLibraryFolders = buildInitialExamLibraryFolders(allQuestionFolders);
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
    allQuestionFolders,
    archiveFolder,
    primaryLecture,
    examLibraryFolders,
    examLibraryDocuments
  };
}

describe("mobile-upload-processing-service", () => {
  it("queues one question-bank upload for downstream ingestion", () => {
    const questionFolders = buildInitialFolderTree();
    const targetFolder = questionFolders.find((folder) => folder.subjectScope === "高中数学");

    expect(targetFolder).toBeTruthy();

    expect(
      processMobileUploadTask({
        task: {
          id: "task-qb-1",
          deviceId: "device-a",
          uploadKind: "question_bank_pdf",
          targetNodeId: targetFolder!.id,
          targetNodePath: targetFolder!.path,
          originalFileName: "math.pdf",
          normalizedFileName: "math.pdf",
          mimeType: "application/pdf",
          status: "received",
          createdAt: "2026-06-03T08:00:00.000Z"
        },
        sourceAssetId: "asset-qb-1",
        questionFolders,
        examLibraryFolders: [],
        examLibraryDocuments: []
      })
    ).toEqual({
      task: {
        id: "task-qb-1",
        deviceId: "device-a",
        uploadKind: "question_bank_pdf",
        targetNodeId: targetFolder!.id,
        targetNodePath: targetFolder!.path,
        originalFileName: "math.pdf",
        normalizedFileName: "math.pdf",
        mimeType: "application/pdf",
        status: "queued",
        createdAt: "2026-06-03T08:00:00.000Z"
      },
      examLibraryDocuments: [],
      downstreamAction: {
        kind: "question_bank_ingestion",
        taskId: "task-qb-1",
        sourceAssetId: "asset-qb-1",
        targetNodeId: targetFolder!.id,
        targetNodePath: targetFolder!.path,
        normalizedFileName: "math.pdf"
      }
    });
  });

  it("completes one archive upload after creating the archive lecture document", () => {
    const fixture = createSpecializedFixture();

    expect(
      processMobileUploadTask({
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
        sourceAssetId: "asset-archive-1",
        questionFolders: fixture.allQuestionFolders,
        examLibraryFolders: fixture.examLibraryFolders,
        examLibraryDocuments: fixture.examLibraryDocuments
      })
    ).toMatchObject({
      task: {
        id: "task-archive-1",
        status: "completed"
      },
      downstreamAction: {
        kind: "archive_applied",
        createdDocumentId: "lecture-archive-task-archive-1"
      }
    });
  });

  it("marks one primary-lecture upload as processing when a block-level sync delta still needs reconciliation", () => {
    const fixture = createSpecializedFixture();
    const uploadedMetadata = {
      version: 1 as const,
      sourceDocumentId: fixture.primaryLecture.id,
      generatedAt: "2026-06-01T09:00:00.000Z",
      questionIds: ["q-1"],
      blocks: [
        {
          blockId: "block-a",
          questionIds: ["q-1"],
          exportOrder: 0,
          pageRange: {
            start: 1,
            end: 1
          },
          anchorBBox: {
            page: 1,
            x: 100,
            y: 120,
            width: 700,
            height: 180
          }
        }
      ]
    };
    const currentMetadata = {
      version: 1 as const,
      sourceDocumentId: fixture.primaryLecture.id,
      generatedAt: "2026-06-03T09:00:00.000Z",
      questionIds: ["q-1", "q-2"],
      blocks: [
        uploadedMetadata.blocks[0],
        {
          blockId: "block-b",
          questionIds: ["q-2"],
          exportOrder: 1,
          pageRange: {
            start: 2,
            end: 2
          },
          anchorBBox: {
            page: 2,
            x: 110,
            y: 150,
            width: 680,
            height: 170
          }
        }
      ]
    };

    expect(
      processMobileUploadTask({
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
        sourceAssetId: "asset-primary-1",
        uploadedSyncMetadata: uploadedMetadata,
        questionFolders: fixture.allQuestionFolders,
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
      task: {
        id: "task-primary-1",
        deviceId: "device-a",
        uploadKind: "primary_lecture_pdf",
        targetNodeId: fixture.primaryLecture.id,
        targetNodePath:
          fixture.examLibraryFolders.find((folder) => folder.id === fixture.primaryLecture.folderId)
            ?.path ?? [],
        originalFileName: "随手命名.pdf",
        normalizedFileName: "牛顿定律主讲义.pdf",
        mimeType: "application/pdf",
        status: "processing",
        createdAt: "2026-06-03T08:00:00.000Z"
      },
      examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
        document.id === fixture.primaryLecture.id
          ? {
              ...document,
              syncMetadata: currentMetadata,
              syncStatus: "pending_confirmation",
              pendingQuestionIds: ["q-1", "q-2"],
              pendingQuestionBlocks: [
                {
                  key: "block-a",
                  label: "block-a",
                  questionIds: ["q-1"]
                },
                {
                  key: "block-b",
                  label: "block-b",
                  questionIds: ["q-2"]
                }
              ],
              pendingManualPlacementQuestionIds: [],
              pendingRawPageAssetIds: ["asset-primary-1"],
              pendingSourceUploadTaskId: "task-primary-1"
            }
          : document
      ),
      downstreamAction: {
        kind: "primary_lecture_sync_pending",
        targetDocumentId: fixture.primaryLecture.id,
        normalizedFileName: "牛顿定律主讲义.pdf",
        syncPlan: {
          status: "delta",
          conflictReason: null,
          preservedBlockIds: ["block-a"],
          addedBlocks: [
            {
              blockId: "block-b",
              questionIds: ["q-2"],
              insertAfterBlockId: "block-a",
              insertBeforeBlockId: null
            }
          ],
          removedBlockIds: []
        }
      }
    });
  });

  it("normalizes one primary-lecture task path to the resolved lecture folder path", () => {
    const fixture = createSpecializedFixture();
    const lectureFolderPath = fixture.examLibraryFolders.find(
      (folder) => folder.id === fixture.primaryLecture.folderId
    )?.path;
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
      processMobileUploadTask({
        task: {
          id: "task-primary-2",
          deviceId: "device-a",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: fixture.primaryLecture.id,
          targetNodePath: ["stale", "client", "path"],
          originalFileName: "闅忔墜鍛藉悕.pdf",
          normalizedFileName: "鐗涢】瀹氬緥涓昏涔?pdf",
          mimeType: "application/pdf",
          status: "received",
          createdAt: "2026-06-03T10:00:00.000Z"
        },
        sourceAssetId: "asset-primary-2",
        uploadedSyncMetadata: currentMetadata,
        questionFolders: fixture.allQuestionFolders,
        examLibraryFolders: fixture.examLibraryFolders,
        examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
          document.id === fixture.primaryLecture.id
            ? {
                ...document,
                syncMetadata: currentMetadata
              }
            : document
        )
      }).task.targetNodePath
    ).toEqual(lectureFolderPath);
  });
});
