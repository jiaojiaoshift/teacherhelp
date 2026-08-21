import { afterEach, describe, expect, it, vi } from "vitest";

import { POST as postMobileUploadPairing } from "@/app/api/mobile-upload/pairing/route";
import { POST as postMobileUploadReceive } from "@/app/api/mobile-upload/receive/route";
import { POST as postMobileUploadWorkspaceSync } from "@/app/api/mobile-upload/workspace-sync/route";
import { renderPdfArrayBufferToPagePreviews } from "@/lib/pdf/pdf-renderer";
import {
  clearMobileUploadHelperStateForTests,
  getActiveMobileUploadPairingSession,
  getMobileUploadHelperProcessedFullPaperDrafts,
  getMobileUploadHelperProcessedLectureUploads,
  getMobileUploadHelperPendingUploads,
  getMobileUploadHelperProcessedQuestionBankImports,
  getMobileUploadHelperWorkspaceSnapshot
} from "@/lib/server/mobile-upload-helper-state";
import { prepareAiPreviewDataUrl } from "@/lib/services/ai-image-preview-service";
import {
  MAX_SYNCHRONOUS_MOBILE_PREPROCESS_BYTES,
  MAX_UPLOAD_REQUEST_BYTES,
  MAX_UPLOAD_FILE_BYTES
} from "@/lib/services/upload-capacity";
import {
  buildInitialExamLibraryFolders,
  createDefaultSpecializedDocuments
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree, createCustomFolder } from "@/lib/services/folder-service";

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
    archiveFolder,
    questionFolders: allQuestionFolders,
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

describe("mobile upload receive route", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearMobileUploadHelperStateForTests();
  });

  it("rejects one upload when there is no active pairing session", async () => {
    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4"], "functions.pdf", { type: "application/pdf" }));
    formData.set("deviceId", "android-a");
    formData.set("pairedSessionId", "pairing-session-missing");
    formData.set("uploadKind", "question_bank_pdf");
    formData.set("targetNodeId", "root-math");
    formData.set(
      "targetNodePath",
      JSON.stringify(["\u6211\u7684\u9898\u5e93", "高中数学"])
    );
    formData.set(
      "workspaceSnapshot",
      JSON.stringify({
        questionFolders: buildInitialFolderTree(),
        examLibraryFolders: [],
        examLibraryDocuments: []
      })
    );

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u914d\u5bf9\u4f1a\u8bdd\u65e0\u6548"
    });
  });

  it("rejects an oversized mobile PDF before pairing or processing", async () => {
    const file = {
      name: "large.pdf",
      type: "application/pdf",
      size: MAX_UPLOAD_FILE_BYTES + 1
    };
    const request = {
      formData: async () =>
        ({
          get: (key: string) => (key === "file" ? file : null)
        }) as unknown as FormData
    } as unknown as Request;

    const response = await postMobileUploadReceive(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: "file_too_large"
    });
    expect(getActiveMobileUploadPairingSession()).toBeNull();
  });

  it("rejects an oversized declared request before materializing multipart form data", async () => {
    const formDataSpy = vi.fn(async () => {
      throw new Error("multipart body should not be parsed");
    });
    const request = {
      headers: new Headers({
        "content-length": String(MAX_UPLOAD_REQUEST_BYTES + 1)
      }),
      formData: formDataSpy
    } as unknown as Request;

    const response = await postMobileUploadReceive(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      code: "file_too_large"
    });
    expect(formDataSpy).not.toHaveBeenCalled();
  });

  it("queues a large paired PDF before helper-side preprocessing can block the upload request", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", { method: "POST" })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const mathFolder = questionFolders.find((folder) => folder.subjectScope === "高中数学");

    expect(mathFolder).toBeTruthy();
    const renderSpy = vi.mocked(renderPdfArrayBufferToPagePreviews);
    renderSpy.mockReset();
    const file = new File(["%PDF-1.4"], "large-functions.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", {
      configurable: true,
      value: MAX_SYNCHRONOUS_MOBILE_PREPROCESS_BYTES + 1
    });
    const fields = new Map<string, FormDataEntryValue>([
      ["file", file],
      ["deviceId", "android-large-a"],
      ["pairedSessionId", pairingPayload.pairingSession.id],
      ["uploadKind", "question_bank_pdf"],
      ["targetNodeId", mathFolder!.id],
      ["targetNodePath", JSON.stringify(mathFolder!.path)],
      [
        "workspaceSnapshot",
        JSON.stringify({
          questionFolders,
          examLibraryFolders: [],
          examLibraryDocuments: []
        })
      ]
    ]);

    const request = {
      formData: async () => ({
        get: (key: string) => fields.get(key) ?? null
      })
    } as unknown as Request;
    const response = await postMobileUploadReceive(request);

    expect(response.status).toBe(200);
    expect((await response.json()).task.status).toBe("queued");
    expect(renderSpy).not.toHaveBeenCalled();
    expect(getMobileUploadHelperPendingUploads()).toEqual([
      expect.objectContaining({
        uploadKind: "question_bank_pdf",
        byteLength: MAX_SYNCHRONOUS_MOBILE_PREPROCESS_BYTES + 1,
        fileToken: expect.any(String)
      })
    ]);
  });

  it("accepts one paired question-bank upload and returns one processing task after helper-side preprocessing", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const mathFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(mathFolder).toBeTruthy();
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      }
    ]);
    vi.mocked(prepareAiPreviewDataUrl).mockResolvedValue(
      "compressed:data:image/png;base64,cGFnZS0x"
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:page-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4"], "functions.pdf", { type: "application/pdf" }));
    formData.set("deviceId", "android-a");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "question_bank_pdf");
    formData.set("targetNodeId", mathFolder!.id);
    formData.set("targetNodePath", JSON.stringify(mathFolder!.path));
    formData.set(
      "workspaceSnapshot",
      JSON.stringify({
        questionFolders,
        examLibraryFolders: [],
        examLibraryDocuments: []
      })
    );

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("accepted");
    expect(payload.task.uploadKind).toBe("question_bank_pdf");
    expect(payload.task.status).toBe("processing");
    expect(payload.downstreamAction.kind).toBe("question_bank_ingestion");
    expect(payload.pairingSession.pairedDeviceIds).toEqual(["android-a"]);
  });

  it("accepts one paired question-bank upload through the last synced helper workspace snapshot", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const mathFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(mathFolder).toBeTruthy();
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      }
    ]);
    vi.mocked(prepareAiPreviewDataUrl).mockResolvedValue(
      "compressed:data:image/png;base64,cGFnZS0x"
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:page-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders,
          examLibraryFolders: [],
          examLibraryDocuments: []
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4"], "functions.pdf", { type: "application/pdf" }));
    formData.set("deviceId", "android-b");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "question_bank_pdf");
    formData.set("targetNodeId", mathFolder!.id);
    formData.set("targetNodePath", JSON.stringify(mathFolder!.path));

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("accepted");
    expect(payload.task.status).toBe("processing");
    expect(payload.pairingSession.pairedDeviceIds).toEqual(["android-b"]);
  });

  it("rejects one paired upload when neither helper nor request provides one workspace snapshot", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const mathFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(mathFolder).toBeTruthy();

    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4"], "functions.pdf", { type: "application/pdf" }));
    formData.set("deviceId", "android-no-workspace");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "question_bank_pdf");
    formData.set("targetNodeId", mathFolder!.id);
    formData.set("targetNodePath", JSON.stringify(mathFolder!.path));

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "PC 后台助手尚未同步工作区快照"
    });
  });

  it("prefers one last synced helper workspace snapshot over one stale client-provided snapshot", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const mathFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(mathFolder).toBeTruthy();

    await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders,
          examLibraryFolders: [],
          examLibraryDocuments: []
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4"], "functions.pdf", { type: "application/pdf" }));
    formData.set("deviceId", "android-c");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "question_bank_pdf");
    formData.set("targetNodeId", mathFolder!.id);
    formData.set("targetNodePath", JSON.stringify(mathFolder!.path));
    formData.set(
      "workspaceSnapshot",
      JSON.stringify({
        questionFolders: [],
        examLibraryFolders: [],
        examLibraryDocuments: []
      })
    );

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("accepted");
    expect(payload.task.status).toBe("processing");
    expect(payload.pairingSession.pairedDeviceIds).toEqual(["android-c"]);
  });

  it("rejects one non-pdf upload before routing it into the workspace receive flow", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const mathFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(mathFolder).toBeTruthy();

    const formData = new FormData();

    formData.set("file", new File(["png"], "functions.png", { type: "image/png" }));
    formData.set("deviceId", "android-a");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "question_bank_pdf");
    formData.set("targetNodeId", mathFolder!.id);
    formData.set("targetNodePath", JSON.stringify(mathFolder!.path));

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u4ec5\u652f\u6301 PDF \u6587\u4ef6\u4e0a\u4f20"
    });
  });

  it("rejects one upload when upload kind is unsupported and leaves the pairing session untouched", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const mathFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(mathFolder).toBeTruthy();

    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4"], "functions.pdf", { type: "application/pdf" }));
    formData.set("deviceId", "android-z");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "unknown_upload_kind");
    formData.set("targetNodeId", mathFolder!.id);
    formData.set("targetNodePath", JSON.stringify(mathFolder!.path));

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u7528\u9014\u65e0\u6548"
    });
    expect(getActiveMobileUploadPairingSession()?.pairedDeviceIds).toEqual([]);
  });

  it("rejects one upload when device id is missing and leaves the pairing session untouched", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const mathFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(mathFolder).toBeTruthy();

    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4"], "functions.pdf", { type: "application/pdf" }));
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "question_bank_pdf");
    formData.set("targetNodeId", mathFolder!.id);
    formData.set("targetNodePath", JSON.stringify(mathFolder!.path));

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u79fb\u52a8\u8bbe\u5907\u6807\u8bc6\u65e0\u6548"
    });
    expect(getActiveMobileUploadPairingSession()?.pairedDeviceIds).toEqual([]);
  });

  it("rejects one upload when target node path is malformed json", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const mathFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(mathFolder).toBeTruthy();

    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4"], "functions.pdf", { type: "application/pdf" }));
    formData.set("deviceId", "android-json");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "question_bank_pdf");
    formData.set("targetNodeId", mathFolder!.id);
    formData.set("targetNodePath", "{bad-json");

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
    });
  });

  it("rejects one upload when target node path json is not one string array", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const mathFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(mathFolder).toBeTruthy();

    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4"], "functions.pdf", { type: "application/pdf" }));
    formData.set("deviceId", "android-json-shape");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "question_bank_pdf");
    formData.set("targetNodeId", mathFolder!.id);
    formData.set("targetNodePath", JSON.stringify([1, 2, 3]));

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
    });
  });

  it("rejects one upload when the fallback workspace snapshot shape is invalid", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const mathFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(mathFolder).toBeTruthy();

    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4"], "functions.pdf", { type: "application/pdf" }));
    formData.set("deviceId", "android-bad-snapshot");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "question_bank_pdf");
    formData.set("targetNodeId", mathFolder!.id);
    formData.set("targetNodePath", JSON.stringify(mathFolder!.path));
    formData.set(
      "workspaceSnapshot",
      JSON.stringify({
        questionFolders: "invalid",
        examLibraryFolders: [],
        examLibraryDocuments: []
      })
    );

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
    });
  });

  it("rejects one upload when the fallback workspace snapshot contains invalid items", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const mathFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(mathFolder).toBeTruthy();

    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4"], "functions.pdf", { type: "application/pdf" }));
    formData.set("deviceId", "android-bad-snapshot-item");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "question_bank_pdf");
    formData.set("targetNodeId", mathFolder!.id);
    formData.set("targetNodePath", JSON.stringify(mathFolder!.path));
    formData.set(
      "workspaceSnapshot",
      JSON.stringify({
        questionFolders: ["invalid-folder"],
        examLibraryFolders: [],
        examLibraryDocuments: []
      })
    );

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "rejected",
      errorMessage: "\u79fb\u52a8\u4e0a\u4f20\u8bf7\u6c42\u683c\u5f0f\u65e0\u6548"
    });
  });

  it("rejects one paired lecture-archive upload when the archive file name breaks the fixed naming rule", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const fixture = createSpecializedFixture();
    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4"], "camera-scan.pdf", { type: "application/pdf" }));
    formData.set("deviceId", "android-c");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "lecture_archive_pdf");
    formData.set("targetNodeId", fixture.archiveFolder.id);
    formData.set("targetNodePath", JSON.stringify(fixture.archiveFolder.path));
    formData.set(
      "workspaceSnapshot",
      JSON.stringify({
        questionFolders: fixture.questionFolders,
        examLibraryFolders: fixture.examLibraryFolders,
        examLibraryDocuments: fixture.examLibraryDocuments
      })
    );

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );
    const payload = await response.json();
    const failedTask = getMobileUploadHelperWorkspaceSnapshot()?.mobileUploadTasks.find(
      (task) => task.id === payload.task?.id
    );

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      status: "rejected",
      errorMessage: "\u8bb2\u4e49\u5f52\u6863\u6587\u4ef6\u540d\u4e0d\u7b26\u5408\u547d\u540d\u89c4\u5219"
    });
    expect(failedTask).toMatchObject({
      status: "failed",
      deviceId: "android-c",
      uploadKind: "lecture_archive_pdf",
      targetNodeId: fixture.archiveFolder.id,
      targetNodePath: fixture.archiveFolder.path,
      errorMessage: "\u8bb2\u4e49\u5f52\u6863\u6587\u4ef6\u540d\u4e0d\u7b26\u5408\u547d\u540d\u89c4\u5219"
    });
    expect(getActiveMobileUploadPairingSession()?.pairedDeviceIds).toEqual(["android-c"]);
  });

  it("persists one failed mobile upload task when one paired primary-lecture upload conflicts with the current block structure", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
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
    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4"], "whatever.pdf", { type: "application/pdf" }));
    formData.set("deviceId", "android-failed");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "primary_lecture_pdf");
    formData.set("targetNodeId", fixture.primaryLecture.id);
    formData.set("targetNodePath", JSON.stringify(["stale", "client", "path"]));
    formData.set(
      "workspaceSnapshot",
      JSON.stringify({
        questionFolders: fixture.questionFolders,
        examLibraryFolders: fixture.examLibraryFolders,
        examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
          document.id === fixture.primaryLecture?.id
            ? {
                ...document,
                syncMetadata: currentMetadata,
                lastExportedSyncMetadata: uploadedMetadata
              }
            : document
        )
      })
    );

    const response = await postMobileUploadReceive(
      new Request("http://localhost:3000/api/mobile-upload/receive", {
        method: "POST",
        body: formData
      })
    );
    const payload = await response.json();
    const failedTask = getMobileUploadHelperWorkspaceSnapshot()?.mobileUploadTasks.find(
      (task) => task.id === payload.task?.id
    );

    expect(response.status).toBe(409);
    expect(payload).toMatchObject({
      status: "rejected",
      errorMessage: "\u4e3b\u8bb2\u4e49\u540c\u6b65\u4fe1\u606f\u4e0e\u5f53\u524d\u9898\u5757\u7ed3\u6784\u51b2\u7a81",
      task: {
        status: "failed",
        errorMessage: "\u4e3b\u8bb2\u4e49\u540c\u6b65\u4fe1\u606f\u4e0e\u5f53\u524d\u9898\u5757\u7ed3\u6784\u51b2\u7a81"
      }
    });
    expect(failedTask).toMatchObject({
      status: "failed",
      deviceId: "android-failed",
      targetNodeId: fixture.primaryLecture.id,
      targetNodePath:
        fixture.examLibraryFolders.find((folder) => folder.id === fixture.primaryLecture?.folderId)
          ?.path,
      errorMessage: "\u4e3b\u8bb2\u4e49\u540c\u6b65\u4fe1\u606f\u4e0e\u5f53\u524d\u9898\u5757\u7ed3\u6784\u51b2\u7a81"
    });
    expect(getActiveMobileUploadPairingSession()?.pairedDeviceIds).toEqual(["android-failed"]);
  });

  it("persists one accepted question-bank upload as one helper-processed import instead of one raw pending upload", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const mathFolder = questionFolders.find(
      (folder) => folder.subjectScope === "高中数学"
    );

    expect(mathFolder).toBeTruthy();
    vi.mocked(renderPdfArrayBufferToPagePreviews).mockResolvedValue([
      {
        pageNumber: 1,
        width: 1200,
        height: 1600,
        blob: new Blob(["page-1"], { type: "image/png" })
      }
    ]);
    vi.mocked(prepareAiPreviewDataUrl).mockResolvedValue(
      "compressed:data:image/png;base64,cGFnZS0x"
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:page-1");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const formData = new FormData();

    formData.set(
      "file",
      new File(["%PDF-1.4 queued question bank"], "functions.pdf", {
        type: "application/pdf"
      })
    );
    formData.set("fileName", "functions.pdf");
    formData.set("deviceId", "android-queued-qb");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "question_bank_pdf");
    formData.set("targetNodeId", mathFolder!.id);
    formData.set("targetNodePath", JSON.stringify(mathFolder!.path));
    formData.set(
      "workspaceSnapshot",
      JSON.stringify({
        questionFolders,
        examLibraryFolders: [],
        examLibraryDocuments: []
      })
    );

    const request = {
      formData: async () => formData
    } as unknown as Request;
    const response = await postMobileUploadReceive(request);
    const payload = await response.json();
    const pendingUploads = getMobileUploadHelperPendingUploads();
    const processedImports = getMobileUploadHelperProcessedQuestionBankImports();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("accepted");
    expect(payload.task.status).toBe("processing");
    expect(pendingUploads).toEqual([]);
    expect(processedImports).toEqual([
      expect.objectContaining({
        task: expect.objectContaining({
          id: payload.task.id,
          deviceId: "android-queued-qb",
          uploadKind: "question_bank_pdf",
          targetNodeId: mathFolder!.id,
          targetNodePath: mathFolder!.path,
          originalFileName: "functions.pdf",
          normalizedFileName: "functions.pdf",
          mimeType: "application/pdf",
          status: "processing"
        }),
        documents: [
          expect.objectContaining({
            name: "functions.pdf",
            kind: "pdf"
          })
        ],
        pages: [
          expect.objectContaining({
            pageNumber: 1
          })
        ],
        pagePreviews: [
          {
            pageId: expect.any(String),
            dataUrl: "compressed:data:image/png;base64,cGFnZS0x"
          }
        ]
      })
    ]);
  });

  it("persists one accepted full-paper upload as one helper-processed full-paper draft", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders);
    const fullFolder = examLibraryFolders.find(
      (folder) => folder.library === "full" && folder.depth === 1
    );

    expect(fullFolder).toBeTruthy();
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

    const formData = new FormData();

    formData.set(
      "file",
      new File(["%PDF-1.4 queued full paper"], "suite.pdf", {
        type: "application/pdf"
      })
    );
    formData.set("fileName", "suite.pdf");
    formData.set("deviceId", "android-queued-full");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "full_paper_pdf");
    formData.set("targetNodeId", fullFolder!.id);
    formData.set("targetNodePath", JSON.stringify(fullFolder!.path));
    formData.set(
      "workspaceSnapshot",
      JSON.stringify({
        questionFolders,
        examLibraryFolders,
        examLibraryDocuments: []
      })
    );

    const request = {
      formData: async () => formData
    } as unknown as Request;
    const response = await postMobileUploadReceive(request);
    const payload = await response.json();
    const pendingUploads = getMobileUploadHelperPendingUploads();
    const processedFullPaperDrafts = getMobileUploadHelperProcessedFullPaperDrafts();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("accepted");
    expect(payload.task.status).toBe("processing");
    expect(pendingUploads).toEqual([]);
    expect(processedFullPaperDrafts).toEqual([
      expect.objectContaining({
        task: expect.objectContaining({
          id: payload.task.id,
          deviceId: "android-queued-full",
          uploadKind: "full_paper_pdf",
          targetNodeId: fullFolder!.id,
          targetNodePath: fullFolder!.path,
          originalFileName: "suite.pdf",
          normalizedFileName: "suite.pdf",
          mimeType: "application/pdf",
          status: "processing"
        }),
        pendingDraft: expect.objectContaining({
          fileName: "suite.pdf",
          folderId: fullFolder!.id,
          sourceUploadTaskId: payload.task.id,
          pageCount: 2
        }),
        binaryAssets: expect.arrayContaining([
          expect.objectContaining({
            kind: "source"
          }),
          expect.objectContaining({
            kind: "display"
          })
        ])
      })
    ]);
  });

  it("falls back to one raw helper pending upload when one full-paper draft is already active", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const questionFolders = buildInitialFolderTree();
    const examLibraryFolders = buildInitialExamLibraryFolders(questionFolders);
    const fullFolder = examLibraryFolders.find(
      (folder) => folder.library === "full" && folder.depth === 1
    );

    expect(fullFolder).toBeTruthy();

    await postMobileUploadWorkspaceSync(
      new Request("http://localhost:3000/api/mobile-upload/workspace-sync", {
        method: "POST",
        body: JSON.stringify({
          questionFolders,
          examLibraryFolders,
          examLibraryDocuments: [],
          pendingUploadedFullPaperDraft: {
            id: "pending-full-paper-1",
            folderId: fullFolder!.id,
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
          }
        }),
        headers: {
          "Content-Type": "application/json"
        }
      })
    );

    const formData = new FormData();

    formData.set(
      "file",
      new File(["%PDF-1.4 queued full paper"], "suite.pdf", {
        type: "application/pdf"
      })
    );
    formData.set("fileName", "suite.pdf");
    formData.set("deviceId", "android-queued-full-blocked");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "full_paper_pdf");
    formData.set("targetNodeId", fullFolder!.id);
    formData.set("targetNodePath", JSON.stringify(fullFolder!.path));
    formData.set(
      "workspaceSnapshot",
      JSON.stringify({
        questionFolders,
        examLibraryFolders,
        examLibraryDocuments: []
      })
    );

    const request = {
      formData: async () => formData
    } as unknown as Request;
    const response = await postMobileUploadReceive(request);
    const payload = await response.json();
    const pendingUploads = getMobileUploadHelperPendingUploads();
    const processedFullPaperDrafts = getMobileUploadHelperProcessedFullPaperDrafts();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("accepted");
    expect(payload.task.status).toBe("queued");
    expect(processedFullPaperDrafts).toEqual([]);
    expect(pendingUploads).toEqual([
      expect.objectContaining({
        taskId: payload.task.id,
        deviceId: "android-queued-full-blocked",
        uploadKind: "full_paper_pdf",
        targetNodeId: fullFolder!.id,
        targetNodePath: fullFolder!.path,
        originalFileName: "suite.pdf",
        normalizedFileName: "suite.pdf",
        mimeType: "application/pdf"
      })
    ]);
  });

  it("persists one accepted lecture-archive upload as one helper-processed lecture replay instead of one raw pending upload", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const fixture = createSpecializedFixture();
    const formData = new FormData();

    formData.set(
      "file",
      new File(["%PDF-1.4 helper lecture archive"], "王明_高二_26_06_04.pdf", {
        type: "application/pdf"
      })
    );
    formData.set("fileName", "王明_高二_26_06_04.pdf");
    formData.set("deviceId", "android-lecture-archive");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "lecture_archive_pdf");
    formData.set("targetNodeId", fixture.archiveFolder.id);
    formData.set("targetNodePath", JSON.stringify(fixture.archiveFolder.path));
    formData.set(
      "workspaceSnapshot",
      JSON.stringify({
        questionFolders: fixture.questionFolders,
        examLibraryFolders: fixture.examLibraryFolders,
        examLibraryDocuments: fixture.examLibraryDocuments
      })
    );

    const request = {
      formData: async () => formData
    } as unknown as Request;
    const response = await postMobileUploadReceive(request);
    const payload = await response.json();
    const pendingUploads = getMobileUploadHelperPendingUploads();
    const processedLectureUploads = getMobileUploadHelperProcessedLectureUploads();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("accepted");
    expect(payload.task.status).toBe("completed");
    expect(pendingUploads).toEqual([]);
    expect(processedLectureUploads).toEqual([
      expect.objectContaining({
        sourceFileToken: expect.stringContaining("processed-lecture-source-"),
        task: expect.objectContaining({
          id: payload.task.id,
          deviceId: "android-lecture-archive",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: fixture.archiveFolder.id,
          targetNodePath: fixture.archiveFolder.path,
          originalFileName: "王明_高二_26_06_04.pdf",
          normalizedFileName: "王明_高二_26_06_04.pdf",
          mimeType: "application/pdf",
          status: "completed"
        }),
        binaryAssets: [
          expect.objectContaining({
            kind: "source",
            documentId: `lecture-archive-${payload.task.id}`,
            pageId: `lecture-archive-${payload.task.id}`,
            mimeType: "application/pdf"
          })
        ]
      })
    ]);
  });

  it("persists one accepted primary-lecture sync-review upload as one helper-processed lecture replay", async () => {
    const pairingResponse = await postMobileUploadPairing(
      new Request("http://localhost:3000/api/mobile-upload/pairing", {
        method: "POST"
      })
    );
    const pairingPayload = await pairingResponse.json();
    const fixture = createSpecializedFixture();

    if (!fixture.primaryLecture) {
      throw new Error("missing primary lecture");
    }

    const olderMetadata = {
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
    const currentMetadata = {
      ...olderMetadata,
      generatedAt: "2026-06-03T10:00:00.000Z",
      questionIds: ["q-1", "q-2", "q-3"],
      blocks: [
        olderMetadata.blocks[0],
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
    const formData = new FormData();

    formData.set("file", new File(["%PDF-1.4 primary lecture"], "随手命名.pdf", { type: "application/pdf" }));
    formData.set("fileName", "随手命名.pdf");
    formData.set("deviceId", "android-primary-review");
    formData.set("pairedSessionId", pairingPayload.pairingSession.id);
    formData.set("uploadKind", "primary_lecture_pdf");
    formData.set("targetNodeId", fixture.primaryLecture.id);
    formData.set("targetNodePath", JSON.stringify(["stale", "client", "path"]));
    formData.set(
      "workspaceSnapshot",
      JSON.stringify({
        questionFolders: fixture.questionFolders,
        examLibraryFolders: fixture.examLibraryFolders,
        examLibraryDocuments: fixture.examLibraryDocuments.map((document) =>
          document.id === fixture.primaryLecture?.id
            ? {
                ...document,
                syncMetadata: currentMetadata,
                lastExportedSyncMetadata: olderMetadata
              }
            : document
        )
      })
    );

    const request = {
      formData: async () => formData
    } as unknown as Request;
    const response = await postMobileUploadReceive(request);
    const payload = await response.json();
    const pendingUploads = getMobileUploadHelperPendingUploads();
    const processedLectureUploads = getMobileUploadHelperProcessedLectureUploads();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("accepted");
    expect(payload.task.status).toBe("processing");
    expect(pendingUploads).toEqual([]);
    expect(processedLectureUploads).toEqual([
      expect.objectContaining({
        sourceFileToken: expect.stringContaining("processed-lecture-source-"),
        task: expect.objectContaining({
          id: payload.task.id,
          deviceId: "android-primary-review",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: fixture.primaryLecture.id,
          status: "processing"
        }),
        binaryAssets: [
          expect.objectContaining({
            kind: "source",
            documentId: fixture.primaryLecture.id,
            pageId: fixture.primaryLecture.id,
            mimeType: "application/pdf"
          })
        ]
      })
    ]);
    expect(
      getMobileUploadHelperWorkspaceSnapshot()?.examLibraryDocuments.find(
        (document) => document.id === fixture.primaryLecture?.id
      )
    ).toMatchObject({
      syncStatus: "pending_confirmation",
      pendingSourceUploadTaskId: payload.task.id
    });
  });
});
