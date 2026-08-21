import { afterEach, describe, expect, it } from "vitest";

import { GET as getPendingUploadFile } from "@/app/api/mobile-upload/pending-uploads/file/route";
import { GET as getPendingUploads, POST as acknowledgePendingUploads } from
  "@/app/api/mobile-upload/pending-uploads/route";
import {
  clearMobileUploadHelperStateForTests,
  upsertMobileUploadHelperProcessedQuestionBankImport,
  upsertMobileUploadHelperProcessedFullPaperDraft
} from "@/lib/server/mobile-upload-helper-state";
import {
  removeMobileUploadHelperFile,
  writeMobileUploadHelperFile
} from "@/lib/server/mobile-upload-helper-file-store";

describe("mobile upload processed full-paper source file route", () => {
  const fileToken = "processed-full-paper-source-test";

  afterEach(async () => {
    clearMobileUploadHelperStateForTests();
    await removeMobileUploadHelperFile(fileToken);
  });

  function seedProcessedDraft() {
    upsertMobileUploadHelperProcessedFullPaperDraft({
      id: "processed-full-paper-source-1",
      sourceFileToken: fileToken,
      task: {
        id: "task-full-source-1",
        deviceId: "android-full-source-1",
        uploadKind: "full_paper_pdf",
        targetNodeId: "full-folder-1",
        targetNodePath: ["套卷库", "物理"],
        originalFileName: "suite.pdf",
        normalizedFileName: "suite.pdf",
        mimeType: "application/pdf",
        status: "processing",
        createdAt: "2026-08-19T08:00:00.000Z",
        errorMessage: null
      },
      pendingDraft: {
        id: "draft-full-source-1",
        folderId: "full-folder-1",
        fileName: "suite.pdf",
        sourceAssetId: "asset-source-1",
        sourceDocumentId: "draft-full-source-1",
        pageCount: 1,
        answerSection: {
          status: "suggested",
          hasAnswerSection: false,
          suggestedSplitPage: null,
          confirmedSplitPage: null
        },
        uploadedPdfPages: []
      },
      binaryAssets: [
        {
          id: "asset-source-1",
          documentId: "draft-full-source-1",
          pageId: "draft-full-source-1",
          kind: "source",
          mimeType: "application/pdf",
          byteLength: 6
        }
      ]
    });
  }

  it("publishes a sourceFileUrl without exposing the temporary token", async () => {
    await writeMobileUploadHelperFile(fileToken, new Uint8Array([37, 80, 68, 70, 45, 49]));
    seedProcessedDraft();

    const response = await getPendingUploads();
    const payload = (await response.json()) as any;
    const draft = payload.processedFullPaperDrafts[0];

    expect(draft.sourceFileToken).toBeUndefined();
    expect(draft.sourceFileUrl).toBe(
      "/api/mobile-upload/pending-uploads/file?id=processed-full-paper-source-1"
    );
  });

  it("streams a processed source file and removes it after acknowledgement", async () => {
    await writeMobileUploadHelperFile(fileToken, new Uint8Array([37, 80, 68, 70, 45, 49]));
    seedProcessedDraft();

    const response = await getPendingUploadFile(
      new Request(
        "http://localhost:3000/api/mobile-upload/pending-uploads/file?id=processed-full-paper-source-1"
      )
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([37, 80, 68, 70, 45, 49])
    );

    const acknowledgement = await acknowledgePendingUploads(
      new Request("http://localhost:3000/api/mobile-upload/pending-uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          processedFullPaperDraftId: "processed-full-paper-source-1",
          nextTaskStatus: "processing"
        })
      })
    );

    expect(acknowledgement.status).toBe(200);
    const missing = await getPendingUploadFile(
      new Request(
        "http://localhost:3000/api/mobile-upload/pending-uploads/file?id=processed-full-paper-source-1"
      )
    );
    expect(missing.status).toBe(404);
  });

  it("publishes and serves a processed question-bank source file through the same stream route", async () => {
    await writeMobileUploadHelperFile(fileToken, new Uint8Array([37, 80, 68, 70, 45, 50]));
    upsertMobileUploadHelperProcessedQuestionBankImport({
      id: "processed-question-bank-source-1",
      sourceFileToken: fileToken,
      task: {
        id: "task-question-bank-source-1",
        deviceId: "android-question-bank-source-1",
        uploadKind: "question_bank_pdf",
        targetNodeId: "question-folder-1",
        targetNodePath: ["题库", "高中物理"],
        originalFileName: "questions.pdf",
        normalizedFileName: "questions.pdf",
        mimeType: "application/pdf",
        status: "processing",
        createdAt: "2026-08-19T08:00:00.000Z",
        errorMessage: null
      },
      documents: [],
      pages: [],
      binaryAssets: [],
      pagePreviews: []
    });

    const listing = await getPendingUploads();
    const payload = (await listing.json()) as any;
    expect(payload.processedQuestionBankImports[0].sourceFileToken).toBeUndefined();
    expect(payload.processedQuestionBankImports[0].sourceFileUrl).toContain(
      "id=processed-question-bank-source-1"
    );

    const response = await getPendingUploadFile(
      new Request(
        "http://localhost:3000/api/mobile-upload/pending-uploads/file?id=processed-question-bank-source-1"
      )
    );
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([37, 80, 68, 70, 45, 50])
    );
  });
});
