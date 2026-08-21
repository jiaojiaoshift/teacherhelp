import { afterEach, describe, expect, it, vi } from "vitest";

import { renderPdfArrayBufferToPagePreviews } from "@/lib/pdf/pdf-renderer";
import { prepareAiPreviewDataUrl } from "@/lib/services/ai-image-preview-service";
import { buildInitialExamLibraryFolders } from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { consumeMobileUploadHelperPendingUpload } from "@/lib/services/mobile-upload-pending-upload-consumer-service";

vi.mock("@/lib/pdf/pdf-renderer", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf/pdf-renderer")>(
    "@/lib/pdf/pdf-renderer"
  );

  return {
    ...actual,
    renderPdfArrayBufferToPagePreviews: vi.fn()
  };
});

vi.mock("@/lib/services/ai-image-preview-service", () => ({
  prepareAiPreviewDataUrl: vi.fn(async (dataUrl: string) => `compressed:${dataUrl}`)
}));

describe("mobile-upload-pending-upload-consumer-service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("consumes one queued question-bank pending upload into the workspace import flow", async () => {
    const questionFolders = buildInitialFolderTree();
    const targetFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );
    const documents: Array<{ id: string; name: string; pageIds: string[] }> = [];
    const pages: Array<{ id: string; documentId: string }> = [];
    const pagePreviewUrls: string[] = [];
    const pagePreviewDataUrls: string[] = [];
    const binaryAssets: Array<{ id: string; kind: string; documentId: string }> = [];

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      }
    ]);
    vi.mocked(prepareAiPreviewDataUrl).mockResolvedValue("compressed:data:image/png;base64,cGFnZS0x");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:page-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const result = await consumeMobileUploadHelperPendingUpload({
      pendingUpload: {
        uploadKind: "question_bank_pdf",
        targetNodeId: targetFolder!.id,
        normalizedFileName: "functions.pdf",
        mimeType: "application/pdf",
        base64Data: "JVBERi0xLjQ="
      },
      questionFolders,
      examLibraryFolders: [],
      pendingUploadedFullPaperDraft: null,
      fileStore: {
        upsertDocument: (document) => {
          documents.push({
            id: document.id,
            name: document.name,
            pageIds: document.pageIds
          });
        },
        upsertPage: (page) => {
          pages.push({
            id: page.id,
            documentId: page.documentId
          });
        }
      },
      questionStore: {
        setPagePreviewUrl: (pageId, url) => {
          pagePreviewUrls.push(`${pageId}:${url}`);
        },
        setPagePreviewDataUrl: (pageId, dataUrl) => {
          pagePreviewDataUrls.push(`${pageId}:${dataUrl}`);
        },
        appendBinaryAssets: (assets) => {
          binaryAssets.push(
            ...assets.map((asset) => ({
              id: asset.id,
              kind: asset.kind,
              documentId: asset.documentId
            }))
          );
        }
      },
      examStore: {
        setPendingUploadedFullPaperDraft: () => undefined,
        setExamWorkspaceDraft: () => undefined
      },
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answerSection: {
            hasAnswerSection: true,
            suggestedSplitPage: 1
          }
        })
      }) as unknown as typeof fetch
    });

    expect(result).toEqual({
      status: "consumed",
      nextTaskStatus: "completed"
    });
    expect(documents).toHaveLength(1);
    expect(documents[0]?.name).toBe("functions.pdf");
    expect(pages).toHaveLength(1);
    expect(pagePreviewUrls).toHaveLength(1);
    expect(pagePreviewDataUrls).toHaveLength(1);
    expect(binaryAssets.some((asset) => asset.kind === "source")).toBe(true);
  });

  it("consumes one queued full-paper pending upload into one pending full-paper draft", async () => {
    const questionFolders = buildInitialFolderTree();
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examLibraryFolders.find(
      (folder) => folder.library === "full" && folder.depth === 1
    );
    let pendingDraft: unknown = null;
    let workspaceDraft: unknown = null;
    const upsertedTasks: Array<{ id: string; status: string; deviceId: string }> = [];
    const binaryAssets: Array<{ kind: string; documentId: string }> = [];

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      },
      {
        pageNumber: 2,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-2"], { type: "image/png" })
      }
    ]);
    vi.mocked(prepareAiPreviewDataUrl)
      .mockResolvedValueOnce("compressed:data:image/png;base64,cGFnZS0x")
      .mockResolvedValueOnce("compressed:data:image/png;base64,cGFnZS0y");

    const result = await consumeMobileUploadHelperPendingUpload({
      pendingUpload: {
        taskId: "task-full-1",
        deviceId: "android-full-1",
        uploadKind: "full_paper_pdf",
        targetNodeId: targetFolder!.id,
        normalizedFileName: "suite.pdf",
        mimeType: "application/pdf",
        base64Data: "JVBERi0xLjQ="
      },
      questionFolders,
      examLibraryFolders,
      pendingUploadedFullPaperDraft: null,
      fileStore: {
        upsertDocument: () => undefined,
        upsertPage: () => undefined
      },
      questionStore: {
        setPagePreviewUrl: () => undefined,
        setPagePreviewDataUrl: () => undefined,
        appendBinaryAssets: (assets) => {
          binaryAssets.push(
            ...assets.map((asset) => ({
              kind: asset.kind,
              documentId: asset.documentId
            }))
          );
        }
      },
      examStore: {
        setPendingUploadedFullPaperDraft: (draft) => {
          pendingDraft = draft;
        },
        setExamWorkspaceDraft: (draft) => {
          workspaceDraft = draft;
        },
        upsertMobileUploadTask: (task) => {
          upsertedTasks.push({
            id: task.id,
            status: task.status,
            deviceId: task.deviceId
          });
        }
      },
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answerSection: {
            hasAnswerSection: true,
            suggestedSplitPage: 2
          }
        })
      }) as unknown as typeof fetch,
      createId: (prefix) => `${prefix}-fixed`
    });

    expect(result).toEqual({
      status: "consumed",
      nextTaskStatus: "processing"
    });
    expect(binaryAssets.filter((asset) => asset.kind === "display")).toHaveLength(2);
    expect(binaryAssets.filter((asset) => asset.kind === "source")).toHaveLength(1);
    expect(upsertedTasks).toEqual([
      {
        id: "task-full-1",
        status: "processing",
        deviceId: "android-full-1"
      }
    ]);
    expect(pendingDraft).toMatchObject({
      id: "exam-doc-fixed",
      folderId: targetFolder!.id,
      fileName: "suite.pdf",
      sourceUploadTaskId: "task-full-1",
      pageCount: 2,
      answerSection: {
        status: "suggested",
        hasAnswerSection: true,
        suggestedSplitPage: 2,
        confirmedSplitPage: null
      }
    });
    expect(workspaceDraft).toEqual({
      selectedLibrary: "full",
      selectedFolderId: targetFolder!.id,
      selectedDocumentId: null
    });
  });

  it("keeps the MIME type produced by queued full-paper preview compression", async () => {
    const questionFolders = buildInitialFolderTree();
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examLibraryFolders.find(
      (folder) => folder.library === "full" && folder.depth === 1
    );
    const binaryAssets: Array<{ kind: string; mimeType: string }> = [];

    expect(targetFolder).toBeTruthy();
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["raw-png"], { type: "image/png" })
      }
    ]);
    vi.mocked(prepareAiPreviewDataUrl).mockResolvedValue(
      "data:image/jpeg;base64,anBlZw=="
    );

    await consumeMobileUploadHelperPendingUpload({
      pendingUpload: {
        uploadKind: "full_paper_pdf",
        targetNodeId: targetFolder!.id,
        normalizedFileName: "suite.pdf",
        mimeType: "application/pdf",
        base64Data: "JVBERi0xLjQ="
      },
      questionFolders,
      examLibraryFolders,
      pendingUploadedFullPaperDraft: null,
      fileStore: {
        upsertDocument: () => undefined,
        upsertPage: () => undefined
      },
      questionStore: {
        setPagePreviewUrl: () => undefined,
        setPagePreviewDataUrl: () => undefined,
        appendBinaryAssets: (assets) => {
          assets.forEach((asset) => {
            binaryAssets.push({ kind: asset.kind, mimeType: asset.mimeType });
          });
        }
      },
      examStore: {
        setPendingUploadedFullPaperDraft: () => undefined,
        setExamWorkspaceDraft: () => undefined
      },
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answerSection: {
            hasAnswerSection: true,
            suggestedSplitPage: 1
          }
        })
      }) as unknown as typeof fetch,
      createId: (prefix) => `${prefix}-mime`
    });

    expect(binaryAssets.find((asset) => asset.kind === "display")?.mimeType).toBe(
      "image/jpeg"
    );
  });

  it("uses an injected Blob preview compressor before browser Data URL conversion", async () => {
    const questionFolders = buildInitialFolderTree();
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examLibraryFolders.find(
      (folder) => folder.library === "full" && folder.depth === 1
    );
    const rawPageBlob = new Blob([new Uint8Array(300_001)], { type: "image/png" });
    const compressedPageBlob = new Blob(["jpeg"], { type: "image/jpeg" });
    const preparePreviewBlob = vi.fn(async () => compressedPageBlob);
    const binaryAssets: Array<{ kind: string; mimeType: string }> = [];

    expect(targetFolder).toBeTruthy();
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: rawPageBlob
      }
    ]);
    vi.mocked(prepareAiPreviewDataUrl).mockClear();

    await consumeMobileUploadHelperPendingUpload({
      pendingUpload: {
        uploadKind: "full_paper_pdf",
        targetNodeId: targetFolder!.id,
        normalizedFileName: "large-suite.pdf",
        mimeType: "application/pdf",
        base64Data: "JVBERi0xLjQ="
      },
      questionFolders,
      examLibraryFolders,
      pendingUploadedFullPaperDraft: null,
      fileStore: {
        upsertDocument: () => undefined,
        upsertPage: () => undefined
      },
      questionStore: {
        setPagePreviewUrl: () => undefined,
        setPagePreviewDataUrl: () => undefined,
        appendBinaryAssets: (assets) => {
          assets.forEach((asset) => {
            binaryAssets.push({ kind: asset.kind, mimeType: asset.mimeType });
          });
        }
      },
      examStore: {
        setPendingUploadedFullPaperDraft: () => undefined,
        setExamWorkspaceDraft: () => undefined
      },
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          answerSection: {
            hasAnswerSection: true,
            suggestedSplitPage: 1
          }
        })
      }) as unknown as typeof fetch,
      preparePreviewBlob,
      createId: (prefix) => `${prefix}-browser-blob`
    });

    expect(preparePreviewBlob).toHaveBeenCalledWith(rawPageBlob);
    expect(vi.mocked(prepareAiPreviewDataUrl)).not.toHaveBeenCalled();
    expect(binaryAssets.find((asset) => asset.kind === "display")?.mimeType).toBe(
      "image/jpeg"
    );
  });

  it("loads a queued temporary PDF as a Blob without requesting another ArrayBuffer copy", async () => {
    const questionFolders = buildInitialFolderTree();
    const targetFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );
    const responseBlob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const responseBlobSpy = vi.fn(async () => responseBlob);
    const responseArrayBufferSpy = vi.fn(async () => responseBlob.arrayBuffer());
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/mobile-upload/pending-uploads/file?id=pending-1") {
        return {
          ok: true,
          blob: responseBlobSpy,
          arrayBuffer: responseArrayBufferSpy
        } as unknown as Response;
      }

      return {
        ok: true,
        json: async () => ({
          answerSection: {
            hasAnswerSection: false,
            suggestedSplitPage: null
          }
        })
      } as Response;
    }) as unknown as typeof fetch;

    expect(targetFolder).toBeTruthy();
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      }
    ]);
    vi.mocked(prepareAiPreviewDataUrl).mockImplementation(async (dataUrl) => dataUrl);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:page-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    await expect(
      consumeMobileUploadHelperPendingUpload({
        pendingUpload: {
          uploadKind: "question_bank_pdf",
          targetNodeId: targetFolder!.id,
          normalizedFileName: "large.pdf",
          mimeType: "application/pdf",
          fileUrl: "/api/mobile-upload/pending-uploads/file?id=pending-1"
        },
        questionFolders,
        examLibraryFolders: [],
        pendingUploadedFullPaperDraft: null,
        fileStore: {
          upsertDocument: () => undefined,
          upsertPage: () => undefined
        },
        questionStore: {
          setPagePreviewUrl: () => undefined,
          setPagePreviewDataUrl: () => undefined,
          appendBinaryAssets: () => undefined
        },
        examStore: {
          setPendingUploadedFullPaperDraft: () => undefined,
          setExamWorkspaceDraft: () => undefined
        },
        fetchImpl
      })
    ).resolves.toEqual({
      status: "consumed",
      nextTaskStatus: "completed"
    });

    expect(responseBlobSpy).toHaveBeenCalledTimes(1);
    expect(responseArrayBufferSpy).not.toHaveBeenCalled();
  });

  it("keeps a 400-page full-paper answer request bounded to representative samples", async () => {
    const questionFolders = buildInitialFolderTree();
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examLibraryFolders.find(
      (folder) => folder.library === "full" && folder.depth === 1
    );
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answerSection: {
          hasAnswerSection: true,
          suggestedSplitPage: 300
        }
      })
    });
    const binaryAssets: Array<{ kind: string; pageId: string }> = [];
    const pages = Array.from({ length: 400 }, (_, index) => ({
      pageNumber: index + 1,
      width: 1200,
      height: 1600,
      blob: new Blob([`page-${index + 1}`], { type: "image/png" })
    }));

    expect(targetFolder).toBeTruthy();

    vi.mocked(renderPdfArrayBufferToPagePreviews).mockImplementation(
      async (_arrayBuffer, options) => {
        for (let index = 0; index < pages.length; index += 8) {
          const batch = pages.slice(index, index + 8);
          await options?.onBatch?.({
            pages: batch,
            pageCount: pages.length,
            current: index + batch.length
          });
        }

        return [];
      }
    );
    vi.mocked(prepareAiPreviewDataUrl).mockResolvedValue("compressed:page");

    const result = await consumeMobileUploadHelperPendingUpload({
      pendingUpload: {
        taskId: "task-full-400",
        deviceId: "android-full-400",
        uploadKind: "full_paper_pdf",
        targetNodeId: targetFolder!.id,
        normalizedFileName: "large-suite.pdf",
        mimeType: "application/pdf",
        base64Data: "JVBERi0xLjQ="
      },
      questionFolders,
      examLibraryFolders,
      pendingUploadedFullPaperDraft: null,
      fileStore: {
        upsertDocument: () => undefined,
        upsertPage: () => undefined
      },
      questionStore: {
        setPagePreviewUrl: () => undefined,
        setPagePreviewDataUrl: () => undefined,
        appendBinaryAssets: (assets) => {
          assets.forEach((asset) => {
            binaryAssets.push({ kind: asset.kind, pageId: asset.pageId });
          });
        }
      },
      examStore: {
        setPendingUploadedFullPaperDraft: () => undefined,
        setExamWorkspaceDraft: () => undefined,
        upsertMobileUploadTask: () => undefined
      },
      fetchImpl,
      createId: (prefix) => `${prefix}-400`
    });

    expect(result).toEqual({
      status: "consumed",
      nextTaskStatus: "processing"
    });
    expect(binaryAssets.filter((asset) => asset.kind === "display")).toHaveLength(400);

    const requestBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(requestBody.pageCount).toBe(400);
    expect(requestBody.pageImageDataUrls).toHaveLength(12);
    expect(requestBody.sampledPageNumbers).toHaveLength(12);
    expect(requestBody.sampledPageNumbers[0]).toBe(1);
    expect(requestBody.sampledPageNumbers.at(-1)).toBe(400);
  });

  it("blocks one queued full-paper pending upload while another pending full-paper draft is still open", async () => {
    const questionFolders = buildInitialFolderTree();
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examLibraryFolders.find(
      (folder) => folder.library === "full" && folder.depth === 1
    );

    expect(targetFolder).toBeTruthy();

    const result = await consumeMobileUploadHelperPendingUpload({
      pendingUpload: {
        uploadKind: "full_paper_pdf",
        targetNodeId: targetFolder!.id,
        normalizedFileName: "suite.pdf",
        mimeType: "application/pdf",
        base64Data: "JVBERi0xLjQ="
      },
      questionFolders,
      examLibraryFolders,
      pendingUploadedFullPaperDraft: {
        id: "pending-full-paper-1",
        folderId: targetFolder!.id,
        fileName: "existing.pdf",
        sourceAssetId: "asset-source-1",
        sourceDocumentId: "pending-full-paper-1",
        pageCount: 2,
        answerSection: {
          status: "suggested",
          hasAnswerSection: true,
          suggestedSplitPage: 2,
          confirmedSplitPage: null
        },
        uploadedPdfPages: []
      },
      fileStore: {
        upsertDocument: () => undefined,
        upsertPage: () => undefined
      },
      questionStore: {
        setPagePreviewUrl: () => undefined,
        setPagePreviewDataUrl: () => undefined,
        appendBinaryAssets: () => undefined
      },
      examStore: {
        setPendingUploadedFullPaperDraft: () => undefined,
        setExamWorkspaceDraft: () => undefined
      }
    });

    expect(result).toEqual({
      status: "blocked"
    });
  });

  it("consumes one queued question-bank pending upload without one browser FileReader", async () => {
    const questionFolders = buildInitialFolderTree();
    const targetFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );
    const documents: Array<{ id: string; name: string; pageIds: string[] }> = [];
    const pagePreviewDataUrls: string[] = [];

    expect(targetFolder).toBeTruthy();

    vi.stubGlobal("FileReader", undefined);
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      }
    ]);
    vi.mocked(prepareAiPreviewDataUrl).mockImplementation(async (dataUrl) => dataUrl);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:page-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    await expect(
      consumeMobileUploadHelperPendingUpload({
        pendingUpload: {
          uploadKind: "question_bank_pdf",
          targetNodeId: targetFolder!.id,
          normalizedFileName: "functions.pdf",
          mimeType: "application/pdf",
          base64Data: "JVBERi0xLjQ="
        },
        questionFolders,
        examLibraryFolders: [],
        pendingUploadedFullPaperDraft: null,
        fileStore: {
          upsertDocument: (document) => {
            documents.push({
              id: document.id,
              name: document.name,
              pageIds: document.pageIds
            });
          },
          upsertPage: () => undefined
        },
        questionStore: {
          setPagePreviewUrl: () => undefined,
          setPagePreviewDataUrl: (pageId, dataUrl) => {
            pagePreviewDataUrls.push(`${pageId}:${dataUrl}`);
          },
          appendBinaryAssets: () => undefined
        },
        examStore: {
          setPendingUploadedFullPaperDraft: () => undefined,
          setExamWorkspaceDraft: () => undefined
        },
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 1
            }
          })
        }) as unknown as typeof fetch
      })
    ).resolves.toEqual({
      status: "consumed",
      nextTaskStatus: "completed"
    });

    expect(documents).toHaveLength(1);
    expect(pagePreviewDataUrls).toHaveLength(1);
    expect(pagePreviewDataUrls[0]).toContain("data:image/png;base64,");
  });

  it("consumes one queued full-paper pending upload without one browser FileReader", async () => {
    const questionFolders = buildInitialFolderTree();
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders);
    const targetFolder = examLibraryFolders.find(
      (folder) => folder.library === "full" && folder.depth === 1
    );
    let pendingDraft: unknown = null;

    expect(targetFolder).toBeTruthy();

    vi.stubGlobal("FileReader", undefined);
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      }
    ]);
    vi.mocked(prepareAiPreviewDataUrl).mockImplementation(async (dataUrl) => dataUrl);

    await expect(
      consumeMobileUploadHelperPendingUpload({
        pendingUpload: {
          taskId: "task-full-1",
          deviceId: "android-full-1",
          uploadKind: "full_paper_pdf",
          targetNodeId: targetFolder!.id,
          normalizedFileName: "suite.pdf",
          mimeType: "application/pdf",
          base64Data: "JVBERi0xLjQ="
        },
        questionFolders,
        examLibraryFolders,
        pendingUploadedFullPaperDraft: null,
        fileStore: {
          upsertDocument: () => undefined,
          upsertPage: () => undefined
        },
        questionStore: {
          setPagePreviewUrl: () => undefined,
          setPagePreviewDataUrl: () => undefined,
          appendBinaryAssets: () => undefined
        },
        examStore: {
          setPendingUploadedFullPaperDraft: (draft) => {
            pendingDraft = draft;
          },
          setExamWorkspaceDraft: () => undefined,
          upsertMobileUploadTask: () => undefined
        },
        fetchImpl: vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            answerSection: {
              hasAnswerSection: true,
              suggestedSplitPage: 1
            }
          })
        }) as unknown as typeof fetch,
        createId: (prefix) => `${prefix}-fixed`
      })
    ).resolves.toEqual({
      status: "consumed",
      nextTaskStatus: "processing"
    });

    expect(pendingDraft).toMatchObject({
      fileName: "suite.pdf",
      pageCount: 1,
      uploadedPdfPages: [
        expect.objectContaining({
          pageNumber: 1
        })
      ]
    });
  });
});
