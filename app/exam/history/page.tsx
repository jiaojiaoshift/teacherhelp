"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { CroppedQuestionImage } from "@/components/library/cropped-question-image";
import {
  buildPrintableExamDocument,
  buildPrintableExamPdf
} from "@/lib/services/exam-print-service";
import { buildUploadedPdfLecturePreview } from "@/lib/services/lecture-preview-service";
import {
  resolveVisibleMobileUploadHelperReadiness,
  type MobileUploadHelperReadinessSummary
} from "@/lib/services/mobile-upload-helper-readiness-service";
import { MOBILE_UPLOAD_KIND_LABELS } from "@/lib/services/mobile-upload-contract";
import {
  resolveMobileUploadPairingSessionState
} from "@/lib/services/mobile-upload-pairing-service";
import { buildMobileUploadPairingQrImageDataUrl } from "@/lib/services/mobile-upload-pairing-qr-service";
import { summarizeMobileUploadReceiverStatus } from "@/lib/services/mobile-upload-receiver-status-service";
import { resolveMobileUploadTaskAction } from "@/lib/services/mobile-upload-task-action-service";
import { buildPaperPreview } from "@/lib/services/paper-preview-service";
import {
  assignPendingQuestionToBlock,
  createPendingBlockForQuestion,
  movePendingQuestionBlock
} from "@/lib/services/specialized-sync-draft-service";
import { useExamStore } from "@/lib/stores/exam-store";
import { useQuestionStore } from "@/lib/stores/question-store";

const LIBRARY_LABELS = {
  specialized: "专题卷库",
  full: "套卷库"
} as const;

const DOCUMENT_KIND_LABELS = {
  paper: "试卷",
  lecture: "讲义",
  answer_sheet: "答案"
} as const;

const SOURCE_MODE_LABELS = {
  question_bank: "题库同步",
  uploaded_pdf: "PDF 导入",
  freeform: "空白文档"
} as const;

const MOBILE_UPLOAD_STATUS_LABELS = {
  received: "Received",
  stored: "Stored",
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed"
} as const;

interface MobileUploadPairingRoutePayload {
  pairingSession: ReturnType<typeof useExamStore.getState>["mobileUploadPairingSession"];
}

interface MobileUploadStatusRoutePayload extends MobileUploadPairingRoutePayload {
  helperReadiness?: MobileUploadHelperReadinessSummary | null;
  helperPendingUploadCount?: number;
  helperPendingUploadTaskIds?: string[];
  examLibraryDocuments: ReturnType<typeof useExamStore.getState>["examLibraryDocuments"];
  mobileUploadTasks: ReturnType<typeof useExamStore.getState>["mobileUploadTasks"];
}

function mergeEntitiesById<T extends { id: string }>(currentItems: T[], incomingItems: T[]) {
  const itemsById = new Map(currentItems.map((item) => [item.id, item]));

  for (const item of incomingItems) {
    itemsById.set(item.id, item);
  }

  return Array.from(itemsById.values());
}

export default function ExamHistoryPage() {
  const router = useRouter();
  const [helperConnectionState, setHelperConnectionState] =
    useState<"online" | "offline">("online");
  const [reportedHelperReadiness, setReportedHelperReadiness] =
    useState<MobileUploadHelperReadinessSummary | null>(null);
  const [helperPendingUploadCount, setHelperPendingUploadCount] = useState(0);
  const [helperPendingUploadTaskIds, setHelperPendingUploadTaskIds] = useState<string[]>([]);
  const examLibraryFolders = useExamStore((state) => state.examLibraryFolders);
  const examLibraryDocuments = useExamStore((state) => state.examLibraryDocuments);
  const mobileUploadPairingSession = useExamStore((state) => state.mobileUploadPairingSession);
  const mobileUploadTasks = useExamStore((state) => state.mobileUploadTasks);
  const examWorkspaceDraft = useExamStore((state) => state.examWorkspaceDraft);
  const setExamWorkspaceDraft = useExamStore((state) => state.setExamWorkspaceDraft);
  const setExamLibraryDocuments = useExamStore((state) => state.setExamLibraryDocuments);
  const setMobileUploadPairingSession = useExamStore((state) => state.setMobileUploadPairingSession);
  const setMobileUploadTasks = useExamStore((state) => state.setMobileUploadTasks);
  const confirmExamDocumentSync = useExamStore((state) => state.confirmExamDocumentSync);
  const patchPendingExamDocumentGroup = useExamStore((state) => state.patchPendingExamDocumentGroup);
  const questionDrafts = useQuestionStore((state) => state.questionDrafts);
  const binaryAssets = useQuestionStore((state) => state.binaryAssets);
  const questionById = useMemo(
    () => new Map(questionDrafts.map((question) => [question.id, question])),
    [questionDrafts]
  );

  const folderPathById = useMemo(
    () => new Map(examLibraryFolders.map((folder) => [folder.id, folder.path.join(" / ")])),
    [examLibraryFolders]
  );
  const documentsByLibrary = useMemo(
    () => ({
      specialized: examLibraryDocuments
        .filter((document) => document.library === "specialized")
        .sort((left, right) => left.title.localeCompare(right.title, "zh-CN")),
      full: examLibraryDocuments
        .filter((document) => document.library === "full")
        .sort((left, right) => left.title.localeCompare(right.title, "zh-CN"))
    }),
    [examLibraryDocuments]
  );
  const recentMobileUploadTasks = useMemo(
    () =>
      mobileUploadTasks
        .slice()
        .sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        ),
    [mobileUploadTasks]
  );
  const activeReceiverPairedDeviceIds = useMemo(
    () =>
      mobileUploadPairingSession &&
      resolveMobileUploadPairingSessionState(mobileUploadPairingSession) !== "expired"
        ? mobileUploadPairingSession.pairedDeviceIds
        : [],
    [mobileUploadPairingSession]
  );
  const mobileUploadReceiverStatus = useMemo(
    () =>
      summarizeMobileUploadReceiverStatus(
        mobileUploadTasks,
        activeReceiverPairedDeviceIds,
        helperPendingUploadTaskIds
      ),
    [activeReceiverPairedDeviceIds, helperPendingUploadTaskIds, mobileUploadTasks]
  );
  const mobileUploadHelperReadiness = useMemo(
    () =>
      helperConnectionState === "offline"
        ? {
            receiverReadiness: "idle",
            workspaceSnapshotReady: false,
            hasActivePairingSession: false
          }
        : resolveVisibleMobileUploadHelperReadiness({
            reportedReadiness: reportedHelperReadiness,
            activePairingSession: mobileUploadPairingSession,
            mobileUploadTasks
          }),
    [helperConnectionState, mobileUploadPairingSession, mobileUploadTasks, reportedHelperReadiness]
  );
  const pairingSessionState = useMemo(
    () =>
      mobileUploadPairingSession
        ? resolveMobileUploadPairingSessionState(mobileUploadPairingSession)
        : null,
    [mobileUploadPairingSession]
  );
  const mobileUploadPairingQrImageDataUrl = useMemo(
    () =>
      mobileUploadPairingSession
        ? buildMobileUploadPairingQrImageDataUrl(mobileUploadPairingSession.qrPayload)
        : null,
    [mobileUploadPairingSession]
  );
  const helperPendingUploadTaskIdSet = useMemo(
    () => new Set(helperPendingUploadTaskIds),
    [helperPendingUploadTaskIds]
  );

  useEffect(() => {
    let disposed = false;
    let pollTimer: number | null = null;

    const loadMobileUploadStatus = async () => {
      try {
        const response = await fetch("/api/mobile-upload/status");

        if (disposed) {
          return;
        }

        if (!response.ok) {
          setHelperConnectionState("offline");
          setReportedHelperReadiness(null);
          setHelperPendingUploadCount(0);
          setHelperPendingUploadTaskIds([]);
          setMobileUploadPairingSession(null);
          return;
        }

        const payload = (await response.json()) as MobileUploadStatusRoutePayload;

        if (!disposed) {
          const currentState = useExamStore.getState();

          setHelperConnectionState("online");
          setReportedHelperReadiness(payload.helperReadiness ?? null);
          setHelperPendingUploadCount(payload.helperPendingUploadCount ?? 0);
          setHelperPendingUploadTaskIds(payload.helperPendingUploadTaskIds ?? []);
          setMobileUploadPairingSession(payload.pairingSession ?? null);
          setMobileUploadTasks(
            mergeEntitiesById(currentState.mobileUploadTasks, payload.mobileUploadTasks ?? [])
          );
          setExamLibraryDocuments(
            mergeEntitiesById(
              currentState.examLibraryDocuments,
              payload.examLibraryDocuments ?? []
            )
          );
        }
      } catch {
        if (!disposed) {
          setHelperConnectionState("offline");
          setReportedHelperReadiness(null);
          setHelperPendingUploadCount(0);
          setHelperPendingUploadTaskIds([]);
          setMobileUploadPairingSession(null);
        }
      }
    };

    void loadMobileUploadStatus();
    pollTimer = window.setInterval(() => {
      void loadMobileUploadStatus();
    }, 5000);

    return () => {
      disposed = true;
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
    };
  }, [setExamLibraryDocuments, setMobileUploadPairingSession, setMobileUploadTasks]);

  const handleGenerateMobileUploadPairing = async () => {
    try {
      const response = await fetch("/api/mobile-upload/pairing", {
        method: "POST"
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as MobileUploadPairingRoutePayload;

      setMobileUploadPairingSession(payload.pairingSession ?? null);
    } catch {
      setMobileUploadPairingSession(null);
    }
  };

  const openExamDocument = (documentId: string) => {
    const targetDocument = examLibraryDocuments.find((document) => document.id === documentId);

    if (!targetDocument) {
      return;
    }

    setExamWorkspaceDraft({
      selectedLibrary: targetDocument.library,
      selectedFolderId: targetDocument.folderId,
      selectedDocumentId: targetDocument.id
    });
  };

  const openExamFolder = (folderId: string) => {
    const targetFolder = examLibraryFolders.find((folder) => folder.id === folderId);

    if (!targetFolder) {
      return;
    }

    setExamWorkspaceDraft({
      selectedLibrary: targetFolder.library,
      selectedFolderId: targetFolder.id,
      selectedDocumentId: null
    });
  };

  const executeMobileUploadTaskAction = (
    action: NonNullable<ReturnType<typeof resolveMobileUploadTaskAction>>
  ) => {
    if (action.target.kind === "exam_document") {
      openExamDocument(action.target.documentId);
      return;
    }

    if (action.target.kind === "exam_folder") {
      openExamFolder(action.target.folderId);
      return;
    }

    router.push(`/folder/${encodeURIComponent(action.target.folderId)}`);
  };
  const selectedDocument =
    examLibraryDocuments.find((document) => document.id === examWorkspaceDraft.selectedDocumentId) ?? null;
  const selectedPreviewQuestionIds =
    selectedDocument?.syncStatus === "pending_confirmation" && selectedDocument.pendingQuestionIds
      ? selectedDocument.pendingQuestionIds
      : selectedDocument?.questionIds ?? [];
  const selectedPreviewQuestionBlocks =
    selectedDocument?.syncStatus === "pending_confirmation" && selectedDocument.pendingQuestionBlocks
      ? selectedDocument.pendingQuestionBlocks
      : selectedDocument?.questionBlocks;
  const selectedPreviewPlaceholderAnswerPage =
    selectedDocument?.syncStatus === "pending_confirmation" &&
    selectedDocument.pendingPlaceholderAnswerPage !== undefined
      ? selectedDocument.pendingPlaceholderAnswerPage
      : selectedDocument?.placeholderAnswerPage ?? false;

  const selectedAnswerEntries = useMemo(() => {
    if (!selectedDocument || selectedDocument.kind !== "answer_sheet") {
      return [];
    }

    const assetById = new Map(binaryAssets.map((asset) => [asset.id, asset]));

    return selectedPreviewQuestionIds.map((questionId, index) => {
      const question = questionById.get(questionId) ?? null;
      const assets =
        question?.answerAttachments
          ?.map((attachment) => assetById.get(attachment.assetId) ?? null)
          .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset)) ?? [];
      const displayNumber =
        selectedDocument.numberingMode === "resequence"
          ? String(index + 1)
          : question?.questionNumberLabel?.trim() || String(index + 1);

      return {
        questionId,
        displayNumber,
        assets
      };
    });
  }, [binaryAssets, questionById, selectedDocument, selectedPreviewQuestionIds]);

  const selectedLecturePreview = useMemo(() => {
    if (
      !selectedDocument ||
      selectedDocument.kind !== "lecture" ||
      selectedDocument.sourceMode !== "uploaded_pdf" ||
      !selectedDocument.uploadedPdfPages?.length
    ) {
      return null;
    }

    return buildUploadedPdfLecturePreview({
      document: {
        questionIds: selectedDocument.questionIds,
        uploadedPdfPages: selectedDocument.uploadedPdfPages
      },
      questionDrafts: questionDrafts.map((question) => ({
        id: question.id,
        primaryPageId: question.primaryPageId,
        bboxByPage: question.bboxByPage,
        questionNumberLabel: question.questionNumberLabel ?? null
      })),
      binaryAssets: binaryAssets.map((asset) => ({
        id: asset.id,
        dataUrl: asset.dataUrl
      }))
    });
  }, [binaryAssets, questionDrafts, selectedDocument]);

  const selectedPaperPreview = useMemo(() => {
    if (
      !selectedDocument ||
      selectedDocument.kind !== "paper" ||
      selectedDocument.sourceMode === "uploaded_pdf"
    ) {
      return null;
    }

    return buildPaperPreview({
      document: {
        numberingMode: selectedDocument.numberingMode,
        questionIds: selectedPreviewQuestionIds,
        questionBlocks: selectedPreviewQuestionBlocks,
        lectureSpacing: selectedDocument.lectureSpacing
      },
      questionDrafts: questionDrafts.map((question) => ({
        id: question.id,
        questionNumberLabel: question.questionNumberLabel ?? null,
        ocrText: question.ocrText ?? null
      }))
    });
  }, [questionDrafts, selectedDocument, selectedPreviewQuestionBlocks, selectedPreviewQuestionIds]);

  const selectedTextLecturePreview = useMemo(() => {
    if (
      !selectedDocument ||
      selectedDocument.kind !== "lecture" ||
      selectedDocument.sourceMode === "uploaded_pdf"
    ) {
      return null;
    }

    return buildPaperPreview({
      document: {
        numberingMode: selectedDocument.numberingMode,
        questionIds: selectedPreviewQuestionIds,
        questionBlocks: selectedPreviewQuestionBlocks,
        lectureSpacing: selectedDocument.lectureSpacing
      },
      questionDrafts: questionDrafts.map((question) => ({
        id: question.id,
        questionNumberLabel: question.questionNumberLabel ?? null,
        ocrText: question.ocrText ?? null
      }))
    });
  }, [questionDrafts, selectedDocument, selectedPreviewQuestionBlocks, selectedPreviewQuestionIds]);

  const selectedUploadedPaperPages = useMemo(() => {
    if (
      !selectedDocument ||
      selectedDocument.kind !== "paper" ||
      selectedDocument.sourceMode !== "uploaded_pdf" ||
      !selectedDocument.uploadedPdfPages?.length
    ) {
      return [];
    }

    const splitPage =
      selectedDocument.uploadedPdfAnswerSection?.confirmedSplitPage ??
      selectedDocument.uploadedPdfAnswerSection?.suggestedSplitPage ??
      selectedDocument.uploadedPdfPages.length + 1;

    if (selectedDocument.uploadedPdfAnswerSection && !selectedDocument.uploadedPdfAnswerSection.hasAnswerSection) {
      return selectedDocument.uploadedPdfPages;
    }

    return selectedDocument.uploadedPdfPages.filter((page) => page.pageNumber < splitPage);
  }, [selectedDocument]);

  const selectedUploadedAnswerPages = useMemo(() => {
    if (
      !selectedDocument ||
      selectedDocument.kind !== "answer_sheet" ||
      selectedDocument.sourceMode !== "uploaded_pdf" ||
      !selectedDocument.uploadedPdfPages?.length ||
      !selectedDocument.uploadedPdfAnswerSection?.hasAnswerSection
    ) {
      return [];
    }

    const splitPage =
      selectedDocument.uploadedPdfAnswerSection.confirmedSplitPage ??
      selectedDocument.uploadedPdfAnswerSection.suggestedSplitPage ??
      Number.MAX_SAFE_INTEGER;

    return selectedDocument.uploadedPdfPages.filter((page) => page.pageNumber >= splitPage);
  }, [selectedDocument]);

  const uploadedPaperPagePreview = useMemo(() => {
    if (!selectedUploadedPaperPages.length) {
      return null;
    }

    return {
      heading: "Uploaded Question Pages",
      pages: selectedUploadedPaperPages
        .map((page) => {
          const asset = binaryAssets.find((item) => item.id === page.previewAssetId);

          if (!asset?.dataUrl) {
            return null;
          }

          return {
            pageNumber: page.pageNumber,
            dataUrl: asset.dataUrl
          };
        })
        .filter((page): page is { pageNumber: number; dataUrl: string } => Boolean(page))
    };
  }, [binaryAssets, selectedUploadedPaperPages]);

  const uploadedAnswerPagePreview = useMemo(() => {
    if (!selectedUploadedAnswerPages.length) {
      return null;
    }

    return {
      heading: "Uploaded Answer Pages",
      pages: selectedUploadedAnswerPages
        .map((page) => {
          const asset = binaryAssets.find((item) => item.id === page.previewAssetId);

          if (!asset?.dataUrl) {
            return null;
          }

          return {
            pageNumber: page.pageNumber,
            dataUrl: asset.dataUrl
          };
        })
        .filter((page): page is { pageNumber: number; dataUrl: string } => Boolean(page))
    };
  }, [binaryAssets, selectedUploadedAnswerPages]);

  const getQuestionDisplayNumber = (questionId: string, fallback: string) => {
    const question = questionById.get(questionId);

    return question?.questionNumberLabel?.trim() || fallback;
  };

  const handleAssignPendingQuestionToBlock = (documentId: string, questionId: string, blockIndex: number) => {
    const document = examLibraryDocuments.find((item) => item.id === documentId);

    if (!document?.pendingQuestionBlocks?.length) {
      return;
    }

    const result = assignPendingQuestionToBlock({
      questionId,
      blockIndex,
      blocks: document.pendingQuestionBlocks,
      manualPlacementQuestionIds: document.pendingManualPlacementQuestionIds ?? [],
      questions: questionDrafts.map((question) => ({
        id: question.id,
        globalOrder: question.globalOrder,
        questionType: question.questionType ?? null,
        chapterTag: question.chapterTag ?? null,
        knowledgeTags: question.knowledgeTags ?? []
      }))
    });

    patchPendingExamDocumentGroup(documentId, {
      pendingQuestionIds: result.orderedQuestionIds.concat(result.manualPlacementQuestionIds),
      pendingQuestionBlocks: result.blocks,
      pendingManualPlacementQuestionIds: result.manualPlacementQuestionIds
    });
  };

  const handleCreatePendingBlockForQuestion = (documentId: string, questionId: string) => {
    const document = examLibraryDocuments.find((item) => item.id === documentId);

    if (!document) {
      return;
    }

    const result = createPendingBlockForQuestion({
      questionId,
      blocks: document.pendingQuestionBlocks ?? [],
      manualPlacementQuestionIds: document.pendingManualPlacementQuestionIds ?? [],
      questions: questionDrafts.map((question) => ({
        id: question.id,
        globalOrder: question.globalOrder,
        questionType: question.questionType ?? null,
        chapterTag: question.chapterTag ?? null,
        knowledgeTags: question.knowledgeTags ?? []
      }))
    });

    patchPendingExamDocumentGroup(documentId, {
      pendingQuestionIds: result.orderedQuestionIds.concat(result.manualPlacementQuestionIds),
      pendingQuestionBlocks: result.blocks,
      pendingManualPlacementQuestionIds: result.manualPlacementQuestionIds
    });
  };

  const handleMovePendingQuestionBlock = (
    documentId: string,
    fromIndex: number,
    direction: "up" | "down"
  ) => {
    const document = examLibraryDocuments.find((item) => item.id === documentId);

    if (!document?.pendingQuestionBlocks?.length) {
      return;
    }

    const result = movePendingQuestionBlock({
      blocks: document.pendingQuestionBlocks,
      fromIndex,
      direction
    });

    patchPendingExamDocumentGroup(documentId, {
      pendingQuestionIds: result.orderedQuestionIds.concat(
        document.pendingManualPlacementQuestionIds ?? []
      ),
      pendingQuestionBlocks: result.blocks,
      pendingManualPlacementQuestionIds: document.pendingManualPlacementQuestionIds ?? []
    });
  };

  const printableDocument = useMemo(() => {
    if (!selectedDocument) {
      return null;
    }

    return buildPrintableExamDocument({
      title: selectedDocument.title,
      documentKind: selectedDocument.kind,
      sourceMode: selectedDocument.sourceMode,
      paperPreview:
        selectedDocument.kind === "paper"
          ? selectedPaperPreview
          : selectedDocument.kind === "lecture"
            ? selectedTextLecturePreview
            : null,
      lecturePreview: selectedDocument.kind === "lecture" ? selectedLecturePreview : null,
      answerPreview:
        selectedDocument.kind === "answer_sheet"
          ? {
              placeholder: selectedPreviewPlaceholderAnswerPage,
              entries: selectedAnswerEntries
            }
          : null,
      uploadedPagePreview:
        selectedDocument.kind === "paper" && selectedDocument.sourceMode === "uploaded_pdf"
          ? uploadedPaperPagePreview
          : selectedDocument.kind === "answer_sheet" && selectedDocument.sourceMode === "uploaded_pdf"
            ? uploadedAnswerPagePreview
            : null
    });
  }, [
    selectedAnswerEntries,
    selectedDocument,
    selectedLecturePreview,
    selectedPaperPreview,
    selectedPreviewPlaceholderAnswerPage,
    selectedTextLecturePreview,
    uploadedAnswerPagePreview,
    uploadedPaperPagePreview
  ]);

  const handlePrintSelectedDocument = () => {
    if (!printableDocument) {
      return;
    }

    const printWindow = window.open("", "_blank", "noopener,noreferrer");

    if (!printWindow) {
      return;
    }

    printWindow.document.open();
    printWindow.document.write(printableDocument.html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const handleExportSelectedDocumentPdf = async () => {
    if (!printableDocument) {
      return;
    }

    const pdfDocument = await buildPrintableExamPdf({
      title: printableDocument.fileNameBase,
      html: printableDocument.html
    });
    const objectUrl = URL.createObjectURL(pdfDocument.blob);
    const anchor = document.createElement("a");

    anchor.href = objectUrl;
    anchor.download = pdfDocument.fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <section className="rounded-lg border border-slate-100 bg-white p-5">
        <h1 className="text-2xl font-semibold text-slate-900">卷库总览</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          这里集中查看专题卷库和套卷库中的试卷、讲义、答案文档，并可切换当前工作文档。
        </p>
        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          当前工作区：{LIBRARY_LABELS[examWorkspaceDraft.selectedLibrary]}
          {examWorkspaceDraft.selectedDocumentId
            ? ` / ${examWorkspaceDraft.selectedDocumentId}`
            : " / 未选择文档"}
        </div>
        {selectedDocument ? (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              aria-label="print-exam-document"
              className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
              onClick={handlePrintSelectedDocument}
              type="button"
            >
              打印当前文档
            </button>
            <button
              aria-label="export-exam-document-pdf"
              className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              onClick={handleExportSelectedDocumentPdf}
              type="button"
            >
              导出打印文件
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-100 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Android Pairing</h2>
            <p className="mt-2 text-sm text-slate-500">
              Generate one QR-style pairing payload for the Android uploader before local upload handoff.
            </p>
          </div>
          {mobileUploadPairingSession ? (
            <span
              className={[
                "rounded-full px-3 py-1 text-xs font-medium",
                pairingSessionState === "expired"
                  ? "bg-rose-100 text-rose-700"
                  : pairingSessionState === "paired"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-sky-100 text-sky-700"
              ].join(" ")}
            >
              {pairingSessionState === "expired"
                ? "Expired"
                : pairingSessionState === "paired"
                  ? "Paired"
                  : "Ready to scan"}
            </span>
          ) : null}
        </div>
        {mobileUploadPairingSession ? (
          <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
            {mobileUploadPairingQrImageDataUrl ? (
              <div className="mb-4 flex justify-center">
                <img
                  alt="Android pairing QR code"
                  className="h-48 w-48 rounded-lg border border-slate-200 bg-white p-3"
                  height={192}
                  src={mobileUploadPairingQrImageDataUrl}
                  width={192}
                />
              </div>
            ) : null}
            <div>Pairing code: {mobileUploadPairingSession.pairingCode}</div>
            <div>Receiver URL: {mobileUploadPairingSession.helperBaseUrl}</div>
            <div>Expires at: {mobileUploadPairingSession.expiresAt}</div>
            <div>Paired devices: {mobileUploadPairingSession.pairedDeviceIds.length}</div>
            <div aria-label="paired-mobile-devices">
              Paired device ids:{" "}
              {mobileUploadPairingSession.pairedDeviceIds.length
                ? mobileUploadPairingSession.pairedDeviceIds.join(", ")
                : "None"}
            </div>
            <div className="break-all">Payload: {mobileUploadPairingSession.qrPayload}</div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
            No active pairing session.
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            aria-label={
              mobileUploadPairingSession
                ? "rotate-mobile-upload-pairing"
                : "generate-mobile-upload-pairing"
            }
            className="rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
            onClick={handleGenerateMobileUploadPairing}
            type="button"
          >
            {mobileUploadPairingSession ? "Rotate Pairing Session" : "Generate Pairing Session"}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-100 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">PC Upload Receiver</h2>
            <p className="mt-2 text-sm text-slate-500">
              Monitor the local receiver status for Android upload handoff tasks.
            </p>
          </div>
          <span
            className={[
              "rounded-full px-3 py-1 text-xs font-medium",
              mobileUploadReceiverStatus.receiverState === "attention"
                ? "bg-rose-100 text-rose-700"
                : mobileUploadReceiverStatus.receiverState === "receiving"
                  ? "bg-sky-100 text-sky-700"
                  : "bg-slate-100 text-slate-600"
            ].join(" ")}
          >
            {mobileUploadReceiverStatus.receiverState === "attention"
              ? "Attention required"
              : mobileUploadReceiverStatus.receiverState === "receiving"
                ? "Receiving uploads"
                : "Idle"}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div
            className={[
              "rounded-lg border px-4 py-4 text-sm",
              helperConnectionState === "online"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            ].join(" ")}
          >
            {helperConnectionState === "online" ? "Helper online" : "Helper offline"}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
            {mobileUploadHelperReadiness.receiverReadiness === "ready"
              ? "Helper ready"
              : mobileUploadHelperReadiness.receiverReadiness === "awaiting_workspace"
                ? "Awaiting workspace snapshot"
                : "Helper idle"}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
            {mobileUploadReceiverStatus.pairedDeviceCount} paired devices
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
            {mobileUploadReceiverStatus.activeTaskCount} active tasks
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          {mobileUploadReceiverStatus.failedTaskCount} failed tasks
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          {helperPendingUploadCount} helper backlog PDFs
        </div>
        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
          <div>
            Latest upload:{" "}
            <span className="font-medium text-slate-800">
              {mobileUploadReceiverStatus.latestTaskFileName ?? "None"}
            </span>
          </div>
          <div>Latest device: {mobileUploadReceiverStatus.latestDeviceId ?? "None"}</div>
          <div>Last received at: {mobileUploadReceiverStatus.latestReceivedAt ?? "None"}</div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-100 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Recent Mobile Uploads</h2>
            <p className="mt-2 text-sm text-slate-500">
              Review the latest Android upload tasks received by the workspace and their current status.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
            {recentMobileUploadTasks.length} tasks
          </span>
        </div>

        {recentMobileUploadTasks.length ? (
          <div className="mt-4 space-y-3">
            {recentMobileUploadTasks.map((task) => (
              (() => {
                const taskAction = resolveMobileUploadTaskAction({
                  task,
                  examLibraryDocuments
                });

                const toneClasses = taskAction
                  ? {
                      sky: "border-sky-200 bg-sky-50 text-sky-900",
                      emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
                      amber: "border-amber-200 bg-amber-50 text-amber-900",
                      indigo: "border-indigo-200 bg-indigo-50 text-indigo-900",
                      violet: "border-violet-200 bg-violet-50 text-violet-900"
                    }
                  : null;

                return (
                  <article
                    key={task.id}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 p-4"
                    data-testid="mobile-upload-task-card"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {task.normalizedFileName}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {task.targetNodePath.join(" / ")}
                        </div>
                      </div>
                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-medium",
                          task.status === "failed"
                            ? "bg-rose-100 text-rose-700"
                            : task.status === "completed"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-700"
                        ].join(" ")}
                      >
                        {MOBILE_UPLOAD_STATUS_LABELS[task.status]}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      <span className="rounded-full bg-white px-3 py-1">
                        {MOBILE_UPLOAD_KIND_LABELS[task.uploadKind]}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1">{task.deviceId}</span>
                      <span className="rounded-full bg-white px-3 py-1">{task.createdAt}</span>
                    </div>

                    {taskAction && toneClasses ? (
                      <div
                        className={`mt-3 rounded-lg border px-3 py-3 ${toneClasses[taskAction.tone]}`}
                      >
                        <div className="text-sm">{taskAction.description}</div>
                        <button
                          aria-label={taskAction.buttonAriaLabel}
                          className={`mt-3 rounded-full px-4 py-2 text-xs font-medium text-white ${
                            taskAction.tone === "sky"
                              ? "bg-sky-900"
                              : taskAction.tone === "emerald"
                                ? "bg-emerald-900"
                                : taskAction.tone === "amber"
                                  ? "bg-amber-900"
                                  : taskAction.tone === "indigo"
                                    ? "bg-indigo-900"
                                    : "bg-violet-900"
                          }`}
                          onClick={() => {
                            executeMobileUploadTaskAction(taskAction);
                          }}
                          type="button"
                        >
                          {taskAction.buttonLabel}
                        </button>
                      </div>
                    ) : null}

                    {task.status === "queued" && helperPendingUploadTaskIdSet.has(task.id) ? (
                      <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3 text-sm text-indigo-900">
                        Still stored in the PC helper backlog until one workspace instance picks up
                        this PDF.
                      </div>
                    ) : null}

                    {task.status !== "queued" &&
                    helperPendingUploadTaskIdSet.has(task.id) &&
                    (task.uploadKind === "lecture_archive_pdf" ||
                      task.uploadKind === "primary_lecture_pdf") ? (
                      <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-3 text-sm text-indigo-900">
                        Still waiting for one workspace window to replay this lecture upload from
                        the PC helper backlog.
                      </div>
                    ) : null}

                    {task.errorMessage ? (
                      <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800">
                        {task.errorMessage}
                      </div>
                    ) : null}
                  </article>
                );
              })()
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
            No mobile upload tasks yet.
          </div>
        )}
      </section>

      {(Object.keys(LIBRARY_LABELS) as Array<keyof typeof LIBRARY_LABELS>).map((library) => (
        <section key={library} className="rounded-lg border border-slate-100 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{LIBRARY_LABELS[library]}</h2>
              <p className="mt-2 text-sm text-slate-500">
                当前共 {documentsByLibrary[library].length} 份文档。
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
              {documentsByLibrary[library].length} 份
            </span>
          </div>

          {documentsByLibrary[library].length ? (
            <div className="mt-4 space-y-3">
              {documentsByLibrary[library].map((document) => (
                <div
                  key={document.id}
                  className={[
                    "overflow-hidden rounded-lg border transition",
                    examWorkspaceDraft.selectedDocumentId === document.id
                      ? "border-sky-300 bg-sky-50"
                      : "border-slate-200 bg-slate-50/70"
                  ].join(" ")}
                >
                  <button
                    aria-label={`select-exam-document-${document.id}`}
                    className="block w-full px-4 py-4 text-left transition hover:bg-slate-100/80"
                    onClick={() =>
                      setExamWorkspaceDraft({
                        selectedLibrary: document.library,
                        selectedFolderId: document.folderId,
                        selectedDocumentId: document.id
                      })
                    }
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{document.title}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {folderPathById.get(document.folderId) ?? document.folderId}
                        </div>
                      </div>
                      <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        {DOCUMENT_KIND_LABELS[document.kind]}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-white px-3 py-1 text-slate-600">
                        {SOURCE_MODE_LABELS[document.sourceMode]}
                      </span>
                      <span className="rounded-full bg-white px-3 py-1 text-slate-600">
                        {document.isDefault ? "默认文档" : "自定义文档"}
                      </span>
                    </div>
                  </button>
                  {document.syncStatus === "pending_confirmation" ? (
                    <div className="border-t border-amber-200 bg-amber-50 px-4 py-3">
                      <div className="text-sm font-medium text-amber-900">Sync confirmation required</div>
                      <p className="mt-1 text-xs text-amber-800">
                        The default specialized document has pending synced content from the linked question folder.
                      </p>
                      {document.library === "specialized" &&
                      (document.pendingQuestionBlocks?.length ||
                        document.pendingManualPlacementQuestionIds?.length) ? (
                        <div className="mt-4 rounded-lg border border-amber-200 bg-white/70 p-4">
                          <div className="text-sm font-semibold text-amber-950">Pending block review</div>
                          <p className="mt-1 text-xs text-amber-800">
                            Review block order and manually place low-confidence questions before confirming this sync.
                          </p>

                          {document.pendingQuestionBlocks?.length ? (
                            <div className="mt-4 space-y-3">
                              {document.pendingQuestionBlocks.map((block, blockIndex) => (
                                <div
                                  key={`${document.id}-${block.key}-${blockIndex}`}
                                  className="rounded-lg border border-slate-200 bg-white p-3"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <div className="text-sm font-medium text-slate-900">{block.label}</div>
                                      <div className="mt-1 text-xs text-slate-500">
                                        {block.questionIds.map((questionId, questionIndex) =>
                                          `Q${getQuestionDisplayNumber(questionId, String(questionIndex + 1))}`
                                        ).join(" / ")}
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        aria-label={`move-pending-block-up-${document.id}-${blockIndex}`}
                                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                                        disabled={blockIndex === 0}
                                        onClick={() =>
                                          handleMovePendingQuestionBlock(document.id, blockIndex, "up")
                                        }
                                        type="button"
                                      >
                                        Up
                                      </button>
                                      <button
                                        aria-label={`move-pending-block-down-${document.id}-${blockIndex}`}
                                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
                                        disabled={
                                          blockIndex === (document.pendingQuestionBlocks?.length ?? 1) - 1
                                        }
                                        onClick={() =>
                                          handleMovePendingQuestionBlock(document.id, blockIndex, "down")
                                        }
                                        type="button"
                                      >
                                        Down
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}

                          {document.pendingManualPlacementQuestionIds?.length ? (
                            <div className="mt-4 space-y-3">
                              {document.pendingManualPlacementQuestionIds.map((questionId, questionIndex) => (
                                <div
                                  key={`${document.id}-pending-question-${questionId}`}
                                  className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3"
                                >
                                  <div className="text-sm font-medium text-amber-950">
                                    Q{getQuestionDisplayNumber(questionId, String(questionIndex + 1))}
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {document.pendingQuestionBlocks?.map((block, blockIndex) => (
                                      <button
                                        key={`${document.id}-${questionId}-${block.key}-${blockIndex}`}
                                        aria-label={`assign-pending-question-${questionId}-to-block-${document.id}-${blockIndex}`}
                                        className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900"
                                        onClick={() =>
                                          handleAssignPendingQuestionToBlock(
                                            document.id,
                                            questionId,
                                            blockIndex
                                          )
                                        }
                                        type="button"
                                      >
                                        Add to {block.label}
                                      </button>
                                    ))}
                                    <button
                                      aria-label={`create-pending-block-for-question-${questionId}-${document.id}`}
                                      className="rounded-full bg-amber-900 px-3 py-1 text-xs font-medium text-white"
                                      onClick={() =>
                                        handleCreatePendingBlockForQuestion(document.id, questionId)
                                      }
                                      type="button"
                                    >
                                      Create block
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      <button
                        aria-label={`confirm-exam-sync-${document.id}`}
                        className="mt-3 rounded-full bg-amber-900 px-4 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={(document.pendingManualPlacementQuestionIds?.length ?? 0) > 0}
                        onClick={() => confirmExamDocumentSync(document.id)}
                        type="button"
                      >
                        Confirm sync
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-sm text-slate-500">
              当前库还没有文档。
            </div>
          )}
        </section>
      ))}

      {selectedDocument?.kind === "answer_sheet" && selectedDocument.sourceMode !== "uploaded_pdf" ? (
        <section className="rounded-lg border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Answer Sheet Preview</h2>
          <p className="mt-2 text-sm text-slate-500">
            Answers follow the current question order of the selected document.
          </p>
          {selectedPreviewPlaceholderAnswerPage ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              <div className="font-medium">Answer sheet placeholder</div>
              <p className="mt-2 text-sm text-amber-800">
                No matched answers are available yet. The default answer sheet is currently a placeholder.
              </p>
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            {selectedAnswerEntries.map((entry) => (
              <div
                key={entry.questionId}
                className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50/60"
              >
                <div className="border-b border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800">
                  Q{entry.displayNumber}
                </div>
                {entry.assets.length ? (
                  <div className="space-y-3 bg-white p-3">
                    {entry.assets.map((asset, assetIndex) => (
                      <img
                        key={`${entry.questionId}-${asset.id}`}
                        alt={
                          assetIndex === 0
                            ? `answer-preview-q-${entry.displayNumber}`
                            : `answer-preview-q-${entry.displayNumber}-${assetIndex + 1}`
                        }
                        className="w-full object-contain"
                        src={asset.dataUrl ?? undefined}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-sm text-slate-500">暂无答案</div>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {selectedPaperPreview && selectedDocument?.kind === "paper" ? (
        <section className="rounded-lg border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Paper Preview</h2>
          <p className="mt-2 text-sm text-slate-500">
            The current paper preview follows the saved question order and numbering mode.
          </p>
          <div aria-label="paper-preview" className="mt-4 space-y-4">
            {selectedPaperPreview.sections.map((section) => (
              <div
                key={`paper-preview-section-${section.key}`}
                className="rounded-lg border border-slate-200 bg-slate-50/60"
              >
                <div className="border-b border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800">
                  {section.label}
                </div>
                <div className="space-y-3 p-3">
                  {section.items.map((item) => (
                    <div
                      key={`paper-preview-item-${section.key}-${item.questionId}`}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-4"
                    >
                      <div className="text-sm font-semibold text-slate-800">Q{item.displayNumber}</div>
                      <div className="mt-2 text-sm leading-6 text-slate-600">{item.summaryText}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {selectedDocument?.kind === "paper" &&
      selectedDocument.sourceMode === "uploaded_pdf" &&
      selectedUploadedPaperPages.length ? (
        <section className="rounded-lg border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Uploaded Question Pages</h2>
          <p className="mt-2 text-sm text-slate-500">
            Uploaded-PDF papers keep the original whole question pages before the confirmed answer split.
          </p>
          <div className="mt-4 space-y-4">
            {selectedUploadedPaperPages.map((page) => {
              const asset = binaryAssets.find((item) => item.id === page.previewAssetId);

              if (!asset?.dataUrl) {
                return null;
              }

              return (
                <div
                  key={`uploaded-question-page-${page.pageNumber}`}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="text-sm font-semibold text-slate-800">Question Page {page.pageNumber}</div>
                  <img
                    alt={`uploaded-question-page-${page.pageNumber}`}
                    className="mt-3 w-full rounded-lg border border-slate-100 bg-white object-contain"
                    src={asset.dataUrl}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {(selectedLecturePreview || selectedTextLecturePreview) && selectedDocument?.kind === "lecture" ? (
        <section className="rounded-lg border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Lecture Preview</h2>
          <p className="mt-2 text-sm text-slate-500">
            {selectedDocument.sourceMode === "uploaded_pdf"
              ? "Uploaded-PDF lecture preview keeps the current question order and does not split one question across pages."
              : "Question-bank and freeform lecture documents render as printable text cards in the current question order."}
          </p>
          {selectedLecturePreview ? (
            <div className="mt-4 space-y-4">
              {selectedLecturePreview.pages.map((page) => (
                <div
                  key={`lecture-preview-page-${page.index}`}
                  className="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="text-sm font-semibold text-slate-800">Preview Page {page.index}</div>
                  <div className="mt-3 space-y-3">
                    {page.items.map((item) => (
                      <div
                        key={`${page.index}-${item.questionId}`}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-4"
                      >
                        <div className="text-sm font-semibold text-slate-800">Q{item.displayNumber}</div>
                        <CroppedQuestionImage
                          alt={`lecture-preview-q-${item.displayNumber}`}
                          bbox={item.crop}
                          className="mt-3 w-full rounded-lg border border-slate-100 object-contain"
                          page={item.sourcePage}
                          sourceDataUrl={item.sourceDataUrl}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : selectedTextLecturePreview ? (
            <div className="mt-4 space-y-4">
              {selectedTextLecturePreview.sections.map((section) => (
                <div
                  key={`lecture-preview-section-${section.key}`}
                  className="rounded-lg border border-slate-200 bg-slate-50/60"
                >
                  <div className="border-b border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800">
                    {section.label}
                  </div>
                  <div className="space-y-3 p-3">
                    {section.items.map((item) => (
                      <div
                        key={`lecture-preview-item-${section.key}-${item.questionId}`}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-4"
                      >
                        <div className="text-sm font-semibold text-slate-800">Q{item.displayNumber}</div>
                        <div className="mt-2 text-sm leading-6 text-slate-600">{item.summaryText}</div>
                        <div className="mt-2 text-xs font-medium text-slate-400">
                          Gap after: {item.gapAfter}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedDocument?.kind === "answer_sheet" &&
      selectedDocument.sourceMode === "uploaded_pdf" &&
      selectedDocument.uploadedPdfPages?.length &&
      selectedDocument.uploadedPdfAnswerSection &&
      !selectedDocument.uploadedPdfAnswerSection.hasAnswerSection ? (
        <section className="rounded-lg border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Uploaded Answer Pages</h2>
          <p className="mt-2 text-sm text-slate-500">
            This uploaded PDF was confirmed to have no answer section, so the answer sheet remains a blank placeholder.
          </p>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            <div className="font-medium">Answer sheet placeholder</div>
            <p className="mt-2 text-sm text-amber-800">
              This uploaded PDF was confirmed to have no answer section. A blank placeholder answer sheet is shown.
            </p>
          </div>
        </section>
      ) : null}

      {selectedDocument?.kind === "answer_sheet" &&
      selectedDocument.sourceMode === "uploaded_pdf" &&
      selectedDocument.uploadedPdfPages?.length &&
      selectedDocument.uploadedPdfAnswerSection?.hasAnswerSection ? (
        <section className="rounded-lg border border-slate-100 bg-white p-5">
          <h2 className="text-lg font-semibold text-slate-900">Uploaded Answer Pages</h2>
          <p className="mt-2 text-sm text-slate-500">
            Uploaded-PDF answer sheets keep the original whole answer pages after the confirmed split.
          </p>
          <div className="mt-4 space-y-4">
            {selectedUploadedAnswerPages.map((page) => {
                const asset = binaryAssets.find((item) => item.id === page.previewAssetId);

                if (!asset?.dataUrl) {
                  return null;
                }

                return (
                  <div
                    key={`uploaded-answer-page-${page.pageNumber}`}
                    className="rounded-lg border border-slate-200 bg-slate-50/60 p-4"
                  >
                    <div className="text-sm font-semibold text-slate-800">Answer Page {page.pageNumber}</div>
                    <img
                      alt={`uploaded-answer-page-${page.pageNumber}`}
                      className="mt-3 w-full rounded-lg border border-slate-100 bg-white object-contain"
                    src={asset.dataUrl}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

