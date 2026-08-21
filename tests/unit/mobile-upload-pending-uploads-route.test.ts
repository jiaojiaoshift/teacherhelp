import { afterEach, describe, expect, it } from "vitest";

import {
  GET as getMobileUploadPendingUploads,
  POST as postMobileUploadPendingUploads
} from "@/app/api/mobile-upload/pending-uploads/route";
import {
  clearMobileUploadHelperStateForTests,
  getMobileUploadHelperPendingUploads,
  getMobileUploadHelperProcessedFullPaperDrafts,
  getMobileUploadHelperProcessedLectureUploads,
  getMobileUploadHelperProcessedQuestionBankImports,
  getMobileUploadHelperWorkspaceSnapshot,
  setMobileUploadHelperWorkspaceSnapshot,
  upsertMobileUploadHelperProcessedFullPaperDraft,
  upsertMobileUploadHelperProcessedLectureUpload,
  upsertMobileUploadHelperProcessedQuestionBankImport,
  upsertMobileUploadHelperPendingUpload
} from "@/lib/server/mobile-upload-helper-state";
import { writeMobileUploadHelperFile } from "@/lib/server/mobile-upload-helper-file-store";

describe("mobile upload pending uploads route", () => {
  afterEach(() => {
    clearMobileUploadHelperStateForTests();
  });

  it("returns the current helper pending uploads", async () => {
    upsertMobileUploadHelperPendingUpload({
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

    const response = await getMobileUploadPendingUploads(
      new Request("http://localhost:3000/api/mobile-upload/pending-uploads")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pendingUploads: [
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
      ],
      processedFullPaperDrafts: [],
      processedLectureUploads: [],
      processedQuestionBankImports: [],
      examLibraryDocuments: [],
      mobileUploadTasks: []
    });
  });

  it("returns the current helper processed question-bank imports", async () => {
    upsertMobileUploadHelperProcessedQuestionBankImport({
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

    const response = await getMobileUploadPendingUploads(
      new Request("http://localhost:3000/api/mobile-upload/pending-uploads")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pendingUploads: [],
      processedFullPaperDrafts: [],
      processedLectureUploads: [],
      examLibraryDocuments: [],
      mobileUploadTasks: [],
      processedQuestionBankImports: [
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
      ]
    });
  });

  it("returns the current helper processed full-paper drafts", async () => {
    upsertMobileUploadHelperProcessedFullPaperDraft({
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

    const response = await getMobileUploadPendingUploads(
      new Request("http://localhost:3000/api/mobile-upload/pending-uploads")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pendingUploads: [],
      examLibraryDocuments: [],
      mobileUploadTasks: [],
      processedLectureUploads: [],
      processedQuestionBankImports: [],
      processedFullPaperDrafts: [
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
      ]
    });
  });

  it("returns the current helper workspace exam documents and upload tasks", async () => {
    setMobileUploadHelperWorkspaceSnapshot({
      questionFolders: [],
      examLibraryFolders: [],
      examLibraryDocuments: [
        {
          id: "archive-doc-1",
          folderId: "specialized-topic-1--archive--lecture",
          library: "specialized",
          kind: "lecture",
          lectureVariant: "archive",
          title: "王明_高二_26_06_04",
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
          targetNodeId: "specialized-topic-1--archive--lecture",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "王明_高二_26_06_04.pdf",
          mimeType: "application/pdf",
          status: "completed",
          createdAt: "2026-06-04T08:02:00.000Z",
          errorMessage: null
        }
      ]
    });

    const response = await getMobileUploadPendingUploads(
      new Request("http://localhost:3000/api/mobile-upload/pending-uploads")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      pendingUploads: [],
      processedQuestionBankImports: [],
      processedFullPaperDrafts: [],
      processedLectureUploads: [],
      examLibraryDocuments: [
        expect.objectContaining({
          id: "archive-doc-1",
          lectureVariant: "archive",
          sourceUploadTaskId: "task-archive-1"
        })
      ],
      mobileUploadTasks: [
        expect.objectContaining({
          id: "task-archive-1",
          uploadKind: "lecture_archive_pdf",
          status: "completed"
        })
      ]
    });
  });

  it("returns the current helper processed lecture uploads", async () => {
    await writeMobileUploadHelperFile(
      "processed-lecture-source-1",
      new Uint8Array([37, 80, 68, 70, 45, 49])
    );
    upsertMobileUploadHelperProcessedLectureUpload({
      id: "processed-lecture-upload-1",
      sourceFileToken: "processed-lecture-source-1",
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

    const response = await getMobileUploadPendingUploads(
      new Request("http://localhost:3000/api/mobile-upload/pending-uploads")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      pendingUploads: [],
      processedQuestionBankImports: [],
      processedFullPaperDrafts: [],
      processedLectureUploads: [
        {
          id: "processed-lecture-upload-1",
          sourceFileUrl:
            "/api/mobile-upload/pending-uploads/file?id=processed-lecture-upload-1",
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
      ],
      examLibraryDocuments: [],
      mobileUploadTasks: []
    });
  });

  it("acknowledges one consumed pending upload and updates the helper task status", async () => {
    setMobileUploadHelperWorkspaceSnapshot({
      questionFolders: [],
      examLibraryFolders: [],
      examLibraryDocuments: [],
      mobileUploadTasks: [
        {
          id: "task-1",
          deviceId: "android-a",
          uploadKind: "question_bank_pdf",
          targetNodeId: "folder-math-1",
          targetNodePath: ["我的题库", "高中数学", "函数"],
          originalFileName: "math.pdf",
          normalizedFileName: "math.pdf",
          mimeType: "application/pdf",
          status: "queued",
          createdAt: "2026-06-04T08:02:00.000Z"
        }
      ]
    });
    upsertMobileUploadHelperPendingUpload({
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

    const response = await postMobileUploadPendingUploads(
      new Request("http://localhost:3000/api/mobile-upload/pending-uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          pendingUploadId: "pending-upload-1",
          nextTaskStatus: "completed"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "acknowledged",
      pendingUploadCount: 0
    });
    expect(getMobileUploadHelperPendingUploads()).toEqual([]);
  });

  it("rejects one malformed acknowledgement payload", async () => {
    const response = await postMobileUploadPendingUploads(
      new Request("http://localhost:3000/api/mobile-upload/pending-uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          pendingUploadId: 123
        })
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "移动上传待处理确认请求格式无效"
    });
  });

  it("rejects one acknowledgement for one missing pending upload", async () => {
    const response = await postMobileUploadPendingUploads(
      new Request("http://localhost:3000/api/mobile-upload/pending-uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          pendingUploadId: "pending-upload-missing",
          nextTaskStatus: "completed"
        })
      })
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "移动上传待处理记录不存在"
    });
  });

  it("acknowledges one replayed processed question-bank import and removes it from the helper queue", async () => {
    setMobileUploadHelperWorkspaceSnapshot({
      questionFolders: [],
      examLibraryFolders: [],
      examLibraryDocuments: [],
      mobileUploadTasks: [
        {
          id: "task-qb-1",
          deviceId: "android-a",
          uploadKind: "question_bank_pdf",
          targetNodeId: "folder-math-1",
          targetNodePath: ["我的题库", "高中数学", "函数"],
          originalFileName: "math.pdf",
          normalizedFileName: "math.pdf",
          mimeType: "application/pdf",
          status: "processing",
          createdAt: "2026-06-04T08:02:00.000Z",
          errorMessage: null
        }
      ]
    });
    upsertMobileUploadHelperProcessedQuestionBankImport({
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
      documents: [],
      pages: [],
      binaryAssets: [],
      pagePreviews: []
    });

    const response = await postMobileUploadPendingUploads(
      new Request("http://localhost:3000/api/mobile-upload/pending-uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          processedQuestionBankImportId: "processed-import-1",
          nextTaskStatus: "completed"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "acknowledged",
      pendingUploadCount: 0
    });
    expect(getMobileUploadHelperProcessedQuestionBankImports()).toEqual([]);
    expect(getMobileUploadHelperWorkspaceSnapshot()?.mobileUploadTasks).toEqual([
      expect.objectContaining({
        id: "task-qb-1",
        status: "completed",
        errorMessage: null
      })
    ]);
  });

  it("acknowledges one replayed processed full-paper draft and removes it from the helper queue", async () => {
    setMobileUploadHelperWorkspaceSnapshot({
      questionFolders: [],
      examLibraryFolders: [],
      examLibraryDocuments: [],
      mobileUploadTasks: [
        {
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
        }
      ],
      pendingUploadedFullPaperDraft: {
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
        uploadedPdfPages: []
      }
    });
    upsertMobileUploadHelperProcessedFullPaperDraft({
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
        uploadedPdfPages: []
      },
      binaryAssets: []
    });

    const response = await postMobileUploadPendingUploads(
      new Request("http://localhost:3000/api/mobile-upload/pending-uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          processedFullPaperDraftId: "processed-full-paper-1",
          nextTaskStatus: "processing"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "acknowledged",
      pendingUploadCount: 0
    });
    expect(getMobileUploadHelperProcessedFullPaperDrafts()).toEqual([]);
    expect(getMobileUploadHelperWorkspaceSnapshot()).toMatchObject({
      mobileUploadTasks: [
        expect.objectContaining({
          id: "task-full-1",
          status: "processing",
          errorMessage: null
        })
      ],
      pendingUploadedFullPaperDraft: expect.objectContaining({
        id: "draft-full-1",
        sourceUploadTaskId: "task-full-1"
      })
    });
  });

  it("acknowledges one replayed processed lecture upload and removes it from the helper queue", async () => {
    setMobileUploadHelperWorkspaceSnapshot({
      questionFolders: [],
      examLibraryFolders: [],
      examLibraryDocuments: [
        {
          id: "lecture-archive-task-lecture-1",
          folderId: "specialized-topic-1--archive--lecture",
          library: "specialized",
          kind: "lecture",
          lectureVariant: "archive",
          title: "wangming_senior2_26_06_04",
          subjectScope: null,
          groupId: null,
          isDefault: false,
          sourceMode: "uploaded_pdf",
          syncBinding: "independent",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: [],
          rawPageAssetIds: ["asset-lecture-source-1"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: false,
          sourceUploadTaskId: "task-lecture-1"
        }
      ],
      mobileUploadTasks: [
        {
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
        }
      ]
    });
    upsertMobileUploadHelperProcessedLectureUpload({
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

    const response = await postMobileUploadPendingUploads(
      new Request("http://localhost:3000/api/mobile-upload/pending-uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          processedLectureUploadId: "processed-lecture-upload-1",
          nextTaskStatus: "completed"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "acknowledged",
      pendingUploadCount: 0
    });
    expect(getMobileUploadHelperProcessedLectureUploads()).toEqual([]);
    expect(getMobileUploadHelperWorkspaceSnapshot()?.mobileUploadTasks).toEqual([
      expect.objectContaining({
        id: "task-lecture-1",
        status: "completed",
        errorMessage: null
      })
    ]);
  });
});
