import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ExamHistoryPage from "@/app/exam/history/page";
import {
  buildInitialExamLibraryFolders,
  buildInitialExamWorkspaceDraft
} from "@/lib/services/exam-library-service";
import { buildInitialFolderTree } from "@/lib/services/folder-service";
import { useQuestionStore } from "@/lib/stores/question-store";
import { useExamStore } from "@/lib/stores/exam-store";

const routerPushMock = vi.fn();
const fetchMock = vi.fn();

function createPairingSessionPayload() {
  return {
    helperReadiness: {
      receiverReadiness: "awaiting_workspace",
      workspaceSnapshotReady: false,
      hasActivePairingSession: true
    },
    pairingSession: {
      id: "pairing-session-1",
      helperBaseUrl: "http://localhost:3000",
      pairingCode: "834271",
      qrPayload:
        '{"type":"teachhelper_mobile_upload_pairing","helperBaseUrl":"http://localhost:3000","pairingSessionId":"pairing-session-1","pairingCode":"834271"}',
      createdAt: "2026-06-03T12:00:00.000Z",
      expiresAt: "2099-06-03T12:15:00.000Z",
      pairedDeviceIds: []
    }
  };
}

function createHelperStatusPayload() {
  return {
    helperReadiness: {
      receiverReadiness: "ready",
      workspaceSnapshotReady: true,
      hasActivePairingSession: true
    },
    helperPendingUploadCount: 0,
    helperPendingUploadTaskIds: [],
    pairingSession: {
      ...createPairingSessionPayload().pairingSession,
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
  };
}

vi.mock("@/lib/services/exam-print-service", () => ({
  buildPrintableExamDocument: vi.fn(() => ({
    fileNameBase: "printable-doc",
    html: "<html><body>printable exam document</body></html>"
  })),
  buildPrintableExamPdf: vi.fn(async () => ({
    fileName: "printable-doc_2026-06-03.pdf",
    blob: new Blob(["pdf"], { type: "application/pdf" })
  }))
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock
  })
}));

describe("exam-history page", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    routerPushMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        helperReadiness: {
          receiverReadiness: "idle",
          workspaceSnapshotReady: false,
          hasActivePairingSession: false
        },
        pairingSession: null,
        examLibraryDocuments: [],
        mobileUploadTasks: []
      })
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const folders = buildInitialExamLibraryFolders(buildInitialFolderTree());

    useExamStore.setState({
      examLibraryFolders: folders,
      examLibraryDocuments: [
        {
          id: "paper-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "paper one",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        },
        {
          id: "lecture-1",
          folderId: "full-root",
          library: "full",
          kind: "lecture",
          title: "lecture one",
          subjectScope: null,
          groupId: null,
          isDefault: false,
          sourceMode: "uploaded_pdf",
          syncBinding: "independent",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: [],
          rawPageAssetIds: ["asset-source-1"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: false
        }
      ],
      mobileUploadPairingSession: null,
      mobileUploadTasks: [],
      examWorkspaceDraft: buildInitialExamWorkspaceDraft(),
      hydrateWorkspaceState: useExamStore.getState().hydrateWorkspaceState,
      setExamLibraryFolders: useExamStore.getState().setExamLibraryFolders,
      setExamLibraryDocuments: useExamStore.getState().setExamLibraryDocuments,
      setMobileUploadTasks: useExamStore.getState().setMobileUploadTasks,
      setMobileUploadPairingSession: useExamStore.getState().setMobileUploadPairingSession,
      upsertMobileUploadTask: useExamStore.getState().upsertMobileUploadTask,
      upsertExamLibraryDocument: useExamStore.getState().upsertExamLibraryDocument,
      setExamWorkspaceDraft: useExamStore.getState().setExamWorkspaceDraft
    });
    useQuestionStore.setState({
      pagePreviewUrls: {},
      pagePreviewDataUrls: {},
      binaryAssets: [
        {
          id: "asset-answer-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 128,
          dataUrl: "data:image/png;base64,YW5zd2Vy"
        },
        {
          id: "asset-answer-2",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 132,
          dataUrl: "data:image/png;base64,YW5zd2VyMg=="
        }
      ],
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.95,
          directoryPath: ["subject-a", "folder-a"],
          directoryCandidatePaths: [],
          questionNumberLabel: "12",
          ocrText: "question one",
          answerAttachments: [
            {
              id: "answer-1",
              assetId: "asset-answer-1",
              kind: "matched"
            },
            {
              id: "answer-2",
              assetId: "asset-answer-2",
              kind: "manual"
            }
          ],
          lastBulkConfirmationId: null
        },
        {
          id: "q-2",
          documentId: "doc-1",
          pageIds: ["page-2"],
          primaryPageId: "page-2",
          localOrder: 2,
          globalOrder: 2,
          bboxByPage: {
            "page-2": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.95,
          directoryPath: ["subject-a", "folder-a"],
          directoryCandidatePaths: [],
          questionNumberLabel: "15",
          ocrText: "question two",
          lastBulkConfirmationId: null
        }
      ],
      crossPageCandidates: [],
      manualMergeQuestionIds: [],
      selectedQuestionId: null,
      lastBulkConfirmation: null,
      hydrateWorkspaceState: useQuestionStore.getState().hydrateWorkspaceState,
      setPagePreviewUrl: useQuestionStore.getState().setPagePreviewUrl,
      setPagePreviewDataUrl: useQuestionStore.getState().setPagePreviewDataUrl,
      setBinaryAssets: useQuestionStore.getState().setBinaryAssets,
      appendBinaryAssets: useQuestionStore.getState().appendBinaryAssets,
      purgeSourceAssetsForDocument: useQuestionStore.getState().purgeSourceAssetsForDocument,
      upsertQuestionDrafts: useQuestionStore.getState().upsertQuestionDrafts,
      replaceQuestionsForPage: useQuestionStore.getState().replaceQuestionsForPage,
      addManualQuestionDraft: useQuestionStore.getState().addManualQuestionDraft,
      removeQuestionDraft: useQuestionStore.getState().removeQuestionDraft,
      updateQuestionBBox: useQuestionStore.getState().updateQuestionBBox,
      updateQuestionAnalysis: useQuestionStore.getState().updateQuestionAnalysis,
      attachAnswerToQuestion: useQuestionStore.getState().attachAnswerToQuestion,
      appendManualAnswerToQuestion: useQuestionStore.getState().appendManualAnswerToQuestion,
      updateQuestionOcrText: useQuestionStore.getState().updateQuestionOcrText,
      updateQuestionType: useQuestionStore.getState().updateQuestionType,
      updateQuestionTags: useQuestionStore.getState().updateQuestionTags,
      applyClassificationResults: useQuestionStore.getState().applyClassificationResults,
      moveQuestionToPendingBucket: useQuestionStore.getState().moveQuestionToPendingBucket,
      assignQuestionToDirectory: useQuestionStore.getState().assignQuestionToDirectory,
      rewriteDirectoryPaths: useQuestionStore.getState().rewriteDirectoryPaths,
      reassignQuestionsFromDeletedFolder: useQuestionStore.getState().reassignQuestionsFromDeletedFolder,
      renameTagEverywhere: useQuestionStore.getState().renameTagEverywhere,
      mergeTagEverywhere: useQuestionStore.getState().mergeTagEverywhere,
      removeTagEverywhere: useQuestionStore.getState().removeTagEverywhere,
      confirmQuestionsInBulk: useQuestionStore.getState().confirmQuestionsInBulk,
      undoLastBulkConfirmation: useQuestionStore.getState().undoLastBulkConfirmation,
      setCrossPageCandidates: useQuestionStore.getState().setCrossPageCandidates,
      acceptCrossPageCandidate: useQuestionStore.getState().acceptCrossPageCandidate,
      dismissCrossPageCandidate: useQuestionStore.getState().dismissCrossPageCandidate,
      queueQuestionForManualMerge: useQuestionStore.getState().queueQuestionForManualMerge,
      clearManualMergeQueue: useQuestionStore.getState().clearManualMergeQueue,
      executeManualMerge: useQuestionStore.getState().executeManualMerge,
      clearCrossPageCandidatesForDocument: useQuestionStore.getState().clearCrossPageCandidatesForDocument,
      selectQuestion: useQuestionStore.getState().selectQuestion
    });
  });

  it("prints the selected document through one dedicated print window", () => {
    const printSpy = vi.fn();
    const closeSpy = vi.fn();
    const writeSpy = vi.fn();
    const focusSpy = vi.fn();
    const mockWindow = {
      document: {
        open: vi.fn(),
        write: writeSpy,
        close: vi.fn()
      },
      focus: focusSpy,
      print: printSpy,
      close: closeSpy
    };
    const openSpy = vi.spyOn(window, "open").mockReturnValue(mockWindow as unknown as Window);

    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-print",
          folderId: "full-root",
          library: "full",
          kind: "paper",
          title: "printable paper",
          subjectScope: null,
          groupId: "group-print",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: "full-root",
        selectedDocumentId: "paper-print"
      }
    });

    render(<ExamHistoryPage />);

    fireEvent.click(screen.getByRole("button", { name: "print-exam-document" }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining("printable exam document"));
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("exports the selected document as one pdf download", async () => {
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:print-doc");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "lecture-export",
          folderId: "specialized-root",
          library: "specialized",
          kind: "lecture",
          title: "printable lecture",
          subjectScope: null,
          groupId: "group-export",
          isDefault: false,
          sourceMode: "freeform",
          syncBinding: "independent",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: [],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "specialized",
        selectedFolderId: "specialized-root",
        selectedDocumentId: "lecture-export"
      }
    });

    render(<ExamHistoryPage />);

    const anchorClickSpy = vi.fn();
    const anchorRemoveSpy = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      if (tagName === "a") {
        return {
          click: anchorClickSpy,
          remove: anchorRemoveSpy,
          href: "",
          download: ""
        } as unknown as HTMLAnchorElement;
      }

      return originalCreateElement(tagName);
    });
    const appendSpy = vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);

    fireEvent.click(screen.getByRole("button", { name: "export-exam-document-pdf" }));

    await waitFor(() => {
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
      expect(appendSpy).toHaveBeenCalledTimes(1);
      expect(anchorClickSpy).toHaveBeenCalledTimes(1);
      expect(anchorRemoveSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:print-doc");
      expect((createElementSpy.mock.results[0]?.value as HTMLAnchorElement).download).toBe(
        "printable-doc_2026-06-03.pdf"
      );
    });
    createElementSpy.mockRestore();
  });

  it("renders specialized and full library documents", () => {
    render(<ExamHistoryPage />);

    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "select-exam-document-paper-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "select-exam-document-lecture-1" })).toBeInTheDocument();
    expect(screen.getByText("paper one")).toBeInTheDocument();
    expect(screen.getByText("lecture one")).toBeInTheDocument();
    expect(screen.getByText("题库同步")).toBeInTheDocument();
    expect(screen.getByText("PDF 导入")).toBeInTheDocument();
  });

  it("renders recent mobile upload tasks in descending created-time order and shows failure reasons", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      mobileUploadTasks: [
        {
          id: "task-older",
          deviceId: "android-a",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "folder-archive-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
          originalFileName: "older.pdf",
          normalizedFileName: "王明_高二_26_06_03.pdf",
          mimeType: "application/pdf",
          status: "completed",
          createdAt: "2026-06-03T09:00:00.000Z",
          errorMessage: null
        },
        {
          id: "task-latest",
          deviceId: "android-b",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律"],
          originalFileName: "latest.pdf",
          normalizedFileName: "牛顿定律主讲义.pdf",
          mimeType: "application/pdf",
          status: "failed",
          createdAt: "2026-06-03T10:30:00.000Z",
          errorMessage: "主讲义同步信息与当前题块结构冲突"
        }
      ]
    });

    render(<ExamHistoryPage />);

    expect(screen.getByRole("heading", { name: "Recent Mobile Uploads" })).toBeInTheDocument();

    const cards = screen.getAllByTestId("mobile-upload-task-card");

    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent("牛顿定律主讲义.pdf");
    expect(cards[0]).toHaveTextContent("Failed");
    expect(cards[0]).toHaveTextContent("主讲义同步信息与当前题块结构冲突");
    expect(cards[0]).toHaveTextContent("专题卷库 / 高中物理 / 力学 / 牛顿定律");
    expect(cards[1]).toHaveTextContent("王明_高二_26_06_03.pdf");
    expect(cards[1]).toHaveTextContent("Completed");
    expect(cards[1]).toHaveTextContent("专题卷库 / 高中物理 / 力学 / 牛顿定律 / 讲义归档");
  });

  it("renders one pc receiver status panel from the latest mobile upload summary", async () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      mobileUploadPairingSession: {
        ...createPairingSessionPayload().pairingSession,
        pairedDeviceIds: ["android-a", "android-c"]
      },
      mobileUploadTasks: [
        {
          id: "task-queued",
          deviceId: "android-a",
          uploadKind: "full_paper_pdf",
          targetNodeId: "full-topic-1",
          targetNodePath: ["套卷库", "牛顿定律套卷"],
          originalFileName: "paper.pdf",
          normalizedFileName: "牛顿定律套卷.pdf",
          mimeType: "application/pdf",
          status: "queued",
          createdAt: "2026-06-03T10:00:00.000Z",
          errorMessage: null
        },
        {
          id: "task-failed",
          deviceId: "android-c",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律"],
          originalFileName: "latest.pdf",
          normalizedFileName: "牛顿定律主讲义.pdf",
          mimeType: "application/pdf",
          status: "failed",
          createdAt: "2026-06-03T11:00:00.000Z",
          errorMessage: "主讲义同步信息与当前题块结构冲突"
        }
      ]
    });

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        helperReadiness: {
          receiverReadiness: "ready",
          workspaceSnapshotReady: true,
          hasActivePairingSession: true
        },
        helperPendingUploadCount: 1,
        helperPendingUploadTaskIds: ["task-queued"],
        pairingSession: useExamStore.getState().mobileUploadPairingSession,
        examLibraryDocuments: [],
        mobileUploadTasks: useExamStore.getState().mobileUploadTasks
      })
    } as Response);

    render(<ExamHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Helper ready")).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "PC Upload Receiver" })).toBeInTheDocument();
    expect(screen.getByText("Attention required")).toBeInTheDocument();
    expect(screen.getByText("Helper online")).toBeInTheDocument();
    expect(screen.getByText("2 paired devices")).toBeInTheDocument();
    expect(screen.getByText("1 active tasks")).toBeInTheDocument();
    expect(screen.getByText("1 helper backlog PDFs")).toBeInTheDocument();
    expect(screen.getByText("1 failed tasks")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Still stored in the PC helper backlog until one workspace instance picks up this PDF."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === "Latest upload: 牛顿定律主讲义.pdf")
    ).toBeInTheDocument();
    expect(screen.getByText("Latest device: android-c")).toBeInTheDocument();
    expect(screen.getByText("Last received at: 2026-06-03T11:00:00.000Z")).toBeInTheDocument();
  });

  it("loads one existing android pairing session from the helper route on mount", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...createPairingSessionPayload(),
        examLibraryDocuments: [],
        mobileUploadTasks: []
      })
    } as Response);

    render(<ExamHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText(/Pairing code:/)).toBeInTheDocument();
    });

    expect(
      screen.getByText((_, node) => node?.textContent?.startsWith("Receiver URL: http://localhost") ?? false)
    ).toBeInTheDocument();
    expect(screen.getByText("Ready to scan")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Android pairing QR code" })).toBeInTheDocument();
  });

  it("does not count paired devices as active receiver devices when the loaded pairing session is expired", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        helperReadiness: {
          receiverReadiness: "awaiting_workspace",
          workspaceSnapshotReady: false,
          hasActivePairingSession: true
        },
        pairingSession: {
          ...createPairingSessionPayload().pairingSession,
          expiresAt: "2000-06-03T12:15:00.000Z",
          pairedDeviceIds: ["android-a", "android-b"]
        },
        examLibraryDocuments: [],
        mobileUploadTasks: []
      })
    } as Response);

    render(<ExamHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Expired")).toBeInTheDocument();
    });

    expect(screen.getByText("Helper idle")).toBeInTheDocument();
    expect(screen.getByText("0 paired devices")).toBeInTheDocument();
    expect(screen.getByLabelText("paired-mobile-devices")).toHaveTextContent(
      "android-a, android-b"
    );
  });

  it("hydrates helper mobile upload tasks and helper-created documents from the status route on mount", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => createHelperStatusPayload()
    } as Response);

    render(<ExamHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("1 paired devices")).toBeInTheDocument();
    });

    expect(screen.getByLabelText("paired-mobile-devices")).toHaveTextContent("android-a");
    expect(screen.getByText("Helper online")).toBeInTheDocument();
    expect(screen.getByText("Helper ready")).toBeInTheDocument();
    expect(screen.getByText("1 tasks")).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent === "Latest upload: 王明_高二_26_06_03.pdf")
    ).toBeInTheDocument();
    expect(useExamStore.getState().mobileUploadTasks).toHaveLength(1);
    expect(
      useExamStore.getState().examLibraryDocuments.some((document) => document.id === "archive-doc-1")
    ).toBe(true);
  });

  it("refreshes helper mobile upload status on an interval while the history page stays open", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          helperReadiness: {
            receiverReadiness: "idle",
            workspaceSnapshotReady: false,
            hasActivePairingSession: false
          },
          pairingSession: null,
          examLibraryDocuments: [],
          mobileUploadTasks: []
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createHelperStatusPayload()
      } as Response);

    render(<ExamHistoryPage />);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Helper online")).toBeInTheDocument();
    expect(screen.getByText("1 tasks")).toBeInTheDocument();
    expect(screen.getAllByText("王明_高二_26_06_03.pdf")).toHaveLength(2);
  });

  it("shows the helper connection as offline when the status poll fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));

    render(<ExamHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("Helper offline")).toBeInTheDocument();
    });
  });

  it("clears stale helper readiness and pairing details when one status poll returns one non-ok response", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createHelperStatusPayload()
      } as Response)
      .mockResolvedValueOnce({
        ok: false
      } as Response);

    render(<ExamHistoryPage />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByText("Helper online")).toBeInTheDocument();
    expect(screen.getByText("Helper ready")).toBeInTheDocument();
    expect(screen.getByText("Paired")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
      await Promise.resolve();
    });

    expect(screen.getByText("Helper offline")).toBeInTheDocument();
    expect(screen.getByText("Helper idle")).toBeInTheDocument();
    expect(screen.getByText("0 paired devices")).toBeInTheDocument();
    expect(screen.getByText("No active pairing session.")).toBeInTheDocument();
  });

  it("creates one android pairing session from the history page and shows its payload", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          helperReadiness: {
            receiverReadiness: "idle",
            workspaceSnapshotReady: false,
            hasActivePairingSession: false
          },
          pairingSession: null,
          examLibraryDocuments: [],
          mobileUploadTasks: []
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => createPairingSessionPayload()
      } as Response);

    render(<ExamHistoryPage />);

    expect(screen.getByText("No active pairing session.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "generate-mobile-upload-pairing" }));

    await waitFor(() => {
      expect(screen.getByText(/Pairing code:/)).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "Android Pairing" })).toBeInTheDocument();
    expect(
      screen.getByText((_, node) => node?.textContent?.startsWith("Receiver URL: http://localhost") ?? false)
    ).toBeInTheDocument();
    expect(screen.getByText(/teachhelper_mobile_upload_pairing/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Android pairing QR code" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "rotate-mobile-upload-pairing" })).toBeInTheDocument();
  });

  it("opens the target primary lecture from one processing mobile upload task card", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "lecture-primary-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "lecture",
          lectureVariant: "primary",
          title: "牛顿定律主讲义",
          immutableName: "牛顿定律主讲义",
          subjectScope: null,
          groupId: "group-primary-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      mobileUploadTasks: [
        {
          id: "task-primary-processing",
          deviceId: "android-b",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律"],
          originalFileName: "latest.pdf",
          normalizedFileName: "牛顿定律主讲义.pdf",
          mimeType: "application/pdf",
          status: "processing",
          createdAt: "2026-06-03T10:30:00.000Z",
          errorMessage: null
        }
      ]
    });

    render(<ExamHistoryPage />);

    expect(
      screen.getByText("Open the target lecture to continue block-level sync review.")
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "open-mobile-upload-document-task-primary-processing"
      })
    );

    expect(useExamStore.getState().examWorkspaceDraft).toMatchObject({
      selectedLibrary: "specialized",
      selectedFolderId: "specialized-root",
      selectedDocumentId: "lecture-primary-1"
    });
  });

  it("opens the target archive lecture document from one completed archive upload task card", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryFolders: [
        ...useExamStore.getState().examLibraryFolders,
        {
          id: "specialized-topic-1--archive--lecture",
          parentId: "specialized-topic-1",
          name: "讲义归档",
          library: "specialized",
          kind: "system",
          role: "lecture_archive",
          subjectScope: null,
          depth: 4,
          path: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
          linkedQuestionFolderId: null
        }
      ],
      examLibraryDocuments: [
        {
          id: "lecture-archive-task-archive-1",
          folderId: "specialized-topic-1--archive--lecture",
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
          targetNodeId: "specialized-topic-1--archive--lecture",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "王明_高二_26_06_03.pdf",
          mimeType: "application/pdf",
          status: "completed",
          createdAt: "2026-06-03T10:30:00.000Z",
          errorMessage: null
        }
      ]
    });

    render(<ExamHistoryPage />);

    expect(
      screen.getByText("Open the archived lecture document created from this upload.")
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "open-mobile-upload-document-task-archive-1"
      })
    );

    expect(useExamStore.getState().examWorkspaceDraft).toMatchObject({
      selectedLibrary: "specialized",
      selectedFolderId: "specialized-topic-1--archive--lecture",
      selectedDocumentId: "lecture-archive-task-archive-1"
    });
  });

  it("opens the target primary lecture from one failed primary-lecture upload task card", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "lecture-primary-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "lecture",
          lectureVariant: "primary",
          title: "牛顿定律主讲义",
          immutableName: "牛顿定律主讲义",
          subjectScope: null,
          groupId: "group-primary-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      mobileUploadTasks: [
        {
          id: "task-primary-failed",
          deviceId: "android-b",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律"],
          originalFileName: "latest.pdf",
          normalizedFileName: "牛顿定律主讲义.pdf",
          mimeType: "application/pdf",
          status: "failed",
          createdAt: "2026-06-03T10:30:00.000Z",
          errorMessage: "主讲义同步信息与当前题块结构冲突"
        }
      ]
    });

    render(<ExamHistoryPage />);

    expect(
      screen.getByText("Open the target lecture to inspect the current block structure before retrying.")
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "open-mobile-upload-document-task-primary-failed"
      })
    );

    expect(useExamStore.getState().examWorkspaceDraft).toMatchObject({
      selectedLibrary: "specialized",
      selectedFolderId: "specialized-root",
      selectedDocumentId: "lecture-primary-1"
    });
  });

  it("does not render one archive action when the completed archive upload has not produced a document yet", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [],
      mobileUploadTasks: [
        {
          id: "task-archive-missing",
          deviceId: "android-a",
          uploadKind: "lecture_archive_pdf",
          targetNodeId: "specialized-topic-1--archive--lecture",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律", "讲义归档"],
          originalFileName: "camera-scan.pdf",
          normalizedFileName: "王明_高二_26_06_03.pdf",
          mimeType: "application/pdf",
          status: "completed",
          createdAt: "2026-06-03T10:30:00.000Z",
          errorMessage: null
        }
      ]
    });

    render(<ExamHistoryPage />);

    expect(
      screen.queryByText("Open the archived lecture document created from this upload.")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "open-mobile-upload-document-task-archive-missing"
      })
    ).not.toBeInTheDocument();
  });

  it("opens the target primary lecture from one completed primary-lecture upload task card", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "lecture-primary-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "lecture",
          lectureVariant: "primary",
          title: "牛顿定律主讲义",
          immutableName: "牛顿定律主讲义",
          subjectScope: null,
          groupId: "group-primary-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          rawPageAssetIds: ["asset-primary-1"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true,
          sourceUploadTaskId: "task-primary-completed"
        }
      ],
      mobileUploadTasks: [
        {
          id: "task-primary-completed",
          deviceId: "android-b",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["专题卷库", "高中物理", "力学", "牛顿定律"],
          originalFileName: "latest.pdf",
          normalizedFileName: "牛顿定律主讲义.pdf",
          mimeType: "application/pdf",
          status: "completed",
          createdAt: "2026-06-03T10:30:00.000Z",
          errorMessage: null
        }
      ]
    });

    render(<ExamHistoryPage />);

    expect(
      screen.getByText("Open the updated primary lecture document saved from this upload.")
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "open-mobile-upload-document-task-primary-completed"
      })
    );

    expect(useExamStore.getState().examWorkspaceDraft).toMatchObject({
      selectedLibrary: "specialized",
      selectedFolderId: "specialized-root",
      selectedDocumentId: "lecture-primary-1"
    });
  });

  it("shows one helper replay backlog notice for one completed primary-lecture upload that is not yet replayed locally", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        helperReadiness: {
          receiverReadiness: "ready",
          workspaceSnapshotReady: true,
          hasActivePairingSession: true
        },
        helperPendingUploadCount: 1,
        helperPendingUploadTaskIds: ["task-primary-completed"],
        pairingSession: useExamStore.getState().mobileUploadPairingSession,
        examLibraryDocuments: useExamStore.getState().examLibraryDocuments,
        mobileUploadTasks: [
          {
            id: "task-primary-completed",
            deviceId: "android-b",
            uploadKind: "primary_lecture_pdf",
            targetNodeId: "lecture-primary-1",
            targetNodePath: ["Specialized Library", "Physics", "Mechanics", "Newton"],
            originalFileName: "latest.pdf",
            normalizedFileName: "newton_primary_lecture.pdf",
            mimeType: "application/pdf",
            status: "completed",
            createdAt: "2026-06-03T10:30:00.000Z",
            errorMessage: null
          }
        ]
      })
    } as Response);

    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "lecture-primary-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "lecture",
          lectureVariant: "primary",
          title: "Newton Primary Lecture",
          immutableName: "Newton Primary Lecture",
          subjectScope: null,
          groupId: "group-primary-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          rawPageAssetIds: ["asset-primary-1"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true,
          sourceUploadTaskId: "task-primary-completed"
        }
      ],
      mobileUploadTasks: [
        {
          id: "task-primary-completed",
          deviceId: "android-b",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["Specialized Library", "Physics", "Mechanics", "Newton"],
          originalFileName: "latest.pdf",
          normalizedFileName: "newton_primary_lecture.pdf",
          mimeType: "application/pdf",
          status: "completed",
          createdAt: "2026-06-03T10:30:00.000Z",
          errorMessage: null
        }
      ]
    });

    render(<ExamHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("1 helper backlog PDFs")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "Still waiting for one workspace window to replay this lecture upload from the PC helper backlog."
      )
    ).toBeInTheDocument();
  });

  it("treats one helper replay backlog lecture upload as one active receiver handoff", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        helperReadiness: {
          receiverReadiness: "ready",
          workspaceSnapshotReady: true,
          hasActivePairingSession: true
        },
        helperPendingUploadCount: 1,
        helperPendingUploadTaskIds: ["task-primary-completed"],
        pairingSession: useExamStore.getState().mobileUploadPairingSession,
        examLibraryDocuments: useExamStore.getState().examLibraryDocuments,
        mobileUploadTasks: [
          {
            id: "task-primary-completed",
            deviceId: "android-b",
            uploadKind: "primary_lecture_pdf",
            targetNodeId: "lecture-primary-1",
            targetNodePath: ["Specialized Library", "Physics", "Mechanics", "Newton"],
            originalFileName: "latest.pdf",
            normalizedFileName: "newton_primary_lecture.pdf",
            mimeType: "application/pdf",
            status: "completed",
            createdAt: "2026-06-03T10:30:00.000Z",
            errorMessage: null
          }
        ]
      })
    } as Response);

    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "lecture-primary-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "lecture",
          lectureVariant: "primary",
          title: "Newton Primary Lecture",
          immutableName: "Newton Primary Lecture",
          subjectScope: null,
          groupId: "group-primary-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          rawPageAssetIds: ["asset-primary-1"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true,
          sourceUploadTaskId: "task-primary-completed"
        }
      ],
      mobileUploadTasks: [
        {
          id: "task-primary-completed",
          deviceId: "android-b",
          uploadKind: "primary_lecture_pdf",
          targetNodeId: "lecture-primary-1",
          targetNodePath: ["Specialized Library", "Physics", "Mechanics", "Newton"],
          originalFileName: "latest.pdf",
          normalizedFileName: "newton_primary_lecture.pdf",
          mimeType: "application/pdf",
          status: "completed",
          createdAt: "2026-06-03T10:30:00.000Z",
          errorMessage: null
        }
      ]
    });

    render(<ExamHistoryPage />);

    await waitFor(() => {
      expect(screen.getByText("1 helper backlog PDFs")).toBeInTheDocument();
    });

    expect(screen.getByText("Receiving uploads")).toBeInTheDocument();
    expect(screen.getByText("1 active tasks")).toBeInTheDocument();
  });

  it("opens the target full-library folder from one queued full-paper upload task card", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryFolders: [
        ...useExamStore.getState().examLibraryFolders,
        {
          id: "full-topic-1",
          parentId: "full-root",
          name: "牛顿定律套卷",
          library: "full",
          kind: "custom",
          subjectScope: null,
          depth: 1,
          path: ["套卷库", "牛顿定律套卷"],
          linkedQuestionFolderId: null
        }
      ],
      mobileUploadTasks: [
        {
          id: "task-full-queued",
          deviceId: "android-c",
          uploadKind: "full_paper_pdf",
          targetNodeId: "full-topic-1",
          targetNodePath: ["套卷库", "牛顿定律套卷"],
          originalFileName: "paper.pdf",
          normalizedFileName: "牛顿定律套卷.pdf",
          mimeType: "application/pdf",
          status: "queued",
          createdAt: "2026-06-03T10:30:00.000Z",
          errorMessage: null
        }
      ]
    });

    render(<ExamHistoryPage />);

    expect(
      screen.getByText("Open the target full-paper folder while this upload waits for downstream processing.")
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "open-mobile-upload-folder-task-full-queued"
      })
    );

    expect(useExamStore.getState().examWorkspaceDraft).toMatchObject({
      selectedLibrary: "full",
      selectedFolderId: "full-topic-1",
      selectedDocumentId: null
    });
  });

  it("opens the target question-bank folder from one queued question-bank upload task card", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      mobileUploadTasks: [
        {
          id: "task-qb-queued",
          deviceId: "android-d",
          uploadKind: "question_bank_pdf",
          targetNodeId: "folder-math-1",
          targetNodePath: ["我的题库", "高中数学", "函数"],
          originalFileName: "questions.pdf",
          normalizedFileName: "函数专题.pdf",
          mimeType: "application/pdf",
          status: "queued",
          createdAt: "2026-06-03T10:30:00.000Z",
          errorMessage: null
        }
      ]
    });

    render(<ExamHistoryPage />);

    expect(
      screen.getByText("Open the target question-bank folder while this upload waits for downstream processing.")
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "open-mobile-upload-question-folder-task-qb-queued"
      })
    );

    expect(useExamStore.getState().examWorkspaceDraft).toMatchObject({
      selectedFolderId: null,
      selectedDocumentId: null
    });
    expect(routerPushMock).toHaveBeenCalledWith("/folder/folder-math-1");
  });

  it("switches the current workspace when one document is selected", () => {
    render(<ExamHistoryPage />);

    fireEvent.click(screen.getByRole("button", { name: "select-exam-document-lecture-1" }));

    expect(useExamStore.getState().examWorkspaceDraft).toMatchObject({
      selectedLibrary: "full",
      selectedFolderId: "full-root",
      selectedDocumentId: "lecture-1"
    });
  });

  it("shows a sync confirmation action for specialized documents pending confirmation", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-pending",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "pending paper",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          pendingQuestionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });

    render(<ExamHistoryPage />);

    expect(screen.getByText("Sync confirmation required")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "confirm-exam-sync-paper-pending" })).toBeInTheDocument();
  });

  it("confirms one pending specialized sync from the history page", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-pending",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "pending paper",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          pendingQuestionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });

    render(<ExamHistoryPage />);

    fireEvent.click(screen.getByRole("button", { name: "confirm-exam-sync-paper-pending" }));

    expect(useExamStore.getState().examLibraryDocuments[0]).toMatchObject({
      syncStatus: "idle",
      questionIds: ["q-1", "q-2"]
    });
    expect(useExamStore.getState().examLibraryDocuments[0].pendingQuestionIds).toBeUndefined();
  });

  it("blocks specialized sync confirmation until pending manual-placement questions are assigned", () => {
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      questionDrafts: useQuestionStore.getState().questionDrafts.map((question) =>
        question.id === "q-2"
          ? {
              ...question,
              questionType: "证明题",
              chapterTag: "力学",
              knowledgeTags: ["牛顿定律"]
            }
          : question.id === "q-1"
            ? {
                ...question,
                questionType: "选择题",
                chapterTag: "力学",
                knowledgeTags: ["牛顿定律"]
              }
            : question
      )
    });
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-pending",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "pending paper",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          questionBlocks: [
            {
              key: "newton",
              label: "牛顿定律",
              questionIds: ["q-1"]
            }
          ],
          pendingQuestionIds: ["q-1", "q-2"],
          pendingQuestionBlocks: [
            {
              key: "newton",
              label: "牛顿定律",
              questionIds: ["q-1"]
            }
          ],
          pendingManualPlacementQuestionIds: ["q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });

    render(<ExamHistoryPage />);

    expect(screen.getByText("Pending block review")).toBeInTheDocument();
    expect(screen.getByText("Q15")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "confirm-exam-sync-paper-pending" })).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "assign-pending-question-q-2-to-block-paper-pending-0" })
    );

    expect(useExamStore.getState().examLibraryDocuments[0]).toMatchObject({
      pendingQuestionIds: ["q-1", "q-2"],
      pendingManualPlacementQuestionIds: []
    });
    expect(useExamStore.getState().examLibraryDocuments[0].pendingQuestionBlocks).toEqual([
      {
        key: "newton",
        label: "牛顿定律",
        questionIds: ["q-1", "q-2"]
      }
    ]);

    const confirmButton = screen.getByRole("button", { name: "confirm-exam-sync-paper-pending" });

    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);

    expect(useExamStore.getState().examLibraryDocuments[0]).toMatchObject({
      syncStatus: "idle",
      questionIds: ["q-1", "q-2"],
      questionBlocks: [
        {
          key: "newton",
          label: "牛顿定律",
          questionIds: ["q-1", "q-2"]
        }
      ]
    });
  });

  it("supports creating a new pending block and reordering pending blocks before specialized sync confirmation", () => {
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      questionDrafts: useQuestionStore.getState().questionDrafts.map((question) =>
        question.id === "q-2"
          ? {
              ...question,
              questionType: "计算题",
              chapterTag: "电学",
              knowledgeTags: ["电场"]
            }
          : question.id === "q-1"
            ? {
                ...question,
                questionType: "选择题",
                chapterTag: "力学",
                knowledgeTags: ["牛顿定律"]
              }
            : question
      )
    });
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-pending",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "pending paper",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          questionBlocks: [
            {
              key: "newton",
              label: "牛顿定律",
              questionIds: ["q-1"]
            }
          ],
          pendingQuestionIds: ["q-1", "q-2"],
          pendingQuestionBlocks: [
            {
              key: "newton",
              label: "牛顿定律",
              questionIds: ["q-1"]
            }
          ],
          pendingManualPlacementQuestionIds: ["q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ]
    });

    render(<ExamHistoryPage />);

    fireEvent.click(
      screen.getByRole("button", { name: "create-pending-block-for-question-q-2-paper-pending" })
    );

    expect(useExamStore.getState().examLibraryDocuments[0].pendingQuestionBlocks).toEqual([
      {
        key: "newton",
        label: "牛顿定律",
        questionIds: ["q-1"]
      },
      {
        key: "电场",
        label: "电场",
        questionIds: ["q-2"]
      }
    ]);

    fireEvent.click(screen.getByRole("button", { name: "move-pending-block-up-paper-pending-1" }));

    expect(useExamStore.getState().examLibraryDocuments[0]).toMatchObject({
      pendingQuestionIds: ["q-2", "q-1"],
      pendingQuestionBlocks: [
        {
          key: "电场",
          label: "电场",
          questionIds: ["q-2"]
        },
        {
          key: "newton",
          label: "牛顿定律",
          questionIds: ["q-1"]
        }
      ]
    });
  });

  it("renders a selected custom-numbered paper preview in current question order", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-custom",
          folderId: "full-root",
          library: "full",
          kind: "paper",
          title: "custom paper",
          subjectScope: null,
          groupId: "group-custom",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-2", "q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: "full-root",
        selectedDocumentId: "paper-custom"
      }
    });

    render(<ExamHistoryPage />);

    expect(screen.getByRole("heading", { name: "Paper Preview" })).toBeInTheDocument();

    const preview = screen.getByLabelText("paper-preview");

    expect(preview).toHaveTextContent("Current Order");
    expect(preview).toHaveTextContent(/Q15[\s\S]*Q12/);
    expect(preview).toHaveTextContent(/question two[\s\S]*question one/);
  });

  it("renders pending paper preview with the staged question order before sync confirmation", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-pending-preview",
          folderId: "full-root",
          library: "full",
          kind: "paper",
          title: "pending custom paper",
          subjectScope: null,
          groupId: "group-pending-preview",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          pendingQuestionIds: ["q-2", "q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: "full-root",
        selectedDocumentId: "paper-pending-preview"
      }
    });

    render(<ExamHistoryPage />);

    const preview = screen.getByLabelText("paper-preview");

    expect(preview).toHaveTextContent(/Q15[\s\S]*Q12/);
    expect(preview).toHaveTextContent(/question two[\s\S]*question one/);
  });

  it("renders specialized paper blocks with resequenced numbers", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "paper-specialized",
          folderId: "specialized-root",
          library: "specialized",
          kind: "paper",
          title: "specialized paper",
          subjectScope: null,
          groupId: "group-specialized",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-2", "q-1"],
          questionBlocks: [
            {
              key: "dynamics",
              label: "Dynamics",
              questionIds: ["q-2"]
            },
            {
              key: "kinematics",
              label: "Kinematics",
              questionIds: ["q-1"]
            }
          ],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "specialized",
        selectedFolderId: "specialized-root",
        selectedDocumentId: "paper-specialized"
      }
    });

    render(<ExamHistoryPage />);

    const preview = screen.getByLabelText("paper-preview");

    expect(preview).toHaveTextContent("Dynamics");
    expect(preview).toHaveTextContent("Kinematics");
    expect(preview).toHaveTextContent(/Dynamics[\s\S]*Q1[\s\S]*question two/);
    expect(preview).toHaveTextContent(/Kinematics[\s\S]*Q2[\s\S]*question one/);
  });

  it("resequences specialized answer-sheet preview numbers by current order", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "answer-1",
          folderId: "specialized-root",
          library: "specialized",
          kind: "answer_sheet",
          title: "answers one",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-1", "q-2"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "specialized",
        selectedFolderId: "specialized-root",
        selectedDocumentId: "answer-1"
      }
    });

    render(<ExamHistoryPage />);

    expect(screen.getByText("answers one")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Answer Sheet Preview" })).toBeInTheDocument();
    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.getByText("Q2")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "answer-preview-q-1" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "answer-preview-q-1-2" })).toBeInTheDocument();
    expect(screen.getByText("暂无答案")).toBeInTheDocument();
  });

  it("keeps custom numeric labels in full-library answer-sheet preview", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "answer-custom",
          folderId: "full-root",
          library: "full",
          kind: "answer_sheet",
          title: "custom answers",
          subjectScope: null,
          groupId: "group-custom",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-2", "q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: "full-root",
        selectedDocumentId: "answer-custom"
      }
    });

    render(<ExamHistoryPage />);

    expect(screen.getByText("custom answers")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Answer Sheet Preview" })).toBeInTheDocument();
    expect(screen.getByText("Q15")).toBeInTheDocument();
    expect(screen.getByText("Q12")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "answer-preview-q-12" })).toBeInTheDocument();
  });

  it("renders pending answer-sheet preview with the staged question order before sync confirmation", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "answer-pending-preview",
          folderId: "full-root",
          library: "full",
          kind: "answer_sheet",
          title: "pending custom answers",
          subjectScope: null,
          groupId: "group-pending-preview",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "pending_confirmation",
          numberingMode: "custom_numeric",
          questionIds: ["q-1", "q-2"],
          pendingQuestionIds: ["q-2", "q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: "full-root",
        selectedDocumentId: "answer-pending-preview"
      }
    });

    render(<ExamHistoryPage />);

    expect(screen.getByText("pending custom answers")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Answer Sheet Preview" })).toBeInTheDocument();
    expect(screen.getByText("Q15")).toBeInTheDocument();
    expect(screen.getByText("Q12")).toBeInTheDocument();
  });

  it("shows a sheet-level placeholder notice when the selected answer sheet is still a placeholder", () => {
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      binaryAssets: [],
      questionDrafts: [
        {
          id: "q-1",
          documentId: "doc-1",
          pageIds: ["page-1"],
          primaryPageId: "page-1",
          localOrder: 1,
          globalOrder: 1,
          bboxByPage: {
            "page-1": { x: 10, y: 20, width: 100, height: 120 }
          },
          status: "reviewed",
          source: "ai",
          confidence: 0.9,
          crossPageGroupId: null,
          classificationStatus: "confirmed",
          directoryMatchConfidence: 0.95,
          directoryPath: ["subject-a", "folder-a"],
          directoryCandidatePaths: [],
          ocrText: "question one",
          lastBulkConfirmationId: null
        }
      ]
    });
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "answer-placeholder",
          folderId: "specialized-root",
          library: "specialized",
          kind: "answer_sheet",
          title: "placeholder answers",
          subjectScope: null,
          groupId: "group-1",
          isDefault: true,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "resequence",
          questionIds: ["q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: true,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "specialized",
        selectedFolderId: "specialized-root",
        selectedDocumentId: "answer-placeholder"
      }
    });

    render(<ExamHistoryPage />);

    expect(screen.getByText("Answer sheet placeholder")).toBeInTheDocument();
    expect(
      screen.getByText("No matched answers are available yet. The default answer sheet is currently a placeholder.")
    ).toBeInTheDocument();
  });

  it("renders uploaded-pdf lecture preview pages in current question order", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "lecture-uploaded",
          folderId: "full-root",
          library: "full",
          kind: "lecture",
          title: "uploaded lecture",
          subjectScope: null,
          groupId: "group-uploaded",
          isDefault: false,
          sourceMode: "uploaded_pdf",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-2", "q-1"],
          rawPageAssetIds: ["asset-source-1"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: false,
          uploadedPdfPages: [
            {
              pageId: "page-1",
              pageNumber: 1,
              width: 1000,
              height: 1400,
              reviewStatus: "reviewed",
              previewAssetId: "asset-answer-1"
            },
            {
              pageId: "page-2",
              pageNumber: 2,
              width: 1000,
              height: 1400,
              reviewStatus: "reviewed",
              previewAssetId: "asset-answer-2"
            }
          ]
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: "full-root",
        selectedDocumentId: "lecture-uploaded"
      }
    });

    render(<ExamHistoryPage />);

    expect(screen.getByRole("heading", { name: "Lecture Preview" })).toBeInTheDocument();
    expect(screen.getByText("Preview Page 1")).toBeInTheDocument();
    expect(screen.getByText("Q15")).toBeInTheDocument();
    expect(screen.getByText("Q12")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "lecture-preview-q-15" })).toHaveAttribute(
      "src",
      expect.stringContaining("data:image/svg+xml")
    );
    expect(screen.getByRole("img", { name: "lecture-preview-q-12" })).toHaveAttribute(
      "src",
      expect.stringContaining("data:image/svg+xml")
    );
  });

  it("renders filesystem-backed uploaded lecture crops without a data SVG wrapper", () => {
    useQuestionStore.setState({
      ...useQuestionStore.getState(),
      binaryAssets: [
        {
          id: "asset-answer-1",
          documentId: "doc-1",
          pageId: "page-1",
          kind: "display",
          mimeType: "image/png",
          byteLength: 128,
          dataUrl: "/api/local-library/asset?id=asset-answer-1"
        },
        {
          id: "asset-answer-2",
          documentId: "doc-1",
          pageId: "page-2",
          kind: "display",
          mimeType: "image/png",
          byteLength: 132,
          dataUrl: "/api/local-library/asset?id=asset-answer-2"
        }
      ]
    });
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "lecture-uploaded-local",
          folderId: "full-root",
          library: "full",
          kind: "lecture",
          title: "filesystem lecture",
          subjectScope: null,
          groupId: "group-uploaded-local",
          isDefault: false,
          sourceMode: "uploaded_pdf",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-2", "q-1"],
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: false,
          uploadedPdfPages: [
            {
              pageId: "page-1",
              pageNumber: 1,
              width: 1000,
              height: 1400,
              reviewStatus: "reviewed",
              previewAssetId: "asset-answer-1"
            },
            {
              pageId: "page-2",
              pageNumber: 2,
              width: 1000,
              height: 1400,
              reviewStatus: "reviewed",
              previewAssetId: "asset-answer-2"
            }
          ]
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: "full-root",
        selectedDocumentId: "lecture-uploaded-local"
      }
    });

    render(<ExamHistoryPage />);

    const image = screen.getByRole("img", { name: "lecture-preview-q-15" });
    expect(image).toHaveAttribute(
      "src",
      "/api/local-library/asset?id=asset-answer-2"
    );
    expect(image).toHaveStyle({ position: "absolute", width: "1000%" });
    expect(image.parentElement).toHaveStyle({ aspectRatio: "100 / 120" });
  });

  it("renders uploaded-pdf paper whole-page preview before the confirmed split page", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "uploaded-paper",
          folderId: "full-root",
          library: "full",
          kind: "paper",
          title: "uploaded paper",
          subjectScope: null,
          groupId: "group-uploaded",
          isDefault: false,
          sourceMode: "uploaded_pdf",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: [],
          rawPageAssetIds: ["asset-source-1"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: false,
          uploadedPdfAnswerSection: {
            status: "confirmed",
            hasAnswerSection: true,
            suggestedSplitPage: 3,
            confirmedSplitPage: 3
          },
          uploadedPdfPages: [
            {
              pageId: "page-1",
              pageNumber: 1,
              width: 1000,
              height: 1400,
              reviewStatus: "reviewed",
              previewAssetId: "asset-answer-1"
            },
            {
              pageId: "page-2",
              pageNumber: 2,
              width: 1000,
              height: 1400,
              reviewStatus: "reviewed",
              previewAssetId: "asset-answer-2"
            },
            {
              pageId: "page-3",
              pageNumber: 3,
              width: 1000,
              height: 1400,
              reviewStatus: "reviewed",
              previewAssetId: "asset-answer-1"
            }
          ]
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: "full-root",
        selectedDocumentId: "uploaded-paper"
      }
    });

    render(<ExamHistoryPage />);

    expect(screen.getByRole("heading", { name: "Uploaded Question Pages" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "uploaded-question-page-1" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "uploaded-question-page-2" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "uploaded-question-page-3" })).not.toBeInTheDocument();
  });

  it("renders uploaded-pdf answer-sheet whole-page preview after the confirmed split page", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "uploaded-answer-sheet",
          folderId: "full-root",
          library: "full",
          kind: "answer_sheet",
          title: "uploaded answers",
          subjectScope: null,
          groupId: "group-uploaded",
          isDefault: false,
          sourceMode: "uploaded_pdf",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: [],
          rawPageAssetIds: ["asset-source-1"],
          placeholderAnswerPage: false,
          allowsQuestionMutations: false,
          uploadedPdfAnswerSection: {
            status: "confirmed",
            hasAnswerSection: true,
            suggestedSplitPage: 3,
            confirmedSplitPage: 3
          },
          uploadedPdfPages: [
            {
              pageId: "page-1",
              pageNumber: 1,
              width: 1000,
              height: 1400,
              reviewStatus: "reviewed",
              previewAssetId: "asset-answer-1"
            },
            {
              pageId: "page-2",
              pageNumber: 2,
              width: 1000,
              height: 1400,
              reviewStatus: "reviewed",
              previewAssetId: "asset-answer-2"
            },
            {
              pageId: "page-3",
              pageNumber: 3,
              width: 1000,
              height: 1400,
              reviewStatus: "reviewed",
              previewAssetId: "asset-answer-1"
            }
          ]
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: "full-root",
        selectedDocumentId: "uploaded-answer-sheet"
      }
    });

    render(<ExamHistoryPage />);

    expect(screen.getByRole("heading", { name: "Uploaded Answer Pages" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "uploaded-answer-page-3" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "uploaded-answer-page-1" })).not.toBeInTheDocument();
  });

  it("renders question-bank lecture documents as printable text cards", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "lecture-bank",
          folderId: "full-root",
          library: "full",
          kind: "lecture",
          title: "题库讲义",
          subjectScope: null,
          groupId: "group-lecture-bank",
          isDefault: false,
          sourceMode: "question_bank",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: ["q-2", "q-1"],
          lectureSpacing: {
            defaultGap: 48,
            perQuestionGapOverrides: {
              "q-2": 96
            }
          },
          rawPageAssetIds: [],
          placeholderAnswerPage: false,
          allowsQuestionMutations: true
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: "full-root",
        selectedDocumentId: "lecture-bank"
      }
    });

    render(<ExamHistoryPage />);

    expect(screen.getByRole("heading", { name: "Lecture Preview" })).toBeInTheDocument();
    expect(screen.getByText("Q15")).toBeInTheDocument();
    expect(screen.getByText("question two")).toBeInTheDocument();
    expect(screen.getByText("Q12")).toBeInTheDocument();
    expect(screen.getByText("question one")).toBeInTheDocument();
    expect(screen.getByText("Gap after: 96")).toBeInTheDocument();
    expect(screen.getByText("Gap after: 48")).toBeInTheDocument();
  });

  it("shows an uploaded-pdf answer placeholder notice when the document has no answer section", () => {
    useExamStore.setState({
      ...useExamStore.getState(),
      examLibraryDocuments: [
        {
          id: "uploaded-answer-placeholder",
          folderId: "full-root",
          library: "full",
          kind: "answer_sheet",
          title: "uploaded placeholder answers",
          subjectScope: null,
          groupId: "group-uploaded",
          isDefault: false,
          sourceMode: "uploaded_pdf",
          syncBinding: "strong",
          syncStatus: "idle",
          numberingMode: "custom_numeric",
          questionIds: [],
          rawPageAssetIds: ["asset-source-1"],
          placeholderAnswerPage: true,
          allowsQuestionMutations: false,
          uploadedPdfAnswerSection: {
            status: "confirmed",
            hasAnswerSection: false,
            suggestedSplitPage: 3,
            confirmedSplitPage: null
          },
          uploadedPdfPages: [
            {
              pageId: "page-1",
              pageNumber: 1,
              width: 1000,
              height: 1400,
              reviewStatus: "reviewed",
              previewAssetId: "asset-answer-1"
            },
            {
              pageId: "page-2",
              pageNumber: 2,
              width: 1000,
              height: 1400,
              reviewStatus: "reviewed",
              previewAssetId: "asset-answer-2"
            }
          ]
        }
      ],
      examWorkspaceDraft: {
        selectedLibrary: "full",
        selectedFolderId: "full-root",
        selectedDocumentId: "uploaded-answer-placeholder"
      }
    });

    render(<ExamHistoryPage />);

    expect(screen.getByRole("heading", { name: "Uploaded Answer Pages" })).toBeInTheDocument();
    expect(screen.getByText("Answer sheet placeholder")).toBeInTheDocument();
    expect(
      screen.getByText("This uploaded PDF was confirmed to have no answer section. A blank placeholder answer sheet is shown.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "uploaded-answer-page-1" })).not.toBeInTheDocument();
  });
});
