import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildInitialFolderTree } from "@/lib/services/folder-service";

const helperStateFilePath = path.join(
  process.cwd(),
  "tmp",
  "mobile-upload-helper-state.test.json"
);

describe("mobile-upload-helper-state", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();

    if (existsSync(helperStateFilePath)) {
      rmSync(helperStateFilePath, {
        force: true
      });
    }
  });

  it("persists one pairing session and one workspace snapshot across one module reload", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TEACHHELPER_MOBILE_UPLOAD_HELPER_STATE_PATH", helperStateFilePath);

    const initialModule = await import("@/lib/server/mobile-upload-helper-state");

    initialModule.clearMobileUploadHelperStateForTests();

    const pairingSession = {
      id: "pairing-session-1",
      helperBaseUrl: "http://192.168.1.8:3000",
      pairingCode: "834271",
      qrPayload:
        '{"type":"teachhelper_mobile_upload_pairing","helperBaseUrl":"http://192.168.1.8:3000","pairingSessionId":"pairing-session-1","pairingCode":"834271"}',
      createdAt: "2026-06-04T08:00:00.000Z",
      expiresAt: "2026-06-04T08:15:00.000Z",
      pairedDeviceIds: ["android-a"]
    } as const;
    const questionFolders = buildInitialFolderTree();
    const workspaceSnapshot = {
      questionFolders,
      examLibraryFolders: [],
      examLibraryDocuments: [],
      mobileUploadTasks: [
        {
          id: "task-1",
          deviceId: "android-a",
          uploadKind: "question_bank_pdf" as const,
          targetNodeId: questionFolders[0]?.id ?? "folder-1",
          targetNodePath: questionFolders[0]?.path ?? ["我的题库"],
          originalFileName: "math.pdf",
          normalizedFileName: "math.pdf",
          mimeType: "application/pdf" as const,
          status: "queued" as const,
          createdAt: "2026-06-04T08:01:00.000Z"
        }
      ],
      pendingUploadedFullPaperDraft: {
        id: "draft-full-1",
        folderId: "full-folder-1",
        fileName: "suite.pdf",
        sourceAssetId: "asset-source-1",
        sourceDocumentId: "draft-full-1",
        sourceUploadTaskId: "task-1",
        pageCount: 2,
        answerSection: {
          status: "suggested" as const,
          hasAnswerSection: true,
          suggestedSplitPage: 2,
          confirmedSplitPage: null
        },
        uploadedPdfPages: []
      },
      questionDrafts: [
        {
          id: "q-1",
          questionNumberLabel: "1",
          ocrText: "question one"
        }
      ]
    };

    initialModule.setActiveMobileUploadPairingSession(pairingSession);
    initialModule.setMobileUploadHelperWorkspaceSnapshot(workspaceSnapshot);

    expect(existsSync(helperStateFilePath)).toBe(true);

    vi.resetModules();

    const reloadedModule = await import("@/lib/server/mobile-upload-helper-state");

    expect(reloadedModule.getActiveMobileUploadPairingSession()).toEqual(pairingSession);
    expect(reloadedModule.getMobileUploadHelperWorkspaceSnapshot()).toEqual(workspaceSnapshot);

    reloadedModule.clearMobileUploadHelperStateForTests();

    expect(reloadedModule.getActiveMobileUploadPairingSession()).toBeNull();
    expect(reloadedModule.getMobileUploadHelperWorkspaceSnapshot()).toBeNull();
    expect(existsSync(helperStateFilePath)).toBe(false);
  });

  it("drops one invalid persisted workspace snapshot while keeping one valid pairing session", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TEACHHELPER_MOBILE_UPLOAD_HELPER_STATE_PATH", helperStateFilePath);

    const pairingSession = {
      id: "pairing-session-1",
      helperBaseUrl: "http://192.168.1.8:3000",
      pairingCode: "834271",
      qrPayload:
        '{"type":"teachhelper_mobile_upload_pairing","helperBaseUrl":"http://192.168.1.8:3000","pairingSessionId":"pairing-session-1","pairingCode":"834271"}',
      createdAt: "2026-06-04T08:00:00.000Z",
      expiresAt: "2026-06-04T08:15:00.000Z",
      pairedDeviceIds: ["android-a"]
    } as const;

    writeFileSync(
      helperStateFilePath,
      JSON.stringify({
        activePairingSession: pairingSession,
        latestWorkspaceSnapshot: {
          questionFolders: "invalid",
          examLibraryFolders: [],
          examLibraryDocuments: [],
          mobileUploadTasks: []
        }
      }),
      "utf8"
    );

    const reloadedModule = await import("@/lib/server/mobile-upload-helper-state");

    expect(reloadedModule.getActiveMobileUploadPairingSession()).toEqual(pairingSession);
    expect(reloadedModule.getMobileUploadHelperWorkspaceSnapshot()).toBeNull();
  });

  it("drops one invalid persisted pairing session while keeping one valid workspace snapshot", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TEACHHELPER_MOBILE_UPLOAD_HELPER_STATE_PATH", helperStateFilePath);

    const questionFolders = buildInitialFolderTree();
    const workspaceSnapshot = {
      questionFolders,
      examLibraryFolders: [],
      examLibraryDocuments: [],
      mobileUploadTasks: [],
      questionDrafts: [
        {
          id: "q-1",
          questionNumberLabel: "1",
          ocrText: "question one"
        }
      ]
    };

    writeFileSync(
      helperStateFilePath,
      JSON.stringify({
        activePairingSession: {
          id: 123
        },
        latestWorkspaceSnapshot: workspaceSnapshot
      }),
      "utf8"
    );

    const reloadedModule = await import("@/lib/server/mobile-upload-helper-state");

    expect(reloadedModule.getActiveMobileUploadPairingSession()).toBeNull();
    expect(reloadedModule.getMobileUploadHelperWorkspaceSnapshot()).toEqual(workspaceSnapshot);
  });

  it("persists one pending queued upload across one module reload", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TEACHHELPER_MOBILE_UPLOAD_HELPER_STATE_PATH", helperStateFilePath);

    const initialModule = await import("@/lib/server/mobile-upload-helper-state");

    initialModule.clearMobileUploadHelperStateForTests();
    initialModule.upsertMobileUploadHelperPendingUpload({
      id: "pending-upload-1",
      taskId: "task-1",
      deviceId: "android-a",
      uploadKind: "question_bank_pdf",
      targetNodeId: "folder-math-1",
      targetNodePath: ["我的题库", "高中数学", "函数"],
      originalFileName: "math.pdf",
      normalizedFileName: "math.pdf",
      mimeType: "application/pdf",
      createdAt: "2026-06-04T08:02:00.000Z",
      byteLength: 8,
      base64Data: "JVBERi0xLjQ="
    });

    expect(existsSync(helperStateFilePath)).toBe(true);

    vi.resetModules();

    const reloadedModule = await import("@/lib/server/mobile-upload-helper-state");

    expect(reloadedModule.getMobileUploadHelperPendingUploads()).toEqual([
      {
        id: "pending-upload-1",
        taskId: "task-1",
        deviceId: "android-a",
        uploadKind: "question_bank_pdf",
        targetNodeId: "folder-math-1",
        targetNodePath: ["我的题库", "高中数学", "函数"],
        originalFileName: "math.pdf",
        normalizedFileName: "math.pdf",
        mimeType: "application/pdf",
        createdAt: "2026-06-04T08:02:00.000Z",
        byteLength: 8,
        base64Data: "JVBERi0xLjQ="
      }
    ]);
  });

  it("persists one helper-processed question-bank import across one module reload", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TEACHHELPER_MOBILE_UPLOAD_HELPER_STATE_PATH", helperStateFilePath);

    const initialModule = await import("@/lib/server/mobile-upload-helper-state");

    initialModule.clearMobileUploadHelperStateForTests();
    initialModule.upsertMobileUploadHelperProcessedQuestionBankImport({
      id: "processed-import-1",
      task: {
        id: "task-qb-1",
        deviceId: "android-a",
        uploadKind: "question_bank_pdf",
        targetNodeId: "folder-math-1",
        targetNodePath: ["我的题库", "高中数学", "函数"],
        originalFileName: "math.pdf",
        normalizedFileName: "math.pdf",
        mimeType: "application/pdf",
        status: "completed",
        createdAt: "2026-06-04T08:02:00.000Z",
        errorMessage: null
      },
      documents: [
        {
          id: "doc-1",
          name: "math.pdf",
          kind: "pdf",
          status: "pages_ready",
          pageIds: ["page-1"],
          subjectScope: "高中数学"
        }
      ],
      pages: [
        {
          id: "page-1",
          documentId: "doc-1",
          pageNumber: 1,
          width: 1200,
          height: 1600,
          analysisStatus: "idle",
          reviewStatus: "unreviewed"
        }
      ],
      binaryAssets: [
        {
          id: "asset-source-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 1234
        }
      ],
      pagePreviews: [
        {
          pageId: "page-1",
          dataUrl: "data:image/png;base64,cGFnZS0x"
        }
      ]
    });

    expect(existsSync(helperStateFilePath)).toBe(true);

    vi.resetModules();

    const reloadedModule = await import("@/lib/server/mobile-upload-helper-state");

    expect(reloadedModule.getMobileUploadHelperProcessedQuestionBankImports()).toEqual([
      {
        id: "processed-import-1",
        task: {
          id: "task-qb-1",
          deviceId: "android-a",
          uploadKind: "question_bank_pdf",
          targetNodeId: "folder-math-1",
          targetNodePath: ["我的题库", "高中数学", "函数"],
          originalFileName: "math.pdf",
          normalizedFileName: "math.pdf",
          mimeType: "application/pdf",
          status: "completed",
          createdAt: "2026-06-04T08:02:00.000Z",
          errorMessage: null
        },
        documents: [
          {
            id: "doc-1",
            name: "math.pdf",
            kind: "pdf",
            status: "pages_ready",
            pageIds: ["page-1"],
            subjectScope: "高中数学"
          }
        ],
        pages: [
          {
            id: "page-1",
            documentId: "doc-1",
            pageNumber: 1,
            width: 1200,
            height: 1600,
            analysisStatus: "idle",
            reviewStatus: "unreviewed"
          }
        ],
        binaryAssets: [
          {
            id: "asset-source-1",
            documentId: "doc-1",
            pageId: "page-1",
            kind: "source",
            mimeType: "application/pdf",
            byteLength: 1234
          }
        ],
        pagePreviews: [
          {
            pageId: "page-1",
            dataUrl: "data:image/png;base64,cGFnZS0x"
          }
        ]
      }
    ]);
  });

  it("persists one helper-processed full-paper draft across one module reload", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TEACHHELPER_MOBILE_UPLOAD_HELPER_STATE_PATH", helperStateFilePath);

    const initialModule = await import("@/lib/server/mobile-upload-helper-state");

    initialModule.clearMobileUploadHelperStateForTests();
    initialModule.upsertMobileUploadHelperProcessedFullPaperDraft({
      id: "processed-full-paper-1",
      task: {
        id: "task-full-1",
        deviceId: "android-full-1",
        uploadKind: "full_paper_pdf",
        targetNodeId: "full-folder-1",
        targetNodePath: ["full-library", "physics", "mechanics", "newton-paper"],
        originalFileName: "suite.pdf",
        normalizedFileName: "suite.pdf",
        mimeType: "application/pdf",
        status: "processing",
        createdAt: "2026-06-04T08:02:00.000Z",
        errorMessage: null
      },
      pendingDraft: {
        id: "draft-full-1",
        folderId: "full-folder-1",
        fileName: "suite.pdf",
        sourceAssetId: "asset-source-1",
        sourceDocumentId: "draft-full-1",
        sourceUploadTaskId: "task-full-1",
        pageCount: 2,
        answerSection: {
          status: "suggested",
          hasAnswerSection: true,
          suggestedSplitPage: 2,
          confirmedSplitPage: null
        },
        uploadedPdfPages: [
          {
            pageId: "uploaded-page-1",
            pageNumber: 1,
            width: 1200,
            height: 1600,
            reviewStatus: "unreviewed",
            previewAssetId: "asset-preview-1"
          }
        ]
      },
      binaryAssets: [
        {
          id: "asset-source-1",
          documentId: "draft-full-1",
          pageId: "draft-full-1",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 1234
        },
        {
          id: "asset-preview-1",
          documentId: "draft-full-1",
          pageId: "uploaded-page-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 456,
          dataUrl: "data:image/png;base64,cGFnZS0x"
        }
      ]
    });

    expect(existsSync(helperStateFilePath)).toBe(true);

    vi.resetModules();

    const reloadedModule = await import("@/lib/server/mobile-upload-helper-state");

    expect(reloadedModule.getMobileUploadHelperProcessedFullPaperDrafts()).toEqual([
      {
        id: "processed-full-paper-1",
        task: {
          id: "task-full-1",
          deviceId: "android-full-1",
          uploadKind: "full_paper_pdf",
          targetNodeId: "full-folder-1",
          targetNodePath: ["full-library", "physics", "mechanics", "newton-paper"],
          originalFileName: "suite.pdf",
          normalizedFileName: "suite.pdf",
          mimeType: "application/pdf",
          status: "processing",
          createdAt: "2026-06-04T08:02:00.000Z",
          errorMessage: null
        },
        pendingDraft: {
          id: "draft-full-1",
          folderId: "full-folder-1",
          fileName: "suite.pdf",
          sourceAssetId: "asset-source-1",
          sourceDocumentId: "draft-full-1",
          sourceUploadTaskId: "task-full-1",
          pageCount: 2,
          answerSection: {
            status: "suggested",
            hasAnswerSection: true,
            suggestedSplitPage: 2,
            confirmedSplitPage: null
          },
          uploadedPdfPages: [
            {
              pageId: "uploaded-page-1",
              pageNumber: 1,
              width: 1200,
              height: 1600,
              reviewStatus: "unreviewed",
              previewAssetId: "asset-preview-1"
            }
          ]
        },
        binaryAssets: [
          {
            id: "asset-source-1",
            documentId: "draft-full-1",
            pageId: "draft-full-1",
            kind: "source",
            mimeType: "application/pdf",
            byteLength: 1234
          },
          {
            id: "asset-preview-1",
            documentId: "draft-full-1",
            pageId: "uploaded-page-1",
            kind: "display",
            mimeType: "image/png",
            byteLength: 456,
            dataUrl: "data:image/png;base64,cGFnZS0x"
          }
        ]
      }
    ]);
  });

  it("persists one helper-processed lecture upload across one module reload", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TEACHHELPER_MOBILE_UPLOAD_HELPER_STATE_PATH", helperStateFilePath);

    const initialModule = await import("@/lib/server/mobile-upload-helper-state");

    initialModule.clearMobileUploadHelperStateForTests();
    initialModule.upsertMobileUploadHelperProcessedLectureUpload({
      id: "processed-lecture-upload-1",
      task: {
        id: "task-lecture-1",
        deviceId: "android-lecture-1",
        uploadKind: "lecture_archive_pdf",
        targetNodeId: "specialized-topic-1--archive--lecture",
        targetNodePath: ["specialized-library", "physics", "mechanics", "newton", "lecture-archive"],
        originalFileName: "camera-scan.pdf",
        normalizedFileName: "wangming_senior2_26_06_04.pdf",
        mimeType: "application/pdf",
        status: "completed",
        createdAt: "2026-06-04T08:02:00.000Z",
        errorMessage: null
      },
      binaryAssets: [
        {
          id: "asset-lecture-source-1",
          documentId: "lecture-archive-task-lecture-1",
          pageId: "lecture-archive-task-lecture-1",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 1234
        }
      ]
    });

    expect(existsSync(helperStateFilePath)).toBe(true);

    vi.resetModules();

    const reloadedModule = await import("@/lib/server/mobile-upload-helper-state");

    expect(reloadedModule.getMobileUploadHelperProcessedLectureUploads()).toEqual([
      {
        id: "processed-lecture-upload-1",
        task: {
          id: "task-lecture-1",
          deviceId: "android-lecture-1",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "specialized-topic-1--archive--lecture",
          targetNodePath: ["specialized-library", "physics", "mechanics", "newton", "lecture-archive"],
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "wangming_senior2_26_06_04.pdf",
          mimeType: "application/pdf",
          status: "completed",
          createdAt: "2026-06-04T08:02:00.000Z",
          errorMessage: null
        },
        binaryAssets: [
          {
            id: "asset-lecture-source-1",
            documentId: "lecture-archive-task-lecture-1",
            pageId: "lecture-archive-task-lecture-1",
            kind: "source",
            mimeType: "application/pdf",
            byteLength: 1234
          }
        ]
      }
    ]);
  });
});
