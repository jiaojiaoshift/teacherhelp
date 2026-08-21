import { describe, expect, it } from "vitest";

import type { MobileUploadPairingSessionEntity } from "@/lib/domain/entities";
import {
  buildInitialExamLibraryFolders,
  createDefaultSpecializedDocuments
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree, createCustomFolder } from "@/lib/services/folder-service";
import { receiveWorkspaceMobileUpload } from "@/lib/services/workspace-mobile-upload-receiver-service";

function createActiveSession(overrides?: Partial<MobileUploadPairingSessionEntity>) {
  return {
    id: "pairing-session-1",
    helperBaseUrl: "http://192.168.1.8:3000",
    pairingCode: "834271",
    qrPayload:
      '{"type":"teachhelper_mobile_upload_pairing","helperBaseUrl":"http://192.168.1.8:3000","pairingSessionId":"pairing-session-1","pairingCode":"834271"}',
    createdAt: "2026-06-03T12:00:00.000Z",
    expiresAt: "2026-06-03T12:15:00.000Z",
    pairedDeviceIds: [],
    ...overrides
  };
}

function createSpecializedFixture() {
  const questionFolders = buildInitialFolderTree();
  const subjectRoot = questionFolders.find(
    (folder) => folder.kind === "system" && folder.depth === 1 && folder.subjectScope !== null
  );

  if (!subjectRoot || !subjectRoot.subjectScope) {
    throw new Error("missing subject root");
  }

  const chapter = createCustomFolder({
    name: "\u529b\u5b66",
    parent: subjectRoot
  });
  const leaf = createCustomFolder({
    name: "\u725b\u987f\u5b9a\u5f8b",
    parent: chapter
  });
  const allQuestionFolders = questionFolders.concat(chapter, leaf);
  const examLibraryFolders = buildInitialExamLibraryFolders(allQuestionFolders);
  const specializedLeaf = examLibraryFolders.find(
    (folder) => folder.library === "specialized" && folder.linkedQuestionFolderId === leaf.id
  );
  const archiveFolder = examLibraryFolders.find(
    (folder) => folder.role === "lecture_archive" && folder.parentId === specializedLeaf?.id
  );

  if (!specializedLeaf || !archiveFolder) {
    throw new Error("missing specialized leaf");
  }

  return {
    allQuestionFolders,
    specializedLeaf,
    archiveFolder,
    examLibraryFolders,
    examLibraryDocuments: createDefaultSpecializedDocuments({
      folder: specializedLeaf,
      subjectScope: specializedLeaf.subjectScope
    }),
    primaryLecture: createDefaultSpecializedDocuments({
      folder: specializedLeaf,
      subjectScope: specializedLeaf.subjectScope
    }).find((document) => document.kind === "lecture" && document.lectureVariant === "primary")
  };
}

describe("workspace-mobile-upload-receiver-service", () => {
  it("rejects one mobile upload when the pairing session is missing or mismatched", () => {
    const questionFolders = buildInitialFolderTree();
    const targetFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(targetFolder).toBeTruthy();

    expect(
      receiveWorkspaceMobileUpload({
        file: {
          name: "functions.pdf",
          type: "application/pdf",
          size: 4096
        },
        upload: {
          deviceId: "android-a",
          pairedSessionId: "pairing-session-missing",
          uploadKind: "question_bank_pdf",
          targetNodeId: targetFolder!.id,
          targetNodePath: targetFolder!.path
        },
        questionFolders,
        examLibraryFolders: [],
        examLibraryDocuments: [],
        activePairingSession: createActiveSession()
      })
    ).toEqual({
      status: "rejected",
      errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u914d\u5bf9\u4f1a\u8bdd\u65e0\u6548"
    });
  });

  it("queues one paired question-bank mobile upload for downstream ingestion and registers the device", () => {
    const questionFolders = buildInitialFolderTree();
    const targetFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(targetFolder).toBeTruthy();

    const result = receiveWorkspaceMobileUpload({
      file: {
        name: "functions.pdf",
        type: "application/pdf",
        size: 4096
      },
      upload: {
        deviceId: "android-a",
        pairedSessionId: "pairing-session-1",
        uploadKind: "question_bank_pdf",
        targetNodeId: targetFolder!.id,
        targetNodePath: targetFolder!.path
      },
      questionFolders,
      examLibraryFolders: [],
      examLibraryDocuments: [],
      activePairingSession: createActiveSession(),
      now: "2026-06-03T12:05:00.000Z",
      createId: (prefix) => (prefix === "mobile-upload-task" ? "task-qb-1" : "asset-qb-1")
    });

    expect(result).toMatchObject({
      status: "accepted",
      task: {
        id: "task-qb-1",
        uploadKind: "question_bank_pdf",
        status: "queued"
      },
      sourceAsset: {
        id: "asset-qb-1",
        kind: "source",
        byteLength: 4096
      },
      downstreamAction: {
        kind: "question_bank_ingestion",
        taskId: "task-qb-1",
        sourceAssetId: "asset-qb-1"
      },
      pairingSession: {
        pairedDeviceIds: ["android-a"]
      }
    });
  });

  it("rejects one paired mobile upload when the file is not a pdf", () => {
    const questionFolders = buildInitialFolderTree();
    const targetFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(targetFolder).toBeTruthy();

    expect(
      receiveWorkspaceMobileUpload({
        file: {
          name: "functions.png",
          type: "image/png",
          size: 4096
        },
        upload: {
          deviceId: "android-a",
          pairedSessionId: "pairing-session-1",
          uploadKind: "question_bank_pdf",
          targetNodeId: targetFolder!.id,
          targetNodePath: targetFolder!.path
        },
        questionFolders,
        examLibraryFolders: [],
        examLibraryDocuments: [],
        activePairingSession: createActiveSession(),
        now: "2026-06-03T12:05:00.000Z"
      })
    ).toEqual({
      status: "rejected",
      errorMessage: "\u4ec5\u652f\u6301 PDF \u6587\u4ef6\u4e0a\u4f20"
    });
  });

  it("applies one paired lecture-archive upload directly into exam-library documents", () => {
    const fixture = createSpecializedFixture();

    const result = receiveWorkspaceMobileUpload({
      file: {
        name: "\u738b\u660e_\u9ad8\u4e8c_26_06_03.pdf",
        type: "application/pdf",
        size: 8192
      },
      upload: {
        deviceId: "android-b",
        pairedSessionId: "pairing-session-1",
        uploadKind: "lecture_archive_pdf",
        targetNodeId: fixture.archiveFolder.id,
        targetNodePath: fixture.archiveFolder.path
      },
      questionFolders: fixture.allQuestionFolders,
      examLibraryFolders: fixture.examLibraryFolders,
      examLibraryDocuments: fixture.examLibraryDocuments,
      activePairingSession: createActiveSession({
        pairedDeviceIds: ["android-a"]
      }),
      now: "2026-06-03T12:08:00.000Z",
      createId: (prefix) =>
        prefix === "mobile-upload-task" ? "task-archive-1" : "asset-archive-1"
    });

    expect(result).toMatchObject({
      status: "accepted",
      task: {
        id: "task-archive-1",
        uploadKind: "lecture_archive_pdf",
        status: "completed"
      },
      downstreamAction: {
        kind: "archive_applied",
        createdDocumentId: "lecture-archive-task-archive-1"
      },
      pairingSession: {
        pairedDeviceIds: ["android-a", "android-b"]
      }
    });
    expect(
      result.status === "accepted"
        ? result.examLibraryDocuments.some(
            (document) => document.id === "lecture-archive-task-archive-1"
          )
        : false
    ).toBe(true);
  });

  it("applies one paired lecture-archive upload when mobile targets the specialized third-level folder", () => {
    const fixture = createSpecializedFixture();

    const result = receiveWorkspaceMobileUpload({
      file: {
        name: "\u738b\u660e_\u9ad8\u4e8c_26_06_03.pdf",
        type: "application/pdf",
        size: 8192
      },
      upload: {
        deviceId: "android-c",
        pairedSessionId: "pairing-session-1",
        uploadKind: "lecture_archive_pdf",
        targetNodeId: fixture.specializedLeaf.id,
        targetNodePath: fixture.specializedLeaf.path
      },
      questionFolders: fixture.allQuestionFolders,
      examLibraryFolders: fixture.examLibraryFolders,
      examLibraryDocuments: fixture.examLibraryDocuments,
      activePairingSession: createActiveSession({
        pairedDeviceIds: ["android-a"]
      }),
      now: "2026-06-03T12:10:00.000Z",
      createId: (prefix) =>
        prefix === "mobile-upload-task" ? "task-archive-2" : "asset-archive-2"
    });

    expect(result).toMatchObject({
      status: "accepted",
      task: {
        id: "task-archive-2",
        uploadKind: "lecture_archive_pdf",
        status: "completed",
        targetNodeId: fixture.archiveFolder.id,
        targetNodePath: fixture.archiveFolder.path
      },
      downstreamAction: {
        kind: "archive_applied",
        createdDocumentId: "lecture-archive-task-archive-2"
      },
      pairingSession: {
        pairedDeviceIds: ["android-a", "android-c"]
      }
    });
    expect(
      result.status === "accepted"
        ? result.examLibraryDocuments.find(
            (document) => document.id === "lecture-archive-task-archive-2"
          )
        : null
    ).toMatchObject({
      id: "lecture-archive-task-archive-2",
      folderId: fixture.archiveFolder.id
    });
  });

  it("rejects one paired lecture-archive upload when the archive file name breaks the fixed naming rule", () => {
    const fixture = createSpecializedFixture();

    expect(
      receiveWorkspaceMobileUpload({
        file: {
          name: "camera-scan.pdf",
          type: "application/pdf",
          size: 8192
        },
        upload: {
          deviceId: "android-b",
          pairedSessionId: "pairing-session-1",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: fixture.archiveFolder.id,
          targetNodePath: fixture.archiveFolder.path
        },
        questionFolders: fixture.allQuestionFolders,
        examLibraryFolders: fixture.examLibraryFolders,
        examLibraryDocuments: fixture.examLibraryDocuments,
        activePairingSession: createActiveSession({
          pairedDeviceIds: ["android-a"]
        }),
        now: "2026-06-03T12:08:00.000Z"
      })
    ).toMatchObject({
      status: "rejected",
      errorMessage: "\u8bb2\u4e49\u5f52\u6863\u6587\u4ef6\u540d\u4e0d\u7b26\u5408\u547d\u540d\u89c4\u5219",
      task: {
        deviceId: "android-b",
        uploadKind: "lecture_archive_pdf",
        targetNodeId: fixture.archiveFolder.id,
        targetNodePath: fixture.archiveFolder.path,
        originalFileName: "camera-scan.pdf",
        normalizedFileName: "camera-scan.pdf",
        mimeType: "application/pdf",
        status: "failed",
        createdAt: "2026-06-03T12:08:00.000Z",
        errorMessage: "\u8bb2\u4e49\u5f52\u6863\u6587\u4ef6\u540d\u4e0d\u7b26\u5408\u547d\u540d\u89c4\u5219"
      }
    });
  });

  it("normalizes one failed lecture-archive upload target to the archive folder when mobile selected the third-level folder", () => {
    const fixture = createSpecializedFixture();

    expect(
      receiveWorkspaceMobileUpload({
        file: {
          name: "camera-scan.pdf",
          type: "application/pdf",
          size: 8192
        },
        upload: {
          deviceId: "android-c",
          pairedSessionId: "pairing-session-1",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: fixture.specializedLeaf.id,
          targetNodePath: fixture.specializedLeaf.path
        },
        questionFolders: fixture.allQuestionFolders,
        examLibraryFolders: fixture.examLibraryFolders,
        examLibraryDocuments: fixture.examLibraryDocuments,
        activePairingSession: createActiveSession({
          pairedDeviceIds: ["android-a"]
        }),
        now: "2026-06-03T12:09:00.000Z"
      })
    ).toMatchObject({
      status: "rejected",
      errorMessage: "\u8bb2\u4e49\u5f52\u6863\u6587\u4ef6\u540d\u4e0d\u7b26\u5408\u547d\u540d\u89c4\u5219",
      task: {
        deviceId: "android-c",
        uploadKind: "lecture_archive_pdf",
        targetNodeId: fixture.archiveFolder.id,
        targetNodePath: fixture.archiveFolder.path,
        originalFileName: "camera-scan.pdf",
        normalizedFileName: "camera-scan.pdf",
        mimeType: "application/pdf",
        status: "failed",
        createdAt: "2026-06-03T12:09:00.000Z",
        errorMessage: "\u8bb2\u4e49\u5f52\u6863\u6587\u4ef6\u540d\u4e0d\u7b26\u5408\u547d\u540d\u89c4\u5219"
      }
    });
  });

  it("returns one failed task when one paired primary-lecture upload conflicts with the current block structure", () => {
    const fixture = createSpecializedFixture();

    if (!fixture.primaryLecture) {
      throw new Error("missing primary lecture");
    }

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
      receiveWorkspaceMobileUpload({
        file: {
          name: "whatever.pdf",
          type: "application/pdf",
          size: 8192
        },
        upload: {
          deviceId: "android-d",
          pairedSessionId: "pairing-session-1",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: fixture.primaryLecture.id,
          targetNodePath: ["stale", "client", "path"]
        },
        questionFolders: fixture.allQuestionFolders,
        examLibraryFolders: fixture.examLibraryFolders,
        examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
          document.id === fixture.primaryLecture?.id
            ? {
                ...document,
                syncMetadata: currentMetadata,
                lastExportedSyncMetadata: uploadedMetadata
              }
            : document
        ),
        activePairingSession: createActiveSession({
          pairedDeviceIds: ["android-a"]
        }),
        now: "2026-06-03T12:12:00.000Z",
        createId: (prefix) =>
          prefix === "mobile-upload-task" ? "task-primary-failed-1" : "asset-primary-failed-1"
      })
    ).toMatchObject({
      status: "rejected",
      errorMessage: "\u4e3b\u8bb2\u4e49\u540c\u6b65\u4fe1\u606f\u4e0e\u5f53\u524d\u9898\u5757\u7ed3\u6784\u51b2\u7a81",
      task: {
        id: "task-primary-failed-1",
        status: "failed",
        targetNodeId: fixture.primaryLecture.id,
        targetNodePath: fixture.examLibraryFolders.find(
          (folder) => folder.id === fixture.primaryLecture?.folderId
        )?.path,
        errorMessage: "\u4e3b\u8bb2\u4e49\u540c\u6b65\u4fe1\u606f\u4e0e\u5f53\u524d\u9898\u5757\u7ed3\u6784\u51b2\u7a81"
      }
    });
  });
});
