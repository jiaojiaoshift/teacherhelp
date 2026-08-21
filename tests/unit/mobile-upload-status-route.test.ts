import { afterEach, describe, expect, it } from "vitest";

import { GET as getMobileUploadStatus } from "@/app/api/mobile-upload/status/route";
import {
  clearMobileUploadHelperStateForTests,
  setActiveMobileUploadPairingSession,
  setMobileUploadHelperWorkspaceSnapshot,
  upsertMobileUploadHelperProcessedFullPaperDraft,
  upsertMobileUploadHelperProcessedLectureUpload,
  upsertMobileUploadHelperProcessedQuestionBankImport,
  upsertMobileUploadHelperPendingUpload
} from "@/lib/server/mobile-upload-helper-state";
import { buildInitialFolderTree } from "@/lib/services/folder-service";

describe("mobile upload status route", () => {
  afterEach(() => {
    clearMobileUploadHelperStateForTests();
  });

  it("returns the current helper pairing session, documents and tasks", async () => {
    const questionFolders = buildInitialFolderTree();

    setActiveMobileUploadPairingSession({
      id: "pairing-session-1",
      helperBaseUrl: "http://localhost:3000",
      pairingCode: "834271",
      qrPayload:
        '{"type":"teachhelper_mobile_upload_pairing","helperBaseUrl":"http://localhost:3000","pairingSessionId":"pairing-session-1","pairingCode":"834271"}',
      createdAt: "2026-06-03T12:00:00.000Z",
      expiresAt: "2099-06-03T12:15:00.000Z",
      pairedDeviceIds: ["android-a"]
    });
    setMobileUploadHelperWorkspaceSnapshot({
      questionFolders,
      examLibraryFolders: [],
      examLibraryDocuments: [
        {
          id: "archive-doc-1",
          folderId: "specialized-root--archive--lecture",
          library: "specialized",
          kind: "lecture",
          lectureVariant: "archive",
          title: "王明_高二_26_06_03",
          subjectScope: null,
          groupId: null,
          isDefault: false,
          sourceMode: "uploaded_pdf",
          syncBinding: "independent",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: [],
          rawPageAssetIds: ["asset-archive-1"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: false,
          sourceUploadTaskId: "task-archive-1"
        }
      ],
      mobileUploadTasks: [
        {
          id: "task-archive-1",
          deviceId: "android-a",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "specialized-root--archive--lecture",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "王明_高二_26_06_03.pdf",
          mimeType: "application/pdf",
          status: "completed",
          createdAt: "2026-06-03T12:08:00.000Z",
          errorMessage: null
        }
      ]
    });
    upsertMobileUploadHelperPendingUpload({
      id: "pending-upload-task-question-1",
      taskId: "task-question-1",
      deviceId: "android-b",
      uploadKind: "question_bank_pdf",
      targetNodeId: questionFolders[0]?.id ?? "folder-1",
      targetNodePath: ["我的题库", "高中物理", "力学"],
      originalFileName: "functions-source.pdf",
      normalizedFileName: "functions.pdf",
      mimeType: "application/pdf",
      createdAt: "2026-06-03T12:09:00.000Z",
      byteLength: 1234,
      base64Data: "JVBERi0xLjQ="
    });

    const response = await getMobileUploadStatus(
      new Request("http://localhost:3000/api/mobile-upload/status")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      helperReadiness: {
        receiverReadiness: "ready",
        workspaceSnapshotReady: true,
        hasActivePairingSession: true
      },
      helperPendingUploadCount: 1,
      helperPendingUploadTaskIds: ["task-question-1"],
      processedLectureUploads: [],
      pairingSession: {
        id: "pairing-session-1",
        helperBaseUrl: "http://localhost:3000",
        pairingCode: "834271",
        qrPayload:
          '{"type":"teachhelper_mobile_upload_pairing","helperBaseUrl":"http://localhost:3000","pairingSessionId":"pairing-session-1","pairingCode":"834271"}',
        createdAt: "2026-06-03T12:00:00.000Z",
        expiresAt: "2099-06-03T12:15:00.000Z",
        pairedDeviceIds: ["android-a"]
      },
      examLibraryDocuments: [
        {
          id: "archive-doc-1",
          folderId: "specialized-root--archive--lecture",
          library: "specialized",
          kind: "lecture",
          lectureVariant: "archive",
          title: "王明_高二_26_06_03",
          subjectScope: null,
          groupId: null,
          isDefault: false,
          sourceMode: "uploaded_pdf",
          syncBinding: "independent",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: [],
          rawPageAssetIds: ["asset-archive-1"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: false,
          sourceUploadTaskId: "task-archive-1"
        }
      ],
      mobileUploadTasks: [
        {
          id: "task-archive-1",
          deviceId: "android-a",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "specialized-root--archive--lecture",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "王明_高二_26_06_03.pdf",
          mimeType: "application/pdf",
          status: "completed",
          createdAt: "2026-06-03T12:08:00.000Z",
          errorMessage: null
        }
      ]
    });
  });

  it("counts helper backlog tasks from raw pending uploads and helper-processed replay queues", async () => {
    const questionFolders = buildInitialFolderTree();

    setActiveMobileUploadPairingSession({
      id: "pairing-session-1",
      helperBaseUrl: "http://localhost:3000",
      pairingCode: "834271",
      qrPayload:
        '{"type":"teachhelper_mobile_upload_pairing","helperBaseUrl":"http://localhost:3000","pairingSessionId":"pairing-session-1","pairingCode":"834271"}',
      createdAt: "2026-06-03T12:00:00.000Z",
      expiresAt: "2099-06-03T12:15:00.000Z",
      pairedDeviceIds: ["android-a"]
    });
    setMobileUploadHelperWorkspaceSnapshot({
      questionFolders,
      examLibraryFolders: [],
      examLibraryDocuments: [],
      mobileUploadTasks: [
        {
          id: "task-qb-processed-1",
          deviceId: "android-qb-processed-1",
          uploadKind: "question_bank_pdf",
          targetNodeId: "folder-qb-1",
          targetNodePath: ["question-bank", "math"],
          originalFileName: "functions.pdf",
          normalizedFileName: "functions.pdf",
          mimeType: "application/pdf",
          status: "processing",
          createdAt: "2026-06-04T08:02:00.000Z",
          errorMessage: null
        },
        {
          id: "task-full-processed-1",
          deviceId: "android-full-processed-1",
          uploadKind: "full_paper_pdf",
          targetNodeId: "full-folder-1",
          targetNodePath: ["full-library", "physics", "mechanics", "newton-paper"],
          originalFileName: "suite.pdf",
          normalizedFileName: "suite.pdf",
          mimeType: "application/pdf",
          status: "processing",
          createdAt: "2026-06-04T08:03:00.000Z",
          errorMessage: null
        }
        ,
        {
          id: "task-lecture-processed-1",
          deviceId: "android-lecture-processed-1",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "specialized-topic-1--archive--lecture",
          targetNodePath: ["specialized-library", "physics", "mechanics", "newton", "lecture-archive"],
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "wangming_senior2_26_06_04.pdf",
          mimeType: "application/pdf",
          status: "completed",
          createdAt: "2026-06-04T08:04:00.000Z",
          errorMessage: null
        }
      ]
    });
    upsertMobileUploadHelperPendingUpload({
      id: "pending-upload-task-question-1",
      taskId: "task-question-1",
      deviceId: "android-b",
      uploadKind: "question_bank_pdf",
      targetNodeId: questionFolders[0]?.id ?? "folder-1",
      targetNodePath: ["question-bank", "physics"],
      originalFileName: "functions-source.pdf",
      normalizedFileName: "functions.pdf",
      mimeType: "application/pdf",
      createdAt: "2026-06-03T12:09:00.000Z",
      byteLength: 1234,
      base64Data: "JVBERi0xLjQ="
    });
    upsertMobileUploadHelperProcessedQuestionBankImport({
      id: "processed-import-qb-1",
      task: {
        id: "task-qb-processed-1",
        deviceId: "android-qb-processed-1",
        uploadKind: "question_bank_pdf",
        targetNodeId: "folder-qb-1",
        targetNodePath: ["question-bank", "math"],
        originalFileName: "functions.pdf",
        normalizedFileName: "functions.pdf",
        mimeType: "application/pdf",
        status: "processing",
        createdAt: "2026-06-04T08:02:00.000Z",
        errorMessage: null
      },
      documents: [],
      pages: [],
      binaryAssets: [],
      pagePreviews: []
    });
    upsertMobileUploadHelperProcessedFullPaperDraft({
      id: "processed-full-paper-1",
      task: {
        id: "task-full-processed-1",
        deviceId: "android-full-processed-1",
        uploadKind: "full_paper_pdf",
        targetNodeId: "full-folder-1",
        targetNodePath: ["full-library", "physics", "mechanics", "newton-paper"],
        originalFileName: "suite.pdf",
        normalizedFileName: "suite.pdf",
        mimeType: "application/pdf",
        status: "processing",
        createdAt: "2026-06-04T08:03:00.000Z",
        errorMessage: null
      },
      pendingDraft: {
        id: "draft-full-1",
        folderId: "full-folder-1",
        fileName: "suite.pdf",
        sourceAssetId: "asset-source-1",
        sourceDocumentId: "draft-full-1",
        sourceUploadTaskId: "task-full-processed-1",
        pageCount: 2,
        answerSection: {
          status: "suggested",
          hasAnswerSection: true,
          suggestedSplitPage: 2,
          confirmedSplitPage: null
        },
        uploadedPdfPages: []
      },
      binaryAssets: []
    });
    upsertMobileUploadHelperProcessedLectureUpload({
      id: "processed-lecture-upload-1",
      task: {
        id: "task-lecture-processed-1",
        deviceId: "android-lecture-processed-1",
        uploadKind: "lecture_archive_pdf",
        targetNodeId: "specialized-topic-1--archive--lecture",
        targetNodePath: ["specialized-library", "physics", "mechanics", "newton", "lecture-archive"],
        originalFileName: "camera-scan.pdf",
        normalizedFileName: "wangming_senior2_26_06_04.pdf",
        mimeType: "application/pdf",
        status: "completed",
        createdAt: "2026-06-04T08:04:00.000Z",
        errorMessage: null
      },
      binaryAssets: [
        {
          id: "asset-lecture-source-1",
          documentId: "lecture-archive-task-lecture-processed-1",
          pageId: "lecture-archive-task-lecture-processed-1",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 1234
        }
      ]
    });

    const response = await getMobileUploadStatus(
      new Request("http://localhost:3000/api/mobile-upload/status")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      helperPendingUploadCount: 4,
      helperPendingUploadTaskIds: [
        "task-question-1",
        "task-qb-processed-1",
        "task-full-processed-1",
        "task-lecture-processed-1"
      ],
      processedLectureUploads: [
        expect.objectContaining({
          id: "processed-lecture-upload-1",
          task: expect.objectContaining({
            id: "task-lecture-processed-1",
            uploadKind: "lecture_archive_pdf"
          })
        })
      ]
    });
  });
});
